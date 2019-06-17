import {
  QueryOrExpression,
  Record as OrbitRecord,
  RecordIdentity,
  RecordOperation,
  TransformBuilderFunc,
  Schema
} from '@orbit/data';
import {
  RecordRelationshipIdentity,
  AsyncRecordCache,
  AsyncRecordCacheSettings,
  PatchResult,
  QueryResultData
} from '@orbit/record-cache';
import Knex from 'knex';
import { underscore, foreignKey, tableize } from 'inflected';

const UPDATED_AT = 'updated_at';

export interface SQLCacheSettings extends AsyncRecordCacheSettings {
  knex: Knex.Config;
}

/**
 * A cache used to access records in an SQL database.
 *
 * Because SQL access is async, this cache extends `AsyncRecordCache`.
 */
export default class SQLCache extends AsyncRecordCache {
  protected _config: Knex.Config;
  protected _db: Knex;

  constructor(settings: SQLCacheSettings) {
    super(settings);

    this._config = settings.knex;
    this._config.postProcessResponse = postProcessResponse;
  }

  async query(
    queryOrExpression: QueryOrExpression,
    options?: object,
    id?: string
  ): Promise<QueryResultData> {
    await this.openDB();
    return super.query(queryOrExpression, options, id);
  }

  async patch(
    operationOrOperations:
      | RecordOperation
      | RecordOperation[]
      | TransformBuilderFunc
  ): Promise<PatchResult> {
    await this.openDB();
    return super.patch(operationOrOperations);
  }

  get config(): Knex.Config {
    return this._config;
  }

  async upgrade(): Promise<void> {
    await this.reopenDB();
    for (let processor of this._processors) {
      await processor.upgrade();
    }
  }

  async reset(): Promise<void> {
    await this.deleteDB();

    for (let processor of this._processors) {
      await processor.reset();
    }
  }

  get isDBOpen(): boolean {
    return !!this._db;
  }

  async openDB(): Promise<any> {
    if (!this.isDBOpen) {
      const db = Knex(this._config);
      await this.createDB(db);
      this._db = db;
    }
    return this._db;
  }

  async closeDB(): Promise<void> {
    if (this.isDBOpen) {
      await this._db.destroy();
    }
  }

  async reopenDB(): Promise<Knex> {
    await this.closeDB();
    return this.openDB();
  }

  async createDB(db: Knex): Promise<void> {
    for (let model in this.schema.models) {
      await this.registerModel(db, model);
    }
  }

  async deleteDB(): Promise<void> {
    await this.closeDB();
  }

  async registerModel(db: Knex, type: string) {
    const tableName = tableize(type);
    const { relationships } = this.schema.getModel(type);

    if (await db.schema.hasTable(tableName)) {
      await db.schema.alterTable(tableName, async table => {
        this.schema.eachAttribute(type, async (property, attribute) => {
          let columnName = underscore(property);
          if (!(await db.schema.hasColumn(tableName, columnName))) {
            switch (attribute.type) {
              case 'string':
                table.string(columnName);
                break;
              case 'number':
                table.integer(columnName);
                break;
              case 'boolean':
                table.boolean(columnName);
                break;
              case 'date':
                table.date(columnName);
                break;
              case 'datetime':
                table.dateTime(columnName);
                break;
            }
          }
        });
        for (let relationship in relationships) {
          let columnName = foreignKey(relationship);
          if (!(await db.schema.hasColumn(tableName, columnName))) {
            if (relationships[relationship].type === 'hasOne') {
              table.uuid(columnName);
            }
          }
        }
      });
    } else {
      await db.schema.createTable(tableName, table => {
        table.uuid('id').primary();
        table.timestamps(true, true);

        this.schema.eachAttribute(type, (property, attribute) => {
          if (!['updatedAt', 'createdAt'].includes(property)) {
            let columnName = underscore(property);
            switch (attribute.type) {
              case 'string':
                table.string(columnName);
                break;
              case 'number':
                table.integer(columnName);
                break;
              case 'boolean':
                table.boolean(columnName);
                break;
              case 'date':
                table.date(columnName);
                break;
              case 'datetime':
                table.dateTime(columnName);
                break;
            }
          }
        });
        for (let relationship in relationships) {
          let columnName = foreignKey(relationship);
          if (relationships[relationship].type === 'hasOne') {
            table.uuid(columnName);
          }
        }
      });
    }
  }

