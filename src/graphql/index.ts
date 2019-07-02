import {
  Schema,
  RecordIdentity,
  Record as OrbitRecord,
  serializeRecordIdentity,
  AttributeDefinition,
  FilterQBParam,
  SortQBParam,
  QueryBuilder
} from '@orbit/data';
import { GraphQLSchema } from 'graphql/type/schema';
import {
  GraphQLObjectType,
  GraphQLFieldConfig,
  GraphQLList,
  GraphQLNonNull,
  GraphQLScalarType,
  GraphQLEnumType,
  GraphQLEnumValueConfigMap,
  GraphQLInputObjectType,
  GraphQLInputFieldConfigMap
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
  where: Record<string, any>;
  orderBy?: SortQBParam;
}

type QueryResult = OrbitRecord | OrbitRecord[] | null;

export function makeExecutableSchema(schema: Schema): GraphQLSchema {
  const types: Record<string, GraphQLObjectType> = {};
  const enums: Record<string, GraphQLEnumType> = {};
  const inputs: Record<string, GraphQLInputObjectType> = {};
  const fields = () => {
    const fields: Record<
      string,
      GraphQLFieldConfig<null, Context, Params>
    > = {};

    for (let type in schema.models) {
      makeModelType(schema, type, types, enums, inputs);

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
          orderBy: {
            type: makeOrderByInputType(schema, type, enums)
          },
          where: {
            type: makeWhereInputType(schema, type, inputs)
          }
        },
        resolve(_, params: FindRecordsParams, { source, headers }) {
          return source.query(
            q =>
              buildFindRecordsQuery(
                schema,
                type,
                q,
                params.where,
                params.orderBy
              ),
            {
              [source.name]: { headers }
            }
          );
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
  types: Record<string, GraphQLObjectType>,
  enums: Record<string, GraphQLEnumType>,
  inputs: Record<string, GraphQLInputObjectType>
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
          args: {
            orderBy: {
              type: makeOrderByInputType(schema, type, enums)
            },
            where: {
              type: makeWhereInputType(schema, type, inputs)
            }
          },
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

function makeOrderByInputType(
  schema: Schema,
  type: string,
  enums: Record<string, GraphQLEnumType>
) {
  const typeClassName = `${classify(type)}OrderByInput`;
  let OrderByInput = enums[typeClassName];

  if (!OrderByInput) {
    const orderByInputFields: GraphQLEnumValueConfigMap = {
      ['id_ASC']: { value: { attribute: 'id', order: 'ascending' } },
      ['id_DESC']: { value: { attribute: 'id', order: 'descending' } }
    };
    schema.eachAttribute(type, property => {
      orderByInputFields[`${property}_ASC`] = {
        value: { attribute: property, order: 'ascending' }
      };
      orderByInputFields[`${property}_DESC`] = {
        value: { attribute: property, order: 'descending' }
      };
    });

    OrderByInput = new GraphQLEnumType({
      name: typeClassName,
      values: orderByInputFields
    });

    enums[typeClassName] = OrderByInput;
  }

  return OrderByInput;
}

function makeWhereInputType(
  schema: Schema,
  type: string,
  inputs: Record<string, GraphQLInputObjectType>
) {
  const typeClassName = `${classify(type)}WhereInput`;
  let WhereInput = inputs[typeClassName];

  if (!WhereInput) {
    const whereInputFields: GraphQLInputFieldConfigMap = {
      id: { type: GraphQLID },
      ['id_in']: { type: new GraphQLList(GraphQLID) }
    };
    schema.eachAttribute(type, (property, attribute) => {
      const GraphQLType = getAttributeGraphQLType(attribute);
      whereInputFields[property] = {
        type: GraphQLType
      };
      whereInputFields[`${property}_not`] = {
        type: GraphQLType
      };
      whereInputFields[`${property}_in`] = {
        type: new GraphQLList(GraphQLType)
      };
      whereInputFields[`${property}_not_in`] = {
        type: new GraphQLList(GraphQLType)
      };
    });

    WhereInput = new GraphQLInputObjectType({
      name: typeClassName,
      fields: whereInputFields
    });

    inputs[typeClassName] = WhereInput;
  }

  return WhereInput;
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

function buildFindRecordsQuery(
  schema: Schema,
  type: string,
  q: QueryBuilder,
  where?: Record<string, any>,
  orderBy?: SortQBParam
) {
  let term;
  const { id_in: idIn = undefined, id = undefined, ...whereOnAttributes } =
    where || {};
  if (idIn) {
    term = q.findRecords((idIn as string[]).map(id => ({ type, id })));
  } else if (id) {
    term = q.findRecords([{ type, id }]);
  } else {
    term = q.findRecords(type);
  }
  if (where && Object.keys(whereOnAttributes).length) {
    term = term.filter(...filterQBParams(schema, type, whereOnAttributes));
  }
  if (orderBy) {
    term = term.sort(orderBy);
  }
  return term;
}

function filterQBParams(
  schema: Schema,
  type: string,
  where: Record<string, any>
): FilterQBParam[] {
  const params: FilterQBParam[] = [];
  for (let attribute in where) {
    if (schema.hasAttribute(type, attribute)) {
      params.push({
        attribute,
        value: where[attribute]
      });
    }
  }
  return params;
}
