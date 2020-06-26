import PropTypes from 'prop-types';
/* eslint-disable react/no-array-index-key */
import React from 'react';
import { createFragmentContainer, graphql } from 'react-relay';
import findIndex from 'lodash/findIndex';
import get from 'lodash/get';
import sortBy from 'lodash/sortBy';
import polyline from 'polyline-encoded';
import { FormattedMessage } from 'react-intl';
import { matchShape, routerShape } from 'found';
import isEqual from 'lodash/isEqual';
import { connectToStores } from 'fluxible-addons-react';
import isEmpty from 'lodash/isEmpty';
import storeOrigin from '../action/originActions';
import DesktopView from './DesktopView';
import MobileView from './MobileView';
import MapContainer from './map/MapContainer';
import SummaryPlanContainer from './SummaryPlanContainer';
import SummaryNavigation from './SummaryNavigation';
import ItineraryLine from './map/ItineraryLine';
import LocationMarker from './map/LocationMarker';
import MobileItineraryWrapper from './MobileItineraryWrapper';
import Loading from './Loading';
import { getRoutePath } from '../util/path';
import { getIntermediatePlaces } from '../util/queryUtils';
import {
  validateServiceTimeRange,
  getStartTime,
  getStartTimeWithColon,
} from '../util/timeUtils';
import withBreakpoint from '../util/withBreakpoint';
import ComponentUsageExample from './ComponentUsageExample';
import exampleData from './data/SummaryPage.ExampleData';
import { isBrowser } from '../util/browser';
import { itineraryHasCancelation } from '../util/alertUtils';
import triggerMessage from '../util/messageUtils';
import MessageStore from '../store/MessageStore';
import { addAnalyticsEvent } from '../util/analyticsUtils';
import { otpToLocation, addressToItinerarySearch } from '../util/otpStrings';
import { startLocationWatch } from '../action/PositionActions';
import { SettingsDrawer } from './SettingsDrawer';

import {
  startRealTimeClient,
  stopRealTimeClient,
  changeRealTimeClientTopics,
} from '../action/realTimeClientAction';
import VehicleMarkerContainer from './map/VehicleMarkerContainer';
import ItineraryTab from './ItineraryTab';
import { StreetModeSelector } from './StreetModeSelector';
import { estimateItineraryDistance } from '../util/geo-utils';

export const ITINERARYFILTERING_DEFAULT = 1.5;

/**
 * Returns the actively selected itinerary's index. Attempts to look for
 * the information in the location's state and pathname, respectively.
 * Otherwise, pre-selects the first non-cancelled itinerary or, failing that,
 * defaults to the index 0.
 *
 * @param {{ pathname: string, state: * }} location the current location object.
 * @param {*} itineraries the itineraries retrieved from OTP.
 * @param {number} defaultValue the default value, defaults to 0.
 */
export const getActiveIndex = (
  { pathname, state } = {},
  itineraries = [],
  defaultValue = 0,
) => {
  if (state) {
    if (state.summaryPageSelected >= itineraries.length) {
      return defaultValue;
    }
    return state.summaryPageSelected || defaultValue;
  }

  /*
   * If state does not exist, for example when accessing the summary
   * page by an external link, we check if an itinerary selection is
   * supplied in URL and make that the active selection.
   */
  const lastURLSegment = pathname && pathname.split('/').pop();
  if (!Number.isNaN(Number(lastURLSegment))) {
    if (Number(lastURLSegment) >= itineraries.length) {
      return defaultValue;
    }
    return Number(lastURLSegment);
  }

  /**
   * Pre-select the first not-cancelled itinerary, if available.
   */
  const itineraryIndex = findIndex(
    itineraries,
    itinerary => !itineraryHasCancelation(itinerary),
  );
  if (itineraryIndex >= itineraries.length) {
    return defaultValue;
  }
  return itineraryIndex > 0 ? itineraryIndex : defaultValue;
};

