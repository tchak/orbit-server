import { FastifyInstance } from 'fastify';
import plugin from 'fastify-plugin';
import { IncomingMessage, OutgoingMessage, Server } from 'http';
import { ApolloServer, gql } from 'apollo-server-fastify';

import { Source, Schema } from '../index';
import { buildGraphQL, createDataLoaders, Context } from '../graphql';

interface GraphQLFastifySettings {
  schema: Schema;
  source: Source;
}

export default plugin<
  Server,
  IncomingMessage,
  OutgoingMessage,
  GraphQLFastifySettings
>(function(fastify: FastifyInstance, { schema, source }, next) {
  const { resolvers, typeDefs } = buildGraphQL(schema);
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
