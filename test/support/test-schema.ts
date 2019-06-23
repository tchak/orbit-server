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
    },
    typedModel: {
      attributes: {
        someText: { type: 'string' },
        someNumber: { type: 'number' },
        someDate: { type: 'date' },
        someDateTime: { type: 'datetime' },
        someBoolean: { type: 'boolean' }
      }
    },
    article: {
      relationships: {
        tags: {
          type: 'hasMany',
          model: 'tag',
          inverse: 'articles'
        }
      }
    },
    tag: {
      attributes: {
        name: { type: 'string' }
      },
      relationships: {
        articles: {
          type: 'hasMany',
          model: 'article',
          inverse: 'tags'
        }
      }
    }
  }
});