/**
 * Report any errors that happen when showing summary
 *
 * @param {Error|string|any} error
 */
export function reportError(error) {
  if (!error) {
    return;
  }
  addAnalyticsEvent({
    category: 'Itinerary',
    action: 'ErrorLoading',
    name: 'SummaryPage',
    message: error.message || error,
    stack: error.stack || null,
  });
}

const getTopicOptions = (context, plan, match) => {
  const { config } = context;
  const { realTime } = config;

  const itineraries = (plan && plan.itineraries) || [];
  const activeIndex = getActiveIndex(match.location, itineraries);
  const itineraryTopics = [];

  if (itineraries.length > 0) {
    itineraries[activeIndex].legs.forEach(leg => {
      if (leg.transitLeg && leg.trip) {
        const feedId = leg.trip.gtfsId.split(':')[0];
        let topic;
        if (realTime[feedId] && realTime[feedId].useFuzzyTripMatching) {
          topic = {
            feedId,
            route: leg.route.gtfsId.split(':')[1],
            mode: leg.mode.toLowerCase(),
            direction: Number(leg.trip.directionId),
            tripStartTime: getStartTimeWithColon(
              leg.trip.stoptimesForDate[0].scheduledDeparture,
            ),
          };
        } else {
          topic = {
            feedId,
            route: leg.route.gtfsId.split(':')[1],
            tripId: leg.trip.gtfsId.split(':')[1],
          };
        }
        if (topic) {
          itineraryTopics.push(topic);
        }
      }
    });
  }
  return itineraryTopics;
};
class SummaryPage extends React.Component {
  static contextTypes = {
    config: PropTypes.object,
    executeAction: PropTypes.func.isRequired,
    headers: PropTypes.object.isRequired,
    getStore: PropTypes.func,
    router: routerShape.isRequired, // DT-3358
    match: matchShape.isRequired,
  };

  static propTypes = {
    match: matchShape.isRequired,
    plan: PropTypes.shape({
      itineraries: PropTypes.array,
    }).isRequired,
    walkPlan: PropTypes.shape({
      itineraries: PropTypes.array,
    }),
    serviceTimeRange: PropTypes.shape({
      start: PropTypes.number.isRequired,
      end: PropTypes.number.isRequired,
    }).isRequired,
    content: PropTypes.node,
    map: PropTypes.shape({
      type: PropTypes.func.isRequired,
    }),
    breakpoint: PropTypes.string.isRequired,
    error: PropTypes.object,
    loadingPosition: PropTypes.bool,
  };

  static defaultProps = {
    map: undefined,
    error: undefined,
    loadingPosition: false,
    walkPlan: undefined,
  };

  constructor(props, context) {
    super(props, context);

    context.executeAction(storeOrigin, otpToLocation(props.match.params.from));
    if (props.error) {
      reportError(props.error);
    }
    this.resultsUpdatedAlertRef = React.createRef();

    const itineraryTopics = getTopicOptions(
      this.context,
      this.props.plan,
      this.props.match,
    );
    if (itineraryTopics && itineraryTopics.length > 0) {
      this.startClient(itineraryTopics);
    }
  }

  state = {
    center: null,
    loading: false,
    streetMode:
      this.props.match.location && this.props.match.location.state
        ? this.props.match.location.state.streetMode
        : '',
  };

  setStreetMode = newStreetMode => {
    this.setState(
      { streetMode: newStreetMode },
      this.selectFirstItinerary(newStreetMode),
    );
  };

  resetStreetMode = () => {
    this.setState({ streetMode: '' });
  };

  selectFirstItinerary = newStreetMode => {
    addAnalyticsEvent({
      event: 'sendMatomoEvent',
      category: 'Itinerary',
      action: 'OpenItineraryDetails',
      name: 0,
    });
    const newState = {
      ...this.context.match.location,
      state: { summaryPageSelected: 0, streetMode: newStreetMode },
    };

    const indexPath = `${getRoutePath(
      this.context.match.params.from,
      this.context.match.params.to,
    )}/0`;

    newState.pathname = indexPath;
    this.context.router.push(newState);
  };

