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
  Updatable,
  Schema
} from '@orbit/data';
import Knex from 'knex';

import SQLCache, { SQLCacheSettings } from './sql-cache';

const { assert } = Orbit;

export interface SQLSourceSettings extends SourceSettings {
  knex?: Knex.Config;
}

/**
 * Source for storing data in SQL database.
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

    assert(
      "SQLSource's `knex` must be specified in `settings.knex` constructor argument",
      !!settings.knex
    );

    settings.name = settings.name || 'sql';

    super(settings);

    let cacheSettings: SQLCacheSettings = {
      knex: settings.knex as Knex.Config,
      schema: settings.schema as Schema
    };
    cacheSettings.keyMap = settings.keyMap;
    cacheSettings.queryBuilder =
      cacheSettings.queryBuilder || this.queryBuilder;
    cacheSettings.transformBuilder =
      cacheSettings.transformBuilder || this.transformBuilder;
    cacheSettings.knex = cacheSettings.knex || settings.knex;

    this._cache = new SQLCache(cacheSettings);
  }

  get cache(): SQLCache {
    return this._cache;
  }

  async deactivate() {
    await super.deactivate();
    return this.cache.closeDB();
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
