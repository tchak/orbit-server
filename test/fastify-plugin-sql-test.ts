// @ts-ignore
import { module } from 'qunit';

import Fastify, { FastifyInstance } from 'fastify';
import { PubSub } from 'graphql-subscriptions';

import schema from './support/test-schema';
import tests, { Subject } from './support/fastify-plugin-shared';
import { Plugin, toOrbitSchema } from '../src';
import SQLSource from '../src/sql';

let fastify: FastifyInstance;
let source: SQLSource;
let subject: Subject = { fastify: Fastify() };

module('Orbit Fastify Plugin (sql)', function(hooks: Hooks) {
  // @ts-ignore
  hooks.beforeEach(() => {
    fastify = Fastify();
    source = new SQLSource({ schema: toOrbitSchema(schema) });
    fastify.register(Plugin, {
      schema,
      source,
      pubsub: new PubSub(),
      jsonapi: true,
      graphql: true
    });

    subject.fastify = fastify;
  });

  // @ts-ignore
  hooks.afterEach(async () => {
    await source.cache.closeDB();
  });

  tests(subject);
});
