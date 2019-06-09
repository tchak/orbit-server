import { FastifyInstance } from 'fastify';
import plugin from 'fastify-plugin';
import { IncomingMessage, OutgoingMessage, Server } from 'http';
import { JSONAPISerializer } from '@orbit/jsonapi';
import { PubSubEngine } from 'graphql-subscriptions';

import Source from '../source';
import { buildJSONAPI } from '../jsonapi';

interface JSONAPIFastifySettings {
  source: Source;
  pubsub?: PubSubEngine;
}

export default plugin<
  Server,
  IncomingMessage,
  OutgoingMessage,
  JSONAPIFastifySettings
>(function(fastify: FastifyInstance, { source, pubsub }, next) {
  const serializer = new JSONAPISerializer({ schema: source.schema });
  const config = { source, serializer, pubsub };
  const routes = buildJSONAPI(config);

  for (let prefix in routes) {
    fastify.register(
      (fastify, _, next) => {
        for (let route of routes[prefix]) {
          fastify.route(route);
        }
        next();
      },
      { prefix, source, serializer }
    );
  }

  next();
});
