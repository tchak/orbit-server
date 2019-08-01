import { RouteOptions, FastifyInstance } from 'fastify';
import plugin from 'fastify-plugin';
import cors from 'fastify-cors';
import helmet from 'fastify-helmet';
import favicon from 'fastify-favicon';

import { IncomingMessage, OutgoingMessage, Server } from 'http';
import qs from 'qs';
import { JSONAPISerializer } from '@orbit/jsonapi';
import { ApolloServer } from 'apollo-server-fastify';

import BaseOrbitServer, {
  JSONAPIConfig,
  GraphQLConfig,
  ServerSettings,
  JSONAPIContext,
  RouteDefinition
} from '../server';

export { ServerSettings };

export interface ServerRegistration {
  cors?: boolean;
  helmet?: boolean | helmet.FastifyHelmetOptions;
}

export default class OrbitServer extends BaseOrbitServer {
  createHandler(settings: ServerRegistration = {}) {
    return plugin(async (fastify, _, next) => {
      fastify.register(favicon);

      if (typeof settings.helmet === 'object') {
        fastify.register(helmet, settings.helmet);
      } else if (settings.helmet !== false) {
        fastify.register(helmet);
      }

      if (settings.cors !== false) {
        fastify.register(cors);
      }

      await this.setupSource(fastify);

      if (this.schema !== false) {
        this.registerSchema(fastify);
      }
      if (this.jsonapi) {
        this.registerJSONAPI(fastify);
      }
      if (this.graphql) {
        this.registerGraphQL(fastify);
      }

      next();
    });
  }

  private registerSchema(fastify: FastifyInstance) {
    const path = typeof this.schema === 'string' ? this.schema : 'schema';
    const schema = this.makeOrbitSchema();
    fastify.get(`/${path}`, async () => schema);
  }

  private registerJSONAPI(fastify: FastifyInstance) {
    let config: JSONAPIConfig = {};

    if (typeof this.jsonapi === 'object') {
      config = this.jsonapi;
    }

    const SerializerClass = config.SerializerClass || JSONAPISerializer;
    const serializer = new SerializerClass({
      schema: this.source.schema
    });

    const context = { source: this.source, serializer };

    fastify.register((fastify, _, next) => {
      this.routeHandlers(
        serializer,
        (prefix, routes) => {
          fastify.register(
            (fastify, _, next) => {
              for (let route of routes) {
                fastify.route(toRouteOptions(route, context));
              }
              next();
            },
            { prefix }
          );
        },
        config.readonly
      );

      fastify.setErrorHandler(async (error, _, reply) => {
        const [status, body] = await this.errorHandler(error);
        reply.status(status);
        return body;
      });

      next();
    });
  }

  private registerGraphQL(fastify: FastifyInstance) {
    let config: GraphQLConfig = {};

    if (typeof this.graphql === 'object') {
      config = this.graphql;
    }

    const context = { source: this.source };

    const server = new ApolloServer({
      schema: this.makeGraphQLSchema(),
      context({ req }) {
        return { ...context, headers: req.headers };
      },
      ...config
    });
    fastify.register(server.createHandler());
  }

  private async setupSource(fastify: FastifyInstance) {
    const listener = await this.activateSource();

    fastify.addHook('onClose', (_, done) => {
      this.deactivateSource(listener).then(done);
    });
  }
}

function toRouteOptions(
  { url, method, params, handler }: RouteDefinition,
  context: JSONAPIContext
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

function parseURL(url: string) {
  const [path, queryString] = url.split('?');
  const query = qs.parse(queryString);
  for (let key of ['filter', 'page']) {
    query[key] = qs.parse(query[key]);
  }
  return [path, query];
}
