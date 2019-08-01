import { toArray } from '@orbit/utils';
import {
  Source,
  Queryable,
  Updatable,
  RecordNotFoundException,
  SchemaError,
  RecordException,
  RecordIdentity,
  Record as OrbitRecord,
  Schema,
  SortQBParam,
  FilterQBParam,
  ClientError,
  ServerError,
  FindRecordsTerm,
  FindRelatedRecordsTerm
} from '@orbit/data';
import {
  ResourceDocument,
  JSONAPISerializer,
  ResourceOperationsDocument
} from '@orbit/jsonapi';

export interface QueryableAndUpdatableSource
  extends Source,
    Queryable,
    Updatable {}

export interface Context {
  source: QueryableAndUpdatableSource;
  serializer: JSONAPISerializer;
}

export interface ResourceOperationsResponseDocument {
  operations: ResourceDocument[];
}

interface ResourceError {
  id: string;
  title: string;
  detail: string;
  code: HTTPStatus;
}

export interface ErrorsDocument {
  errors: ResourceError[];
}

export interface DefaultParams {
  type: string;
  id?: string;
  relationship?: string;
  include?: string;
  filter?: Record<string, string>;
  page?: Record<string, string>;
  sort?: string;
}

export interface ResourceParams extends DefaultParams {
  id: string;
}

export interface RelationshipParams extends DefaultParams {
  id: string;
  relationship: string;
}

type Headers = Record<string, string>;

export interface JSONAPIRequest<Params = DefaultParams> {
  url: string;
  params: Params;
  headers: Headers;
  context: Context;
  body: ResourceDocument;
}

export interface JSONAPIOperationsRequest {
  params: DefaultParams;
  headers: Headers;
  context: Context;
  body: ResourceOperationsDocument;
}

enum HTTPMethods {
  Get = 'GET',
  Post = 'POST',
  Patch = 'PATCH',
  Delete = 'DELETE'
}

enum HTTPStatus {
  Ok = 200,
  Created = 201,
  NoContent = 204,
  BadRequest = 400,
  NotFound = 404,
  InternalServerError = 500
}

export type JSONAPIResponse<Body = ResourceDocument> = [
  HTTPStatus,
  Headers,
  Body
];

export type Handler = (
  request: JSONAPIRequest | JSONAPIOperationsRequest
) => Promise<
  JSONAPIResponse<ResourceDocument | ResourceOperationsResponseDocument | null>
>;

export interface RouteDefinition {
  method: HTTPMethods;
  url: string;
  params: { type: string; relationship?: string };
  handler: Handler;
}

export interface RouteHandlersArgs {
  schema: Schema;
  serializer: JSONAPISerializer;
  readonly: boolean;
}

export function routeHandlers(
  args: RouteHandlersArgs,
  callback: (prefix: string, routes: RouteDefinition[]) => void
): void {
  for (let type in args.schema.models) {
    const prefix = args.serializer.resourceType(type);
    callback(prefix, resourceRoutes(args, type));
  }

  if (!args.readonly) {
    callback('/operations', [
      {
        method: HTTPMethods.Patch,
        url: '/',
        params: { type: 'operations' },
        handler: handleOperations
      }
    ]);
  }
}

export async function errorHandler(
  source: Source,
  error: Error
): Promise<[number, ErrorsDocument]> {
  await source.requestQueue.clear().catch(() => {});

  const id = source.schema.generateId();
  const title = error.message;
  let detail = '';
  let code = HTTPStatus.InternalServerError;

  if (error instanceof RecordNotFoundException) {
    detail = error.description;
    code = HTTPStatus.NotFound;
  } else if (error instanceof ClientError || error instanceof ServerError) {
    detail = error.description;
    code = (error as any).response.status;
  } else if (error instanceof SchemaError || error instanceof RecordException) {
    detail = error.description;
    code = HTTPStatus.BadRequest;
  }

  return [code, { errors: [{ id, title, detail, code }] }];
}

