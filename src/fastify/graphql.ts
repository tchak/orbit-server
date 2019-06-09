import { FastifyInstance } from 'fastify';
import plugin from 'fastify-plugin';
import { IncomingMessage, OutgoingMessage, Server } from 'http';
import { ApolloServer, gql, PubSubEngine } from 'apollo-server-fastify';

import { Source } from '../index';
import { buildGraphQL, createDataLoaders, Context } from '../graphql';

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
  const { resolvers, typeDefs } = buildGraphQL(source.schema);
  const apollo = new ApolloServer({
    resolvers,
    typeDefs: gql(typeDefs),
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
