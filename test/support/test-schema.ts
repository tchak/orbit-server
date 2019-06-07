import { Schema } from '../../src';

const schema: Schema = {
  models: [
    {
      type: 'planet',
      attributes: [
        {
          property: 'name',
          type: 'string'
        },
        {
          property: 'description',
          type: 'string'
        },
        {
          property: 'createdAt',
          type: 'datetime'
        }
      ],
      relationships: [
        {
          property: 'moons',
          kind: 'hasMany',
          type: 'moon',
          inverse: 'planet',
          dependent: 'remove'
        }
      ]
    },
    {
      type: 'moon',
      attributes: [
        {
          property: 'name',
          type: 'string'
        }
      ],
      relationships: [
        {
          property: 'planet',
          kind: 'hasOne',
          type: 'planet',
          inverse: 'moons'
        }
      ]
    }
  ]
};

export default schema;
