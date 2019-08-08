import { Source as OrbitSource, Queryable, Updatable } from '@orbit/data';
import { JSONAPISerializer } from '@orbit/jsonapi';

export interface Source extends OrbitSource, Queryable, Updatable {}

export interface Context {
  source: Source;
  serializer: JSONAPISerializer;
}
