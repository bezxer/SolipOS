'use strict';
const path = require('path');
const fs = require('fs');
const Docker = require('dockerode');

const ROOT = path.join(__dirname, '..');
const env = process.env;

const config = {
  ROOT,
  PORT: +env.PORT || 7745,
  FILES_ROOT: path.resolve(env.FILES_ROOT || '/'),
  USE_NSENTER: env.USE_NSENTER === '1',
  ENV_USER: (env.ADMIN_USER || 'admin').trim(),
  ENV_PASS: env.PASSWORD || '',
  APPS_DIR: path.resolve(env.APPS_DIR || path.join(ROOT, 'apps')),
  DATA_DIR: path.resolve(env.DATA_DIR || path.join(ROOT, 'data')),
  APP_LABEL: 'solipos.app',
  LEGACY_LABEL: 'minicasa.app',
  COOKIE: 'sp_session',
};
config.ASSET_DIR = path.join(config.DATA_DIR, 'assets');

for (const d of [config.APPS_DIR, config.ASSET_DIR]) fs.mkdirSync(d, { recursive: true });

config.docker = new Docker({ socketPath: env.DOCKER_SOCKET || '/var/run/docker.sock' });

module.exports = config;
