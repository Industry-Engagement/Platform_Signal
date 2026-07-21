# Version 2 Simplified Elements

## Purpose

This file records what the Version 2 flight-frequency and signal-loss prototype ignores, substitutes, or simplifies. These limitations must remain visible whenever Version 2 results are interpreted or visualized.

Version 2 produces theoretical path loss and relative power change. It does not produce measured radio strength.

## Version and interface isolation

- Version 1 rules, workbook, OpenSky observations, tracker behavior, and interface remain unchanged.
- Version 2 creates separate derived records.
- No Version 2 building status changes the 2D or 3D map.
- Blocking buildings, non-blocking buildings, missing-height buildings, and estimated-height buildings all keep the existing web-interface style.
- Version 2 adds no building highlight, flag, outline, label, popup, legend, feature state, filter, or conditional color.
- The 10 m missing-height fallback is calculation-only and must never be used as a styling condition.
- Visualization of calculated flight signal values is outside the current Version 2 rule implementation.

## OpenSky timing and route simplifications

- OpenSky observations arrive approximately every 30 seconds.
- Positions generated once per second between updates are predictions, not observations.
- Live horizontal prediction assumes recent turn rate and velocity continue over the short prediction horizon.
- Live vertical prediction assumes recent vertical rate continues over the short prediction horizon.
- Maneuvers that begin after the latest observation cannot be known until the next actual update.
- Predicted points do not count as independent evidence for phase confirmation.
- When the next actual observation arrives, provisional Version 2 points are replaced by endpoint-constrained interpolation.
- Reconciliation improves the stored historical path but cannot retroactively change what a live user previously saw.
- If endpoint velocity information is missing, interpolation falls back to simpler geodesic and linear methods.
- Prediction stops for stale flights rather than inventing an extended route.

## Flight-phase and frequency simplifications

- LGA relationship, direction, phase, and frequency are inferred from movement.
- OpenSky state vectors do not report the aircraft's active controller-assigned voice frequency.
- Distance and altitude zones are prototype eligibility guidance, not FAA handoff boundaries.
- Phase evidence weights are transparent prototype assumptions, not trained probabilities.
- Runway alignment may be unavailable or ambiguous.
- Version 2 selects only the most likely representative frequency for a stable phase.
- Secondary and nearly tied candidate frequencies do not receive separate signal-loss calculations.
- A selected frequency is labeled inferred and retains a confidence value.
- When evidence is insufficient, the frequency remains unknown.

## Transmitter simplifications

- Published NASR serviced-facility coordinates are not treated as verified per-frequency transmitter sites.
- All services and frequencies use one synthetic LGA reference origin.
- The synthetic origin is `40.77724222, -73.87260555`.
- A fixed 50 m antenna height above the local ground reference is used only to construct the signal ray.
- The reference point and height do not assert a real FAA transmitter location or installation.
- A transmitter handoff between physical radio sites is not modeled.

## Ignored radio-system elements

The prototype does not use:

- transmitter power or EIRP;
- transmitter antenna gain, pattern, tilt, or orientation;
- aircraft antenna gain, pattern, placement, or orientation;
- cable, connector, combiner, or feeder loss;
- polarization mismatch;
- receiver sensitivity, selectivity, squelch, or required input level;
- receiver noise figure or bandwidth;
- modulation, coding, voice quality, or intelligibility;
- co-channel or adjacent-channel interference;
- simultaneous transmitters;
- measured SDR or receiver calibration data.

Therefore `total_loss_db` is modeled attenuation, not received dBm or link margin.

## Propagation simplifications

- Free-space path loss is the base model.
- Detailed ITU-R P.528 time variability is not included in this simplified version.
- Atmospheric refraction variability, ducting, rain, humidity, and weather are ignored.
- Terrain creates no propagation attenuation.
- Terrain elevation may be used only to place the synthetic antenna, buildings, and aircraft in a consistent vertical reference.
- If terrain elevation is unavailable, the model uses a flat LGA elevation reference.
- Urban clutter other than the decoded building footprints is ignored.
- Vegetation, bridges, cranes, vehicles, temporary structures, and interior building materials are ignored.
- Reflection, scattering, multipath, shadow fading, and fast fading are ignored.

## Building-data simplifications

- Building footprints and heights come from the same OpenFreeMap/OpenMapTiles source used by the 3D map.
- OpenMapTiles building heights are approximations derived from available OpenStreetMap tags.
- Coverage, footprints, and heights may be missing, outdated, generalized, or incorrect.
- A finite positive `render_height` is used when available.
- A missing or invalid height is replaced by 10 m for calculation only.
- Missing-height status is stored only in derived calculation metadata.
- `render_min_height` defaults to zero when unavailable.
- The building calculation does not depend on whether a building is currently visible in the map viewport.
- Only buildings intersecting the transmitter-to-aircraft path corridor are tested.
- Only the dominant obstruction contributes diffraction loss.
- Multiple-building diffraction interaction is not modeled.
- The dominant building is approximated as a knife edge rather than a detailed electromagnetic structure.
- Building materials, windows, roofs, and penetration loss are not modeled.
- No building is highlighted or visually flagged, including buildings using the 10 m fallback.

## Output interpretation

- `fspl_db` is the theoretical free-space component.
- `building_loss_db` is the dominant-building diffraction approximation.
- `total_loss_db = fspl_db + building_loss_db`.
- Lower total loss represents a stronger modeled path when all omitted radio-system factors are held constant.
- `relative_signal_db` is referenced to the strongest modeled point in a phase or flight.
- `relative_power_percent` is a power ratio to that reference, not a probability or quality score.
- Approximately 0 dB means 100% of reference power, -3 dB means 50%, -10 dB means 10%, and -20 dB means 1%.
- Results from different flights are comparable only when they use the same prototype origin, frequency interpretation, building source, and calculation version.
- Predicted live results may change when the interval is reconciled after the next OpenSky update.

