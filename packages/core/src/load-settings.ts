import { deepMerge } from '@orbit/utils';
import path from 'path';
import fs from 'fs';
import { ServerSettings } from '.';

export function loadSettings(
  settings: Partial<ServerSettings>,
  root: string
): ServerSettings {
  const environment: string = process.env['NODE_ENV'] || 'development';
  const configPath = path.join(root, 'config', 'environment');
  const environmentConfigPath = path.join(
    root,
    'config',
    'environments',
    environment
  );

  let config = {};
  config = loadConfigurationFromPath(config, configPath);
  config = loadConfigurationFromPath(config, environmentConfigPath);

  if (settings) {
    return deepMerge(config, settings) as ServerSettings;
  }
  return config as ServerSettings;
}

function loadConfigurationFromPath(
  settings: Partial<ServerSettings>,
  path: string
) {
  if (fs.existsSync(`${path}.ts`)) {
    return deepMerge(settings, requireIfOK(`${path}.ts`));
  } else if (fs.existsSync(`${path}.js`)) {
    return deepMerge(settings, requireIfOK(`${path}.js`));
  }
  return settings;
}

function requireIfOK(path: string) {
  try {
    const settings = require(path);
    if (settings && settings.__esModule) {
      return settings.default;
    }
    return settings || {};
  } catch {
    throw new Error(`Could not load configuration from file: ${path}`);
  }
}
