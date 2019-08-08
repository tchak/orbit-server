import { Schema } from '@orbit/data';
import MemorySource from '@orbit/memory';

import { Server } from '../src';

QUnit.module('Orbit Server', function(hooks) {
  let schema: Schema;
  let source: MemorySource;
  let server: Server;

  hooks.beforeEach(async function() {
    schema = new Schema({
      models: {
        user: {
          attributes: {
            name: { type: 'string' }
          }
        }
      }
    });

    source = new MemorySource({
      schema
    });

    server = new Server({ source });
  });

  hooks.beforeEach(async function() {
    await server.deactivate();
  });

  QUnit.test('it exists', function(assert) {
    assert.ok(server);
    assert.ok(server instanceof Server);
  });
});