  async clearRecords(type: string): Promise<void> {
    await this.scopeForType(type).del();
  }

  async getRecordAsync(identity: RecordIdentity): Promise<OrbitRecord> {
    return new Promise(async resolve => {
      const fields = this.getFieldsForType(identity.type);
      const record = await this.scopeForType(identity.type)
        .where('id', identity.id)
        .first(fields);
      if (record) {
        resolve(record);
      }
      resolve();
    });
  }

  async getRecordsAsync(
    typeOrIdentities?: string | RecordIdentity[]
  ): Promise<OrbitRecord[]> {
    let records: OrbitRecord[] = [];

    if (!typeOrIdentities) {
      for (let type in this.schema.models) {
        records = records.concat(await this.getRecordsAsync(type));
      }
    } else if (typeof typeOrIdentities === 'string') {
      let fields = this.getFieldsForType(typeOrIdentities);
      records = await this.scopeForType(typeOrIdentities).select(fields);
    } else if (Array.isArray(typeOrIdentities)) {
      const identities: RecordIdentity[] = typeOrIdentities;

      if (identities.length > 0) {
        const idsByType = groupIdentitiesByType(identities);
        const recordsById: Record<string, OrbitRecord> = {};

        for (let type in idsByType) {
          let fields = this.getFieldsForType(type);
          for (let record of await this.scopeForType(type)
            .whereIn('id', idsByType[type])
            .select(fields)) {
            recordsById[record.id] = record;
          }
        }
        for (let identity of identities) {
          records.push(recordsById[identity.id]);
        }
      }
    }
    return records;
  }

  async setRecordAsync(record: OrbitRecord): Promise<void> {
    const { id, ...properties } = this.toProperties(record);

    if (
      await this.scopeForType(record.type)
        .where('id', id)
        .first('id')
    ) {
      const now = this._db.raw('CURRENT_TIMESTAMP');
      await this.scopeForType(record.type)
        .where({ id })
        .update({ ...properties, [UPDATED_AT]: now });
    } else {
      await this.scopeForType(record.type).insert({ id, ...properties });
    }
  }

  async setRecordsAsync(records: OrbitRecord[]): Promise<void> {
    for (let record of records) {
      await this.setRecordAsync(record);
    }
  }

  async removeRecordAsync(identity: RecordIdentity) {
    const record = await this.getRecordAsync(identity);
    await this.scopeForType(identity.type)
      .where({ id: identity.id })
      .del();
    return record;
  }

  async removeRecordsAsync(identities: RecordIdentity[]) {
    const records = this.getRecordsAsync(identities);
    const idsByType = groupIdentitiesByType(identities);
    for (let type in idsByType) {
      await this.scopeForType(type)
        .whereIn('id', idsByType[type])
        .del();
    }
    return records;
  }

  async getRelatedRecordAsync(
    identity: RecordIdentity,
    relationship: string
  ): Promise<RecordIdentity> {
    return new Promise(async resolve => {
      const relationships = this.schema.getModel(identity.type).relationships;
      if (
        relationships &&
        this.schema.hasRelationship(identity.type, relationship)
      ) {
        const type = relationships[relationship].model as string;
        const fields = this.getFieldsForType(type);
        const record = await this.scopeForType(type)
          .join(
            tableize(identity.type),
            `${tableize(type)}.id`,
            `${tableize(identity.type)}.${foreignKey(relationship)}`
          )
          .where(`${tableize(identity.type)}.id`, identity.id)
          .first(fields);
        resolve(record);
      }
    });
  }

  async getRelatedRecordsAsync(
    identity: RecordIdentity,
    relationship: string
  ): Promise<RecordIdentity[]> {
    const relationships = this.schema.getModel(identity.type).relationships;
    if (
      relationships &&
      this.schema.hasRelationship(identity.type, relationship)
    ) {
      const type = relationships[relationship].model as string;
      const fields = this.getFieldsForType(type);
      const inverse = relationships[relationship].inverse as string;
      return this.scopeForType(type)
        .where(foreignKey(inverse), identity.id)
        .select(fields);
    }
    return [];
  }

