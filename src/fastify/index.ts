import { FastifyInstance } from 'fastify';
import plugin from 'fastify-plugin';
import cors from 'fastify-cors';
import helmet from 'fastify-helmet';
// @ts-ignore
import websocket from 'fastify-websocket';

import { IncomingMessage, OutgoingMessage, Server } from 'http';
import { PubSubEngine } from 'graphql-subscriptions';
import { Transform, Schema, ModelDefinition } from '@orbit/data';

import Source from '../source';
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

export interface Inflections {
  plurals: Record<string, string>;
  singulars: Record<string, string>;
}

export interface SchemaDocument {
  models: Record<string, ModelDefinition>;
  inflections?: Inflections;
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

    const schemaJson: SchemaDocument = { models: source.schema.models };
    if (settings.inflections !== false) {
      schemaJson.inflections = buildInflections(source.schema);
    }
    fastify.get('/schema', async () => schemaJson);

    if (settings.jsonapi) {
      fastify.register(fastifyJSONAPI, { source, pubsub });
    }

    if (settings.graphql) {
      fastify.register(fastifyGraphQL, { source, pubsub });
    }

    fastify.addHook('onClose', (_, done) => source.disconnect().then(done));

    next();
  }
);

function buildInflections(schema: Schema) {
  const inflections: Inflections = { plurals: {}, singulars: {} };
  for (let type in schema.models) {
    let plural = schema.pluralize(type);
    inflections.plurals[type] = plural;
    inflections.singulars[plural] = type;
  }
  return inflections;
}
