// @ts-ignore
import { module, test } from 'qunit';
import { FastifyInstance, HTTPInjectOptions } from 'fastify';
import { uuid } from '@orbit/utils';

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

      assert.equal(response.status, 201);
      assert.equal(response.body.data.type, 'planets');
      assert.ok(response.body.data.id);
      assert.deepEqual(
        response.body.data.attributes,
        compact({
          name: 'Earth',
          'created-at': response.body.data.attributes['created-at']
        })
      );
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
        attributes: compact({
          name: 'Earth',
          'created-at': response.body.data.attributes['created-at']
        })
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

      assert.equal(response.status, 204);

      const {
        status,
        body: { data }
      } = await getPlanet(subject.fastify, id);

      assert.equal(status, 200);
      assert.deepEqual(data, {
        type: 'planets',
        id,
        attributes: compact({
          name: 'Earth 2',
          'created-at': data.attributes['created-at']
        })
      });
    });

    test('remove planet', async function(assert: Assert) {
      const { body } = await createEarth(subject.fastify);
      const id = body.data.id;

      const response = await request(subject.fastify, {
        method: 'DELETE',
        url: `/planets/${id}`
      });

      assert.equal(response.status, 204);

      const { status } = await getPlanet(subject.fastify, id);

      assert.equal(status, 404);
    });

    test('create moon', async function(assert: Assert) {
      const { body } = await createEarth(subject.fastify);
      const id = body.data.id;

      const response = await createMoon(subject.fastify, id);

      assert.equal(response.status, 201);
    });

    test('get planet moons', async function(assert: Assert) {
      const { body } = await createEarth(subject.fastify);
      const id = body.data.id;
      await createMoon(subject.fastify, id);

      const response = await getPlanetMoons(subject.fastify, id);

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 1);
    });

    test('create typedModels', async function(assert: Assert) {
      const { body } = await createTypedModel(subject.fastify);
      const id = body.data.id;

      const response = await request(subject.fastify, {
        url: `/typed-models/${id}`
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data.attributes, {
        'some-text': 'Some text',
        'some-number': 2,
        'some-boolean': true
      });
    });

    test('operations', async function(assert: Assert) {
      const {
        body: {
          data: { id: earthId }
        }
      } = await createEarth(subject.fastify);
      const {
        body: {
          data: { id: marsId }
        }
      } = await createMars(subject.fastify);
      const {
        body: {
          data: { id: moonId }
        }
      } = await createMoon(subject.fastify, earthId);

      const response = await operationsWithEarthAndMars(
        subject.fastify,
        earthId,
        marsId,
        moonId
      );

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, {
        operations: [
          {
            data: compact({
              type: 'planets',
              id: earthId,
              attributes: compact({
                name: 'Beautiful Earth',
                'created-at':
                  response.body.operations[0].data.attributes['created-at']
              }),
              relationships: response.body.operations[0].data.relationships
            })
          },
          {
            data: {
              type: 'moons',
              id: moonId,
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
          },
          {
            data: {
              type: 'moons',
              id: response.body.operations[2].data.id,
              attributes: {
                name: 'Phobos'
              }
            }
          },
          {
            data: {
              type: 'moons',
              id: response.body.operations[3].data.id,
              attributes: {
                name: 'Deimos'
              }
            }
          },
          {
            data: {
              type: 'planets',
              id: marsId,
              attributes: compact({
                name: 'Mars',
                'created-at':
                  response.body.operations[4].data.attributes['created-at']
              }),
              relationships: {
                moons: {
                  data: [
                    {
                      type: 'moons',
                      id: response.body.operations[2].data.id
                    }
                  ]
                }
              }
            }
          },
          {
            data: {
              type: 'moons',
              id: response.body.operations[3].data.id,
              attributes: {
                name: 'Deimos'
              },
              relationships: {
                planet: {
                  data: {
                    type: 'planets',
                    id: marsId
                  }
                }
              }
            }
          }
        ]
      });
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

    test('create typedModels', async function(assert: Assert) {
      const { body } = await createTypedModel(subject.fastify);
      const id = body.data.id;

      const response = await request(subject.fastify, {
        method: 'POST',
        url: '/graphql',
        payload: {
          query: `{ typedModel(id: "${id}") { someText someNumber someBoolean } }`
        }
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data.typedModel, {
        someText: 'Some text',
        someNumber: 2,
        someBoolean: true
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

function createMars(fastify: FastifyInstance) {
  return request(fastify, {
    method: 'POST',
    url: '/planets',
    payload: {
      data: {
        type: 'planets',
        attributes: {
          name: 'Mars'
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

function operationsWithEarthAndMars(
  fastify: FastifyInstance,
  earthId: string,
  marsId: string,
  moonId: string
) {
  const phobosId = uuid();
  const deimosId = uuid();

  return request(fastify, {
    method: 'PATCH',
    url: '/operations',
    payload: {
      operations: [
        {
          op: 'update',
          ref: {
            type: 'planets',
            id: earthId
          },
          data: {
            type: 'planets',
            id: earthId,
            attributes: {
              name: 'Beautiful Earth'
            }
          }
        },
        {
          op: 'remove',
          ref: {
            type: 'moons',
            id: moonId
          }
        },
        {
          op: 'add',
          ref: {
            type: 'moons',
            id: phobosId
          },
          data: {
            type: 'moons',
            id: phobosId,
            attributes: {
              name: 'Phobos'
            }
          }
        },
        {
          op: 'add',
          ref: {
            type: 'moons',
            id: deimosId
          },
          data: {
            type: 'moons',
            id: deimosId,
            attributes: {
              name: 'Deimos'
            }
          }
        },
        {
          op: 'add',
          ref: {
            type: 'planets',
            id: marsId,
            relationship: 'moons'
          },
          data: {
            type: 'moons',
            id: phobosId
          }
        },
        {
          op: 'update',
          ref: {
            type: 'moons',
            id: deimosId,
            relationship: 'planet'
          },
          data: {
            type: 'planets',
            id: marsId
          }
        }
      ]
    }
  });
}

function createTypedModel(fastify: FastifyInstance) {
  return request(fastify, {
    method: 'POST',
    url: '/typed-models',
    payload: {
      data: {
        type: 'typed-models',
        attributes: {
          'some-text': 'Some text',
          'some-number': 2,
          'some-boolean': true
        }
      }
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

function compact(obj: Record<string, unknown>) {
  for (let key in obj) {
    if (obj[key] === undefined) {
      delete obj[key];
    }
  }
  return obj;
}
