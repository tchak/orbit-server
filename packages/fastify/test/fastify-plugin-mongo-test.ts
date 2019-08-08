import Fastify, { FastifyInstance } from 'fastify';
import { PubSub } from 'graphql-subscriptions';
import MongoSource from 'orbit-mongo';

import schema from './support/test-schema';
import tests, { Subject } from './support/fastify-plugin-shared';
import Server from '../src';

let fastify: FastifyInstance;
let source: MongoSource;
let subject: Subject = {};

QUnit.module('Orbit Fastify Plugin (mongo)', function(hooks) {
  hooks.beforeEach(() => {
    fastify = Fastify();
    source = new MongoSource({
      schema,
      uri: 'mongodb://127.0.0.1:27017',
      namespace: 'test-database'
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
    await source.cache.deleteDB();
    await fastify.close();
  });

  tests(subject, 'mongo');
});