  configClient = itineraryTopics => {
    const { config } = this.context;
    const { realTime } = config;
    const feedIds = Array.from(
      new Set(itineraryTopics.map(topic => topic.feedId)),
    );
    let feedId;
    /* handle multiple feedid case */
    feedIds.forEach(fId => {
      if (!feedId && realTime[fId]) {
        feedId = fId;
      }
    });
    const source = feedId && realTime[feedId];
    if (source && source.active) {
      return {
        ...source,
        agency: feedId,
        options: itineraryTopics.length > 0 ? itineraryTopics : null,
      };
    }
    return null;
  };

  startClient = itineraryTopics => {
    const { storedItineraryTopics } = this.context.getStore(
      'RealTimeInformationStore',
    );
    if (
      itineraryTopics &&
      !isEmpty(itineraryTopics) &&
      !storedItineraryTopics
    ) {
      const clientConfig = this.configClient(itineraryTopics);
      this.context.executeAction(startRealTimeClient, clientConfig);
      this.context.getStore(
        'RealTimeInformationStore',
      ).storedItineraryTopics = itineraryTopics;
    }
  };

  updateClient = itineraryTopics => {
    const { client, topics } = this.context.getStore(
      'RealTimeInformationStore',
    );

    if (client) {
      const clientConfig = this.configClient(itineraryTopics);
      if (clientConfig) {
        this.context.executeAction(changeRealTimeClientTopics, {
          ...clientConfig,
          client,
          oldTopics: topics,
        });
        return;
      }
      this.stopClient();
    }

    if (!isEmpty(itineraryTopics)) {
      this.startClient(itineraryTopics);
    }
  };

  stopClient = () => {
    const { client } = this.context.getStore('RealTimeInformationStore');
    if (client) {
      this.context.executeAction(stopRealTimeClient, client);
      this.context.getStore(
        'RealTimeInformationStore',
      ).storedItineraryTopics = undefined;
      this.context.getStore(
        'RealTimeInformationStore',
      ).storedItineraryVehicleInfos = undefined;
    }
  };

  componentDidMount() {
    const host =
      this.context.headers &&
      (this.context.headers['x-forwarded-host'] || this.context.headers.host);

    if (
      get(this.context, 'config.showHSLTracking', false) &&
      host &&
      host.indexOf('127.0.0.1') === -1 &&
      host.indexOf('localhost') === -1
    ) {
      // eslint-disable-next-line no-unused-expressions
      import('../util/feedbackly');
    }
  }

  componentWillUnmount() {
    this.stopClient();
    //  alert screen reader when search results appear
    if (this.resultsUpdatedAlertRef.current) {
      this.resultsUpdatedAlertRef.current.innerHTML = this.resultsUpdatedAlertRef.current.innerHTML;
    }
  }

  componentDidUpdate(prevProps) {
    // alert screen readers when results update
    if (
      this.resultsUpdatedAlertRef.current &&
      this.props.plan.itineraries &&
      JSON.stringify(prevProps.match.location) !==
        JSON.stringify(this.props.match.location)
    ) {
      // refresh content to trigger the alert
      this.resultsUpdatedAlertRef.current.innerHTML = this.resultsUpdatedAlertRef.current.innerHTML;
    }
    if (this.props.error) {
      reportError(this.props.error);
    }
    const itineraryTopics = getTopicOptions(
      this.context,
      this.props.plan,
      this.props.match,
    );
    this.updateClient(itineraryTopics);
  }

  setLoading = loading => {
    this.setState({ loading });
  };

  setError = error => {
    reportError(error);
    this.setState({ error });
  };

  updateCenter = (lat, lon) => {
    this.setState({ center: { lat, lon } });
  };

