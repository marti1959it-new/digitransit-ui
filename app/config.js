import fs from 'fs';
import path from 'path';
import cloneDeep from 'lodash/cloneDeep';

import defaultConfig from './configurations/config.default';
import configMerger from './util/configMerger';
import { boundWithMinimumAreaSimple } from './util/geo-utils';

const configs = {}; // cache merged configs for speed
const themeMap = {};
// Look up paths for various asset files
const appRoot = `${process.cwd()}/`;
// eslint-disable-next-line global-require
const metaDataTemplate = require('./ssrmeta.json');

if (defaultConfig.themeMap) {
  Object.keys(defaultConfig.themeMap).forEach(theme => {
    themeMap[theme] = new RegExp(defaultConfig.themeMap[theme], 'i'); // str to regex
  });
}

let allZones;
export function setAssembledZones(zoneLayer) {
  allZones = zoneLayer;
}

function addMetaData(config) {
  const dirName = `icons-${config.CONFIG}-`;
  let manifestName = '';
  const manifestDir = path.join(appRoot, '_static', 'assets');
  let hasManifest = false;

  try {
    if (fs.existsSync(manifestDir)) {
      hasManifest = true;
    }
  } catch (e) {
    return;
  }
  if (!hasManifest) {
    return;
  }
  const files = fs.readdirSync(manifestDir);
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.startsWith(dirName)) {
      manifestName = file;
      // eslint-disable-next-line no-param-reassign
      config.iconPath = path.join('assets', file, '/');
      break;
    }
  }

  // read metadata template and modify it to match image assets generated by favicons-webpack-plugin
  // eslint-disable-next-line no-param-reassign
  config.metaData = cloneDeep(metaDataTemplate);
  config.metaData.link.forEach(link => {
    // eslint-disable-next-line no-param-reassign
    link.href = link.href.replace('<themehash>', manifestName);
  });
  config.metaData.meta.forEach(meta => {
    switch (meta.name) {
      case 'apple-mobile-web-app-title':
      case 'application-name':
        // eslint-disable-next-line no-param-reassign
        meta.content = config.title;
        break;
      case 'theme-color':
        // eslint-disable-next-line no-param-reassign
        meta.content = config.colors.topBarColor || config.colors.primary;
        break;
      default:
        break;
    }
  });
  if (process.env.NOINDEX) {
    config.metaData.meta.push({
      name: 'robots',
      content: 'noindex,nofollow',
    });
  }
}

export function getNamedConfiguration(configName) {
  if (!configs[configName]) {
    let additionalConfig;

    if (configName !== 'default') {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      additionalConfig = require(
        `./configurations/config.${configName}`,
      ).default;
    }

    // use cached baseConfig that is potentially patched in server start up
    // for merge if one is configured
    const baseConfig = configs[process.env.BASE_CONFIG];
    const config = baseConfig
      ? configMerger(baseConfig, additionalConfig)
      : configMerger(defaultConfig, additionalConfig);

    if (config.useSearchPolygon && config.areaPolygon) {
      // pass poly as 'lon lat, lon lat, lon lat ...' sequence
      const pointsParam = config.areaPolygon
        .map(p => `${p[0]} ${p[1]}`)
        .join(',');

      config.searchParams = config.searchParams || {};
      config.searchParams['boundary.polygon'] = pointsParam;
    }

    Object.keys(config.modePolygons).forEach(mode => {
      const boundingBoxes = [];
      config.modePolygons[mode].forEach(polygon => {
        boundingBoxes.push(boundWithMinimumAreaSimple(polygon));
      });
      config.modeBoundingBoxes = config.modeBoundingBoxes || {};
      config.modeBoundingBoxes[mode] = boundingBoxes;
    });
    Object.keys(config.realTimePatch).forEach(realTimeKey => {
      config.realTime[realTimeKey] = {
        ...(config.realTime[realTimeKey] || {}),
        ...config.realTimePatch[realTimeKey],
      };
    });

    addMetaData(config); // add dynamic metadata content

    const appPathPrefix = config.URL.ASSET_URL || '';
    if (config.geoJson && Array.isArray(config.geoJson.layers)) {
      for (let i = 0; i < config.geoJson.layers.length; i++) {
        const layer = config.geoJson.layers[i];
        if (layer.url.indexOf('http') !== 0) {
          layer.url = appPathPrefix + layer.url;
        }
      }
    }
    configs[configName] = config;
  }
  // inject zone geoJson if necessary
  const conf = configs[configName];
  if (conf.useAssembledGeoJsonZones && allZones) {
    const zoneLayer = {
      ...allZones,
      isOffByDefault: conf.useAssembledGeoJsonZones === 'isOffByDefault',
    };
    if (!conf.geoJson) {
      conf.geoJson = { layers: [zoneLayer] };
    } else {
      conf.geoJson.layers.push(zoneLayer);
    }
  }

  if (!process.env.OIDC_CLIENT_ID && conf.allowLogin) {
    return {
      ...conf,
      allowLogin: false,
    };
  }
  return conf;
}

export function getConfiguration(req) {
  let configName = process.env.CONFIG || process.env.BASE_CONFIG || 'default';
  let host;

  if (req) {
    host =
      (req.headers['x-forwarded-host'] &&
        req.headers['x-forwarded-host'].split(':')[0]) ||
      (req.headers.host && req.headers.host.split(':')[0]) ||
      'localhost';
  }

  if (
    host &&
    // process.env.NODE_ENV !== 'development' &&
    (process.env.CONFIG === '' || !process.env.CONFIG)
  ) {
    // no forced CONFIG, map dynamically
    Object.keys(themeMap).forEach(theme => {
      if (themeMap[theme].test(host)) {
        configName = theme;
      }
    });
  }

  return getNamedConfiguration(configName);
}
