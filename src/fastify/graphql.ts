import { FastifyInstance } from 'fastify';
import plugin from 'fastify-plugin';
import { IncomingMessage, OutgoingMessage, Server } from 'http';
import { ApolloServer, PubSubEngine } from 'apollo-server-fastify';

import Source from '../source';
import { makeExecutableSchema, createDataLoaders, Context } from '../graphql';

interface GraphQLFastifySettings {
  source: Source;
  pubsub?: PubSubEngine;
}

export default plugin<
  Server,
  IncomingMessage,
  OutgoingMessage,
  GraphQLFastifySettings
>(function(fastify: FastifyInstance, { source }, next) {
  const schema = makeExecutableSchema(source.schema);
  const apollo = new ApolloServer({
    schema,
    context: (): Context => {
      return {
        source,
        getDataLoader: createDataLoaders()
      };
    }
  });

  fastify.register(apollo.createHandler());
  next();
});
