import Fastify, { FastifyInstance } from 'fastify';
import MemorySource from '@orbit/memory';
import { PubSub } from 'graphql-subscriptions';

import schema from './support/test-schema';
import tests, { Subject } from './support/fastify-plugin-shared';
import Server from '../src';

let fastify: FastifyInstance;
let source: MemorySource;
let subject: Subject = {};

QUnit.module('Orbit Fastify Plugin (memory)', function(hooks) {
  hooks.beforeEach(() => {
    fastify = Fastify();
    source = new MemorySource({ schema });
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

  tests(subject, 'memory');
});
