import { toArray } from '@orbit/utils';
import { RecordIdentity, Record as OrbitRecord } from '@orbit/data';
import {
  ResourceDocument,
  JSONAPISerializer,
  ResourceOperationsDocument
} from '@orbit/jsonapi';

import Source from '../source';

export interface ResourceOperationsResponseDocument {
  operations: ResourceDocument[];
}

export interface Context {
  source: Source;
  serializer: JSONAPISerializer;
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

export type Handler = (
  request: JSONAPIRequest | JSONAPIOperationsRequest
) => Promise<ResourceDocument | ResourceOperationsResponseDocument>;

export async function handleUpdateRecord({
  body,
  headers,
  context
}: JSONAPIRequest<ResourceParams>): Promise<ResourceDocument> {
  const { source, serializer } = context;
  const { data } = serializer.deserialize(body);
  const options = transformOptions(headers);

  const record: OrbitRecord = await source.update(
    q => q.updateRecord(data as OrbitRecord),
    options
  );
  return serializer.serialize({ data: record });
}

export async function handleRemoveRecord({
  params: { type, id },
  headers,
  context
}: JSONAPIRequest<ResourceParams>): Promise<ResourceDocument> {
  const { source } = context;
  const options = transformOptions(headers);

  await source.update(q => q.removeRecord({ id, type }), options);
  return { data: [] };
}

export async function handleFindRecord({
  params: { type, id, include },
  context
}: JSONAPIRequest<ResourceParams>): Promise<ResourceDocument> {
  const { source, serializer } = context;

  const record: OrbitRecord = await source.query(
    q => q.findRecord({ type, id }),
    {
      [source.name]: { include: normalizeInclude(include) }
    }
  );
  return serializer.serialize({ data: record });
}

export async function handleAddRecord({
  body,
  headers,
  context
}: JSONAPIRequest): Promise<ResourceDocument> {
  const { source, serializer } = context;
  const { data } = serializer.deserialize(body);
  const options = transformOptions(headers);
  const record: OrbitRecord = await source.update(
    q => q.addRecord(data as OrbitRecord),
    options
  );
  return serializer.serialize({ data: record });
}

export async function handleFindRecords({
  params: { type, include },
  context
}: JSONAPIRequest): Promise<ResourceDocument> {
  const { source, serializer } = context;

  const records: OrbitRecord[] = await source.query(q => q.findRecords(type), {
    [source.name]: { include: normalizeInclude(include) }
  });
  return serializer.serialize({ data: records });
}

export async function handleFindRelatedRecords({
  params: { type, id, relationship, include },
  context
}: JSONAPIRequest<RelationshipParams>): Promise<ResourceDocument> {
  const { source, serializer } = context;

  const records: OrbitRecord[] = await source.query(
    q => q.findRelatedRecords({ type, id }, relationship),
    {
      [source.name]: { include: normalizeInclude(include) }
    }
  );
  return serializer.serialize({ data: records });
}

export async function handleFindRelatedRecord({
  params: { type, id, relationship, include },
  context
}: JSONAPIRequest<RelationshipParams>): Promise<ResourceDocument> {
  const { source, serializer } = context;

  const record: OrbitRecord = await source.query(
    q => q.findRelatedRecord({ type, id }, relationship),
    {
      [source.name]: { include: normalizeInclude(include) }
    }
  );
  return serializer.serialize({ data: record });
}

export async function handleAddToRelatedRecords({
  params: { type, id, relationship },
  body,
  headers,
  context
}: JSONAPIRequest<RelationshipParams>): Promise<ResourceDocument> {
  const { source, serializer } = context;
  const { data } = serializer.deserialize(body);
  const options = transformOptions(headers);

  for (let identity of data as RecordIdentity[]) {
    await source.update(
      q => q.addToRelatedRecords({ id, type }, relationship, identity),
      options
    );
  }
  return { data: [] };
}

export async function handleRemoveFromRelatedRecords({
  params: { type, id, relationship },
  body,
  headers,
  context
}: JSONAPIRequest<RelationshipParams>): Promise<ResourceDocument> {
  const { source, serializer } = context;
  const { data } = serializer.deserialize(body);
  const options = transformOptions(headers);

  for (let identity of data as RecordIdentity[]) {
    await source.update(
      q => q.removeFromRelatedRecords({ id, type }, relationship, identity),
      options
    );
  }
  return { data: [] };
}

export async function handleReplaceRelatedRecords({
  params: { type, id, relationship },
  body,
  headers,
  context
}: JSONAPIRequest<RelationshipParams>): Promise<ResourceDocument> {
  const { source, serializer } = context;
  const { data } = serializer.deserialize(body);
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
  return { data: [] };
}

export async function handleReplaceRelatedRecord({
  params: { type, id, relationship },
  body,
  headers,
  context
}: JSONAPIRequest<RelationshipParams>): Promise<ResourceDocument> {
  const { source, serializer } = context;
  const { data } = serializer.deserialize(body);
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
  return { data: [] };
}

export async function handleOperations({
  body,
  context
}: JSONAPIOperationsRequest): Promise<ResourceOperationsResponseDocument> {
  const { source, serializer } = context;
  const operations = serializer.deserializeOperationsDocument(body);
  for (let operation of operations) {
    if (operation.op === 'addRecord') {
      source.schema.initializeRecord(operation.record);
    }
  }
  const result: OrbitRecord[] = toArray(await source.update(operations));
  return { operations: result.map(data => serializer.serialize({ data })) };
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
