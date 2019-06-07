import { Source, Queryable, Updatable } from '@orbit/data';

export interface Source extends Source, Updatable, Queryable {}
export { Schema, ModelDefinition, toOrbitSchema } from './schema';

export { default as Plugin, ServerSettings } from './fastify';
