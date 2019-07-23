import Orbit, {
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

import MongoCache, { MongoCacheSettings } from './mongo-cache';
import { MongoClientOptions } from 'mongodb';

const { assert } = Orbit;

export interface MongoSourceSettings extends SourceSettings {
  namespace?: string;
  uri?: string;
  options?: MongoClientOptions;
}

/**
 * Source for storing data in Mongo database.
 */
@queryable
@updatable
export default class MongoSource extends Source
  implements Queryable, Updatable {
  protected _cache: MongoCache;

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

  constructor(settings: MongoSourceSettings = {}) {
    assert(
      "SQLSource's `schema` must be specified in `settings.schema` constructor argument",
      !!settings.schema
    );

    assert(
      "SQLSource's `uri` must be specified in `settings.mongo` constructor argument",
      !!settings.uri
    );

    settings.name = settings.name || 'mongo';
    settings.autoActivate = false;

    super(settings);

    let cacheSettings: MongoCacheSettings = {
      namespace: settings.namespace || 'orbit',
      uri: settings.uri as string,
      options: settings.options,
      schema: settings.schema as Schema
    };
    cacheSettings.keyMap = settings.keyMap;
    cacheSettings.queryBuilder =
      cacheSettings.queryBuilder || this.queryBuilder;
    cacheSettings.transformBuilder =
      cacheSettings.transformBuilder || this.transformBuilder;

    this._cache = new MongoCache(cacheSettings);
    this.activate();
  }

  get cache(): MongoCache {
    return this._cache;
  }

  async _activate() {
    await super._activate();
    await this.cache.openDB();
  }

  async deactivate() {
    await super.deactivate();
    return this.cache.closeDB();
  }

  /////////////////////////////////////////////////////////////////////////////
  // Updatable interface implementation
  /////////////////////////////////////////////////////////////////////////////

  async _update(transform: Transform): Promise<any> {
    if (!this.transformLog.contains(transform.id)) {
      const result = await this.cache.patch(
        transform.operations as RecordOperation[]
      );
      await this.transformed([transform]);
      const results = result.data;
      return transform.operations.length === 1 ? results[0] : results;
    }
  }

  /////////////////////////////////////////////////////////////////////////////
  // Queryable interface implementation
  /////////////////////////////////////////////////////////////////////////////

  async _query(query: Query): Promise<any> {
    return this._cache.query(query);
  }
}
