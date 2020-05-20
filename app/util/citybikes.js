import isEmpty from 'lodash/isEmpty';
import isString from 'lodash/isString';
import without from 'lodash/without';
import { toggleCitybikesAndNetworks } from './modeUtils';
import {
  getCustomizedSettings,
  setCustomizedSettings,
} from '../store/localStorage';

export const BIKESTATION_ON = 'Station on';
export const BIKESTATION_OFF = 'Station off';
export const BIKESTATION_CLOSED = 'Station closed';

/**
 * CityBikeNetworkType depicts different types of citybike networks.
 */
export const CityBikeNetworkType = {
  /** The network uses bikes. */
  CityBike: 'citybike',
  /** The network uses scooters. */
  Scooter: 'scooter',
};

export const defaultNetworkConfig = {
  icon: 'citybike',
  name: {},
  type: CityBikeNetworkType.CityBike,
};

export const getCityBikeNetworkName = (
  networkConfig = defaultNetworkConfig,
  language = 'en',
) => (networkConfig.name && networkConfig.name[language]) || undefined;

export const getCityBikeNetworkIcon = (networkConfig = defaultNetworkConfig) =>
  `icon-icon_${networkConfig.icon || 'citybike'}`;

export const getCityBikeNetworkId = networks => {
  if (isString(networks) && networks.length > 0) {
    return networks;
  }
  if (!Array.isArray(networks) || networks.length === 0) {
    return undefined;
  }
  return networks[0];
};

export const getCityBikeNetworkConfig = (networkId, config) => {
  if (!networkId || !networkId.toLowerCase) {
    return defaultNetworkConfig;
  }
  const id = networkId.toLowerCase();
  if (
    config &&
    config.cityBike &&
    config.cityBike.networks &&
    config.cityBike.networks[id] &&
    Object.keys(config.cityBike.networks[id]).length > 0
  ) {
    return config.cityBike.networks[id];
  }
  return defaultNetworkConfig;
};

export const getDefaultNetworks = config => {
  const mappedNetworks = [];
  Object.keys(config.cityBike.networks).forEach(key =>
    mappedNetworks.push(key.toUpperCase()),
  );
  return mappedNetworks;
};

export const mapDefaultNetworkProperties = config => {
  const mappedNetworks = [];
  Object.keys(config.cityBike.networks).forEach(key =>
    mappedNetworks.push({ networkName: key, ...config.cityBike.networks[key] }),
  );
  return mappedNetworks;
};

/**
 * Retrieves all chosen citybike networks from the
 * localstorage or default configuration.
 *
 * @param {*} config The configuration for the software installation
 */

export const getCitybikeNetworks = config => {
  const { allowedBikeRentalNetworks } = getCustomizedSettings();
  if (
    Array.isArray(allowedBikeRentalNetworks) &&
    !isEmpty(allowedBikeRentalNetworks)
  ) {
    return allowedBikeRentalNetworks;
  }
  return getDefaultNetworks(config);
};

/** *
 * Updates the list of allowed citybike networks either by removing or adding
 *
 * @param currentSettings the current settings
 * @param newValue the network to be added/removed
 * @param config The configuration for the software installation
 * @param isUsingCitybike if citybike is enabled
 */

export const updateCitybikeNetworks = (
  currentSettings,
  newValue,
  config,
  isUsingCitybike,
) => {
  const mappedcurrentSettings = currentSettings.map(o => o.toUpperCase());

  let chosenNetworks;

  if (isUsingCitybike) {
    chosenNetworks = mappedcurrentSettings.find(o => o === newValue)
      ? without(mappedcurrentSettings, newValue)
      : mappedcurrentSettings.concat([newValue]);
  } else {
    chosenNetworks = [newValue];
  }

  if (chosenNetworks.length === 0 || !isUsingCitybike) {
    if (chosenNetworks.length === 0) {
      toggleCitybikesAndNetworks(
        'citybike',
        config,
        getDefaultNetworks(config).join(),
      );
      return getDefaultNetworks(config);
    }
    toggleCitybikesAndNetworks('citybike', config, chosenNetworks.join(','));
    return chosenNetworks;
  }

  setCustomizedSettings({
    allowedBikeRentalNetworks: chosenNetworks,
  });
  return chosenNetworks;
};

// Returns network specific url if it exists. Defaults to cityBike.useUrl
export const getCityBikeUrl = (networks, lang, config) => {
  const id = getCityBikeNetworkId(networks).toLowerCase();

  if (
    config &&
    config.cityBike &&
    config.cityBike.networks &&
    config.cityBike.networks[id] &&
    config.cityBike.networks[id].url &&
    config.cityBike.networks[id].url[lang]
  ) {
    return config.cityBike.networks[id].url[lang];
  }
  if (
    config.cityBike &&
    config.cityBike.useUrl &&
    config.cityBike.useUrl[lang]
  ) {
    return config.cityBike.useUrl[lang];
  }
  return undefined;
};

// Returns network specific type if it exists. Defaults to citybike
export const getCityBikeType = (networks, config) => {
  const id = getCityBikeNetworkId(networks).toLowerCase();

  if (
    config &&
    config.cityBike &&
    config.cityBike.networks &&
    config.cityBike.networks[id] &&
    config.cityBike.networks[id].type
  ) {
    return config.cityBike.networks[id].type;
  }
  return defaultNetworkConfig.type;
};
