import { JSONAPISerializer } from '@orbit/jsonapi';
import { PubSubEngine } from 'graphql-subscriptions';

import Source from '../source';
import {
  Handler,
  Config,
  handleAddRecord,
  handleUpdateRecord,
  handleRemoveRecord,
  handleFindRecord,
  handleFindRecords,
  handleFindRelatedRecords,
  handleFindRelatedRecord,
  handleAddToRelatedRecords,
  handleRemoveFromRelatedRecords,
  handleOperations,
  handleReplaceRelatedRecords,
  handleReplaceRelatedRecord
} from './handlers';

interface RouteDefinition {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  config: Config;
  handler: Handler;
}

interface RouteConfig {
  source: Source;
  serializer: JSONAPISerializer;
  pubsub?: PubSubEngine;
}

export function buildJSONAPI(
  config: RouteConfig
): Record<string, RouteDefinition[]> {
  const routes: Record<string, RouteDefinition[]> = {};

  for (let type in config.source.schema.models) {
    routes[config.source.schema.pluralize(type)] = buildJSONAPIResource(
      type,
      config
    );
  }

  routes['operations'] = [
    {
      method: 'PATCH',
      url: '/',
      config: { ...config, type: 'operations' },
      handler: handleOperations
    }
  ];

  return routes;
}

function buildJSONAPIResource(
  type: string,
  config: RouteConfig
): RouteDefinition[] {
  const routes: RouteDefinition[] = [
    {
      method: 'GET',
      url: '/',
      config: { ...config, type },
      handler: handleFindRecords
    },
    {
      method: 'POST',
      url: '/',
      config: { ...config, type },
      handler: handleAddRecord
    },
    {
      method: 'GET',
      url: `/:id`,
      config: { ...config, type },
      handler: handleFindRecord
    },
    {
      method: 'PATCH',
      url: `/:id`,
      config: { ...config, type },
      handler: handleUpdateRecord
    },
    {
      method: 'DELETE',
      url: `/:id`,
      config: { ...config, type },
      handler: handleRemoveRecord
    }
  ];

  config.source.schema.eachRelationship(type, (property, { type: kind }) => {
    const url = `/:id/relationships/${property}`;

    if (kind === 'hasMany') {
      routes.push({
        method: 'GET',
        url: `/:id/${property}`,
        config: { ...config, type, relationship: property },
        handler: handleFindRelatedRecords
      });
      routes.push({
        method: 'POST',
        url,
        config: { ...config, type, relationship: property },
        handler: handleAddToRelatedRecords
      });
      routes.push({
        method: 'DELETE',
        url,
        config: { ...config, type, relationship: property },
        handler: handleRemoveFromRelatedRecords
      });
      routes.push({
        method: 'PATCH',
        url,
        config: { ...config, type, relationship: property },
        handler: handleReplaceRelatedRecords
      });
    } else {
      routes.push({
        method: 'GET',
        url: `/:id/${property}`,
        config: { ...config, type, relationship: property },
        handler: handleFindRelatedRecord
      });
      routes.push({
        method: 'PATCH',
        url,
        config: { ...config, type, relationship: property },
        handler: handleReplaceRelatedRecord
      });
    }
  });

  return routes;
}
