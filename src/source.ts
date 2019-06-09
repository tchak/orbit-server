import { Source, Queryable, Updatable } from '@orbit/data';

export default interface Source extends Source, Updatable, Queryable {
  disconnect: () => Promise<void>;
}
