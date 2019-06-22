import { FastifyInstance } from 'fastify';
import plugin from 'fastify-plugin';
import { IncomingMessage, OutgoingMessage, Server } from 'http';
import { Schema, ModelDefinition } from '@orbit/data';

import Context from '../context';

export interface SchemaSettings {
  context: Context;
  inflections?: boolean;
}

export interface Inflections {
  plurals: Record<string, string>;
  singulars: Record<string, string>;
}

export interface SchemaDocument {
  models: Record<string, ModelDefinition>;
  inflections?: Inflections;
}

export default plugin<Server, IncomingMessage, OutgoingMessage, SchemaSettings>(
  function(fastify: FastifyInstance, { context, inflections }, next) {
    const schema: SchemaDocument = { models: context.source.schema.models };
    if (inflections !== false) {
      schema.inflections = buildInflections(context.source.schema);
    }
    fastify.get('/schema', async () => schema);
    next();
  }
);

function buildInflections(schema: Schema) {
  const inflections: Inflections = { plurals: {}, singulars: {} };
  for (let type in schema.models) {
    let plural = schema.pluralize(type);
    inflections.plurals[type] = plural;
    inflections.singulars[plural] = type;
  }
  return inflections;
}
