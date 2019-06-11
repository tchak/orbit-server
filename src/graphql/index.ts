import {
  Schema,
  RecordIdentity,
  Record as OrbitRecord,
  serializeRecordIdentity
} from '@orbit/data';
import { deepGet, deepMerge } from '@orbit/utils';
import DataLoader from 'dataloader';
import { classify } from 'inflected';

import Source from '../source';

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

  for (let type in schema.models) {
    typeDef.push(createTypeDef(schema, type));
    deepMerge(resolvers, createResolvers(schema, type));
  }

  typeDef.push('type Query {');
  for (let type in schema.models) {
    typeDef.push(`  ${schema.pluralize(type)}: [${classify(type)}]!`);
    typeDef.push(`  ${type}(id: ID!): ${classify(type)}`);
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

function createTypeDef(schema: Schema, type: string) {
  let typeDef = [`type ${classify(type)} {`];
  typeDef.push('  id: ID!');

  schema.eachAttribute(type, (property, attribute) => {
    switch (attribute.type) {
      case 'string':
        typeDef.push(`  ${property}: String`);
        break;
      case 'number':
        typeDef.push(`  ${property}: Int`);
        break;
      case 'boolean':
        typeDef.push(`  ${property}: Boolean`);
        break;
      default:
        typeDef.push(`  ${property}: String`);
      // case 'date':
      //   typeDef.push(`  ${property}: Date`);
      //   break;
      // case 'datetime':
      //   typeDef.push(`  ${property}: DateTime`);
    }
  });

  schema.eachRelationship(type, (property, { model: type, type: kind }) => {
    let relatedType = classify(type as string);
    if (kind === 'hasMany') {
      typeDef.push(`  ${property}: [${relatedType}]!`);
    } else {
      typeDef.push(`  ${property}: ${relatedType}`);
    }
  });

  typeDef.push('}');

  return typeDef.join('\n');
}

function createResolvers(
  schema: Schema,
  type: string
): Record<string, Record<string, Resolver>> {
  const typeClassName = classify(type);
  const resolver: Record<string, Resolver> = {};

  schema.eachAttribute(type, property => {
    resolver[property] = (parent: OrbitRecord) =>
      deepGet(parent, ['attributes', property]);
  });

  schema.eachRelationship(type, (property, { type: kind }) => {
    let namespace = `${typeClassName}.${property}`;

    if (kind === 'hasMany') {
      resolver[property] = (parent, _, { source, getDataLoader }) => {
        return getDataLoader(namespace, (records: OrbitRecord[]) => {
          return Promise.all(
            records.map(record =>
              source.query(q => q.findRelatedRecords(record, property))
            )
          );
        }).load(parent as RecordIdentity);
      };
    } else {
      resolver[property] = (parent, _, { source, getDataLoader }) => {
        return getDataLoader(namespace, (records: OrbitRecord[]) => {
          return Promise.all(
            records.map(record =>
              source.query(q => q.findRelatedRecord(record, property))
            )
          );
        }).load(parent as RecordIdentity);
      };
    }
  });

  return {
    [typeClassName]: resolver,
    Query: {
      [type]: (_, params: FindRecordParams, { source }) => {
        return source.query(q =>
          q.findRecord({ type, id: params.id as string })
        );
      },
      [schema.pluralize(type)]: (_, params: FindRecordsParams, { source }) => {
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
