import isEmpty from 'lodash/isEmpty';
import isString from 'lodash/isString';
import trim from 'lodash/trim';

// Convert between location objects (address, lat, lon)
// and string format OpenTripPlanner uses in many places

export const parseLatLon = coords => {
  const latlon = coords.split(',');
  if (latlon.length === 2) {
    const lat = parseFloat(latlon[0]);
    const lon = parseFloat(latlon[1]);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
      return {
        lat,
        lon,
      };
    }
  }
  return undefined;
};

export const otpToLocation = otpString => {
  const [address, coords, slack] = otpString.split('::');
  const location = {
    address,
  };
  if (slack) {
    const parsedSlack = parseInt(slack, 10);
    if (!Number.isNaN(parsedSlack)) {
      location.locationSlack = parsedSlack;
    }
  }
  if (coords) {
    return {
      ...location,
      ...parseLatLon(coords),
    };
  }
  return location;
};

export const addressToItinerarySearch = location => {
  if (location.gps && !location.lat) {
    return 'POS';
  }
  if (location.set === false) {
    return '-';
  }
  return `${encodeURIComponent(location.address)}::${location.lat},${
    location.lon
  }`;
};

export const locationToOTP = location => {
  if (location.gps) {
    return 'POS';
  }
  if (location.set === false) {
    return '-';
  }
  if (location.type === 'SelectFromMap') {
    return `${location.type}`;
  }
  return `${location.address}::${location.lat},${location.lon}`;
};

export const locationToCoords = location => [location.lat, location.lon];

export const encodeAddressAndCoordinatesArray = (address, coordinates) => {
  if (address && coordinates && Array.isArray(coordinates)) {
    return encodeURIComponent(
      `${address}::${coordinates[0]},${coordinates[1]}`,
    );
  }
  return undefined;
};

/**
 * Extracts the location information from the intermediatePlaces
 * query parameter, if available. The locations will be returned in
 * non-OTP mode (i.e. mapped to lat?, lon? and address).
 *
 * @typedef Query
 * @prop {String|String[]} intermediatePlaces
 *
 * @param {Query} query The query to extract the information from.
 * @returns an array of locations if available, or an empty array otherwise
 */
export const getIntermediatePlaces = query => {
  if (!query) {
    return [];
  }
  const { intermediatePlaces } = query;
  if (!intermediatePlaces) {
    return [];
  }
  if (Array.isArray(intermediatePlaces)) {
    return intermediatePlaces.map(otpToLocation);
  }
  if (isString(intermediatePlaces)) {
    if (isEmpty(trim(intermediatePlaces))) {
      return [];
    }
    return [otpToLocation(intermediatePlaces)];
  }
  return [];
};
