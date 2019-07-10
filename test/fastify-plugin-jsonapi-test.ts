// @ts-ignore
import { module } from 'qunit';

import Fastify, { FastifyInstance } from 'fastify';
import JSONAPISource from '@orbit/jsonapi';
import MemorySource from '@orbit/memory';
import { PubSub } from 'graphql-subscriptions';
import { AddressInfo } from 'net';
import Orbit from '@orbit/core';
import fetch from 'node-fetch';

import schema from './support/test-schema';
import tests, { Subject } from './support/fastify-plugin-shared';
import { Plugin } from '../src';

let fastify: FastifyInstance;
let server: FastifyInstance;
let source: JSONAPISource;
let memory: MemorySource;
let subject: Subject = {};

Orbit.globals.fetch = fetch;

module('Orbit Fastify Plugin (jsonapi)', function(hooks: Hooks) {
  // @ts-ignore
  hooks.beforeEach(async () => {
    server = Fastify();
    memory = new MemorySource({ schema });
    server.register(Plugin, {
      source: memory,
      jsonapi: true,
      graphql: false
    });
    await server.listen(0);

    const { port } = server.server.address() as AddressInfo;
    const host = `http://localhost:${port}`;

    fastify = Fastify();
    source = new JSONAPISource({
      schema,
      host,
      defaultFetchSettings: { headers: { 'Content-Type': 'application/json' } }
    });
    fastify.register(Plugin, {
      source,
      pubsub: new PubSub(),
      jsonapi: true,
      graphql: true
    });

    subject.fastify = fastify;
  });

  // @ts-ignore
  hooks.afterEach(async () => {
    await fastify.close();
    await server.close();
  });

  tests(subject, 'jsonapi');
});
