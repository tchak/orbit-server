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

    test('create moon', async function(assert: Assert) {
      const { body } = await createEarth(subject.fastify);
      const id = body.data.id;

      const response = await createMoon(subject.fastify, id);

      assert.equal(response.status, 200);
    });

    test('get planet moons', async function(assert: Assert) {
      const { body } = await createEarth(subject.fastify);
      const id = body.data.id;
      await createMoon(subject.fastify, id);

      const response = await getPlanetMoons(subject.fastify, id);

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 1);
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

    test('get planet moons', async function(assert: Assert) {
      const { body } = await createEarth(subject.fastify);
      const id = body.data.id;
      await createMoon(subject.fastify, id);

      const response = await getGQLPlanetMoons(subject.fastify, id);

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, {
        planet: {
          __typename: 'Planet',
          moons: [
            {
              __typename: 'Moon',
              name: 'Moon',
              planet: {
                name: 'Earth'
              }
            }
          ]
        }
      });
    });

    test('operations', async function(assert: Assert) {
      const { body } = await createEarth(subject.fastify);
      const id = body.data.id;

      const response = await operationsOnEarth(subject.fastify, id);

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, {
        operations: [
          {
            data: {
              type: 'planets',
              id,
              attributes: {
                name: 'Earth 3'
              }
            }
          },
          {
            data: {
              type: 'planets',
              id: response.body.operations[1].data.id,
              attributes: {
                name: 'Mars'
              }
            }
          }
        ]
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

function createMoon(fastify: FastifyInstance, earthId: string) {
  return request(fastify, {
    method: 'POST',
    url: '/moons',
    payload: {
      data: {
        type: 'moons',
        attributes: {
          name: 'Moon'
        },
        relationships: {
          planet: {
            data: {
              type: 'planets',
              id: earthId
            }
          }
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

function getPlanetMoons(fastify: FastifyInstance, id: string) {
  return request(fastify, {
    url: `/planets/${id}/moons`
  });
}

function operationsOnEarth(fastify: FastifyInstance, id: string) {
  return request(fastify, {
    method: 'PATCH',
    url: '/operations',
    payload: {
      operations: [
        {
          op: 'update',
          ref: {
            type: 'planets',
            id
          },
          data: {
            type: 'planets',
            id,
            attributes: {
              name: 'Earth 3'
            }
          }
        },
        {
          op: 'add',
          ref: {
            type: 'planets'
          },
          data: {
            type: 'planets',
            attributes: {
              name: 'Mars'
            }
          }
        }
      ]
    }
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

function getGQLPlanetMoons(fastify: FastifyInstance, id: string) {
  return request(fastify, {
    method: 'POST',
    url: '/graphql',
    payload: {
      query: `{ planet(id: "${id}") {
        __typename
        moons {
          __typename
          name
          planet { name }
        }
      } }`
    }
  });
}
