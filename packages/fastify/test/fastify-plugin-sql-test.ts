import Fastify, { FastifyInstance } from 'fastify';
import { PubSub } from 'graphql-subscriptions';
import SQLSource from 'orbit-sql';

import schema from './support/test-schema';
import tests, { Subject } from './support/fastify-plugin-shared';
import Server from '../src';

let fastify: FastifyInstance;
let source: SQLSource;
let subject: Subject = {};

QUnit.module('Orbit Fastify Plugin (sql)', function(hooks) {
  hooks.beforeEach(() => {
    fastify = Fastify();
    source = new SQLSource({
      schema,
      knex: {
        client: 'sqlite3',
        connection: { filename: ':memory:' },
        useNullAsDefault: true
      }
    });
    fastify.register(
      new Server({
        source,
        pubsub: new PubSub(),
        jsonapi: true,
        graphql: true
      }).createHandler()
    );

    subject.fastify = fastify;
  });

  hooks.afterEach(async () => {
    await fastify.close();
  });

  tests(subject, 'sql');
});
