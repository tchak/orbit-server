// @ts-ignore
import { module, test } from 'qunit';
import { FastifyInstance, HTTPInjectOptions } from 'fastify';

export interface Subject {
  fastify: FastifyInstance;
}

export default function(subject: Subject) {
  module('jsonapi', function() {
    test('get planets (empty)', async function(assert: Assert) {
      const response = await getPlanets(subject.fastify);

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { data: [] });
    });

    test('create planet', async function(assert: Assert) {
      const response = await createEarth(subject.fastify);

      assert.equal(response.status, 200);
      assert.equal(response.body.data.type, 'planets');
      assert.ok(response.body.data.id);
      assert.deepEqual(response.body.data.attributes, { name: 'Earth' });
    });

    test('get planets', async function(assert: Assert) {
      await createEarth(subject.fastify);
      const response = await getPlanets(subject.fastify);

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 1);
    });

    test('get planet', async function(assert: Assert) {
      const { body } = await createEarth(subject.fastify);
      const id = body.data.id;

      const response = await getPlanet(subject.fastify, id);

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, {
        type: 'planets',
        id,
        attributes: {
          name: 'Earth'
        }
      });
    });

    test('update planet', async function(assert: Assert) {
      const { body } = await createEarth(subject.fastify);
      const id = body.data.id;

      const response = await request(subject.fastify, {
        method: 'PATCH',
        url: `/planets/${id}`,
        payload: {
          data: {
            id,
            type: 'planets',
            attributes: {
              name: 'Earth 2'
            }
          }
        }
      });

      assert.equal(response.status, 200);

      const {
        status,
        body: { data }
      } = await getPlanet(subject.fastify, id);

      assert.equal(status, 200);
      assert.deepEqual(data, {
        type: 'planets',
        id,
        attributes: {
          name: 'Earth 2'
        }
      });
    });

    test('remove planet', async function(assert: Assert) {
      const { body } = await createEarth(subject.fastify);
      const id = body.data.id;

      const response = await request(subject.fastify, {
        method: 'DELETE',
        url: `/planets/${id}`
      });

      assert.equal(response.status, 200);

      const { status } = await getPlanet(subject.fastify, id);

      assert.equal(status, 404);
    });
  });

  module('graphql', function() {
    test('get planets (empty)', async function(assert: Assert) {
      const response = await getGQLPlanets(subject.fastify);

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, { planets: [] });
    });

    test('get planets', async function(assert: Assert) {
      await createEarth(subject.fastify);
      const response = await getGQLPlanets(subject.fastify);

      assert.equal(response.status, 200);
      assert.equal(response.body.data.planets.length, 1);
    });

    test('get planet', async function(assert: Assert) {
      const { body } = await createEarth(subject.fastify);
      const id = body.data.id;

      const response = await getGQLPlanet(subject.fastify, id);

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data.planet, {
        __typename: 'Planet',
        id,
        name: 'Earth'
      });
    });
  });
}

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

function getPlanet(fastify: FastifyInstance, id: string) {
  return request(fastify, {
    url: `/planets/${id}`
  });
}

function getPlanets(fastify: FastifyInstance) {
  return request(fastify, {
    url: '/planets'
  });
}

function getGQLPlanets(fastify: FastifyInstance) {
  return request(fastify, {
    method: 'POST',
    url: '/graphql',
    payload: {
      query: '{ planets { __typename id name } }'
    }
  });
}

function getGQLPlanet(fastify: FastifyInstance, id: string) {
  return request(fastify, {
    method: 'POST',
    url: '/graphql',
    payload: {
      query: `{ planet(id: "${id}") { __typename id name } }`
    }
  });
}