  // eslint-disable-next-line camelcase
  UNSAFE_componentWillReceiveProps(nextProps) {
    if (!isEqual(nextProps.match.params.from, this.props.match.params.from)) {
      this.context.executeAction(storeOrigin, nextProps.match.params.from);
    }

    if (nextProps.breakpoint === 'large' && this.state.center) {
      this.setState({ center: null });
    }
  }

  renderMap() {
    const { match, plan } = this.props;
    const {
      config: { defaultEndpoint },
    } = this.context;
    const itineraries = (plan && plan.itineraries) || [];
    const activeIndex = getActiveIndex(match.location, itineraries);
    const from = otpToLocation(match.params.from);
    const to = otpToLocation(match.params.to);

    triggerMessage(
      from.lat,
      from.lon,
      this.context,
      this.context.getStore(MessageStore).getMessages(),
    );

    triggerMessage(
      to.lat,
      to.lon,
      this.context,
      this.context.getStore(MessageStore).getMessages(),
    );

    const leafletObjs = sortBy(
      itineraries.map((itinerary, i) => (
        <ItineraryLine
          key={i}
          hash={i}
          legs={itinerary.legs}
          passive={i !== activeIndex}
          showIntermediateStops={i === activeIndex}
        />
      )),
      // Make sure active line isn't rendered over
      i => i.props.passive === false,
    );

    if (from.lat && from.lon) {
      leafletObjs.push(
        <LocationMarker key="fromMarker" position={from} type="from" />,
      );
    }

    if (to.lat && to.lon) {
      leafletObjs.push(
        <LocationMarker isLarge key="toMarker" position={to} type="to" />,
      );
    }

    getIntermediatePlaces(match.location.query).forEach(
      (intermediatePlace, i) => {
        leafletObjs.push(
          <LocationMarker key={`via_${i}`} position={intermediatePlace} />,
        );
      },
    );

    // Decode all legs of all itineraries into latlong arrays,
    // and concatenate into one big latlong array
    const bounds = []
      .concat(
        [[from.lat, from.lon], [to.lat, to.lon]],
        ...itineraries.map(itinerary =>
          [].concat(
            ...itinerary.legs.map(leg =>
              polyline.decode(leg.legGeometry.points),
            ),
          ),
        ),
      )
      .filter(a => a[0] && a[1]);

    const centerPoint = {
      lat: from.lat || to.lat || defaultEndpoint.lat,
      lon: from.lon || to.lon || defaultEndpoint.lon,
    };
    const delta = 0.0269; // this is roughly equal to 3 km
    const defaultBounds = [
      [centerPoint.lat - delta, centerPoint.lon - delta],
      [centerPoint.lat + delta, centerPoint.lon + delta],
    ];

    let itineraryVehicles = {};
    const gtfsIdsOfRouteAndDirection = [];
    const gtfsIdsOfTrip = [];
    const startTimes = [];

    if (itineraries.length > 0) {
      itineraries[activeIndex].legs.forEach(leg => {
        if (leg.transitLeg && leg.trip) {
          gtfsIdsOfTrip.push(leg.trip.gtfsId);
          startTimes.push(
            getStartTime(leg.trip.stoptimesForDate[0].scheduledDeparture),
          );
          gtfsIdsOfRouteAndDirection.push(
            `${leg.route.gtfsId}_${leg.trip.directionId}`,
          );
        }
      });
    }
    if (startTimes.length > 0) {
      itineraryVehicles = {
        gtfsIdsOfTrip,
        gtfsIdsOfRouteAndDirection,
        startTimes,
      };
    }
    this.context.getStore(
      'RealTimeInformationStore',
    ).storedItineraryVehicleInfos = itineraryVehicles;

    if (!isEmpty(itineraryVehicles)) {
      leafletObjs.push(<VehicleMarkerContainer key="vehicles" useLargeIcon />);
    }

    return (
      <MapContainer
        className="summary-map"
        leafletObjs={leafletObjs}
        fitBounds
        bounds={bounds.length > 1 ? bounds : defaultBounds}
        showScaleBar
      />
    );
  }

