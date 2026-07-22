(function (root) {
  "use strict";

  var MINIMUM_SPAN_DB = 20;
  var FLOOR_STEP_DB = 5;

  function fromLosses(losses) {
    var finiteLosses = (losses || []).map(Number).filter(Number.isFinite);
    if (!finiteLosses.length) {
      return {
        referenceLossDb: null,
        minimumRelativeDb: null,
        floorDb: -MINIMUM_SPAN_DB
      };
    }

    var referenceLossDb = Math.min.apply(null, finiteLosses);
    var weakestLossDb = Math.max.apply(null, finiteLosses);
    var minimumRelativeDb = referenceLossDb - weakestLossDb;
    var roundedFloorDb = Math.floor(minimumRelativeDb / FLOOR_STEP_DB) * FLOOR_STEP_DB;
    return {
      referenceLossDb: referenceLossDb,
      minimumRelativeDb: minimumRelativeDb,
      floorDb: Math.min(-MINIMUM_SPAN_DB, roundedFloorDb)
    };
  }

  function normalize(relativeDb, floorDb) {
    var relative = Number(relativeDb);
    var floor = Number(floorDb);
    if (!Number.isFinite(relative) || !Number.isFinite(floor) || floor >= 0) return null;
    var clamped = Math.max(floor, Math.min(0, relative));
    return (clamped - floor) / -floor;
  }

  function axisTicks(floorDb) {
    var floor = Number(floorDb);
    if (!Number.isFinite(floor) || floor >= 0) floor = -MINIMUM_SPAN_DB;
    var ticks = [0];
    for (var tick = -10; tick > floor; tick -= 10) ticks.push(tick);
    if (ticks[ticks.length - 1] !== floor) ticks.push(floor);
    return ticks;
  }

  root.PlatformSignalVisualScale = {
    minimumSpanDb: MINIMUM_SPAN_DB,
    floorStepDb: FLOOR_STEP_DB,
    fromLosses: fromLosses,
    normalize: normalize,
    axisTicks: axisTicks
  };
})(typeof window !== "undefined" ? window : globalThis);
