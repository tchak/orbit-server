import {
  RecordNotFoundException,
  SchemaError,
  RecordException,
  RecordIdentity,
  Record as OrbitRecord,
  SortQBParam,
  FilterQBParam,
  ClientError,
  ServerError,
  FindRecordsTerm,
  FindRelatedRecordsTerm
} from '@orbit/data';
import { ResourceDocument, JSONAPISerializer } from '@orbit/jsonapi';
import { toArray } from '@orbit/utils';

import { Source, Context } from './types';

export interface Ref {
  type: string;
  id?: string;
  relationship?: string;
}

export interface Request {
  op: string;
  ref: Ref;
  url: string;
  params: Record<string, any>;
  document?: ResourceDocument;
  options?: Record<string, any>;
}

export interface RequestWithId extends Request {
  ref: {
    type: string;
    id: string;
  };
}

export interface RequestWithRelationship extends Request {
  ref: {
    type: string;
    id: string;
    relationship: string;
  };
}

export type Headers = Record<string, string>;

export enum Status {
  Ok = 200,
  Created = 201,
  NoContent = 204,
  BadRequest = 400,
  NotFound = 404,
  InternalServerError = 500
}

interface ResourceError {
  id: string;
  title: string;
  detail: string;
  code: Status;
}

export interface ErrorsDocument {
  errors: ResourceError[];
}

export type Response = [
  Status,
  Headers,
  null | ResourceDocument | ErrorsDocument
];

export async function onError(source: Source, error: Error): Promise<Response> {
  await source.requestQueue.clear().catch(() => {});

  const id = source.schema.generateId();
  const title = error.message;
  let detail = '';
  let code = Status.InternalServerError;

  if (error instanceof RecordNotFoundException) {
    detail = error.description;
    code = Status.NotFound;
  } else if (error instanceof ClientError || error instanceof ServerError) {
    detail = error.description;
    code = (error as any).response.status;
  } else if (error instanceof SchemaError || error instanceof RecordException) {
    detail = error.description;
    code = Status.BadRequest;
  }

  return [
    code,
    {
      ['Content-Type']: 'application/vnd.api+json; charset=utf-8'
    },
    { errors: [{ id, title, detail, code }] }
  ];
}

export async function addRecord(
  request: Request,
  context: Context
): Promise<Response> {
  const { source, serializer } = context;
  if (!request.document) {
    throw new Error('addRecord: request.document is required');
  }
  const { data } = serializer.deserialize(request.document);

  const record: OrbitRecord = await source.update(
    q => q.addRecord(data as OrbitRecord),
    {
      [source.name]: request.options
    }
  );
  return [
    Status.Created,
    {
      location: `${request.url}/${record.id}`,
      ['Content-Type']: 'application/vnd.api+json; charset=utf-8'
    },
    serializer.serialize({ data: record })
  ];
}

export async function updateRecord(
  request: Request,
  context: Context
): Promise<Response> {
  const { source, serializer } = context;
  if (!request.document) {
    throw new Error('updateRecord: request.document is required');
  }
  const { data } = serializer.deserialize(request.document);

  await source.update(q => q.updateRecord(data as OrbitRecord), {
    [source.name]: request.options
  });
  return [Status.NoContent, {}, null];
}

export async function removeRecord(
  request: RequestWithId,
  context: Context
): Promise<Response> {
  const { id, type } = request.ref;
  const { source } = context;

  await source.update(q => q.removeRecord({ id, type }), {
    [source.name]: request.options
  });
  return [Status.NoContent, {}, null];
}

export async function findRecord(
  request: RequestWithId,
  context: Context
): Promise<Response> {
  const { id, type } = request.ref;
  const { source, serializer } = context;

  const record: OrbitRecord = await source.query(
    q => q.findRecord({ type, id }),
    {
      [source.name]: request.options
    }
  );
  return [
    Status.Ok,
    {
      ['Content-Type']: 'application/vnd.api+json; charset=utf-8'
    },
    serializer.serialize({ data: record })
  ];
}

export async function findRecords(
  request: Request,
  context: Context
): Promise<Response> {
  const { type } = request.ref;
  const { filter, sort } = request.params;
  const { source, serializer } = context;

  const records: OrbitRecord[] = await source.query(
    q =>
      queryBuilderParams(serializer, q.findRecords(type), type, filter, sort),
    {
      [source.name]: request.options
    }
  );
  return [
    Status.Ok,
    {
      ['Content-Type']: 'application/vnd.api+json; charset=utf-8'
    },
    serializer.serialize({ data: records })
  ];
}

export async function findRelatedRecords(
  request: RequestWithRelationship,
  context: Context
): Promise<Response> {
  const { type, id, relationship } = request.ref;
  const { filter, sort } = request.params;
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
      [source.name]: request.options
    }
  );
  return [
    Status.Ok,
    {
      ['Content-Type']: 'application/vnd.api+json; charset=utf-8'
    },
    serializer.serialize({ data: records })
  ];
}

