// @ts-ignore
import { module } from 'qunit';

import Fastify, { FastifyInstance } from 'fastify';
import MemorySource from '@orbit/memory';
import { PubSub } from 'graphql-subscriptions';

import schema from './support/test-schema';
import tests, { Subject } from './support/fastify-plugin-shared';
import { Plugin } from '../src';

let fastify: FastifyInstance;
let source: MemorySource;
let subject: Subject = { fastify: Fastify() };

module('Orbit Fastify Plugin (memory)', function(hooks: Hooks) {
  // @ts-ignore
  hooks.beforeEach(() => {
    fastify = Fastify();
    source = new MemorySource({ schema });
    fastify.register(Plugin, {
      source,
      pubsub: new PubSub(),
      jsonapi: true,
      graphql: true
    });

    subject.fastify = fastify;
  });

  tests(subject);
});