  async getInverseRelationshipsAsync(
    recordIdentity: RecordIdentity
  ): Promise<RecordRelationshipIdentity[]> {
    recordIdentity;
    const recordRelationshipIdentities: RecordRelationshipIdentity[] = [];
    return recordRelationshipIdentities;
  }

  addInverseRelationshipsAsync(
    relationships: RecordRelationshipIdentity[]
  ): Promise<void> {
    if (relationships.length > 0) {
      return Promise.resolve();
    } else {
      return Promise.resolve();
    }
  }

  removeInverseRelationshipsAsync(
    relationships: RecordRelationshipIdentity[]
  ): Promise<void> {
    if (relationships.length > 0) {
      return Promise.resolve();
    } else {
      return Promise.resolve();
    }
  }

  protected scopeForType(type: string) {
    return this._db(tableize(type)).queryContext({ type, schema: this.schema });
  }

  protected toProperties(record: OrbitRecord) {
    const properties: Record<string, unknown> = {
      id: record.id
    };

    this.schema.eachAttribute(record.type, property => {
      if (record.attributes && record.attributes[property] !== undefined) {
        properties[underscore(property)] = record.attributes[property];
      }
    });

    this.schema.eachRelationship(record.type, (property, { type: kind }) => {
      if (
        kind === 'hasOne' &&
        record.relationships &&
        record.relationships[property]
      ) {
        const data = record.relationships[property]
          .data as RecordIdentity | null;
        properties[foreignKey(property)] = data ? data.id : null;
      }
    });

    return properties;
  }

  protected getFieldsForType(type: string) {
    const tableName = tableize(type);
    const fields: string[] = [`${tableName}.id`];

    this.schema.eachAttribute(type, property => {
      fields.push(`${tableName}.${underscore(property)}`);
    });

    this.schema.eachRelationship(type, (property, { type: kind }) => {
      if (kind === 'hasOne') {
        fields.push(`${tableName}.${foreignKey(property)}`);
      }
    });

    return fields;
  }
}

function groupIdentitiesByType(identities: RecordIdentity[]) {
  const idsByType: Record<string, string[]> = {};
  for (let identity of identities) {
    idsByType[identity.type] = idsByType[identity.type] || [];
    idsByType[identity.type].push(identity.id);
  }
  return idsByType;
}

type QueryResult = Record<string, unknown> | Record<string, unknown>[] | null;
interface QueryContext {
  type: string;
  schema: Schema;
}

function postProcessResponse(result: QueryResult, context?: QueryContext) {
  if (context) {
    if (Array.isArray(result)) {
      return result.map(result => queryResultToRecord(result, context));
    } else if (result) {
      return queryResultToRecord(result, context);
    }

    return null;
  }
  return result;
}

function queryResultToRecord(
  result: Record<string, unknown>,
  context: QueryContext
): OrbitRecord {
  const record: OrbitRecord = {
    type: context.type,
    id: result.id as string,
    attributes: {},
    relationships: {}
  };

  context.schema.eachAttribute(context.type, (property, attribute) => {
    const propertyName = underscore(property);
    if (result[propertyName] != null) {
      (record.attributes as Record<string, unknown>)[
        property
      ] = castAttributeValue(result[propertyName], attribute.type);
    }
  });

  context.schema.eachRelationship(
    context.type,
    (property, { type: kind, model: type }) => {
      if (kind === 'hasOne') {
        (record.relationships as Record<string, unknown>)[property] = {
          data: {
            type: type as string,
            id: result[foreignKey(property)] as string
          }
        };
      }
    }
  );

  return record;
}

function castAttributeValue(value: unknown, type?: string) {
  const typeOfValue = typeof value;
  const isString = typeOfValue === 'string';
  const isNumber = typeOfValue === 'number';
  if (type === 'boolean') {
    return value === 1;
  } else if (type === 'datetime' && (isString || isNumber)) {
    return new Date(value as string | number);
  }
  return value;
}
