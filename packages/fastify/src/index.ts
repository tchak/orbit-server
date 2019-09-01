import { FastifyInstance, FastifyRequest } from 'fastify';
import plugin from 'fastify-plugin';
import cors from 'fastify-cors';
import helmet from 'fastify-helmet';
import favicon from 'fastify-favicon';

import { IncomingMessage } from 'http';
import qs from 'qs';
import { ApolloServer } from 'apollo-server-fastify';

import {
  Server as BaseServer,
  GraphQLConfig,
  ServerSettings,
  Ref
} from '@orbit-server/core';

export { ServerSettings };

export interface ServerRegistration {
  cors?: boolean;
  helmet?: boolean | helmet.FastifyHelmetOptions;
}

export default class Server extends BaseServer {
  createHandler(settings: ServerRegistration = {}) {
    return plugin(async (fastify, _, next) => {
      fastify.register(favicon);

      if (typeof settings.helmet === 'object') {
        fastify.register(helmet, settings.helmet);
      } else if (settings.helmet !== false) {
        fastify.register(helmet);
      }

      if (settings.cors !== false) {
        fastify.register(cors);
      }

      await this.setupSource(fastify);

      if (this.schema !== false) {
        this.registerSchema(fastify);
      }
      if (this.jsonapi) {
        this.registerJSONAPI(fastify);
      }
      if (this.graphql) {
        this.registerGraphQL(fastify);
      }

      next();
    });
  }

  private registerSchema(fastify: FastifyInstance) {
    const path = typeof this.schema === 'string' ? this.schema : 'schema';
    const schema = this.makeOrbitSchema();
    fastify.get(`/${path}`, async () => schema);
  }

  private handleRequest(
    op: string,
    ref: Ref,
    request: FastifyRequest<IncomingMessage>
  ) {
    const [url, params] = parseURL(request.raw.url as string);
    return this.processRequest({
      op,
      ref: { id: request.params.id, ...ref },
      url,
      params,
      options: {
        headers: request.headers,
        include: request.params.include
      },
      document: request.body
    });
  }

  private handleBatchRequest(request: FastifyRequest<IncomingMessage>) {
    const [url, params] = parseURL(request.raw.url as string);
    return this.processBatchRequest({
      op: 'batch',
      ref: { type: 'batch' },
      url,
      params,
      options: {
        headers: request.headers
      },
      document: request.body
    });
  }

  private registerJSONAPI(fastify: FastifyInstance) {
    fastify.register((fastify, _, next) => {
      fastify.addContentTypeParser(
        'application/vnd.api+json',
        { parseAs: 'string' },
        function(_, body, done) {
          try {
            done(null, JSON.parse(body));
          } catch (err) {
            err.statusCode = 400;
            done(err, undefined);
          }
        }
      );
      fastify.addHook('preSerialization', async (_, reply, payload) => {
        const [status, responseHeaders, responseBody] = payload;
        reply.status(status);
        reply.headers(responseHeaders);
        return responseBody;
      });

      for (let type in this.source.schema.models) {
        const prefix = this.serializer.resourceType(type);
        fastify.register(
          (fastify, _, next) => {
            const ref = { type };

            fastify.get('/', async request =>
              this.handleRequest('findRecords', ref, request)
            );
            fastify.get('/:id', async request =>
              this.handleRequest('findRecord', ref, request)
            );

            if (!this.readonly) {
              fastify.post('/', async request =>
                this.handleRequest('addRecord', ref, request)
              );
              fastify.patch('/:id', async request =>
                this.handleRequest('updateRecord', ref, request)
              );
              fastify.delete('/:id', async request =>
                this.handleRequest('removeRecord', ref, request)
              );
            }

            this.source.schema.eachRelationship(
              type,
              (property, { type: kind }) => {
                const relationship = this.serializer.resourceRelationship(
                  type,
                  property
                );
                const refWithRelationship = { relationship: property, ...ref };

                if (kind === 'hasMany') {
                  fastify.get(`/:id/${relationship}`, request =>
                    this.handleRequest(
                      'findRelatedRecords',
                      refWithRelationship,
                      request
                    )
                  );

                  if (!this.readonly) {
                    fastify.patch(
                      `/:id/relationships/${relationship}`,
                      request =>
                        this.handleRequest(
                          'replaceRelatedRecord',
                          refWithRelationship,
                          request
                        )
                    );
                    fastify.post(
                      `/:id/relationships/${relationship}`,
                      request =>
                        this.handleRequest(
                          'addToRelatedRecords',
                          refWithRelationship,
                          request
                        )
                    );
                    fastify.delete(
                      `/:id/relationships/${relationship}`,
                      request =>
                        this.handleRequest(
                          'removeFromRelatedRecords',
                          refWithRelationship,
                          request
                        )
                    );
                  }
                } else {
                  fastify.get(`/:id/${relationship}`, request =>
                    this.handleRequest(
                      'findRelatedRecord',
                      refWithRelationship,
                      request
                    )
                  );

                  if (!this.readonly) {
                    fastify.patch(
                      `/:id/relationships/${relationship}`,
                      request =>
                        this.handleRequest(
                          'replaceRelatedRecord',
                          refWithRelationship,
                          request
                        )
                    );
                  }
                }
              }
            );

            next();
          },
          { prefix }
        );
      }

      fastify.patch('/batch', async request =>
        this.handleBatchRequest(request)
      );

      fastify.setErrorHandler(async (error, _, reply) => {
        const [status, body] = await this.onError(error);
        reply.status(status);
        return body;
      });

      next();
    });
  }

  private registerGraphQL(fastify: FastifyInstance) {
    let config: GraphQLConfig = {};

    if (typeof this.graphql === 'object') {
      config = this.graphql;
    }

    const context = { source: this.source };

    const server = new ApolloServer({
      schema: this.makeGraphQLSchema(),
      context({ req }) {
        return { ...context, headers: req.headers };
      },
      ...config
    });
    fastify.register(server.createHandler());
  }

  private async setupSource(fastify: FastifyInstance) {
    await this.activate();
    fastify.addHook('onClose', async () => this.deactivate());
  }
}

function parseURL(url: string) {
  const [path, queryString] = url.split('?');
  const query = qs.parse(queryString);
  for (let key of ['filter', 'page']) {
    query[key] = qs.parse(query[key]);
  }
  return [path, query];
}
