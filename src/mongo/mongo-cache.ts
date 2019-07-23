import { Record as OrbitRecord, RecordIdentity } from '@orbit/data';
import {
  RecordRelationshipIdentity,
  AsyncRecordCache,
  AsyncRecordCacheSettings
} from '@orbit/record-cache';
import { MongoClient, Db, Collection, MongoClientOptions } from 'mongodb';
import { tableize } from 'inflected';
import { deepMerge } from '@orbit/utils';

export interface MongoCacheSettings extends AsyncRecordCacheSettings {
  namespace: string;
  uri: string;
  options?: MongoClientOptions;
}

/**
 * A cache used to access records in an SQL database.
 *
 * Because Mongo access is async, this cache extends `AsyncRecordCache`.
 */
export default class MongoCache extends AsyncRecordCache {
  protected _uri: string;
  protected _options?: MongoClientOptions;
  protected _client: MongoClient;
  protected _db: Db;

  namespace: string;

  constructor(settings: MongoCacheSettings) {
    super(settings);

    this.namespace = settings.namespace;
    this._uri = settings.uri;
    this._options = settings.options;
  }

  get isDBOpen(): boolean {
    return this._client && this._client.isConnected();
  }

  async openDB(): Promise<any> {
    if (!this.isDBOpen) {
      this._client = new MongoClient(this._uri, {
        ...this._options,
        useNewUrlParser: true
      });
      await this._client.connect();
      await this.createDB();
    }
    return this._db;
  }

  async closeDB(): Promise<void> {
    if (this.isDBOpen) {
      await this._client.close();
    }
  }

  async createDB(): Promise<void> {
    this._db = this._client.db(this.namespace);
    for (let model in this.schema.models) {
      await this.registerModel(model);
    }
  }

  async deleteDB() {
    if (this.isDBOpen) {
      await this._db.dropDatabase();
    }
  }

  async registerModel(type: string) {
    await this._db.createCollection(tableize(type));
  }

  async getRecordAsync(
    identity: RecordIdentity
  ): Promise<OrbitRecord | undefined> {
    const record = await this.collectionForType(identity.type).findOne({
      _id: identity.id
    });
    if (record) {
      return record;
    }
    return undefined;
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
      records = await this.collectionForType(typeOrIdentities)
        .find()
        .toArray();
    } else if (Array.isArray(typeOrIdentities)) {
      const identities: RecordIdentity[] = typeOrIdentities;

      if (identities.length > 0) {
        const idsByType = groupIdentitiesByType(identities);
        const recordsById: Record<string, OrbitRecord> = {};

        for (let type in idsByType) {
          for (let record of await this.collectionForType(type)
            .find({ _id: { $in: idsByType[type] } })
            .toArray()) {
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
    const now = new Date();

    if (await this.collectionForType(record.type).findOne({ _id: record.id })) {
      deepMerge(record, { attributes: { updatedAt: now } });
      await this.collectionForType(record.type).updateOne(
        { _id: record.id },
        {
          $set: record
        }
      );
    } else {
      record = deepMerge(
        {
          _id: record.id,
          attributes: { createdAt: now, updatedAt: now }
        },
        record
      );
      await this.collectionForType(record.type).insertOne(record);
    }
  }

  async setRecordsAsync(records: OrbitRecord[]): Promise<void> {
    for (let record of records) {
      await this.setRecordAsync(record);
    }
  }

  async removeRecordAsync(identity: RecordIdentity) {
    const [record] = await this.removeRecordsAsync([identity]);
    return record;
  }

  async removeRecordsAsync(identities: RecordIdentity[]) {
    const records = await this.getRecordsAsync(identities);
    const idsByType = groupIdentitiesByType(records);
    for (let type in idsByType) {
      await this.collectionForType(type).deleteMany({
        _id: { $in: idsByType[type] }
      });
    }
    return records;
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

  protected collectionForType(type: string): Collection {
    return this._db.collection(tableize(type));
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
