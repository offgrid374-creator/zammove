'use strict';
/* Builds the business domain around one state object S (loaded from the database). */
const makeHelpers = require('./helpers');

module.exports = function createDomain(S) {
  const h = makeHelpers(S);
  const catalog = require('./catalog')(S, h); // first: it extends h.rates with the fuel price
  const auth = require('./auth')(S, h);
  const bookings = require('./bookings')(S, h);
  const { publicTrack, ...bookingActions } = bookings;
  const actions = {
    ...auth.actions,
    ...catalog,
    ...bookingActions,
    ...require('./verification')(S, h),
    ...require('./rentals')(S, h),
    ...require('./incidents')(S, h), // reports, emergencies and incident cases
    ...require('./workspace')(S, h),
    ...require('./drivers')(S, h), // replaces the old reqAssign / assignDecision
    ...require('./ops')(S, h),
    ...require('./finance')(S, h),
    ...require('./people')(S, h), // owners manage their drivers and helpers
    ...require('./turnover')(S, h), // driver → owner → ZamMove
    ...require('./handover')(S, h),
    ...require('./chat')(S, h), // customer ↔ driver and renter ↔ owner messages // rental pickup and return checked with the renter's code
    ...require('./recovery')(S, h), // undo, withdraw, correct a payment, admin corrections
  };
  return { h, auth, actions, publicTrack, view: require('../views')(S, h) };
};
