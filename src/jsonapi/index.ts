import { toArray } from '@orbit/utils';
import {
  RecordNotFoundException,
  SchemaError,
  RecordException,
  RecordIdentity,
  Record as OrbitRecord,
  Schema,
  SortQBParam,
  FilterQBParam,
  QueryBuilder
} from '@orbit/data';
import {
  ResourceDocument,
  JSONAPISerializer,
  ResourceOperationsDocument
} from '@orbit/jsonapi';

import Context from '../context';

export interface ResourceOperationsResponseDocument {
  operations: ResourceDocument[];
}

interface ResourceError {
  id: string;
  title: string;
  detail: string;
  code: HTTPStatus;
}

interface ErrorsDocument {
  errors: ResourceError[];
}

export interface DefaultParams {
  type: string;
  id?: string;
  relationship?: string;
  include?: string | string[];
  filter?: Record<string, string>;
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

export type Handler = (request: JSONAPIRequest) => Promise<JSONAPIResponse>;

export interface RouteDefinition {
  method: HTTPMethods;
  url: string;
  params: { type: string; relationship?: string };
  handler: Handler;
}

export interface JSONAPIServerSettings {
  schema: Schema;
}

export class JSONAPIServer {
  readonly schema: Schema;
  protected readonly serializer: JSONAPISerializer;

  constructor(settings: JSONAPIServerSettings) {
    this.schema = settings.schema;
    this.serializer = new JSONAPISerializer({ schema: settings.schema });
  }

  eachRoute(callback: (prefix: string, route: RouteDefinition[]) => void) {
    for (let type in this.schema.models) {
      callback(this.serializer.resourceType(type), this.resourceRoutes(type));
    }

    callback('operations', [
      {
        method: HTTPMethods.Patch,
        url: '/',
        params: { type: 'operations' },
        handler: this.handleOperations.bind(this)
      }
    ]);
  }

  handleError(error: Error): [number, ErrorsDocument] {
    const id = this.schema.generateId();
    const title = error.message;
    let detail = '';
    let code = HTTPStatus.InternalServerError;

    if (error instanceof RecordNotFoundException) {
      detail = error.description;
      code = HTTPStatus.NotFound;
    } else if (
      error instanceof SchemaError ||
      error instanceof RecordException
    ) {
      detail = error.description;
      code = HTTPStatus.BadRequest;
    }

    return [code, { errors: [{ id, title, detail, code }] }];
  }

  protected resourceRoutes(type: string): RouteDefinition[] {
    const routes: RouteDefinition[] = [
      {
        method: HTTPMethods.Get,
        url: '/',
        params: { type },
        handler: this.handleFindRecords.bind(this)
      },
      {
        method: HTTPMethods.Post,
        url: '/',
        params: { type },
        handler: this.handleAddRecord.bind(this)
      },
      {
        method: HTTPMethods.Get,
        url: `/:id`,
        params: { type },
        handler: this.handleFindRecord.bind(this)
      },
      {
        method: HTTPMethods.Patch,
        url: `/:id`,
        params: { type },
        handler: this.handleUpdateRecord.bind(this)
      },
      {
        method: HTTPMethods.Delete,
        url: `/:id`,
        params: { type },
        handler: this.handleRemoveRecord.bind(this)
      }
    ];

    this.schema.eachRelationship(type, (property, { type: kind }) => {
      const url = `/:id/relationships/${this.serializer.resourceRelationship(
        type,
        property
      )}`;

      if (kind === 'hasMany') {
        routes.push({
          method: HTTPMethods.Get,
          url: `/:id/${property}`,
          params: { type, relationship: property },
          handler: this.handleFindRelatedRecords.bind(this)
        });
        routes.push({
          method: HTTPMethods.Post,
          url,
          params: { type, relationship: property },
          handler: this.handleAddToRelatedRecords.bind(this)
        });
        routes.push({
          method: HTTPMethods.Delete,
          url,
          params: { type, relationship: property },
          handler: this.handleRemoveFromRelatedRecords.bind(this)
        });
        routes.push({
          method: HTTPMethods.Patch,
          url,
          params: { type, relationship: property },
          handler: this.handleReplaceRelatedRecords.bind(this)
        });
      } else {
        routes.push({
          method: HTTPMethods.Get,
          url: `/:id/${property}`,
          params: { type, relationship: property },
          handler: this.handleFindRelatedRecord.bind(this)
        });
        routes.push({
          method: HTTPMethods.Patch,
          url,
          params: { type, relationship: property },
          handler: this.handleReplaceRelatedRecord.bind(this)
        });
      }
    });

    return routes;
  }

