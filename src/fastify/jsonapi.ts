import { FastifyInstance, FastifyReply } from 'fastify';
import plugin from 'fastify-plugin';
import { IncomingMessage, OutgoingMessage, Server } from 'http';
import { JSONAPISerializer } from '@orbit/jsonapi';
import { PubSubEngine } from 'graphql-subscriptions';
import {
  RecordNotFoundException,
  SchemaError,
  RecordException
} from '@orbit/data';
import { uuid } from '@orbit/utils';

import Source from '../source';
import { buildJSONAPI } from '../jsonapi';

interface JSONAPIFastifySettings {
  source: Source;
  pubsub?: PubSubEngine;
}

export default plugin<
  Server,
  IncomingMessage,
  OutgoingMessage,
  JSONAPIFastifySettings
>(function(fastify: FastifyInstance, { source, pubsub }, next) {
  const serializer = new JSONAPISerializer({ schema: source.schema });
  const config = { source, serializer, pubsub };
  const routes = buildJSONAPI(config);

  for (let prefix in routes) {
    fastify.register(
      (fastify, _, next) => {
        for (let route of routes[prefix]) {
          fastify.route(route);
        }
        next();
      },
      { prefix, source, serializer }
    );
  }

  fastify.setErrorHandler(
    async (error: Error, _, reply: FastifyReply<OutgoingMessage>) => {
      return handleException(error, reply);
    }
  );

  next();
});

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
      code: '400'
    });
    reply.status(400);
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

interface ResourceError {
  id: string;
  title: string;
  detail: string;
  code: '400' | '404' | '500';
}

interface ErrorsDocument {
  errors: ResourceError[];
}