  getOffcanvasState = () =>
    (this.props.match.location.state &&
      this.props.match.location.state.customizeSearchOffcanvas) ||
    false;

  toggleCustomizeSearchOffcanvas = () => {
    this.internalSetOffcanvas(!this.getOffcanvasState());
  };

  onRequestChange = newState => {
    this.internalSetOffcanvas(newState);
  };

  internalSetOffcanvas = newState => {
    addAnalyticsEvent({
      event: 'sendMatomoEvent',
      category: 'ItinerarySettings',
      action: 'ExtraSettingsPanelClick',
      name: newState ? 'ExtraSettingsPanelOpen' : 'ExtraSettingsPanelClose',
    });
    if (newState) {
      this.context.router.push({
        ...this.props.match.location,
        state: {
          ...this.props.match.location.state,
          customizeSearchOffcanvas: newState,
        },
      });
    } else {
      this.context.router.go(-1);
    }
  };

  render() {
    const { match, error } = this.props;
    const itineraryDistance = estimateItineraryDistance(
      match.params.from,
      match.params.to,
      match.location.query.intermediatePlaces,
    );
    const showWalkOptionButton =
      itineraryDistance < this.context.config.suggestWalkMaxDistance;

    const showStreetModeSelector = showWalkOptionButton;

    const hasItineraries =
      this.props.plan && Array.isArray(this.props.plan.itineraries);
    let itineraries;
    if (this.state.streetMode === 'walk') {
      // eslint-disable-next-line prefer-destructuring
      itineraries = this.props.walkPlan.itineraries;
    } else {
      itineraries = hasItineraries ? this.props.plan.itineraries : [];
    }
    // Remove old itineraries if new query cannot find a route
    if (error && hasItineraries) {
      itineraries = [];
    }

    if (match.routes.some(route => route.printPage) && hasItineraries) {
      return React.cloneElement(this.props.content, {
        itinerary: itineraries[match.params.hash],
        focus: this.updateCenter,
        from: otpToLocation(match.params.from),
        to: otpToLocation(match.params.to),
      });
    }

    // Call props.map directly in order to render to same map instance
    let map = this.props.map
      ? this.props.map.type(
          {
            itinerary: itineraries && itineraries[match.params.hash],
            center: this.state.center,
            ...this.props,
          },
          this.context,
        )
      : this.renderMap();

    let earliestStartTime;
    let latestArrivalTime;

    if (hasItineraries) {
      earliestStartTime = Math.min(...itineraries.map(i => i.startTime));
      latestArrivalTime = Math.max(...itineraries.map(i => i.endTime));
    }

    let intermediatePlaces = [];
    const { query } = match.location;

    if (query && query.intermediatePlaces) {
      if (Array.isArray(query.intermediatePlaces)) {
        intermediatePlaces = query.intermediatePlaces.map(otpToLocation);
      } else {
        intermediatePlaces = [otpToLocation(query.intermediatePlaces)];
      }
    }
    const screenReaderUpdateAlert = (
      <span className="sr-only" role="alert" ref={this.resultsUpdatedAlertRef}>
        <FormattedMessage
          id="itinerary-page.update-alert"
          defaultMessage="Search results updated"
        />
      </span>
    );
    // added config.itinerary.serviceTimeRange parameter (DT-3175)
    const serviceTimeRange = validateServiceTimeRange(
      this.context.config.itinerary.serviceTimeRange,
      this.props.serviceTimeRange,
    );
    if (this.props.breakpoint === 'large') {
      let content;
      if (
        this.state.loading === false &&
        this.props.loadingPosition === false &&
        (error || this.props.plan)
      ) {
        if (match.params.hash) {
          content = (
            <>
              {screenReaderUpdateAlert}
              <ItineraryTab
                key={match.params.hash.toString()}
                activeIndex={getActiveIndex(match.location, itineraries)}
                plan={this.props.plan}
                serviceTimeRange={serviceTimeRange}
                itinerary={
                  itineraries[getActiveIndex(match.location, itineraries)]
                }
                params={match.params}
                error={error || this.state.error}
                setLoading={this.setLoading}
                setError={this.setError}
                focus={this.updateCenter}
                resetStreetMode={this.resetStreetMode}
              />
            </>
          );
          return (
            <DesktopView
              title={
                <FormattedMessage
                  id="itinerary-page.title"
                  defaultMessage="Itinerary suggestions"
                />
              }
              content={content}
              map={map}
              scrollable
              bckBtnVisible={false}
            />
          );
        }
        content = (
          <>
            {screenReaderUpdateAlert}
            <SummaryPlanContainer
              activeIndex={getActiveIndex(match.location, itineraries)}
              plan={this.props.plan}
              serviceTimeRange={serviceTimeRange}
              itineraries={itineraries}
              params={match.params}
              error={error || this.state.error}
              setLoading={this.setLoading}
              setError={this.setError}
            >
              {this.props.content &&
                React.cloneElement(this.props.content, {
                  itinerary: hasItineraries && itineraries[match.params.hash],
                  focus: this.updateCenter,
                  plan: this.props.plan,
                })}
            </SummaryPlanContainer>
          </>
        );
      } else {
        content = (
          <div style={{ position: 'relative', height: 200 }}>
            <Loading />
          </div>
        );
      }

      return (
        <DesktopView
          title={
            <FormattedMessage
              id="summary-page.title"
              defaultMessage="Itinerary suggestions"
            />
          }
          header={
            <React.Fragment>
              <SummaryNavigation
                params={match.params}
                serviceTimeRange={serviceTimeRange}
                startTime={earliestStartTime}
                endTime={latestArrivalTime}
                toggleSettings={this.toggleCustomizeSearchOffcanvas}
              />
              {showStreetModeSelector && (
                <StreetModeSelector
                  showWalkOptionButton
                  onButtonClick={this.setStreetMode}
                  walkItinerary={this.props.walkPlan.itineraries[0]}
                />
              )}
            </React.Fragment>
          }
          content={content}
          settingsDrawer={
            <SettingsDrawer
              open={this.getOffcanvasState()}
              onToggleClick={this.toggleCustomizeSearchOffcanvas}
            />
          }
          map={map}
          scrollable
          bckBtnColor={this.context.config.colors.primary}
        />
      );
    }

    let content;

    if (
      (!error && !this.props.plan) ||
      this.state.loading !== false ||
      this.props.loadingPosition === true
    ) {
      content = (
        <div style={{ position: 'relative', height: 200 }}>
          <Loading />
        </div>
      );
    } else if (match.params.hash) {
      content = (
        <MobileItineraryWrapper
          itineraries={itineraries}
          params={match.params}
          focus={this.updateCenter}
        >
          {this.props.content &&
            itineraries.map((itinerary, i) =>
              React.cloneElement(this.props.content, {
                key: i,
                itinerary,
                plan: this.props.plan,
                serviceTimeRange: this.props.serviceTimeRange,
                resetStreetMode: this.resetStreetMode,
              }),
            )}
        </MobileItineraryWrapper>
      );
    } else {
      map = undefined;
      content = (
        <>
          <SummaryPlanContainer
            activeIndex={getActiveIndex(match.location, itineraries)}
            plan={this.props.plan}
            serviceTimeRange={serviceTimeRange}
            itineraries={itineraries}
            params={match.params}
            error={error || this.state.error}
            setLoading={this.setLoading}
            setError={this.setError}
            from={match.params.from}
            to={match.params.to}
            intermediatePlaces={intermediatePlaces}
          />
          {screenReaderUpdateAlert}
        </>
      );
    }

    return (
      <MobileView
        header={
          !match.params.hash ? (
            <React.Fragment>
              <SummaryNavigation
                params={match.params}
                serviceTimeRange={serviceTimeRange}
                startTime={earliestStartTime}
                endTime={latestArrivalTime}
                toggleSettings={this.toggleCustomizeSearchOffcanvas}
              />
              {showStreetModeSelector && (
                <StreetModeSelector
                  showWalkOptionButton
                  onButtonClick={this.setStreetMode}
                  walkItinerary={this.props.walkPlan.itineraries[0]}
                />
              )}
            </React.Fragment>
          ) : (
            false
          )
        }
        content={content}
        map={map}
        settingsDrawer={
          <SettingsDrawer
            open={this.getOffcanvasState()}
            onToggleClick={this.toggleCustomizeSearchOffcanvas}
            mobile
          />
        }
      />
    );
  }
}

