import {
  FastifyReply,
  FastifyRequest,
  DefaultQuery,
  DefaultParams,
  DefaultHeaders
} from 'fastify';
import { IncomingMessage, OutgoingMessage } from 'http';
import { PubSubEngine, withFilter } from 'graphql-subscriptions';
import {
  RecordIdentity,
  Record as OrbitRecord,
  Transform,
  RecordOperation
} from '@orbit/data';
import {
  ResourceDocument,
  JSONAPISerializer,
  ResourceOperationsDocument
} from '@orbit/jsonapi';
import { toArray } from '@orbit/utils';
import { Observable } from 'rxjs';

import Source from '../source';

export interface Config {
  source: Source;
  serializer: JSONAPISerializer;
  type: string;
  relationship?: string;
}

export type Handler = (
  req: DefaultRequest | OperationsRequest,
  reply: FastifyReply<OutgoingMessage>
) => Promise<ResourceDocument | OperationsResponseDocument>;
type DefaultRequest = FastifyRequest<
  IncomingMessage,
  DefaultQuery,
  DefaultParams,
  DefaultHeaders,
  ResourceDocument
>;

type OperationsRequest = FastifyRequest<
  IncomingMessage,
  DefaultQuery,
  DefaultParams,
  DefaultHeaders,
  ResourceOperationsDocument
>;

interface OperationsResponseDocument {
  operations: ResourceDocument[];
}

export async function handleAddRecord(
  { body, headers }: DefaultRequest,
  { context }: FastifyReply<OutgoingMessage>
): Promise<ResourceDocument> {
  const { source, serializer } = context.config as Config;
  const { data } = serializer.deserialize(body);
  const options = transformOptions(headers);
  const record: OrbitRecord = await source.update(
    q => q.addRecord(data as OrbitRecord),
    options
  );
  return serializer.serialize({ data: record });
}

export async function handleUpdateRecord(
  { body, headers }: DefaultRequest,
  { context }: FastifyReply<OutgoingMessage>
): Promise<ResourceDocument> {
  const { source, serializer } = context.config as Config;
  const { data } = serializer.deserialize(body);
  const options = transformOptions(headers);

  const record: OrbitRecord = await source.update(
    q => q.updateRecord(data as OrbitRecord),
    options
  );
  return serializer.serialize({ data: record });
}

export async function handleRemoveRecord(
  { params, headers }: DefaultRequest,
  { context }: FastifyReply<OutgoingMessage>
): Promise<ResourceDocument> {
  const { type, source } = context.config as Config;
  const { id } = params;
  const options = transformOptions(headers);

  await source.update(q => q.removeRecord({ id, type }), options);
  return { data: [] };
}

export async function handleFindRecord(
  { params, query }: DefaultRequest,
  reply: FastifyReply<OutgoingMessage>
): Promise<ResourceDocument> {
  const { type, source, serializer } = reply.context.config as Config;
  const { id } = params;
  const identity = { type, id };
  const include: string[] = query.include
    ? Array.isArray(query.include)
      ? query.include
      : [query.include]
    : [];

  const record: OrbitRecord = await source.query(q => q.findRecord(identity), {
    [source.name]: { include }
  });
  return serializer.serialize({ data: record });
}

export async function handleFindRecords(
  { query }: DefaultRequest,
  { context }: FastifyReply<OutgoingMessage>
): Promise<ResourceDocument> {
  const { type, source, serializer } = context.config as Config;
  const include: string[] = query.include
    ? Array.isArray(query.include)
      ? query.include
      : [query.include]
    : [];

  const records: OrbitRecord[] = await source.query(q => q.findRecords(type), {
    [source.name]: { include }
  });
  return serializer.serialize({ data: records });
}

export async function handleFindRelatedRecords(
  { params, query }: DefaultRequest,
  { context }: FastifyReply<OutgoingMessage>
): Promise<ResourceDocument> {
  const { type, relationship, source, serializer } = context.config as Config;
  const { id } = params;
  const include: string[] = query.include
    ? Array.isArray(query.include)
      ? query.include
      : [query.include]
    : [];

  const records: OrbitRecord[] = await source.query(
    q => q.findRelatedRecords({ type, id }, relationship as string),
    {
      [source.name]: { include }
    }
  );
  return serializer.serialize({ data: records });
}

