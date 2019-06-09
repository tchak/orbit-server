import { Source, Queryable, Updatable } from '@orbit/data';

export interface Source extends Source, Updatable, Queryable {}

export { default as Plugin, ServerSettings } from './fastify';
