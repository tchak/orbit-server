import { Schema } from '@orbit/data';

export default new Schema({
  models: {
    planet: {
      attributes: {
        name: {
          type: 'string'
        },
        description: {
          type: 'string'
        },
        createdAt: {
          type: 'datetime'
        }
      },
      relationships: {
        moons: {
          type: 'hasMany',
          model: 'moon',
          inverse: 'planet',
          dependent: 'remove'
        }
      }
    },
    moon: {
      attributes: {
        name: {
          type: 'string'
        }
      },
      relationships: {
        planet: {
          type: 'hasOne',
          model: 'planet',
          inverse: 'moons'
        }
      }
    }
  }
});
