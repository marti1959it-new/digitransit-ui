import PropTypes from 'prop-types';
import React from 'react';

import TileLayerContainer from './TileLayerContainer';
import CityBikes from './CityBikes';
import Stops from './Stops';
import ParkAndRide from './ParkAndRide';
import TicketSales from './TicketSales';

export default function VectorTileLayerContainer(props, { config }) {
  const layers = [];

  if (props.showStops) {
    layers.push(Stops);
    if (config.cityBike && config.cityBike.showCityBikes) {
      layers.push(CityBikes);
    }

    if (config.parkAndRide && config.parkAndRide.showParkAndRide) {
      layers.push(ParkAndRide);
    }
    if (config.ticketSales && config.ticketSales.showTicketSales) {
      layers.push(TicketSales);
    }
  }

  return (
    <TileLayerContainer
      key="tileLayer"
      layers={layers}
      stopsNearYouMode={props.stopsNearYouMode}
      hilightedStops={props.hilightedStops}
      tileSize={config.map.tileSize || 256}
      zoomOffset={config.map.zoomOffset || 0}
      disableMapTracking={props.disableMapTracking}
      disableLocationPopup={props.disableLocationPopup}
    />
  );
}

VectorTileLayerContainer.propTypes = {
  hilightedStops: PropTypes.arrayOf(PropTypes.string.isRequired),
  disableMapTracking: PropTypes.func,
  showStops: PropTypes.bool,
  stopsNearYouMode: PropTypes.string,
  disableLocationPopup: PropTypes.bool,
};

VectorTileLayerContainer.contextTypes = {
  config: PropTypes.object.isRequired,
};
