import { FastifyInstance } from 'fastify';
import plugin from 'fastify-plugin';
import { IncomingMessage, OutgoingMessage, Server } from 'http';
import { JSONAPISerializer } from '@orbit/jsonapi';
import { PubSubEngine } from 'graphql-subscriptions';

import { buildJSONAPI } from '../jsonapi';
import { Source, Schema } from '../index';

interface JSONAPIFastifySettings {
  schema: Schema;
  source: Source;
  pubsub?: PubSubEngine;
}

export default plugin<
  Server,
  IncomingMessage,
  OutgoingMessage,
  JSONAPIFastifySettings
>(function(fastify: FastifyInstance, { schema, source, pubsub }, next) {
  const serializer = new JSONAPISerializer({ schema: source.schema });
  const config = { source, serializer, pubsub };
  const routesByType = buildJSONAPI(schema, config);

  for (let [prefix, routes] of routesByType) {
    fastify.register(
      (fastify, _, next) => {
        for (let route of routes) {
          fastify.route(route);
        }
        next();
      },
      { prefix, source, serializer }
    );
  }

  next();
});
