import {
  RecordIdentity,
  Record as OrbitRecord,
  serializeRecordIdentity
} from '@orbit/data';
import DataLoader from 'dataloader';
import { classify, pluralize } from 'inflected';

import { Source, Schema, ModelDefinition } from '../';
import { deepGet, deepMerge } from '@orbit/utils';

interface Params {}

interface FindRecordParams extends Params {
  id?: string;
}

interface FindRecordsParams extends Params {
  ids?: string[];
  order?: string;
}

type Resolver = (
  parent: OrbitRecord | null,
  params: Params,
  context: Context
) => Promise<any>;
type QueryResult = OrbitRecord | OrbitRecord[] | null;
type getDataLoaderFn = (
  namespace: string,
  batchLoadFn: DataLoader.BatchLoadFn<RecordIdentity, QueryResult>
) => DataLoader<RecordIdentity, QueryResult>;

export interface Context {
  source: Source;
  getDataLoader: getDataLoaderFn;
}

export function buildGraphQL(schema: Schema) {
  const resolvers = { Query: {} };
  const typeDef = [];

  for (let model of schema.models) {
    typeDef.push(createTypeDef(model));
    deepMerge(resolvers, createResolvers(model));
  }

  typeDef.push('type Query {');
  for (let model of schema.models) {
    typeDef.push(`  ${pluralize(model.type)}: [${classify(model.type)}]!`);
    typeDef.push(`  ${model.type}(id: ID!): ${classify(model.type)}`);
  }
  typeDef.push('}');

  return {
    typeDefs: typeDef.join('\n'),
    resolvers
  };
}

export function createDataLoaders() {
  const dataLoaders = new Map();
  return (
    namespace: string,
    batchLoadFn: DataLoader.BatchLoadFn<RecordIdentity, QueryResult>
  ) => {
    let dataLoader = dataLoaders.get(namespace);
    if (!dataLoader) {
      dataLoader = new DataLoader(batchLoadFn, {
        cacheKeyFn: serializeRecordIdentity
      });
      dataLoaders.set(namespace, dataLoader);
    }
    return dataLoader;
  };
}

function createTypeDef(schema: ModelDefinition) {
  let typeDef = [`type ${classify(schema.type)} {`];
  typeDef.push('  id: ID!');

  for (let attribute of schema.attributes) {
    typeDef.push(`  ${attribute.property}: String`);
  }

  for (let relationship of schema.relationships) {
    let relatedType = classify(relationship.type);
    if (relationship.kind === 'hasMany') {
      typeDef.push(`  ${relationship.property}: [${relatedType}]!`);
    } else {
      typeDef.push(`  ${relationship.property}: ${relatedType}`);
    }
  }

  typeDef.push('}');

  return typeDef.join('\n');
}

function createResolvers(
  schema: ModelDefinition
): Record<string, Record<string, Resolver>> {
  const type = schema.type;
  const typeClassName = classify(type);
  const resolver: Record<string, Resolver> = {};

  for (let attribute of schema.attributes) {
    resolver[attribute.property] = (parent: OrbitRecord) =>
      deepGet(parent, ['attributes', attribute.property]);
  }

  for (let relationship of schema.relationships) {
    let namespace = `${typeClassName}.${relationship.property}`;

    if (relationship.kind === 'hasMany') {
      resolver[relationship.property] = (
        parent,
        _,
        { source, getDataLoader }
      ) => {
        return getDataLoader(namespace, (records: OrbitRecord[]) => {
          return Promise.all(
            records.map(record =>
              source.query(q =>
                q.findRelatedRecords(record, relationship.property)
              )
            )
          );
        }).load(parent as RecordIdentity);
      };
    } else {
      resolver[relationship.property] = (
        parent,
        _,
        { source, getDataLoader }
      ) => {
        return getDataLoader(namespace, (records: OrbitRecord[]) => {
          return Promise.all(
            records.map(record =>
              source.query(q =>
                q.findRelatedRecord(record, relationship.property)
              )
            )
          );
        }).load(parent as RecordIdentity);
      };
    }
  }

  return {
    [typeClassName]: resolver,
    Query: {
      [type]: (_, params: FindRecordParams, { source }) => {
        return source.query(q =>
          q.findRecord({ type, id: params.id as string })
        );
      },
      [pluralize(type)]: (_, params: FindRecordsParams, { source }) => {
        if (params.ids) {
          source.query(q =>
            q.findRecords((params.ids as string[]).map(id => ({ type, id })))
          );
        }
        return source.query(q => q.findRecords(type));
      }
    }
  };
}
