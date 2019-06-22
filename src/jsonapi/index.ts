import { Schema } from '@orbit/data';
import { dasherize } from '@orbit/utils';

import {
  Handler,
  Context,
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

export { Context };

export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  config: { type: string; relationship?: string };
  handler: Handler;
}

export function buildJSONAPI(
  schema: Schema
): Record<string, RouteDefinition[]> {
  const routes: Record<string, RouteDefinition[]> = {};

  for (let type in schema.models) {
    routes[dasherize(schema.pluralize(type))] = buildJSONAPIResource(
      type,
      schema
    );
  }

  routes['operations'] = [
    {
      method: 'PATCH',
      url: '/',
      config: { type: 'operations' },
      handler: handleOperations
    }
  ];

  return routes;
}

function buildJSONAPIResource(type: string, schema: Schema): RouteDefinition[] {
  const routes: RouteDefinition[] = [
    {
      method: 'GET',
      url: '/',
      config: { type },
      handler: handleFindRecords
    },
    {
      method: 'POST',
      url: '/',
      config: { type },
      handler: handleAddRecord
    },
    {
      method: 'GET',
      url: `/:id`,
      config: { type },
      handler: handleFindRecord
    },
    {
      method: 'PATCH',
      url: `/:id`,
      config: { type },
      handler: handleUpdateRecord
    },
    {
      method: 'DELETE',
      url: `/:id`,
      config: { type },
      handler: handleRemoveRecord
    }
  ];

  schema.eachRelationship(type, (property, { type: kind }) => {
    const url = `/:id/relationships/${dasherize(property)}`;

    if (kind === 'hasMany') {
      routes.push({
        method: 'GET',
        url: `/:id/${property}`,
        config: { type, relationship: property },
        handler: handleFindRelatedRecords
      });
      routes.push({
        method: 'POST',
        url,
        config: { type, relationship: property },
        handler: handleAddToRelatedRecords
      });
      routes.push({
        method: 'DELETE',
        url,
        config: { type, relationship: property },
        handler: handleRemoveFromRelatedRecords
      });
      routes.push({
        method: 'PATCH',
        url,
        config: { type, relationship: property },
        handler: handleReplaceRelatedRecords
      });
    } else {
      routes.push({
        method: 'GET',
        url: `/:id/${property}`,
        config: { type, relationship: property },
        handler: handleFindRelatedRecord
      });
      routes.push({
        method: 'PATCH',
        url,
        config: { type, relationship: property },
        handler: handleReplaceRelatedRecord
      });
    }
  });

  return routes;
}
