import path from 'path';
import { loadSettings, ServerSettings } from '../src';

QUnit.module('loadSettings', function() {
  QUnit.test('loads config from development env', function(assert) {
    const settings = loadSettings(
      { schema: true },
      path.join(__dirname, 'dummy')
    ) as Partial<ServerSettings>;

    assert.deepEqual(settings, {
      jsonapi: true,
      graphql: true,
      schema: true
    });
  });

  QUnit.test('loads config from test env', function(assert) {
    const nodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'test';
    const settings = loadSettings(
      { schema: true },
      path.join(__dirname, 'dummy')
    ) as Partial<ServerSettings>;
    process.env['NODE_ENV'] = nodeEnv;

    assert.deepEqual(settings, {
      jsonapi: false,
      graphql: true,
      schema: true
    });
  });

  QUnit.test('loads config from production (ts) env', function(assert) {
    const nodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    const settings = loadSettings(
      { schema: true },
      path.join(__dirname, 'dummy')
    ) as Partial<ServerSettings>;
    process.env['NODE_ENV'] = nodeEnv;

    assert.deepEqual(settings, {
      jsonapi: true,
      graphql: true,
      schema: true
    });
  });
});
