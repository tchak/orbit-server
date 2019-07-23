import { FastifyInstance, RouteOptions } from 'fastify';
import plugin from 'fastify-plugin';
import { IncomingMessage, OutgoingMessage, Server } from 'http';
import qs from 'qs';
import { JSONAPISerializerSettings, JSONAPISerializer } from '@orbit/jsonapi';

import Context from '../context';
import { JSONAPIServer, RouteDefinition } from '../jsonapi';

export interface JSONAPIConfig {
  readonly?: boolean;
  SerializerClass?: new (
    settings: JSONAPISerializerSettings
  ) => JSONAPISerializer;
}

export interface JSONAPIFastifySettings {
  config?: JSONAPIConfig;
  context: Context;
}

export default plugin<
  Server,
  IncomingMessage,
  OutgoingMessage,
  JSONAPIFastifySettings
>(function(fastify: FastifyInstance, { context, config }, next) {
  const server = new JSONAPIFastifyServer({
    schema: context.source.schema,
    ...config
  });

  fastify.register(server.createHandler(context));
  next();
});

class JSONAPIFastifyServer extends JSONAPIServer {
  createHandler(context: Context) {
    return plugin((fastify, _, next) => {
      this.eachRoute((prefix, routes) => {
        fastify.register(
          (fastify, _, next) => {
            for (let route of routes) {
              fastify.route(this.toRouteOptions(route, context));
            }
            next();
          },
          { prefix }
        );
      });

      fastify.setErrorHandler(async (error, _, reply) => {
        await context.source.requestQueue.clear().catch(() => {});
        const [status, body] = this.handleError(error);
        reply.status(status);
        return body;
      });

      next();
    });
  }

  private toRouteOptions(
    { url, method, params, handler }: RouteDefinition,
    context: Context
  ): RouteOptions<Server, IncomingMessage, OutgoingMessage> {
    return {
      url,
      method,
      async handler({ params: { id }, raw, headers, body }, reply) {
        const [url, { include, filter, sort, page }] = parseURL(
          raw.url as string
        );
        const [status, responseHeaders, responseBody] = await handler({
          url,
          headers,
          params: {
            ...params,
            id,
            include,
            filter,
            sort,
            page
          },
          body,
          context
        });
        reply.status(status);
        reply.headers(responseHeaders);
        return responseBody;
      }
    };
  }
}

function parseURL(url: string) {
  const [path, queryString] = url.split('?');
  const query = qs.parse(queryString);
  for (let key of ['filter', 'page']) {
    query[key] = qs.parse(query[key]);
  }
  return [path, query];
}
