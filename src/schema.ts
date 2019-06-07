import {
  Schema as OrbitSchema,
  ModelDefinition as OrbitModelDefinition,
  AttributeDefinition as OrbitAttributeDefinition,
  RelationshipDefinition as OrbitRelationshipDefinition
} from '@orbit/data';

export interface Schema {
  models: ModelDefinition[];
}

export interface ModelDefinition {
  type: string;
  attributes: AttributeDefinition[];
  relationships: RelationshipDefinition[];
}

export interface AttributeDefinition {
  type: string;
  property: string;
}

export interface RelationshipDefinition {
  kind: 'hasMany' | 'hasOne';
  type: string;
  property: string;
  inverse?: string;
  dependent?: 'remove';
}

export interface HasManyRelationshipDefinition extends RelationshipDefinition {
  kind: 'hasMany';
}

export interface HasOneRelationshipDefinition extends RelationshipDefinition {
  kind: 'hasOne';
}

export function toOrbitSchema(schema: Schema): OrbitSchema {
  const models: Record<string, OrbitModelDefinition> = {};

  for (let model of schema.models) {
    models[model.type] = {
      attributes: {},
      relationships: {}
    };

    model.attributes.forEach(attribute => {
      (models[model.type].attributes as Record<
        string,
        OrbitAttributeDefinition
      >)[attribute.property] = { type: attribute.type };
    });
    model.relationships.forEach(relationship => {
      (models[model.type].relationships as Record<
        string,
        OrbitRelationshipDefinition
      >)[relationship.property] = {
        type: relationship.kind,
        model: relationship.type,
        inverse: relationship.inverse,
        dependent: relationship.dependent
      };
    });
  }

  return new OrbitSchema({ models });
}
