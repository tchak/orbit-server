import { FastifyInstance, RouteOptions } from 'fastify';
import plugin from 'fastify-plugin';
import { IncomingMessage, OutgoingMessage, Server } from 'http';
import { JSONAPISerializer } from '@orbit/jsonapi';
import { PubSubEngine } from 'graphql-subscriptions';
import {
  RecordNotFoundException,
  SchemaError,
  RecordException,
  Schema
} from '@orbit/data';

import Source from '../source';
import { buildJSONAPI, RouteDefinition, Context } from '../jsonapi';

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
  const context = { source, serializer, pubsub };
  const routes = buildJSONAPI(source.schema);

  for (let prefix in routes) {
    fastify.register(
      (fastify, _, next) => {
        for (let route of routes[prefix]) {
          fastify.route(toFastifyRouteOptions(route, context));
        }
        next();
      },
      { prefix }
    );
  }

  fastify.setErrorHandler(async (error, _, reply) => {
    const [status, body] = handleException(source.schema, error);
    reply.status(status);
    return body;
  });

  next();
});

function toFastifyRouteOptions(
  { url, method, config, handler }: RouteDefinition,
  context: Context
): RouteOptions<Server, IncomingMessage, OutgoingMessage> {
  return {
    url,
    method,
    config,
    handler(
      { params: { id }, query: { include }, headers, body },
      {
        context: {
          config: { type, relationship }
        }
      }
    ) {
      return handler({
        headers,
        params: { type, id, relationship, include },
        body,
        context
      });
    }
  };
}

function handleException(
  schema: Schema,
  error: Error
): [number, ErrorsDocument] {
  const id = schema.generateId();
  const title = error.message;
  let detail = '';
  let code = 500;

  if (error instanceof RecordNotFoundException) {
    detail = error.description;
    code = 404;
  } else if (error instanceof SchemaError || error instanceof RecordException) {
    detail = error.description;
    code = 400;
  }

  return [code, { errors: [{ id, title, detail, code: `${code}` }] }];
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
