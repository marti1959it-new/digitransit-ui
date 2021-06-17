import PropTypes from 'prop-types';
import React from 'react';
import { createRefetchContainer, graphql } from 'react-relay';
import { matchShape } from 'found';
import connectToStores from 'fluxible-addons-react/connectToStores';
import groupBy from 'lodash/groupBy';
import values from 'lodash/values';
import cx from 'classnames';

import RouteStop from './RouteStop';
import withBreakpoint from '../util/withBreakpoint';

class RouteStopListContainer extends React.PureComponent {
  static propTypes = {
    pattern: PropTypes.object.isRequired,
    className: PropTypes.string,
    vehicles: PropTypes.object,
    currentTime: PropTypes.object.isRequired,
    relay: PropTypes.shape({
      refetch: PropTypes.func.isRequired,
    }).isRequired,
    breakpoint: PropTypes.string.isRequired,
  };

  static contextTypes = {
    config: PropTypes.object.isRequired,
    match: matchShape.isRequired,
  };

  getStops() {
    const { stops } = this.props.pattern;

    const mode = this.props.pattern.route.mode.toLowerCase();
    const vehicles = groupBy(
      values(this.props.vehicles).filter(
        vehicle =>
          this.props.currentTime - vehicle.timestamp * 1000 < 5 * 60 * 1000,
      ),
      vehicle => vehicle.next_stop,
    );
    const rowClassName = `bp-${this.props.breakpoint}`;

    return stops.map((stop, i) => {
      const idx = i; // DT-3159: using in key of RouteStop component
      const nextStop = stops[i + 1];

      return (
        <li key={`${stop.gtfsId}-${this.props.pattern}-${idx}`}>
          <RouteStop
            color={
              this.props.pattern.route && this.props.pattern.route.color
                ? `#${this.props.pattern.route.color}`
                : null
            }
            stop={stop}
            nextStop={nextStop}
            mode={mode}
            vehicle={vehicles[stop.gtfsId] ? vehicles[stop.gtfsId][0] : null}
            currentTime={this.props.currentTime.unix()}
            last={i === stops.length - 1}
            first={i === 0}
            className={rowClassName}
            displayNextDeparture={this.context.config.displayNextDeparture}
            shortName={
              this.props.pattern.route && this.props.pattern.route.shortName
            }
          />
        </li>
      );
    });
  }

  // eslint-disable-next-line camelcase
  UNSAFE_componentWillReceiveProps({ relay, currentTime }) {
    const currUnix = this.props.currentTime.unix();
    const nextUnix = currentTime.unix();
    if (currUnix !== nextUnix) {
      relay.refetch(
        {
          currentTime: nextUnix,
          patternId: this.context.match.params.patternId,
        },
        null,
      );
    }
  }

  render() {
    return (
      <ul className={cx('route-stop-list', this.props.className)}>
        {this.getStops()}
      </ul>
    );
  }
}

const containerComponent = createRefetchContainer(
  connectToStores(
    withBreakpoint(RouteStopListContainer),
    ['RealTimeInformationStore', 'PositionStore', 'TimeStore'],
    ({ getStore }) => ({
      vehicles: getStore('RealTimeInformationStore').vehicles,
      currentTime: getStore('TimeStore').getCurrentTime(),
    }),
  ),
  {
    pattern: graphql`
      fragment RouteStopListContainer_pattern on Pattern
      @argumentDefinitions(
        currentTime: { type: "Long!", defaultValue: 0 }
        patternId: { type: "String!", defaultValue: "0" }
      ) {
        directionId
        route {
          mode
          color
          shortName
        }
        stops {
          alerts {
            alertSeverityLevel
            effectiveEndDate
            effectiveStartDate
          }
          stopTimesForPattern(id: $patternId, startTime: $currentTime) {
            realtime
            realtimeState
            realtimeArrival
            realtimeDeparture
            serviceDay
            scheduledDeparture
            pickupType
            stop {
              platformCode
            }
          }
          gtfsId
          lat
          lon
          name
          desc
          code
          platformCode
          zoneId
        }
      }
    `,
  },
  graphql`
    query RouteStopListContainerQuery(
      $patternId: String!
      $currentTime: Long!
    ) {
      pattern(id: $patternId) {
        ...RouteStopListContainer_pattern
        @arguments(currentTime: $currentTime, patternId: $patternId)
      }
    }
  `,
);

export { containerComponent as default, RouteStopListContainer as Component };
