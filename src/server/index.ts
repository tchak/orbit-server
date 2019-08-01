import {
  ModelDefinition,
  Schema,
  RecordOperation,
  Transform
} from '@orbit/data';
import { JSONAPISerializer, JSONAPISerializerSettings } from '@orbit/jsonapi';
import { Config as GraphQLConfig } from 'apollo-server-fastify';
import { PubSubEngine } from 'graphql-subscriptions';

import {
  routeHandlers,
  errorHandler,
  RouteDefinition,
  Context as JSONAPIContext,
  QueryableAndUpdatableSource
} from '../jsonapi';
import { makeExecutableSchema, Context as GraphQLContext } from '../graphql';

export { RouteDefinition, JSONAPIContext, GraphQLContext };

export interface Inflections {
  plurals: Record<string, string>;
  singulars: Record<string, string>;
}

export interface SchemaDocument {
  models: Record<string, ModelDefinition>;
  inflections?: Inflections;
}

export interface JSONAPIConfig {
  readonly?: boolean;
  SerializerClass?: new (
    settings: JSONAPISerializerSettings
  ) => JSONAPISerializer;
}

export { GraphQLConfig };

export interface ServerSettings {
  source: QueryableAndUpdatableSource;
  pubsub?: PubSubEngine;
  inflections?: boolean;
  schema?: boolean | string;
  jsonapi?: boolean | JSONAPIConfig;
  graphql?: boolean | GraphQLConfig;
}

export default class OrbitServer {
  protected source: QueryableAndUpdatableSource;
  protected pubsub?: PubSubEngine;
  protected inflections?: boolean;
  protected schema?: boolean | string;
  protected jsonapi?: boolean | JSONAPIConfig;
  protected graphql?: boolean | GraphQLConfig;

  constructor(settings: ServerSettings) {
    this.source = settings.source;
    this.pubsub = settings.pubsub;
    this.inflections = settings.inflections;
    this.schema = settings.schema;
    this.jsonapi = settings.jsonapi;
    this.graphql = settings.graphql;
  }

  routeHandlers(
    serializer: JSONAPISerializer,
    callback: (prefix: string, routes: RouteDefinition[]) => void,
    readonly: boolean = false
  ): void {
    routeHandlers(
      {
        schema: this.source.schema,
        serializer,
        readonly
      },
      callback
    );
  }

  errorHandler(error: Error) {
    return errorHandler(this.source, error);
  }

  makeGraphQLSchema() {
    return makeExecutableSchema(this.source.schema);
  }

  makeOrbitSchema() {
    const schema: SchemaDocument = { models: this.source.schema.models };
    if (this.inflections !== false) {
      schema.inflections = buildInflections(this.source.schema);
    }
    return schema;
  }

  async activateSource(): Promise<
    ((transform: Transform) => void) | undefined
  > {
    await this.source.activated;

    if (this.pubsub) {
      const { pubsub } = this;

      function listener(transform: Transform) {
        for (let operation of transform.operations as RecordOperation[]) {
          pubsub.publish(`operation:${operation.record.type}`, operation);
        }
      }

      this.source.on('transform', listener);

      return listener;
    }

    return undefined;
  }

  deactivateSource(listener: ((transform: Transform) => void) | undefined) {
    if (listener) {
      this.source.off('transform', listener);
    }
    return this.source.deactivate();
  }
}

function buildInflections(schema: Schema) {
  const inflections: Inflections = { plurals: {}, singulars: {} };
  for (let type in schema.models) {
    let plural = schema.pluralize(type);
    inflections.plurals[type] = plural;
    inflections.singulars[plural] = type;
  }
  return inflections;
}