const SummaryPageWithBreakpoint = withBreakpoint(SummaryPage);

SummaryPageWithBreakpoint.description = (
  <ComponentUsageExample isFullscreen>
    {isBrowser && <SummaryPageWithBreakpoint {...exampleData} />}
  </ComponentUsageExample>
);

// Handle geolocationing when url contains POS as origin/destination
const PositioningWrapper = connectToStores(
  SummaryPageWithBreakpoint,
  ['PositionStore'],
  (context, props) => {
    const { from, to } = props.match.params;
    if (from !== 'POS' && to !== 'POS') {
      return props;
    }

    const locationState = context.getStore('PositionStore').getLocationState();
    if (locationState.locationingFailed) {
      // Error message is displayed by locationing message bar
      return { ...props, loadingPosition: false };
    }

    if (
      locationState.isLocationingInProgress ||
      locationState.isReverseGeocodingInProgress
    ) {
      return { ...props, loadingPosition: true };
    }

    if (locationState.hasLocation) {
      const locationForUrl = addressToItinerarySearch(locationState);
      const newFrom = from === 'POS' ? locationForUrl : from;
      const newTo = to === 'POS' ? locationForUrl : to;
      props.router.replace(getRoutePath(newFrom, newTo));
      return { ...props, loadingPosition: false };
    }

    // locationing not started...
    context.executeAction(startLocationWatch);
    return { ...props, loadingPosition: true };
  },
);

