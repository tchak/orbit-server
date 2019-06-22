import { FastifyInstance } from 'fastify';
import plugin from 'fastify-plugin';
import { IncomingMessage, OutgoingMessage, Server } from 'http';
import { ApolloServer } from 'apollo-server-fastify';

import Context from '../context';
import { makeExecutableSchema } from '../graphql';

interface GraphQLFastifySettings {
  context: Context;
}

export default plugin<
  Server,
  IncomingMessage,
  OutgoingMessage,
  GraphQLFastifySettings
>(function(fastify: FastifyInstance, { context }, next) {
  const schema = makeExecutableSchema(context.source.schema);
  const apollo = new ApolloServer({
    schema,
    context
  });

  fastify.register(apollo.createHandler({ cors: false }));
  next();
});
