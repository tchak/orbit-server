// @ts-ignore
import { module, test } from 'qunit';

import Fastify, { FastifyInstance, HTTPInjectOptions } from 'fastify';
import MemorySource from '@orbit/memory';
import { PubSub } from 'graphql-subscriptions';

import schema from './support/test-schema';
import { Plugin, toOrbitSchema } from '../src';

function serverOptions() {
  return {
    schema,
    source: new MemorySource({ schema: toOrbitSchema(schema) }),
    pubsub: new PubSub(),
    jsonapi: true,
    graphql: true
  };
}

module('Orbit Server', function() {
  test('get planets (empty)', async function(assert: Assert) {
    const fastify = Fastify();
    fastify.register(Plugin, serverOptions());

    const response = await request(fastify, {
      url: '/planets'
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { data: [] });
  });

  test('create planet', async function(assert: Assert) {
    const fastify = Fastify();
    fastify.register(Plugin, serverOptions());

    const response = await createEarth(fastify);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.type, 'planets');
    assert.ok(response.body.data.id);
    assert.deepEqual(response.body.data.attributes, { name: 'Earth' });
  });

  test('get planets', async function(assert: Assert) {
    const fastify = Fastify();
    fastify.register(Plugin, serverOptions());

    await createEarth(fastify);

    const response = await request(fastify, {
      url: '/planets'
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, 1);
  });

  test('get planet', async function(assert: Assert) {
    const fastify = Fastify();
    fastify.register(Plugin, serverOptions());

    const { body } = await createEarth(fastify);
    const id = body.data.id;

    const response = await request(fastify, {
      url: `/planets/${id}`
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, {
      type: 'planets',
      id,
      attributes: {
        name: 'Earth'
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

function createEarth(fastify: FastifyInstance) {
  return request(fastify, {
    method: 'POST',
    url: '/planets',
    payload: {
      data: {
        type: 'planets',
        attributes: {
          name: 'Earth'
        }
      }
    }
  });
}
