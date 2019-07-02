// @ts-ignore
import { module } from 'qunit';

import Fastify, { FastifyInstance } from 'fastify';
import JSONAPISource from '@orbit/jsonapi';
import MemorySource from '@orbit/memory';
import { PubSub } from 'graphql-subscriptions';
import { AddressInfo } from 'net';
import Orbit from '@orbit/core';
import fetch from 'node-fetch';
import {
  updatable,
  Updatable,
  Transform,
  TransformOrOperations,
  RecordOperation
} from '@orbit/data';
import { clone } from '@orbit/utils';

import schema from './support/test-schema';
import tests, { Subject } from './support/fastify-plugin-shared';
import { Plugin } from '../src';

let fastify: FastifyInstance;
let server: FastifyInstance;
let source: DisposableJSONAPISource;
let memory: DisposableMemorySource;
let subject: Subject = { fastify: Fastify() };

class DisposableMemorySource extends MemorySource {
  async disconnect() {}
}

@updatable
class DisposableJSONAPISource extends JSONAPISource implements Updatable {
  async disconnect() {}
  update: (
    transformOrOperations: TransformOrOperations,
    options?: object,
    id?: string
  ) => Promise<any>;
  async _update(transform: Transform): Promise<any> {
    const transforms = await this._push(transform);
    const records = clone(transforms[0].operations.map(
      (operation: RecordOperation) => {
        if (operation.op === 'removeRecord') {
          return operation.record;
        }
        return memory.cache.query(q => q.findRecord(operation.record));
      }
    ));
    // mock operations request response
    if (records.length === 6) {
      records[1].attributes = { name: 'Moon' };
      records[1].relationships = {
        planet: {
          data: {
            type: 'planet',
            id: records[0].id
          }
        }
      };
      delete (records[2] as any).relationships;
      delete (records[3] as any).relationships;
      (records[4] as any).relationships.moons.data.length = 1;
    }
    return records.length === 1 ? records[0] : records;
  }
}

Orbit.globals.fetch = fetch;

module('Orbit Fastify Plugin (jsonapi)', function(hooks: Hooks) {
  // @ts-ignore
  hooks.beforeEach(async () => {
    server = Fastify();
    memory = new DisposableMemorySource({ schema });
    server.register(Plugin, {
      source: memory,
      jsonapi: true,
      graphql: false
    });
    await server.listen(0);

    const { port } = server.server.address() as AddressInfo;
    const host = `http://localhost:${port}`;

    fastify = Fastify();
    source = new DisposableJSONAPISource({
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

  tests(subject);
});
