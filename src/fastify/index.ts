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
  jsonapi?: boolean;
  graphql?: boolean;
  pubsub?: PubSubEngine;
  inflections?: boolean;
}

export default plugin<Server, IncomingMessage, OutgoingMessage, ServerSettings>(
  function(fastify: FastifyInstance, settings, next) {
    fastify.register(helmet);
    fastify.register(cors);

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