  protected async handleUpdateRecord({
    body,
    headers,
    context
  }: JSONAPIRequest<ResourceParams>): Promise<JSONAPIResponse<null>> {
    const { source } = context;
    const { data } = this.serializer.deserialize(body);
    const options = transformOptions(headers);

    await source.update(q => q.updateRecord(data as OrbitRecord), options);
    return [HTTPStatus.NoContent, {}, null];
  }

  protected async handleRemoveRecord({
    params: { type, id },
    headers,
    context
  }: JSONAPIRequest<ResourceParams>): Promise<JSONAPIResponse<null>> {
    const { source } = context;
    const options = transformOptions(headers);

    await source.update(q => q.removeRecord({ id, type }), options);
    return [HTTPStatus.NoContent, {}, null];
  }

  protected async handleFindRecord({
    params: { type, id, include },
    context
  }: JSONAPIRequest<ResourceParams>): Promise<JSONAPIResponse> {
    const { source } = context;

    const record: OrbitRecord = await source.query(
      q => q.findRecord({ type, id }),
      {
        [source.name]: { include: normalizeInclude(include) }
      }
    );
    return [HTTPStatus.Ok, {}, this.serializer.serialize({ data: record })];
  }

  protected async handleAddRecord({
    body,
    headers,
    context
  }: JSONAPIRequest): Promise<JSONAPIResponse> {
    const { source } = context;
    const { data } = this.serializer.deserialize(body);
    const options = transformOptions(headers);
    const record: OrbitRecord = await source.update(
      q => q.addRecord(data as OrbitRecord),
      options
    );
    return [
      HTTPStatus.Created,
      {},
      this.serializer.serialize({ data: record })
    ];
  }

  protected async handleFindRecords({
    params: { type, include, filter, sort },
    context
  }: JSONAPIRequest): Promise<JSONAPIResponse> {
    const { source } = context;

    const records: OrbitRecord[] = await source.query(
      q => this.buildFindRecordsQuery(q, type, filter, sort),
      {
        [source.name]: { include: normalizeInclude(include) }
      }
    );
    return [HTTPStatus.Ok, {}, this.serializer.serialize({ data: records })];
  }

  protected async handleFindRelatedRecords({
    params: { type, id, relationship, include },
    context
  }: JSONAPIRequest<RelationshipParams>): Promise<JSONAPIResponse> {
    const { source } = context;

    const records: OrbitRecord[] = await source.query(
      q => q.findRelatedRecords({ type, id }, relationship),
      {
        [source.name]: { include: normalizeInclude(include) }
      }
    );
    return [HTTPStatus.Ok, {}, this.serializer.serialize({ data: records })];
  }

  protected async handleFindRelatedRecord({
    params: { type, id, relationship, include },
    context
  }: JSONAPIRequest<RelationshipParams>): Promise<JSONAPIResponse> {
    const { source } = context;

    const record: OrbitRecord = await source.query(
      q => q.findRelatedRecord({ type, id }, relationship),
      {
        [source.name]: { include: normalizeInclude(include) }
      }
    );
    return [HTTPStatus.Ok, {}, this.serializer.serialize({ data: record })];
  }

  protected async handleAddToRelatedRecords({
    params: { type, id, relationship },
    body,
    headers,
    context
  }: JSONAPIRequest<RelationshipParams>): Promise<JSONAPIResponse<null>> {
    const { source } = context;
    const { data } = this.serializer.deserialize(body);
    const options = transformOptions(headers);

    for (let identity of data as RecordIdentity[]) {
      await source.update(
        q => q.addToRelatedRecords({ id, type }, relationship, identity),
        options
      );
    }
    return [HTTPStatus.NoContent, {}, null];
  }