function resourceRoutes(
  args: RouteHandlersArgs,
  type: string
): RouteDefinition[] {
  const routes: RouteDefinition[] = [
    {
      method: HTTPMethods.Get,
      url: '/',
      params: { type },
      handler: handleFindRecords
    },
    {
      method: HTTPMethods.Get,
      url: `/:id`,
      params: { type },
      handler: handleFindRecord
    }
  ];

  if (!args.readonly) {
    routes.push(
      {
        method: HTTPMethods.Patch,
        url: `/:id`,
        params: { type },
        handler: handleUpdateRecord
      },
      {
        method: HTTPMethods.Delete,
        url: `/:id`,
        params: { type },
        handler: handleRemoveRecord
      },
      {
        method: HTTPMethods.Post,
        url: '/',
        params: { type },
        handler: handleAddRecord
      }
    );
  }

  args.schema.eachRelationship(type, (property, { type: kind }) => {
    const url = `/:id/relationships/${args.serializer.resourceRelationship(
      type,
      property
    )}`;

    if (kind === 'hasMany') {
      routes.push({
        method: HTTPMethods.Get,
        url: `/:id/${property}`,
        params: { type, relationship: property },
        handler: handleFindRelatedRecords
      });
      if (!args.readonly) {
        routes.push(
          {
            method: HTTPMethods.Post,
            url,
            params: { type, relationship: property },
            handler: handleAddToRelatedRecords
          },
          {
            method: HTTPMethods.Delete,
            url,
            params: { type, relationship: property },
            handler: handleRemoveFromRelatedRecords
          },
          {
            method: HTTPMethods.Patch,
            url,
            params: { type, relationship: property },
            handler: handleReplaceRelatedRecords
          }
        );
      }
    } else {
      routes.push({
        method: HTTPMethods.Get,
        url: `/:id/${property}`,
        params: { type, relationship: property },
        handler: handleFindRelatedRecord
      });
      if (!args.readonly) {
        routes.push({
          method: HTTPMethods.Patch,
          url,
          params: { type, relationship: property },
          handler: handleReplaceRelatedRecord
        });
      }
    }
  });

  return routes;
}

export async function handleUpdateRecord({
  body,
  headers,
  context
}: JSONAPIRequest<ResourceParams>): Promise<JSONAPIResponse<null>> {
  const { source, serializer } = context;
  const { data } = serializer.deserialize(body);

  await source.update(q => q.updateRecord(data as OrbitRecord), {
    [source.name]: sourceOptions(headers)
  });
  return [HTTPStatus.NoContent, {}, null];
}

export async function handleRemoveRecord({
  params: { type, id },
  headers,
  context
}: JSONAPIRequest<ResourceParams>): Promise<JSONAPIResponse<null>> {
  const { source } = context;

  await source.update(q => q.removeRecord({ id, type }), {
    [source.name]: sourceOptions(headers)
  });
  return [HTTPStatus.NoContent, {}, null];
}

export async function handleFindRecord({
  params: { type, id, include },
  headers,
  context
}: JSONAPIRequest<ResourceParams>): Promise<JSONAPIResponse> {
  const { source, serializer } = context;

  const record: OrbitRecord = await source.query(
    q => q.findRecord({ type, id }),
    {
      [source.name]: sourceOptions(headers, include)
    }
  );
  return [HTTPStatus.Ok, {}, serializer.serialize({ data: record })];
}

export async function handleAddRecord({
  url,
  params: { include },
  body,
  headers,
  context
}: JSONAPIRequest): Promise<JSONAPIResponse> {
  const { source, serializer } = context;
  const { data } = serializer.deserialize(body);

  const record: OrbitRecord = await source.update(
    q => q.addRecord(data as OrbitRecord),
    {
      [source.name]: sourceOptions(headers, include)
    }
  );
  return [
    HTTPStatus.Created,
    {
      location: `${url}/${record.id}`
    },
    serializer.serialize({ data: record })
  ];
}

export async function handleFindRecords({
  params: { type, include, filter, sort },
  headers,
  context
}: JSONAPIRequest): Promise<JSONAPIResponse> {
  const { source, serializer } = context;

  const records: OrbitRecord[] = await source.query(
    q =>
      queryBuilderParams(serializer, q.findRecords(type), type, filter, sort),
    {
      [source.name]: sourceOptions(headers, include)
    }
  );
  return [HTTPStatus.Ok, {}, serializer.serialize({ data: records })];
}

export async function handleFindRelatedRecords({
  params: { type, id, relationship, include, filter, sort },
  headers,
  context
}: JSONAPIRequest<RelationshipParams>): Promise<JSONAPIResponse> {
  const { source, serializer } = context;

  const records: OrbitRecord[] = await source.query(
    q =>
      queryBuilderParams(
        serializer,
        q.findRelatedRecords({ type, id }, relationship),
        type,
        filter,
        sort
      ),
    {
      [source.name]: sourceOptions(headers, include)
    }
  );
  return [HTTPStatus.Ok, {}, serializer.serialize({ data: records })];
}

export async function handleFindRelatedRecord({
  params: { type, id, relationship, include },
  headers,
  context
}: JSONAPIRequest<RelationshipParams>): Promise<JSONAPIResponse> {
  const { source, serializer } = context;

  const record: OrbitRecord = await source.query(
    q => q.findRelatedRecord({ type, id }, relationship),
    {
      [source.name]: sourceOptions(headers, include)
    }
  );
  return [HTTPStatus.Ok, {}, serializer.serialize({ data: record })];
}

