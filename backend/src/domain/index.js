'use strict';
/* Builds the business domain around one state object S (loaded from the database). */
const makeHelpers = require('./helpers');

module.exports = function createDomain(S) {
  const h = makeHelpers(S);
  const auth = require('./auth')(S, h);
  const bookings = require('./bookings')(S, h);
  const { publicTrack, ...bookingActions } = bookings;
  const actions = {
    ...auth.actions,
    ...bookingActions,
    ...require('./verification')(S, h),
    ...require('./rentals')(S, h),
    ...require('./workspace')(S, h),
    ...require('./drivers')(S, h), // replaces the old reqAssign / assignDecision
    ...require('./ops')(S, h),
    ...require('./finance')(S, h),
  };
  return { h, auth, actions, publicTrack, view: require('../views')(S, h) };
};
