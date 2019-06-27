import { FastifyInstance } from 'fastify';
import plugin from 'fastify-plugin';
import { IncomingMessage, OutgoingMessage, Server } from 'http';
import { ApolloServer, Config } from 'apollo-server-fastify';

import Context from '../context';
import { makeExecutableSchema } from '../graphql';

export interface GraphQLFastifySettings {
  config?: Config;
  context: Context;
}

export default plugin<
  Server,
  IncomingMessage,
  OutgoingMessage,
  GraphQLFastifySettings
>(function(fastify: FastifyInstance, { context, config }, next) {
  const schema = makeExecutableSchema(context.source.schema);
  const server = new ApolloServer({
    schema,
    context({ req }) {
      return { ...context, headers: req.headers };
    },
    ...config
  });

  fastify.register(server.createHandler({ cors: false }));
  next();
});
