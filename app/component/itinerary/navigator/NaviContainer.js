import distance from '@digitransit-search-util/digitransit-search-util-distance';
import PropTypes from 'prop-types';
import React, { useEffect, useState } from 'react';
import { legTime } from '../../../util/legUtils';
import { checkPositioningPermission } from '../../../action/PositionActions';
import { legShape, relayShape } from '../../../util/shapes';
import NaviBottom from './NaviBottom';
import NaviCardContainer from './NaviCardContainer';
import { useRealtimeLegs } from './hooks/useRealtimeLegs';
import NavigatorOutroModal from './navigatoroutro/NavigatorOutroModal';

const DESTINATION_RADIUS = 20; // meters
const ADDITIONAL_ARRIVAL_TIME = 60000; // 60 seconds in ms

function NaviContainer(
  {
    legs,
    focusToLeg,
    relayEnvironment,
    setNavigation,
    isNavigatorIntroDismissed,
    mapRef,
    mapLayerRef,
  },
  { getStore },
) {
  const [isPositioningAllowed, setPositioningAllowed] = useState(false);

  const position = getStore('PositionStore').getLocationState();

  const {
    realTimeLegs,
    time,
    origin,
    firstLeg,
    lastLeg,
    previousLeg,
    currentLeg,
    nextLeg,
  } = useRealtimeLegs(relayEnvironment, legs);

  useEffect(() => {
    if (position.hasLocation) {
      mapRef?.enableMapTracking();
      setPositioningAllowed(true);
    } else {
      checkPositioningPermission().then(permission => {
        if (permission.state === 'granted') {
          mapRef?.enableMapTracking();
          setPositioningAllowed(true);
        }
      });
    }
  }, [mapRef]);

  if (!realTimeLegs?.length) {
    return null;
  }

  const arrivalTime = legTime(lastLeg.end);

  const isDestinationReached =
    position && lastLeg && distance(position, lastLeg.to) <= DESTINATION_RADIUS;

  const isPastExpectedArrival = time > arrivalTime + ADDITIONAL_ARRIVAL_TIME;

  const isJourneyCompleted = isDestinationReached || isPastExpectedArrival;

  return (
    <>
      <NaviCardContainer
        legs={realTimeLegs}
        focusToLeg={
          mapRef?.state.mapTracking || isPositioningAllowed ? null : focusToLeg
        }
        time={time}
        position={position}
        mapLayerRef={mapLayerRef}
        origin={origin}
        currentLeg={time > arrivalTime ? previousLeg : currentLeg}
        nextLeg={nextLeg}
        firstLeg={firstLeg}
        lastLeg={lastLeg}
        isJourneyCompleted={isJourneyCompleted}
      />
      {isJourneyCompleted && isNavigatorIntroDismissed && (
        <NavigatorOutroModal
          destination={lastLeg.to.name}
          onClose={() => setNavigation(false)}
        />
      )}
      <NaviBottom
        setNavigation={setNavigation}
        arrival={arrivalTime}
        time={time}
      />
    </>
  );
}

NaviContainer.propTypes = {
  legs: PropTypes.arrayOf(legShape).isRequired,
  focusToLeg: PropTypes.func.isRequired,
  relayEnvironment: relayShape.isRequired,
  setNavigation: PropTypes.func.isRequired,
  isNavigatorIntroDismissed: PropTypes.bool,
  // eslint-disable-next-line
  mapRef: PropTypes.object,
  mapLayerRef: PropTypes.func.isRequired,
};

NaviContainer.contextTypes = {
  getStore: PropTypes.func.isRequired,
};

NaviContainer.defaultProps = {
  mapRef: undefined,
  isNavigatorIntroDismissed: false,
};

export default NaviContainer;
