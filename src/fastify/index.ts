import { FastifyInstance } from 'fastify';
import plugin from 'fastify-plugin';
import cors from 'fastify-cors';
import helmet from 'fastify-helmet';
// @ts-ignore
import websocket from 'fastify-websocket';

import { IncomingMessage, OutgoingMessage, Server } from 'http';
import { PubSubEngine } from 'graphql-subscriptions';
import { Transform } from '@orbit/data';

import { Source } from '../index';
import fastifyJSONAPI from './jsonapi';
import fastifyGraphQL from './graphql';

export { fastifyJSONAPI, fastifyGraphQL };

export interface ServerSettings {
  source: Source;
  jsonapi?: boolean;
  graphql?: boolean;
  pubsub?: PubSubEngine;
}

export default plugin<Server, IncomingMessage, OutgoingMessage, ServerSettings>(
  function(fastify: FastifyInstance, settings, next) {
    fastify.register(helmet);
    fastify.register(cors);

    const { source, pubsub } = settings;

    if (pubsub) {
      fastify.register(websocket);

      source.on('transform', (transform: Transform) => {
        pubsub.publish('transform', transform);
      });
    }

    if (settings.jsonapi) {
      fastify.register(fastifyJSONAPI, { source, pubsub });
    }

    if (settings.graphql) {
      fastify.register(fastifyGraphQL, { source, pubsub });
    }

    next();
  }
);
