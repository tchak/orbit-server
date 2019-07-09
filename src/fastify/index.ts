import { FastifyInstance } from 'fastify';
import plugin from 'fastify-plugin';
import cors from 'fastify-cors';
import helmet from 'fastify-helmet';
import favicon from 'fastify-favicon';

import { IncomingMessage, OutgoingMessage, Server } from 'http';
import { PubSubEngine } from 'graphql-subscriptions';

import Source from '../source';
import fastifySchema from './schema';
import fastifyJSONAPI, {
  JSONAPIFastifySettings,
  JSONAPIConfig
} from './jsonapi';
import fastifyGraphQL, {
  GraphQLFastifySettings,
  GraphQLConfig
} from './graphql';

export { fastifyJSONAPI, fastifyGraphQL };

export interface ServerSettings {
  source: Source;
  pubsub?: PubSubEngine;
  jsonapi?: boolean | JSONAPIConfig;
  graphql?: boolean | GraphQLConfig;
  inflections?: boolean;
  cors?: boolean;
  helmet?: boolean | helmet.FastifyHelmetOptions;
}

export default plugin<Server, IncomingMessage, OutgoingMessage, ServerSettings>(
  function(fastify: FastifyInstance, settings, next) {
    fastify.register(favicon);

    if (typeof settings.helmet === 'object') {
      fastify.register(helmet, settings.helmet);
    } else if (settings.helmet !== false) {
      fastify.register(helmet);
    }

    if (settings.cors !== false) {
      fastify.register(cors);
    }

    const { source, pubsub } = settings;
    const context = { source, pubsub };

    fastify.register(fastifySchema, {
      context,
      inflections: settings.inflections
    });

    if (settings.jsonapi) {
      let options: JSONAPIFastifySettings = { context };

      if (typeof settings.jsonapi === 'object') {
        options.config = settings.jsonapi;
      }
      fastify.register(fastifyJSONAPI, options);
    }

    if (settings.graphql) {
      let options: GraphQLFastifySettings = { context };

      if (typeof settings.graphql === 'object') {
        options.config = settings.graphql;
      }
      fastify.register(fastifyGraphQL, options);
    }

    fastify.addHook('onClose', (_, done) => source.disconnect().then(done));

    next();
  }
);
