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
  RecordNotFoundException,
  RecordException,
  SchemaError
} from '@orbit/data';
import { ResourceDocument, JSONAPISerializer } from '@orbit/jsonapi';
import { uuid } from '@orbit/utils';
import { Observable } from 'rxjs';

import { Source } from '../';

export interface Config {
  source: Source;
  serializer: JSONAPISerializer;
  type: string;
  relationship?: string;
}

export type Handler = (
  req: DefaultRequest,
  reply: FastifyReply<OutgoingMessage>
) => Promise<ResourceDocument | ErrorsDocument>;
type DefaultRequest = FastifyRequest<
  IncomingMessage,
  DefaultQuery,
  DefaultParams,
  DefaultHeaders,
  ResourceDocument
>;

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
): Promise<ResourceDocument | ErrorsDocument> {
  const { type, source, serializer } = reply.context.config as Config;
  const { id } = params;
  const identity = { type, id };
  const include: string[] = Array.isArray(query.include)
    ? query.include
    : [query.include];

  const result = await source
    .query(q => q.findRecord(identity), {
      include
    })
    .catch(error => handleException(error, reply));
  return serializeResult(serializer, result, reply);
}

export async function handleFindRecords(
  _: DefaultRequest,
  { context }: FastifyReply<OutgoingMessage>
): Promise<ResourceDocument> {
  const { type, source, serializer } = context.config as Config;

  const records: OrbitRecord[] = await source.query(q => q.findRecords(type));
  return serializer.serialize({ data: records });
}

export async function handleFindRelatedRecords(
  { params }: DefaultRequest,
  { context }: FastifyReply<OutgoingMessage>
): Promise<ResourceDocument> {
  const { type, relationship, source, serializer } = context.config as Config;
  const { id } = params;

  const records: OrbitRecord[] = await source.query(q =>
    q.findRelatedRecords({ type, id }, relationship as string)
  );
  return serializer.serialize({ data: records });
}

export async function handleFindRelatedRecord(
  { params }: DefaultRequest,
  { context }: FastifyReply<OutgoingMessage>
): Promise<ResourceDocument> {
  const { type, relationship, source, serializer } = context.config as Config;
  const { id } = params;

  const record: OrbitRecord = await source.query(q =>
    q.findRelatedRecord({ type, id }, relationship as string)
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

export async function handleOperations(
  _: DefaultRequest,
  __: FastifyReply<OutgoingMessage>
): Promise<ResourceDocument> {
  return { data: [] };
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
      // @ts-ignore
      const operations = serializer.serializeOperations(transform.operations);
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

function handleException(
  error: Error,
  reply: FastifyReply<OutgoingMessage>
): ErrorsDocument {
  const errors: ResourceError[] = [];

  if (error instanceof RecordNotFoundException) {
    errors.push({
      id: uuid(),
      title: error.message,
      detail: error.description,
      code: '404'
    });
    reply.status(404);
  } else if (error instanceof SchemaError || error instanceof RecordException) {
    errors.push({
      id: uuid(),
      title: error.message,
      detail: error.description,
      code: '500'
    });
    reply.status(500);
  } else {
    errors.push({
      id: uuid(),
      title: error.message,
      detail: '',
      code: '500'
    });
    reply.status(500);
  }

  return { errors };
}

function serializeResult(
  serializer: JSONAPISerializer,
  result: OrbitRecord | OrbitRecord[] | null | Error,
  reply: FastifyReply<OutgoingMessage>
) {
  if (result instanceof Error) {
    return handleException(result, reply);
  } else if (Array.isArray(result)) {
    return serializer.serialize({ data: result as OrbitRecord[] });
  } else if (result) {
    return serializer.serialize({ data: result as OrbitRecord });
  }
  return { data: [] };
}

interface ResourceError {
  id: string;
  title: string;
  detail: string;
  code: '400' | '404' | '500';
}

interface ErrorsDocument {
  errors: ResourceError[];
}