export async function findRelatedRecord(
  request: RequestWithRelationship,
  context: Context
): Promise<Response> {
  const { type, id, relationship } = request.ref;
  const { source, serializer } = context;

  const record: OrbitRecord = await source.query(
    q => q.findRelatedRecord({ type, id }, relationship),
    {
      [source.name]: request.options
    }
  );
  return [
    Status.Ok,
    {
      ['Content-Type']: 'application/vnd.api+json; charset=utf-8'
    },
    serializer.serialize({ data: record })
  ];
}

export async function addToRelatedRecords(
  request: RequestWithRelationship,
  context: Context
): Promise<Response> {
  const { type, id, relationship } = request.ref;
  const { source, serializer } = context;
  if (!request.document) {
    throw new Error('addToRelatedRecords: request.document is required');
  }
  const { data } = serializer.deserialize(request.document);

  for (let identity of data as RecordIdentity[]) {
    await source.update(
      q => q.addToRelatedRecords({ id, type }, relationship, identity),
      {
        [source.name]: request.options
      }
    );
  }
  return [Status.NoContent, {}, null];
}

export async function removeFromRelatedRecords(
  request: RequestWithRelationship,
  context: Context
): Promise<Response> {
  const { type, id, relationship } = request.ref;
  const { source, serializer } = context;
  if (!request.document) {
    throw new Error('removeFromRelatedRecords: request.document is required');
  }
  const { data } = serializer.deserialize(request.document);

  for (let identity of data as RecordIdentity[]) {
    await source.update(
      q => q.removeFromRelatedRecords({ id, type }, relationship, identity),
      {
        [source.name]: request.options
      }
    );
  }
  return [Status.NoContent, {}, null];
}

export async function replaceRelatedRecords(
  request: RequestWithRelationship,
  context: Context
): Promise<Response> {
  const { type, id, relationship } = request.ref;
  const { source, serializer } = context;
  if (!request.document) {
    throw new Error('replaceRelatedRecords: request.document is required');
  }
  const { data } = serializer.deserialize(request.document);

  await source.update(
    q =>
      q.replaceRelatedRecords(
        { id, type },
        relationship as string,
        data as RecordIdentity[]
      ),
    {
      [source.name]: request.options
    }
  );
  return [Status.NoContent, {}, null];
}

export async function replaceRelatedRecord(
  request: RequestWithRelationship,
  context: Context
): Promise<Response> {
  const { type, id, relationship } = request.ref;
  const { source, serializer } = context;
  if (!request.document) {
    throw new Error('replaceRelatedRecord: request.document is required');
  }
  const { data } = serializer.deserialize(request.document);

  await source.update(
    q =>
      q.replaceRelatedRecord(
        { id, type },
        relationship as string,
        data as RecordIdentity
      ),
    {
      [source.name]: request.options
    }
  );
  return [Status.NoContent, {}, null];
}

export function processRequest(request: Request, context: Context) {
  switch (request.op) {
    case 'findRecord':
      return findRecord(request as RequestWithId, context);
    case 'findRecords':
      return findRecords(request, context);
    case 'findRelatedRecord':
      return findRelatedRecord(request as RequestWithRelationship, context);
    case 'findRelatedRecords':
      return findRelatedRecords(request as RequestWithRelationship, context);
    case 'addRecord':
      return addRecord(request, context);
    case 'updateRecord':
      return updateRecord(request as RequestWithId, context);
    case 'removeRecord':
      return removeRecord(request as RequestWithId, context);
    case 'addToRelatedRecords':
      return addToRelatedRecords(request as RequestWithRelationship, context);
    case 'removeFromRelatedRecords':
      return removeFromRelatedRecords(
        request as RequestWithRelationship,
        context
      );
    case 'replaceRelatedRecord':
      return replaceRelatedRecord(request as RequestWithRelationship, context);
    case 'replaceRelatedRecords':
      return replaceRelatedRecords(request as RequestWithRelationship, context);
  }
  throw new Error(`"${request.op}": is not a valid operation`);
}

export async function processBatchRequest(request: Request, context: Context) {
  const { source, serializer } = context;
  const operations = serializer.deserializeOperationsDocument(
    request.document as any
  );

  for (let operation of operations) {
    if (operation.op === 'addRecord') {
      source.schema.initializeRecord(operation.record);
    }
  }

  const records: OrbitRecord[] = toArray(
    await source.update(operations, {
      [source.name]: request.options
    })
  );
  return [
    Status.Ok,
    {
      ['Content-Type']: 'application/vnd.api+json; charset=utf-8'
    },
    {
      operations: records.map(data => serializer.serialize({ data }))
    }
  ];
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
