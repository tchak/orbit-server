import { toArray } from '@orbit/utils';
import {
  RecordNotFoundException,
  SchemaError,
  RecordException,
  RecordIdentity,
  Record as OrbitRecord,
  Schema
} from '@orbit/data';
import {
  ResourceDocument,
  JSONAPISerializer,
  ResourceOperationsDocument
} from '@orbit/jsonapi';
import { dasherize } from '@orbit/utils';

import Context from '../context';

export interface ResourceOperationsResponseDocument {
  operations: ResourceDocument[];
}

interface ResourceError {
  id: string;
  title: string;
  detail: string;
  code: string;
}

interface ErrorsDocument {
  errors: ResourceError[];
}

export interface Params {
  type: string;
  id?: string;
  relationship?: string;
  include?: string | string[];
}

export interface ResourceParams extends Params {
  id: string;
}

export interface RelationshipParams extends Params {
  id: string;
  relationship: string;
}

export interface JSONAPIRequest<T = Params> {
  params: T;
  headers: Record<string, string>;
  context: Context;
  body: ResourceDocument;
}

export interface JSONAPIOperationsRequest {
  params: Params;
  headers: Record<string, string>;
  context: Context;
  body: ResourceOperationsDocument;
}

type HTTPStatus = number;
type Headers = Record<string, string>;
export type JSONAPIResponse<Body = ResourceDocument> = [
  HTTPStatus,
  Headers,
  Body
];

export type Handler = (request: JSONAPIRequest) => Promise<JSONAPIResponse>;

export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  params: { type: string; relationship?: string };
  handler: Handler;
}

export interface JSONAPIServerSettings {
  schema: Schema;
}

export class JSONAPIServer {
  schema: Schema;
  serializer: JSONAPISerializer;

  constructor(settings: JSONAPIServerSettings) {
    this.schema = settings.schema;
    this.serializer = new JSONAPISerializer({ schema: settings.schema });
  }

  eachRoute(callback: (prefix: string, route: RouteDefinition[]) => void) {
    for (let type in this.schema.models) {
      callback(
        dasherize(this.schema.pluralize(type)),
        this.resourceRoutes(type)
      );
    }

    callback('operations', [
      {
        method: 'PATCH',
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
    let code = 500;

    if (error instanceof RecordNotFoundException) {
      detail = error.description;
      code = 404;
    } else if (
      error instanceof SchemaError ||
      error instanceof RecordException
    ) {
      detail = error.description;
      code = 400;
    }

    return [code, { errors: [{ id, title, detail, code: `${code}` }] }];
  }

  protected resourceRoutes(type: string): RouteDefinition[] {
    const routes: RouteDefinition[] = [
      {
        method: 'GET',
        url: '/',
        params: { type },
        handler: this.handleFindRecords.bind(this)
      },
      {
        method: 'POST',
        url: '/',
        params: { type },
        handler: this.handleAddRecord.bind(this)
      },
      {
        method: 'GET',
        url: `/:id`,
        params: { type },
        handler: this.handleFindRecord.bind(this)
      },
      {
        method: 'PATCH',
        url: `/:id`,
        params: { type },
        handler: this.handleUpdateRecord.bind(this)
      },
      {
        method: 'DELETE',
        url: `/:id`,
        params: { type },
        handler: this.handleRemoveRecord.bind(this)
      }
    ];

    this.schema.eachRelationship(type, (property, { type: kind }) => {
      const url = `/:id/relationships/${dasherize(property)}`;

      if (kind === 'hasMany') {
        routes.push({
          method: 'GET',
          url: `/:id/${property}`,
          params: { type, relationship: property },
          handler: this.handleFindRelatedRecords.bind(this)
        });
        routes.push({
          method: 'POST',
          url,
          params: { type, relationship: property },
          handler: this.handleAddToRelatedRecords.bind(this)
        });
        routes.push({
          method: 'DELETE',
          url,
          params: { type, relationship: property },
          handler: this.handleRemoveFromRelatedRecords.bind(this)
        });
        routes.push({
          method: 'PATCH',
          url,
          params: { type, relationship: property },
          handler: this.handleReplaceRelatedRecords.bind(this)
        });
      } else {
        routes.push({
          method: 'GET',
          url: `/:id/${property}`,
          params: { type, relationship: property },
          handler: this.handleFindRelatedRecord.bind(this)
        });
        routes.push({
          method: 'PATCH',
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
    return [204, {}, null];
  }

  protected async handleRemoveRecord({
    params: { type, id },
    headers,
    context
  }: JSONAPIRequest<ResourceParams>): Promise<JSONAPIResponse<null>> {
    const { source } = context;
    const options = transformOptions(headers);

    await source.update(q => q.removeRecord({ id, type }), options);
    return [204, {}, null];
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
    return [200, {}, this.serializer.serialize({ data: record })];
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
    return [201, {}, this.serializer.serialize({ data: record })];
  }

  protected async handleFindRecords({
    params: { type, include },
    context
  }: JSONAPIRequest): Promise<JSONAPIResponse> {
    const { source } = context;

    const records: OrbitRecord[] = await source.query(
      q => q.findRecords(type),
      {
        [source.name]: { include: normalizeInclude(include) }
      }
    );
    return [200, {}, this.serializer.serialize({ data: records })];
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
    return [200, {}, this.serializer.serialize({ data: records })];
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
    return [200, {}, this.serializer.serialize({ data: record })];
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
    return [204, {}, null];
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
    return [204, {}, null];
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
    return [204, {}, null];
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
    return [204, {}, null];
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
      200,
      {},
      {
        operations: result.map(data => this.serializer.serialize({ data }))
      }
    ];
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