export async function handleFindRelatedRecord(
  { params, query }: DefaultRequest,
  { context }: FastifyReply<OutgoingMessage>
): Promise<ResourceDocument> {
  const { type, relationship, source, serializer } = context.config as Config;
  const { id } = params;
  const include: string[] = query.include
    ? Array.isArray(query.include)
      ? query.include
      : [query.include]
    : [];

  const record: OrbitRecord = await source.query(
    q => q.findRelatedRecord({ type, id }, relationship as string),
    {
      [source.name]: { include }
    }
  );
  return serializer.serialize({ data: record });
}

export async function handleAddToRelatedRecords(
  { params, body, headers }: DefaultRequest,
  { context }: FastifyReply<OutgoingMessage>
): Promise<ResourceDocument> {
  const { type, relationship, source, serializer } = context.config as Config;
  const { id } = params;
  const { data } = serializer.deserialize(body);
  const options = transformOptions(headers);

  for (let identity of data as RecordIdentity[]) {
    await source.update(
      q =>
        q.addToRelatedRecords({ id, type }, relationship as string, identity),
      options
    );
  }
  return { data: [] };
}

export async function handleRemoveFromRelatedRecords(
  { params, body, headers }: DefaultRequest,
  { context }: FastifyReply<OutgoingMessage>
): Promise<ResourceDocument> {
  const { type, relationship, source, serializer } = context.config as Config;
  const { id } = params;
  const { data } = serializer.deserialize(body);
  const options = transformOptions(headers);

  for (let identity of data as RecordIdentity[]) {
    await source.update(
      q =>
        q.removeFromRelatedRecords(
          { id, type },
          relationship as string,
          identity
        ),
      options
    );
  }
  return { data: [] };
}

export async function handleReplaceRelatedRecords(
  { params, body, headers }: DefaultRequest,
  { context }: FastifyReply<OutgoingMessage>
): Promise<ResourceDocument> {
  const { type, relationship, source, serializer } = context.config as Config;
  const { id } = params;
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

export async function handleReplaceRelatedRecord(
  { params, body, headers }: DefaultRequest,
  { context }: FastifyReply<OutgoingMessage>
): Promise<ResourceDocument> {
  const { type, relationship, source, serializer } = context.config as Config;
  const { id } = params;
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

export async function handleOperations(
  { body }: OperationsRequest,
  { context }: FastifyReply<OutgoingMessage>
): Promise<OperationsResponseDocument> {
  const { source, serializer } = context.config as Config;
  const operations = serializer.deserializeOperationsDocument(body);
  for (let operation of operations) {
    if (operation.op === 'addRecord') {
      source.schema.initializeRecord(operation.record);
    }
  }
  const result: OrbitRecord[] = toArray(await source.update(operations));
  return { operations: result.map(data => serializer.serialize({ data })) };
}

export function handleWebSocket(
  pubsub: PubSubEngine,
  serializer: JSONAPISerializer
) {
  return (connection: any) => {
    const iterator = withFilter(
      () => pubsub.asyncIterator<Transform>('transform'),
      () => true
    )();
    const observable = observableFromAsyncIterator<Transform>(iterator);
    const subscription = observable.subscribe(transform => {
      const operations = serializer.serializeOperations(
        transform.operations as RecordOperation[]
      );
      connection.socket.send(JSON.stringify({ operations }));
    });

    connection.on('close', () => subscription.unsubscribe());
  };
}

function transformOptions(headers: DefaultHeaders) {
  if (headers['x-client-id']) {
    return { clientId: headers['x-client-id'] };
  }
  return {};
}

export function observableFromAsyncIterator<T>(iterator: AsyncIterator<T>) {
  const iterable: AsyncIterable<T> = {
    [Symbol.asyncIterator]() {
      return iterator;
    }
  };
  return new Observable<T>(subscriber => {
    let dispose = false;
    (async () => {
      for await (let value of iterable) {
        if (dispose) {
          break;
        }
        subscriber.next(value);
      }
      subscriber.complete();
    })();
    return () => {
      dispose = true;
    };
  });
}
