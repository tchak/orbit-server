import {
  ModelDefinition,
  Schema,
  RecordOperation,
  Transform
} from '@orbit/data';
import { JSONAPISerializer } from '@orbit/jsonapi';
import { PubSubEngine } from 'graphql-subscriptions';

import {
  routeHandlers,
  errorHandler,
  RouteHandler,
  Context as JSONAPIContext,
  QueryableAndUpdatableSource
} from '../jsonapi';
import { makeExecutableSchema, Context as GraphQLContext } from '../graphql';

export { RouteHandler, JSONAPIContext, GraphQLContext };

export interface Inflections {
  plurals: Record<string, string>;
  singulars: Record<string, string>;
}

export interface SchemaDocument {
  models: Record<string, ModelDefinition>;
  inflections?: Inflections;
}

export interface ServerSettings {
  source: QueryableAndUpdatableSource;
  pubsub?: PubSubEngine;
  inflections?: boolean;
}

export default class Server {
  protected source: QueryableAndUpdatableSource;
  protected pubsub?: PubSubEngine;
  protected inflections?: boolean;

  private transformListener: any;

  constructor(settings: ServerSettings) {
    this.source = settings.source;
    this.pubsub = settings.pubsub;
    this.inflections = settings.inflections;
  }

  routeHandlers(
    serializer: JSONAPISerializer,
    callback: (prefix: string, routes: RouteHandler[]) => void,
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

  graphQLSchema() {
    return makeExecutableSchema(this.source.schema);
  }

  generateSchema() {
    const schema: SchemaDocument = { models: this.source.schema.models };
    if (this.inflections !== false) {
      schema.inflections = buildInflections(this.source.schema);
    }
    return schema;
  }

  setupPubSub() {
    if (this.pubsub) {
      this.transformListener = (transform: Transform) => {
        if (this.pubsub) {
          for (let operation of transform.operations as RecordOperation[]) {
            this.pubsub.publish(operation.record.type, operation);
          }
        }
      };

      this.source.on('transform', this.transformListener);
    }
  }

  onClose() {
    if (this.transformListener) {
      this.source.off('transform', this.transformListener);
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
