# LGA Version 2 Flight-Phase and Frequency Matching Rules

## Status and isolation

This is a Version 2 specification. It does not replace, rename, or modify the Version 1 rules, OpenSky observations, tracker backend, or web interface.

Version 2 reads the existing OpenSky state-vector fields and creates separate derived results. Its frequency is an inferred representative frequency, not the channel actually assigned by air traffic control.

## Output rule

For each flight and stable phase, Version 2 selects exactly one `most_likely_frequency_mhz`. Only that frequency is passed to the Version 2 signal-loss calculation.

Alternative frequencies may be considered internally when deciding confidence, but they do not create parallel signal-loss calculations.

If no defensible phase or frequency is available, the output is unknown rather than forced:

```text
inferred_phase = unknown
most_likely_frequency_mhz = null
phase_confidence = low
frequency_confidence = low
matched_rule_id = null
```

## Unchanged OpenSky inputs

Version 2 does not add fields to or overwrite the OpenSky observations. It reads:

```text
icao24
timestamp
latitude
longitude
barometric altitude
geometric altitude when available
on-ground flag
ground speed
track/heading
vertical rate
```

Observed values and one-second derived positions must remain distinguishable.

## Derived motion evidence

The phase engine derives the following values from actual observations:

```text
distance_to_lga_nm
radial_speed_to_lga_kt
smoothed_ground_speed_kt
smoothed_vertical_rate_fpm
smoothed_track_deg
turn_rate_deg_per_second
runway_alignment_score
position_status
prediction_horizon_seconds
```

Geometric altitude is preferred for signal-path geometry. Barometric altitude remains acceptable for phase evidence when geometric altitude is unavailable.

## Independent-evidence rule

One-second predicted positions are temporal samples, not new independent OpenSky observations. Thirty predicted points between two API updates must not be treated as thirty confirmations of a phase or direction.

Phase confirmation and frequency handoff stability use actual OpenSky updates. Predicted positions may carry a provisional phase forward or indicate a provisional transition, but the next actual observation must reconcile that transition.

## Stateful phase model

Allowed normal transitions are:

```text
unknown -> ground_taxi -> initial_departure -> departure_climb
unknown -> arrival_approach -> final_approach -> ground_taxi
```

Reverse or skipped transitions are allowed only when actual observations provide stronger evidence than phase continuity. This avoids phase changes caused by a single noisy altitude, vertical-rate, or distance value.

### Evidence weights

For an eligible candidate phase, confidence is the weighted fraction of the available evidence that agrees with the phase:

| Evidence | Weight |
|---|---:|
| Arrival/departure direction and radial motion | 0.30 |
| Smoothed vertical motion | 0.25 |
| Distance zone | 0.20 |
| Altitude zone | 0.15 |
| Runway alignment, when available | 0.10 |

When runway alignment is unavailable, its weight is removed from the denominator rather than counted as a failure.

The initial weights are transparent prototype assumptions and must be reported in `Simplified_Elements.md` when results are distributed.

### Stability rules

- Keep the current phase when competing phase scores are within `0.10`.
- A non-ground phase change normally requires support from two consecutive actual OpenSky updates.
- An actual on-ground observation within 1.5 NM of LGA can immediately select `ground_taxi`.
- A transition may be shown as provisional between updates, but it is reconciled when the next actual observation arrives.
- When one actual observation has no phase match, retain the last stable V2 frequency and mark `frequency_assignment_status = held_during_transition`.
- When two consecutive actual observations have no phase match, set phase to `unknown`, clear the frequency, and stop signal-loss calculation until V2 matches again.
- Beyond 40 NM, clear the phase and frequency immediately with `frequency_assignment_status = outside_40_nm`.
- If the flight becomes stale, do not continue phase transitions from predicted positions.

## Initial Version 2 representative frequencies

The selected frequencies remain representative primary NASR frequencies while the phase inference becomes stateful and confidence-aware.

| Rule ID | Stable phase | Service | Facility | Most likely frequency |
|---|---|---|---|---:|
| `LGA_V2_GROUND` | `ground_taxi` | Ground | LGA ATCT | 121.700 MHz |
| `LGA_V2_ARR_FINAL` | `final_approach` | Tower/Local | LGA ATCT | 118.700 MHz |
| `LGA_V2_DEP_INITIAL` | `initial_departure` | Tower/Local | LGA ATCT | 118.700 MHz |
| `LGA_V2_ARR_APPROACH` | `arrival_approach` | Approach | N90 New York TRACON | 120.800 MHz |
| `LGA_V2_DEP_CLIMB` | `departure_climb` | Departure | N90 New York TRACON | 120.400 MHz |

These assignments do not assert a live controller handoff. If two candidate frequencies have nearly equal evidence, retain the current frequency to avoid a one-second frequency oscillation.

## Phase eligibility guidance

The following distance and altitude values remain eligibility guidance, not official FAA handoff boundaries:

| Phase | Eligibility guidance |
|---|---|
| `ground_taxi` | Within 1.5 NM; actual on-ground flag, or low-and-slow substitute at or below 250 ft and 50 kt |
| `final_approach` | Stable arrival; within 8 NM; at or below 3,000 ft; descending |
| `initial_departure` | Stable departure; within 5 NM; at or below 3,000 ft; climbing |
| `arrival_approach` | Stable arrival; within 40 NM; at or below 10,000 ft; descending |
| `departure_climb` | Stable departure; within 40 NM; at or below 15,000 ft; climbing |

Smoothed radial and vertical motion, transition continuity, and runway alignment determine whether a boundary crossing is credible. Exact-boundary priority is final approach before arrival approach, and initial departure before departure climb.

## Derived frequency fields

```text
inferred_phase
phase_score
phase_confidence
phase_status
most_likely_frequency_mhz
frequency_confidence
frequency_status
frequency_assignment_status
facility_id
matched_rule_id
assignment_method = stateful_rule_based_v2
```

`phase_status` is one of `observed`, `provisional_predicted`, `reconciled`, or `unknown`.

`frequency_assignment_status` is one of `current_phase_match`, `provisional_phase_match`, `reconciled_phase_match`, `held_during_transition`, `unavailable`, or `outside_40_nm`.
