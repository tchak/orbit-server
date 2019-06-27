import {
  Schema,
  RecordIdentity,
  Record as OrbitRecord,
  serializeRecordIdentity,
  AttributeDefinition
} from '@orbit/data';
import { GraphQLSchema } from 'graphql/type/schema';
import {
  GraphQLObjectType,
  GraphQLFieldConfig,
  GraphQLList,
  GraphQLNonNull,
  GraphQLScalarType
} from 'graphql/type/definition';
import {
  GraphQLString,
  GraphQLID,
  GraphQLInt,
  GraphQLBoolean
} from 'graphql/type/scalars';
import { GraphQLDate, GraphQLDateTime } from 'graphql-iso-date';
import { deepGet, camelize, capitalize } from '@orbit/utils';
import DataLoader from 'dataloader';

import Context from '../context';

interface Params {}

interface FindRecordParams extends Params {
  id?: string;
}

interface FindRecordsParams extends Params {
  ids?: string[];
  order?: string;
}

type QueryResult = OrbitRecord | OrbitRecord[] | null;

export function makeExecutableSchema(schema: Schema): GraphQLSchema {
  const types: Record<string, GraphQLObjectType> = {};
  const fields = () => {
    const fields: Record<
      string,
      GraphQLFieldConfig<null, Context, Params>
    > = {};

    for (let type in schema.models) {
      makeModelType(schema, type, types);

      fields[type] = {
        type: types[type],
        args: {
          id: {
            type: new GraphQLNonNull(GraphQLID)
          }
        },
        resolve(_, params: FindRecordParams, { source, headers }) {
          return source.query(
            q => q.findRecord({ type, id: params.id as string }),
            {
              [source.name]: { headers: headers }
            }
          );
        }
      };

      fields[schema.pluralize(type)] = {
        type: new GraphQLNonNull(new GraphQLList(types[type])),
        args: {
          ids: {
            type: new GraphQLList(GraphQLID)
          }
        },
        resolve(_, params: FindRecordsParams, { source, headers }) {
          if (params.ids) {
            return source.query(
              q =>
                q.findRecords(
                  (params.ids as string[]).map(id => ({ type, id }))
                ),
              {
                [source.name]: { headers }
              }
            );
          }
          return source.query(q => q.findRecords(type));
        }
      };
    }

    return fields;
  };

  const Query = new GraphQLObjectType({
    name: 'Query',
    fields
  });

  return new GraphQLSchema({ query: Query });
}

function makeModelType(
  schema: Schema,
  type: string,
  types: Record<string, GraphQLObjectType>
): GraphQLObjectType<RecordIdentity, Context> {
  const typeClassName = classify(type);
  const fields = () => {
    const fields: Record<
      string,
      GraphQLFieldConfig<RecordIdentity, Context>
    > = {
      id: { type: new GraphQLNonNull(GraphQLID) }
    };

    schema.eachAttribute(type, (property, attribute) => {
      fields[property] = {
        type: getAttributeGraphQLType(attribute),
        resolve: parent => deepGet(parent, ['attributes', property])
      };
    });

    schema.eachRelationship(type, (property, { type: kind, model: type }) => {
      let namespace = `${typeClassName}.${property}`;

      if (!type) {
        throw new Error(`Type missing on "${namespace}" relationship`);
      }
      if (Array.isArray(type)) {
        throw new Error(`Polymorphic types are not supported yet`);
      }

      if (kind === 'hasMany') {
        fields[property] = {
          type: new GraphQLNonNull(new GraphQLList(types[type])),
          resolve: (parent, _, context) => {
            const { source, headers } = context;
            return getDataLoader(
              context,
              namespace,
              (records: OrbitRecord[]) => {
                return Promise.all(
                  records.map(record =>
                    source.query(q => q.findRelatedRecords(record, property), {
                      [source.name]: { headers }
                    })
                  )
                );
              }
            ).load(parent);
          }
        };
      } else {
        fields[property] = {
          type: types[type],
          resolve: (parent, _, context) => {
            const { source, headers } = context;
            return getDataLoader(
              context,
              namespace,
              (records: OrbitRecord[]) => {
                return Promise.all(
                  records.map(record =>
                    source.query(q => q.findRelatedRecord(record, property), {
                      [source.name]: { headers }
                    })
                  )
                );
              }
            ).load(parent);
          }
        };
      }
    });

    return fields;
  };

  const ModelType = new GraphQLObjectType({
    name: typeClassName,
    fields
  });

  types[type] = ModelType;

  return ModelType;
}

function classify(str: string): string {
  return capitalize(camelize(str));
}

function getAttributeGraphQLType(
  attribute: AttributeDefinition
): GraphQLScalarType {
  switch (attribute.type) {
    case 'string':
      return GraphQLString;
    case 'number':
      return GraphQLInt;
    case 'boolean':
      return GraphQLBoolean;
    case 'date':
      return GraphQLDate;
    case 'datetime':
      return GraphQLDateTime;
    default:
      throw new Error(`Unknown type "${attribute.type}"`);
  }
}

function getDataLoader(
  context: object,
  namespace: string,
  batchLoadFn: DataLoader.BatchLoadFn<RecordIdentity, QueryResult>
): DataLoader<RecordIdentity, QueryResult> {
  const dataLoaderMap = dataLoaderMapFor(context);
  let dataLoader = dataLoaderMap.get(namespace);
  if (!dataLoader) {
    dataLoader = new DataLoader(batchLoadFn, {
      cacheKeyFn: serializeRecordIdentity
    });
    dataLoaderMap.set(namespace, dataLoader);
  }
  return dataLoader;
}

function dataLoaderMapFor(context: object) {
  let dataLoaderMap = dataLoaderMapForContext.get(context);
  if (!dataLoaderMap) {
    dataLoaderMap = new Map();
    dataLoaderMapForContext.set(context, dataLoaderMap);
  }
  return dataLoaderMap;
}

const dataLoaderMapForContext = new WeakMap();
