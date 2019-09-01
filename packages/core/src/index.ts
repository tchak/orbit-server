import {
  ModelDefinition,
  Schema,
  RecordOperation,
  Transform
} from '@orbit/data';
import { JSONAPISerializer, JSONAPISerializerSettings } from '@orbit/jsonapi';
import { Config as GraphQLConfig } from 'apollo-server';
import { GraphQLSchema } from 'graphql';
import { PubSubEngine } from 'graphql-subscriptions';
import {
  makeExecutableSchema,
  Context as GraphQLContext
} from 'orbit-graphql-schema';

import {
  processRequest,
  processBatchRequest,
  onError,
  Request
} from './handlers';

import { Context as JSONAPIContext, Source } from './types';

export * from './handlers';

export { Source, JSONAPIContext, GraphQLContext };

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
  source: Source;
  pubsub?: PubSubEngine;
  inflections?: boolean;
  schema?: boolean | string;
  jsonapi?: boolean | JSONAPIConfig;
  graphql?: boolean | GraphQLConfig;
  readonly?: boolean;
}

export class Server {
  protected source: Source;
  protected serializer: JSONAPISerializer;
  protected pubsub?: PubSubEngine;
  protected inflections?: boolean;
  protected schema?: boolean | string;
  protected jsonapi?: boolean | JSONAPIConfig;
  protected graphql?: boolean | GraphQLConfig;
  protected readonly?: boolean;

  private _listener?: (transform: Transform) => void;

  constructor(settings: ServerSettings) {
    this.source = settings.source;
    this.pubsub = settings.pubsub;
    this.inflections = settings.inflections;
    this.schema = settings.schema;
    this.jsonapi = settings.jsonapi;
    this.graphql = settings.graphql;
    this.readonly = settings.readonly;

    let config: JSONAPIConfig = {};
    if (typeof this.jsonapi === 'object') {
      config = this.jsonapi;
    }

    const SerializerClass = config.SerializerClass || JSONAPISerializer;
    this.serializer = new SerializerClass({
      schema: this.source.schema
    });
  }

  processRequest(request: Request) {
    return processRequest(request, {
      source: this.source,
      serializer: this.serializer
    });
  }

  processBatchRequest(request: Request) {
    return processBatchRequest(request, {
      source: this.source,
      serializer: this.serializer
    });
  }

  onError(error: Error) {
    return onError(this.source, error);
  }

  makeGraphQLSchema(): GraphQLSchema {
    return makeExecutableSchema(this.source.schema);
  }

  makeOrbitSchema() {
    const schema: SchemaDocument = { models: this.source.schema.models };
    if (this.inflections !== false) {
      schema.inflections = buildInflections(this.source.schema);
    }
    return schema;
  }

  async activate(): Promise<void> {
    await this.source.activated;

    if (this.pubsub) {
      const { pubsub } = this;

      function listener(transform: Transform) {
        for (let operation of transform.operations as RecordOperation[]) {
          pubsub.publish(`operation:${operation.record.type}`, operation);
        }
      }

      this.source.on('transform', listener);
      this._listener = listener;
    }
  }

  deactivate() {
    if (this._listener) {
      this.source.off('transform', this._listener);
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