PositioningWrapper.contextTypes = {
  ...PositioningWrapper.contextTypes,
  executeAction: PropTypes.func.isRequired,
};

const containerComponent = createFragmentContainer(PositioningWrapper, {
  plan: graphql`
    fragment SummaryPage_plan on Plan {
      ...SummaryPlanContainer_plan
      ...ItineraryTab_plan
      itineraries {
        startTime
        endTime
        ...ItineraryTab_itinerary
        ...PrintableItinerary_itinerary
        ...SummaryPlanContainer_itineraries
        legs {
          mode
          ...ItineraryLine_legs
          transitLeg
          legGeometry {
            points
          }
          route {
            gtfsId
          }
          trip {
            gtfsId
            directionId
            stoptimesForDate {
              scheduledDeparture
            }
            pattern {
              ...RouteLine_pattern
            }
          }
        }
      }
    }
  `,
  walkPlan: graphql`
    fragment SummaryPage_walkPlan on Plan {
      ...SummaryPlanContainer_plan
      ...ItineraryTab_plan
      itineraries {
        walkDistance
        duration
        startTime
        endTime
        ...ItineraryTab_itinerary
        ...PrintableItinerary_itinerary
        ...SummaryPlanContainer_itineraries
        legs {
          mode
          ...ItineraryLine_legs
          transitLeg
          legGeometry {
            points
          }
          route {
            gtfsId
          }
          trip {
            gtfsId
            directionId
            stoptimesForDate {
              scheduledDeparture
            }
            pattern {
              ...RouteLine_pattern
            }
          }
          distance
        }
      }
    }
  `,
  serviceTimeRange: graphql`
    fragment SummaryPage_serviceTimeRange on serviceTimeRange {
      start
      end
    }
  `,
});

export {
  containerComponent as default,
  SummaryPageWithBreakpoint as Component,
};