export async function handleAddToRelatedRecords({
  params: { type, id, relationship },
  body,
  headers,
  context
}: JSONAPIRequest<RelationshipParams>): Promise<JSONAPIResponse<null>> {
  const { source, serializer } = context;
  const { data } = serializer.deserialize(body);

  for (let identity of data as RecordIdentity[]) {
    await source.update(
      q => q.addToRelatedRecords({ id, type }, relationship, identity),
      {
        [source.name]: sourceOptions(headers)
      }
    );
  }
  return [HTTPStatus.NoContent, {}, null];
}

export async function handleRemoveFromRelatedRecords({
  params: { type, id, relationship },
  body,
  headers,
  context
}: JSONAPIRequest<RelationshipParams>): Promise<JSONAPIResponse<null>> {
  const { source, serializer } = context;
  const { data } = serializer.deserialize(body);

  for (let identity of data as RecordIdentity[]) {
    await source.update(
      q => q.removeFromRelatedRecords({ id, type }, relationship, identity),
      {
        [source.name]: sourceOptions(headers)
      }
    );
  }
  return [HTTPStatus.NoContent, {}, null];
}

export async function handleReplaceRelatedRecords({
  params: { type, id, relationship },
  body,
  headers,
  context
}: JSONAPIRequest<RelationshipParams>): Promise<JSONAPIResponse<null>> {
  const { source, serializer } = context;
  const { data } = serializer.deserialize(body);

  await source.update(
    q =>
      q.replaceRelatedRecords(
        { id, type },
        relationship as string,
        data as RecordIdentity[]
      ),
    {
      [source.name]: sourceOptions(headers)
    }
  );
  return [HTTPStatus.NoContent, {}, null];
}

export async function handleReplaceRelatedRecord({
  params: { type, id, relationship },
  body,
  headers,
  context
}: JSONAPIRequest<RelationshipParams>): Promise<JSONAPIResponse<null>> {
  const { source, serializer } = context;
  const { data } = serializer.deserialize(body);

  await source.update(
    q =>
      q.replaceRelatedRecord(
        { id, type },
        relationship as string,
        data as RecordIdentity
      ),
    {
      [source.name]: sourceOptions(headers)
    }
  );
  return [HTTPStatus.NoContent, {}, null];
}

export async function handleOperations({
  body,
  headers,
  context
}: JSONAPIOperationsRequest): Promise<
  JSONAPIResponse<ResourceOperationsResponseDocument>
> {
  const { source, serializer } = context;
  const operations = serializer.deserializeOperationsDocument(body);

  for (let operation of operations) {
    if (operation.op === 'addRecord') {
      source.schema.initializeRecord(operation.record);
    }
  }

  const records: OrbitRecord[] = toArray(
    await source.update(operations, {
      [source.name]: sourceOptions(headers)
    })
  );
  return [
    HTTPStatus.Ok,
    {},
    {
      operations: records.map(data => serializer.serialize({ data }))
    }
  ];
}

function sourceOptions(headers: Headers, include?: string) {
  return {
    include,
    settings: {
      headers
    }
  };
}

function queryBuilderParams(
  serializer: JSONAPISerializer,
  term: FindRecordsTerm | FindRelatedRecordsTerm,
  type: string,
  filter?: Record<string, string>,
  sort?: string
) {
  if (filter) {
    term = term.filter(...filterQBParams(serializer, type, filter));
  }
  if (sort) {
    term = term.sort(...sortQBParams(serializer, type, sort));
  }
  return term;
}

function filterQBParams(
  serializer: JSONAPISerializer,
  type: string,
  filter: Record<string, string>
): FilterQBParam[] {
  const params: FilterQBParam[] = [];
  for (let property in filter) {
    let attribute = serializer.recordAttribute(type, property);
    if (serializer.schema.hasAttribute(type, attribute)) {
      params.push({
        op: 'equal',
        attribute,
        value: filter[property]
      });
    }
  }
  return params;
}

function sortQBParams(
  serializer: JSONAPISerializer,
  type: string,
  sort: string
): SortQBParam[] {
  const params: SortQBParam[] = [];
  for (let property of sort.split(',')) {
    let desc = property.startsWith('-');
    let attribute = serializer.recordAttribute(
      type,
      desc ? property.substring(1) : property
    );
    if (serializer.schema.hasAttribute(type, attribute)) {
      params.push({
        attribute,
        order: desc ? 'descending' : 'ascending'
      });
    }
  }
  return params;
}
