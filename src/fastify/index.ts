import { RouteOptions, FastifyInstance } from 'fastify';
import plugin from 'fastify-plugin';
import cors from 'fastify-cors';
import helmet from 'fastify-helmet';
import favicon from 'fastify-favicon';

import { IncomingMessage, OutgoingMessage, Server } from 'http';
import qs from 'qs';
import { JSONAPISerializerSettings, JSONAPISerializer } from '@orbit/jsonapi';
import { ApolloServer, Config as GraphQLConfig } from 'apollo-server-fastify';

import BaseServer, {
  ServerSettings,
  GraphQLContext,
  JSONAPIContext,
  RouteHandler
} from '../server';

export interface JSONAPIConfig {
  readonly?: boolean;
  SerializerClass?: new (
    settings: JSONAPISerializerSettings
  ) => JSONAPISerializer;
}

export interface FastifyServerSettings extends ServerSettings {
  jsonapi?: boolean | JSONAPIConfig;
  graphql?: boolean | GraphQLConfig;
}

export interface ServerRegistration {
  cors?: boolean;
  helmet?: boolean | helmet.FastifyHelmetOptions;
}

export default class FastifyServer extends BaseServer {
  protected jsonapi?: boolean | JSONAPIConfig;
  protected graphql?: boolean | GraphQLConfig;

  constructor(settings: FastifyServerSettings) {
    super(settings);
    this.jsonapi = settings.jsonapi;
    this.graphql = settings.graphql;
  }

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

      await this.source.activated;

      this.registerSchema(fastify);
      if (this.jsonapi) {
        this.registerJSONAPI(fastify);
      }
      if (this.graphql) {
        this.registerGraphQL(fastify);
      }
      this.registerPubSub(fastify);

      next();
    });
  }

  private registerSchema(fastify: FastifyInstance) {
    const schema = this.generateSchema();
    fastify.get('/schema', async () => schema);
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

    const context: JSONAPIContext = { source: this.source, serializer };

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
  }

  private registerGraphQL(fastify: FastifyInstance) {
    let config: GraphQLConfig = {};

    if (typeof this.graphql === 'object') {
      config = this.graphql;
    }

    const context: GraphQLContext = { source: this.source };

    const server = new ApolloServer({
      schema: this.graphQLSchema(),
      context({ req }) {
        return { ...context, headers: req.headers };
      },
      ...config
    });
    fastify.register(server.createHandler());
  }

  private registerPubSub(fastify: FastifyInstance) {
    this.setupPubSub();

    fastify.addHook('onClose', (_, done) => {
      this.onClose().then(done);
    });
  }
}

function toRouteOptions(
  { url, method, params, handler }: RouteHandler,
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
