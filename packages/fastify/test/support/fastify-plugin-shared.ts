import { FastifyInstance, HTTPInjectOptions } from 'fastify';
import { uuid } from '@orbit/utils';
import qs from 'qs';

export interface Subject {
  fastify?: FastifyInstance;
}

QUnit.config.testTimeout = 1000;

const { test } = QUnit;

export default function(subject: Subject, sourceName: string) {
  QUnit.module('jsonapi', function() {
    test('get planets (empty)', async function(assert) {
      const response = await getPlanets(subject.fastify as FastifyInstance);

      assert.equal(response.status, 200);
      // assert.equal(response.headers['content-type'], 'application/vnd.api+json; charset=utf-8');
      assert.deepEqual(response.body, { data: [] });
    });

    test('create planet', async function(assert) {
      const response = await createEarth(subject.fastify as FastifyInstance);

      assert.equal(response.status, 201);
      assert.equal(
        response.headers.location,
        `/planets/${response.body.data.id}`
      );
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

    test('get planets', async function(assert) {
      await createEarth(subject.fastify as FastifyInstance);
      const response = await getPlanets(subject.fastify as FastifyInstance);

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 1);
    });

    test('get planet', async function(assert) {
      const { body } = await createEarth(subject.fastify as FastifyInstance);
      const id = body.data.id;

      const response = await getPlanet(subject.fastify as FastifyInstance, id);

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

    test('update planet', async function(assert) {
      const { body } = await createEarth(subject.fastify as FastifyInstance);
      const id = body.data.id;

      const response = await request(subject.fastify as FastifyInstance, {
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
      } = await getPlanet(subject.fastify as FastifyInstance, id);

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

    test('update not found', async function(assert) {
      if (sourceName == 'memory') {
        assert.ok(true);
        return;
      }
      const response = await request(subject.fastify as FastifyInstance, {
        method: 'PATCH',
        url: `/planets/123`,
        payload: {
          data: {
            id: '123',
            type: 'planets',
            attributes: {
              name: 'Earth 2'
            }
          }
        }
      });

      assert.equal(response.status, 404);
    });

    test('remove planet', async function(assert) {
      const { body } = await createEarth(subject.fastify as FastifyInstance);
      const id = body.data.id;

      const response = await request(subject.fastify as FastifyInstance, {
        method: 'DELETE',
        url: `/planets/${id}`
      });

      assert.equal(response.status, 204);

      const { status } = await getPlanet(
        subject.fastify as FastifyInstance,
        id
      );

      assert.equal(status, 404);

      const { status: newStatus } = await createEarth(
        subject.fastify as FastifyInstance
      );
      assert.equal(newStatus, 201);
    });

    test('create moon', async function(assert) {
      const { body } = await createEarth(subject.fastify as FastifyInstance);
      const id = body.data.id;

      const response = await createMoon(subject.fastify as FastifyInstance, id);

      assert.equal(response.status, 201);
    });

    test('get planet moons', async function(assert) {
      const { body } = await createEarth(subject.fastify as FastifyInstance);
      const id = body.data.id;
      await createMoon(subject.fastify as FastifyInstance, id);

      const response = await getPlanetMoons(
        subject.fastify as FastifyInstance,
        id
      );

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 1);
    });

    test('create typedModels', async function(assert) {
      const { body } = await createTypedModel(
        subject.fastify as FastifyInstance
      );
      const id = body.data.id;

      const response = await request(subject.fastify as FastifyInstance, {
        url: `/typed-models/${id}`
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data.attributes, {
        'some-text': 'Some text',
        'some-number': 2,
        'some-boolean': true
      });
    });

    test('many to many', async function(assert) {
      const { body } = await createTag(subject.fastify as FastifyInstance);
      const id = body.data.id;

      const response = await createArticle(
        subject.fastify as FastifyInstance,
        id
      );
      assert.equal(response.status, 201);
    });

    test('filter', async function(assert) {
      await createTags(subject.fastify as FastifyInstance);

      const response = await request(subject.fastify as FastifyInstance, {
        url: `/tags`,
        query: {
          filter: qs.stringify({
            name: 'b'
          })
        }
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 1);
      assert.deepEqual(response.body.data[0].attributes, {
        name: 'b'
      });
    });

    test('sort (asc)', async function(assert) {
      await createTags(subject.fastify as FastifyInstance);

      const response = await request(subject.fastify as FastifyInstance, {
        url: `/tags`,
        query: {
          sort: 'name'
        }
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 3);
      assert.deepEqual(response.body.data[0].attributes.name, 'a');
      assert.deepEqual(response.body.data[1].attributes.name, 'b');
      assert.deepEqual(response.body.data[2].attributes.name, 'c');
    });

    test('sort (desc)', async function(assert) {
      await createTags(subject.fastify as FastifyInstance);

      const response = await request(subject.fastify as FastifyInstance, {
        url: `/tags`,
        query: {
          sort: '-name'
        }
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.length, 3);
      assert.deepEqual(response.body.data[0].attributes.name, 'c');
      assert.deepEqual(response.body.data[1].attributes.name, 'b');
      assert.deepEqual(response.body.data[2].attributes.name, 'a');
    });

    test('operations', async function(assert) {
      if (sourceName == 'jsonapi' || sourceName === 'sql') {
        assert.ok(true);
        return;
      }
      const {
        body: {
          data: { id: earthId }
        }
      } = await createEarth(subject.fastify as FastifyInstance);
      const {
        body: {
          data: { id: marsId }
        }
      } = await createMars(subject.fastify as FastifyInstance);
      const {
        body: {
          data: { id: moonId }
        }
      } = await createMoon(subject.fastify as FastifyInstance, earthId);

      const response = await operationsWithEarthAndMars(
        subject.fastify as FastifyInstance,
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
              relationships: response.body.operations[4].data.relationships
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

  QUnit.module('graphql', function() {
    test('get planets (empty)', async function(assert) {
      const response = await getGQLPlanets(subject.fastify as FastifyInstance);

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, { planets: [] });
    });

    test('get planets', async function(assert) {
      await createEarth(subject.fastify as FastifyInstance);
      const response = await getGQLPlanets(subject.fastify as FastifyInstance);

      assert.equal(response.status, 200);
      assert.equal(response.body.data.planets.length, 1);
    });

    test('get planet', async function(assert) {
      const { body } = await createEarth(subject.fastify as FastifyInstance);
      const id = body.data.id;

      const response = await getGQLPlanet(
        subject.fastify as FastifyInstance,
        id
      );

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data.planet, {
        __typename: 'Planet',
        id,
        name: 'Earth'
      });
    });

    test('get planet moons', async function(assert) {
      const { body } = await createEarth(subject.fastify as FastifyInstance);
      const id = body.data.id;
      await createMoon(subject.fastify as FastifyInstance, id);

      const response = await getGQLPlanetMoons(
        subject.fastify as FastifyInstance,
        id
      );

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

    test('get typedModels', async function(assert) {
      const { body } = await createTypedModel(
        subject.fastify as FastifyInstance
      );
      const id = body.data.id;

      const response = await request(subject.fastify as FastifyInstance, {
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

    test('filter', async function(assert) {
      await createTags(subject.fastify as FastifyInstance);

      const response = await request(subject.fastify as FastifyInstance, {
        method: 'POST',
        url: `/graphql`,
        payload: {
          query: `{ tags(where: { name: "b" }) { name } }`
        }
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, {
        tags: [
          {
            name: 'b'
          }
        ]
      });
    });

    test('sort (asc)', async function(assert) {
      await createTags(subject.fastify as FastifyInstance);

      const response = await request(subject.fastify as FastifyInstance, {
        method: 'POST',
        url: `/graphql`,
        payload: {
          query: `{ tags(orderBy: name_ASC) { name } }`
        }
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, {
        tags: [
          {
            name: 'a'
          },
          {
            name: 'b'
          },
          {
            name: 'c'
          }
        ]
      });
    });

    test('sort (desc)', async function(assert) {
      await createTags(subject.fastify as FastifyInstance);

      const response = await request(subject.fastify as FastifyInstance, {
        method: 'POST',
        url: `/graphql`,
        payload: {
          query: `{ tags(orderBy: name_DESC) { name } }`
        }
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, {
        tags: [
          {
            name: 'c'
          },
          {
            name: 'b'
          },
          {
            name: 'a'
          }
        ]
      });
    });
  });
}

async function request(fastify: FastifyInstance, options: HTTPInjectOptions) {
  if (options.url !== '/graphql') {
    options.headers = options.headers || {};
    options.headers['accept'] = 'application/vnd.api+json';
    if (options.method === 'POST' || options.method === 'PUT') {
      options.headers['content-type'] = 'application/vnd.api+json';
    }
  }
  const response = await fastify.inject(options);

  return {
    status: response.statusCode,
    headers: response.headers as any,
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
    url: '/batch',
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

function createTag(fastify: FastifyInstance) {
  return request(fastify, {
    method: 'POST',
    url: '/tags',
    payload: {
      data: {
        type: 'tags'
      }
    }
  });
}

function createTags(fastify: FastifyInstance) {
  return request(fastify, {
    method: 'PATCH',
    url: '/batch',
    payload: {
      operations: [
        {
          op: 'add',
          ref: {
            type: 'tags'
          },
          data: {
            type: 'tags',
            attributes: {
              name: 'a'
            }
          }
        },
        {
          op: 'add',
          ref: {
            type: 'tags'
          },
          data: {
            type: 'tags',
            attributes: {
              name: 'c'
            }
          }
        },
        {
          op: 'add',
          ref: {
            type: 'tags'
          },
          data: {
            type: 'tags',
            attributes: {
              name: 'b'
            }
          }
        }
      ]
    }
  });
}

function createArticle(fastify: FastifyInstance, tagId: string) {
  return request(fastify, {
    method: 'POST',
    url: '/articles',
    payload: {
      data: {
        type: 'articles',
        relationships: {
          tags: {
            data: [
              {
                type: 'tags',
                id: tagId
              }
            ]
          }
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
