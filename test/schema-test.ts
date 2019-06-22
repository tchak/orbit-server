// @ts-ignore
import { module, test } from 'qunit';

import Fastify, { FastifyInstance, HTTPInjectOptions } from 'fastify';
import MemorySource from '@orbit/memory';

import schema from './support/test-schema';
import { Plugin } from '../src';

let fastify: FastifyInstance;
let source: DisposableMemorySource;

class DisposableMemorySource extends MemorySource {
  async disconnect() {}
}

module('Orbit Fastify Plugin schema', function(hooks: Hooks) {
  // @ts-ignore
  hooks.beforeEach(() => {
    fastify = Fastify();
    source = new DisposableMemorySource({ schema });
    fastify.register(Plugin, {
      source
    });
  });

  // @ts-ignore
  hooks.afterEach(async () => {
    await fastify.close();
  });

  test('get', async function(assert: Assert) {
    const response = await request(fastify, {
      url: '/schema'
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      models: source.schema.models,
      inflections: {
        plurals: {
          planet: 'planets',
          moon: 'moons',
          typedModel: 'typedModels',
          article: 'articles',
          tag: 'tags'
        },
        singulars: {
          planets: 'planet',
          moons: 'moon',
          typedModels: 'typedModel',
          articles: 'article',
          tags: 'tag'
        }
      }
    });
  });
});

async function request(fastify: FastifyInstance, options: HTTPInjectOptions) {
  const response = await fastify.inject(options);

  return {
    status: response.statusCode,
    headers: response.headers,
    body: JSON.parse(response.payload)
  };
}
