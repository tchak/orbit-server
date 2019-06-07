import { pluralize } from 'inflected';
import { JSONAPISerializer } from '@orbit/jsonapi';
import { PubSubEngine } from 'graphql-subscriptions';

import { Source, Schema, ModelDefinition } from '../index';
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
  handleWebSocket
} from './handlers';

interface RouteDefinition {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  config: Config;
  handler: Handler;
}

interface WebsocketRouteDefinition extends RouteDefinition {
  wsHandler?: (connection: any, req: Request) => void;
}

interface RouteConfig {
  source: Source;
  serializer: JSONAPISerializer;
  pubsub?: PubSubEngine;
}

export function buildJSONAPI(
  schema: Schema,
  config: RouteConfig
): [string, RouteDefinition[]][] {
  const routes: [string, RouteDefinition[]][] = [];

  for (let model of schema.models) {
    routes.push([
      `/${pluralize(model.type)}`,
      buildJSONAPIResource(model, config)
    ]);
  }

  routes.push(['/operations', [buildJSONAPIOperations(config)]]);

  return routes;
}

function buildJSONAPIResource(
  model: ModelDefinition,
  config: RouteConfig
): RouteDefinition[] {
  const { type, relationships } = model;

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

  for (let relationship of relationships) {
    if (relationship.kind === 'hasMany') {
      routes.push({
        method: 'GET',
        url: `/:id/${relationship.property}`,
        config: { ...config, type, relationship: relationship.property },
        handler: handleFindRelatedRecords
      });
      routes.push({
        method: 'PATCH',
        url: `/:id/relationships/${relationship.property}`,
        config: { ...config, type, relationship: relationship.property },
        handler: handleAddToRelatedRecords
      });
      routes.push({
        method: 'DELETE',
        url: `/:id/relationships/${relationship.property}`,
        config: { ...config, type, relationship: relationship.property },
        handler: handleRemoveFromRelatedRecords
      });
    } else {
      routes.push({
        method: 'GET',
        url: `/:id/${relationship.property}`,
        config: { ...config, type, relationship: relationship.property },
        handler: handleFindRelatedRecord
      });
    }
  }

  return routes;
}

function buildJSONAPIOperations(config: RouteConfig): WebsocketRouteDefinition {
  const route: WebsocketRouteDefinition = {
    method: 'GET',
    url: '/operations',
    config: { ...config, type: 'operations' },
    handler: handleOperations
  };

  if (config.pubsub) {
    route.wsHandler = handleWebSocket(config.pubsub, config.serializer);
  }

  return route;
}