  protected async handleRemoveFromRelatedRecords({
    params: { type, id, relationship },
    body,
    headers,
    context
  }: JSONAPIRequest<RelationshipParams>): Promise<JSONAPIResponse<null>> {
    const { source } = context;
    const { data } = this.serializer.deserialize(body);
    const options = transformOptions(headers);

    for (let identity of data as RecordIdentity[]) {
      await source.update(
        q => q.removeFromRelatedRecords({ id, type }, relationship, identity),
        options
      );
    }
    return [HTTPStatus.NoContent, {}, null];
  }

  protected async handleReplaceRelatedRecords({
    params: { type, id, relationship },
    body,
    headers,
    context
  }: JSONAPIRequest<RelationshipParams>): Promise<JSONAPIResponse<null>> {
    const { source } = context;
    const { data } = this.serializer.deserialize(body);
    const options = transformOptions(headers);

    await source.update(
      q =>
        q.replaceRelatedRecords(
          { id, type },
          relationship as string,
          data as RecordIdentity[]
        ),
      options
    );
    return [HTTPStatus.NoContent, {}, null];
  }

  protected async handleReplaceRelatedRecord({
    params: { type, id, relationship },
    body,
    headers,
    context
  }: JSONAPIRequest<RelationshipParams>): Promise<JSONAPIResponse<null>> {
    const { source } = context;
    const { data } = this.serializer.deserialize(body);
    const options = transformOptions(headers);

    await source.update(
      q =>
        q.replaceRelatedRecord(
          { id, type },
          relationship as string,
          data as RecordIdentity
        ),
      options
    );
    return [HTTPStatus.NoContent, {}, null];
  }

  protected async handleOperations({
    body,
    context
  }: JSONAPIOperationsRequest): Promise<
    JSONAPIResponse<ResourceOperationsResponseDocument>
  > {
    const { source } = context;
    const operations = this.serializer.deserializeOperationsDocument(body);
    for (let operation of operations) {
      if (operation.op === 'addRecord') {
        source.schema.initializeRecord(operation.record);
      }
    }
    const result: OrbitRecord[] = toArray(await source.update(operations));
    return [
      HTTPStatus.Ok,
      {},
      {
        operations: result.map(data => this.serializer.serialize({ data }))
      }
    ];
  }

  protected buildFindRecordsQuery(
    q: QueryBuilder,
    type: string,
    filter?: Record<string, string>,
    sort?: string
  ) {
    let term = q.findRecords(type);
    if (filter) {
      term = term.filter(...this.filterQBParams(type, filter));
    }
    if (sort) {
      term = term.sort(...this.sortQBParams(type, sort));
    }
    return term;
  }

  protected filterQBParams(
    type: string,
    filter: Record<string, string>
  ): FilterQBParam[] {
    const params: FilterQBParam[] = [];
    for (let property in filter) {
      let attribute = this.serializer.recordAttribute(type, property);
      if (this.schema.hasAttribute(type, attribute)) {
        params.push({
          attribute,
          value: filter[property]
        });
      }
    }
    return params;
  }

  protected sortQBParams(type: string, sort: string): SortQBParam[] {
    const params: SortQBParam[] = [];
    for (let property of sort.split(',')) {
      let desc = property.startsWith('-');
      let attribute = this.serializer.recordAttribute(
        type,
        desc ? property.substring(1) : property
      );
      if (this.schema.hasAttribute(type, attribute)) {
        params.push({
          attribute,
          order: desc ? 'descending' : 'ascending'
        });
      }
    }
    return params;
  }
}

function normalizeInclude(include?: string | string[]): string[] {
  return include ? (Array.isArray(include) ? include : [include]) : [];
}

function transformOptions(headers: Record<string, string>) {
  if (headers['x-client-id']) {
    return { clientId: headers['x-client-id'] };
  }
  return {};
}
