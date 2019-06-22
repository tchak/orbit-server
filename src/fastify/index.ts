import { FastifyInstance } from 'fastify';
import plugin from 'fastify-plugin';
import cors from 'fastify-cors';
import helmet from 'fastify-helmet';

import { IncomingMessage, OutgoingMessage, Server } from 'http';
import { PubSubEngine } from 'graphql-subscriptions';

import Source from '../source';
import fastifySchema from './schema';
import fastifyJSONAPI from './jsonapi';
import fastifyGraphQL from './graphql';

export { fastifyJSONAPI, fastifyGraphQL };

export interface ServerSettings {
  source: Source;
  pubsub?: PubSubEngine;
  jsonapi?: boolean;
  graphql?: boolean;
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
      fastify.register(fastifyGraphQL, { context });
    }

    fastify.addHook('onClose', (_, done) => source.disconnect().then(done));

    next();
  }
);
