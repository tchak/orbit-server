import Orbit, {
  Resettable,
  Query,
  QueryOrExpression,
  queryable,
  Queryable,
  Source,
  SourceSettings,
  Transform,
  TransformOrOperations,
  RecordOperation,
  updatable,
  Updatable
} from '@orbit/data';

import SQLCache, { SQLCacheSettings } from './sql-cache';

const { assert } = Orbit;

export interface SQLSourceSettings extends SourceSettings {
  namespace?: string;
  cacheSettings?: SQLCacheSettings;
}

/**
 * Source for storing data in IndexedDB.
 */
@queryable
@updatable
export default class SQLSource extends Source
  implements Resettable, Queryable, Updatable {
  protected _cache: SQLCache;

  // Queryable interface stubs
  query: (
    queryOrExpression: QueryOrExpression,
    options?: object,
    id?: string
  ) => Promise<any>;

  // Updatable interface stubs
  update: (
    transformOrOperations: TransformOrOperations,
    options?: object,
    id?: string
  ) => Promise<any>;

  constructor(settings: SQLSourceSettings = {}) {
    assert(
      "SQLSource's `schema` must be specified in `settings.schema` constructor argument",
      !!settings.schema
    );

    settings.name = settings.name || 'indexedDB';

    super(settings);

    let cacheSettings: SQLCacheSettings = settings.cacheSettings || {};
    cacheSettings.schema = settings.schema;
    cacheSettings.keyMap = settings.keyMap;
    cacheSettings.queryBuilder =
      cacheSettings.queryBuilder || this.queryBuilder;
    cacheSettings.transformBuilder =
      cacheSettings.transformBuilder || this.transformBuilder;
    cacheSettings.namespace = cacheSettings.namespace || settings.namespace;

    this._cache = new SQLCache(cacheSettings);
  }

  get cache(): SQLCache {
    return this._cache;
  }

  async upgrade(): Promise<void> {
    await this._cache.reopenDB();
  }

  /////////////////////////////////////////////////////////////////////////////
  // Resettable interface implementation
  /////////////////////////////////////////////////////////////////////////////

  async reset(): Promise<void> {
    await this._cache.reset();
  }

  /////////////////////////////////////////////////////////////////////////////
  // Updatable interface implementation
  /////////////////////////////////////////////////////////////////////////////

  async _update(transform: Transform): Promise<any> {
    const result = await this.cache.patch(
      transform.operations as RecordOperation[]
    );
    const results = result.data;
    return results.length === 1 ? results[0] : results;
  }

  /////////////////////////////////////////////////////////////////////////////
  // Queryable interface implementation
  /////////////////////////////////////////////////////////////////////////////

  async _query(query: Query): Promise<any> {
    return this._cache.query(query);
  }
}
