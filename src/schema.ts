import {
  Schema,
  AttributeDefinition,
  RelationshipDefinition
} from '@orbit/data';

export function eachAttribute(
  schema: Schema,
  type: string,
  callback: (property: string, attribute: AttributeDefinition) => void
) {
  const attributes = schema.getModel(type).attributes || {};
  for (let property in attributes) {
    callback(property, attributes[property]);
  }
}

export function eachRelationship(
  schema: Schema,
  type: string,
  callback: (property: string, relationship: RelationshipDefinition) => void
) {
  const relationships = schema.getModel(type).relationships || {};
  for (let property in relationships) {
    callback(property, relationships[property]);
  }
}
