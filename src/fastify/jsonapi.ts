import { FastifyInstance, RouteOptions } from 'fastify';
import plugin from 'fastify-plugin';
import { IncomingMessage, OutgoingMessage, Server } from 'http';

import Context from '../context';
import { JSONAPIServer, RouteDefinition } from '../jsonapi';

interface JSONAPIFastifySettings {
  context: Context;
}

export default plugin<
  Server,
  IncomingMessage,
  OutgoingMessage,
  JSONAPIFastifySettings
>(function(fastify: FastifyInstance, { context }, next) {
  const server = new JSONAPIServer({ schema: context.source.schema });

  server.eachRoute((prefix, routes) => {
    fastify.register(
      (fastify, _, next) => {
        for (let route of routes) {
          fastify.route(toFastifyRouteOptions(route, context));
        }
        next();
      },
      { prefix }
    );
  });

  fastify.setErrorHandler(async (error, _, reply) => {
    const [status, body] = server.handleError(error);
    reply.status(status);
    return body;
  });

  next();
});

function toFastifyRouteOptions(
  { url, method, params, handler }: RouteDefinition,
  context: Context
): RouteOptions<Server, IncomingMessage, OutgoingMessage> {
  const { type, relationship } = params;
  return {
    url,
    method,
    async handler({ params: { id }, query, headers, body }, reply) {
      const { include } = query;

      const [status, responseHeaders, responseBody] = await handler({
        headers,
        params: { type, id, relationship, include },
        body,
        context
      });
      reply.status(status);
      reply.headers(responseHeaders);
      return responseBody;
    }
  };
}
