# LGA Prototype Flight Phase and Frequency Matching Rules

## Purpose

This specification supports a prototype that assigns an **inferred ATC service and representative frequency** to flight-track observations involving LaGuardia Airport.

The assignment is not a record of the frequency actually used by an aircraft. FAA NASR data describes published facilities, services, and frequencies, but it does not contain live controller handoffs.

The machine-readable rules are stored in `lga_frequency_rules.csv`. The flight dataset remains separate and should be treated as read-only. When flight data is provided, the rules can be applied to it and the results written to a new output file.

## NASR basis

Source subscription: **28 Day NASR Subscription — Effective 2026-07-09**.

Relevant NASR tables:

| File | Use |
|---|---|
| `APT_BASE.csv` | LGA identifier, airport coordinate, and elevation |
| `ATC_BASE.csv` | Confirms that N90/New York TRACON provides primary Approach and Departure service for LGA |
| `FRQ.csv` | Provides the representative frequencies and their published uses |

LGA reference point from `APT_BASE.csv`:

| Field | Value |
|---|---:|
| FAA airport ID | LGA |
| ICAO ID | KLGA |
| Latitude | 40.77724222 |
| Longitude | -73.87260555 |
| Airport elevation | 20.7 ft |

Representative frequencies selected from `FRQ.csv`:

| Service | Facility | NASR frequency use | Frequency |
|---|---|---|---:|
| Ground | LGA ATCT | GND/P | 121.7 MHz |
| Tower/Local | LGA ATCT | LCL/P | 118.7 MHz |
| Departure | N90 New York TRACON | DEP/P | 120.4 MHz |
| Approach | N90 New York TRACON | APCH/P | 120.8 MHz |

The `/P` values are used as representative primary frequencies. Secondary and procedure-specific frequencies are intentionally excluded from this simple prototype.

## Required future flight fields

Preferred fields for every observation:

| Field | Required | Purpose |
|---|---|---|
| Flight identifier | Yes | Groups observations by aircraft/flight |
| Timestamp | Yes | Orders observations and supports derived vertical rate |
| Latitude | Yes | Calculates distance and motion relative to LGA |
| Longitude | Yes | Calculates distance and motion relative to LGA |
| Altitude | Yes | Distinguishes ground, initial/final, and terminal phases |
| Origin airport | Preferred | Identifies an LGA departure directly |
| Destination airport | Preferred | Identifies an LGA arrival directly |
| Vertical rate | Preferred | Classifies climbing, descending, or level flight |
| Ground speed | Preferred | Helps distinguish ground movement from flight |
| On-ground flag | Preferred | Provides the safest ground/taxi classification |
| Track/heading | Optional | Can later improve runway-alignment detection |

If vertical rate is absent, it can be derived from consecutive timestamped altitude observations. If origin and destination are absent, direction can be inferred from distance change, but confidence must be reduced.

## Derived values

Before evaluating the CSV rules, calculate:

1. `distance_to_lga_nm`: horizontal great-circle distance from the observation to the LGA reference point.
2. `vertical_motion`:
   - `climbing` when vertical rate is greater than a selected positive tolerance;
   - `descending` when vertical rate is less than a selected negative tolerance;
   - `level` otherwise.
3. `direction`:
   - `arrival` when destination is LGA;
   - `departure` when origin is LGA;
   - otherwise, probable arrival when distance is decreasing and the aircraft is descending;
   - otherwise, probable departure when distance is increasing and the aircraft is climbing.

Recommended noise tolerance for the initial implementation is approximately ±200 ft/min. This can be adjusted after inspecting the sampling interval and noise in the future dataset.

## Rule evaluation

Evaluate matching rows in ascending `priority` order. The first fully satisfied rule wins.

| Priority | Condition | Phase | Service | Frequency |
|---:|---|---|---|---:|
| 10 | On ground near LGA, or a validated low-and-slow substitute | Ground/taxi | Ground | 121.7 MHz |
| 20 | LGA arrival, 0–8 NM, at or below 3,000 ft, descending | Final approach | Tower | 118.7 MHz |
| 30 | LGA departure, 0–5 NM, at or below 3,000 ft, climbing | Initial departure | Tower | 118.7 MHz |
| 40 | LGA arrival, 8–40 NM, at or below 10,000 ft, descending | Arrival approach | Approach | 120.8 MHz |
| 50 | LGA departure, 5–40 NM, at or below 15,000 ft, climbing | Departure climb | Departure | 120.4 MHz |

Distance and altitude thresholds are transparent prototype assumptions. They are not FAA-published handoff boundaries.

### Boundary convention

To prevent ambiguous exact-boundary matches in implementation:

- final approach takes precedence at exactly 8 NM;
- initial departure takes precedence at exactly 5 NM;
- approach and departure-climb rules begin immediately outside those inner zones.

The CSV contains readable inclusive limits; the implementation should enforce the priority convention above when resolving overlaps.

## Stability and confidence

To prevent rapid switching caused by noisy observations, require a new phase to match for three consecutive observations before changing the assigned phase and frequency. If observations are widely spaced, this persistence setting should be reviewed.

Suggested confidence logic:

| Confidence | Evidence |
|---|---|
| High | Origin/destination explicitly identifies LGA and all required motion conditions match |
| Medium | Direction is explicit, but the phase depends on prototype handoff thresholds |
| Low | Arrival/departure direction is inferred from trajectory movement |
| Unknown | No rule matches or required evidence is missing |

Do not force a match. The fallback result should be:

```text
inferred_phase = unknown
inferred_service = unknown
inferred_frequency_mhz = null
assignment_confidence = low
matched_rule_id = null
```

## Future output fields

When the flight dataset is provided, preserve it unchanged and write a new derived dataset containing the original fields plus:

```text
distance_to_lga_nm
derived_vertical_motion
inferred_direction
inferred_phase
inferred_service
inferred_frequency_mhz
facility_id
matched_rule_id
assignment_confidence
assignment_method
```

Use `assignment_method = rule_based_prototype` to make the inferred nature of the result explicit.

## Scope limitation

This version intentionally does not model:

- live ATC frequency assignments;
- runway configuration;
- detailed N90 sectors;
- STAR or departure-procedure frequency selection;
- secondary or military frequencies;
- physical transmitter locations.

Those features are unnecessary for the current prototype and can be added later without changing the original flight dataset.
