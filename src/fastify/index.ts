import { FastifyInstance } from 'fastify';
import plugin from 'fastify-plugin';
import cors from 'fastify-cors';
import helmet from 'fastify-helmet';

import { IncomingMessage, OutgoingMessage, Server } from 'http';
import { PubSubEngine } from 'graphql-subscriptions';
import { Config } from 'apollo-server-fastify';

import Source from '../source';
import fastifySchema from './schema';
import fastifyJSONAPI from './jsonapi';
import fastifyGraphQL, { GraphQLFastifySettings } from './graphql';

export { fastifyJSONAPI, fastifyGraphQL };

export interface ServerSettings {
  source: Source;
  pubsub?: PubSubEngine;
  jsonapi?: boolean;
  graphql?: boolean | Config;
  inflections?: boolean;
  cors?: boolean;
  helmet?: helmet.FastifyHelmetOptions | boolean;
}

export default plugin<Server, IncomingMessage, OutgoingMessage, ServerSettings>(
  function(fastify: FastifyInstance, settings, next) {
    if (settings.helmet !== false) {
      if (settings.helmet === true || !settings.helmet) {
        fastify.register(helmet);
      } else {
        fastify.register(helmet, settings.helmet);
      }
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
      fastify.register(fastifyJSONAPI, { context });
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
