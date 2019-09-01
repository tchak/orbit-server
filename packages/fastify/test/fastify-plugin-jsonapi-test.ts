import Fastify, { FastifyInstance } from 'fastify';
import JSONAPISource from '@orbit/jsonapi';
import { PubSub } from 'graphql-subscriptions';
import { AddressInfo } from 'net';
import Orbit from '@orbit/core';
import fetch from 'node-fetch';
import SQLSource from 'orbit-sql';

import schema from './support/test-schema';
import tests, { Subject } from './support/fastify-plugin-shared';
import Server from '../src';

let fastify: FastifyInstance;
let server: FastifyInstance;
let source: JSONAPISource;
let memory: SQLSource;
let subject: Subject = {};

Orbit.globals.fetch = fetch;

QUnit.module('Orbit Fastify Plugin (jsonapi)', function(hooks) {
  hooks.beforeEach(async () => {
    server = Fastify();
    memory = new SQLSource({
      schema,
      knex: {
        client: 'sqlite3',
        connection: { filename: ':memory:' },
        useNullAsDefault: true
      }
    });
    server.register(
      new Server({
        source: memory,
        jsonapi: true,
        graphql: false
      }).createHandler()
    );
    await server.listen(0);

    const { port } = server.server.address() as AddressInfo;
    const host = `http://localhost:${port}`;

    fastify = Fastify();
    source = new JSONAPISource({
      schema,
      host
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
    await server.close();
  });

  tests(subject, 'jsonapi');
});
