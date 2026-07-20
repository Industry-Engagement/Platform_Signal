# Realtime Flight Tracker: LaGuardia Arrivals and Departures

**Status: Shell.** Structure and API notes are here; working code is not yet built. Ask for a full build when you are ready to work through it.

## What you will build

A static web page with a MapLibre map centered on LGA that plots live positions of aircraft within a bounding box around the airport. Each aircraft is a rotated icon showing heading. Clicking a plane shows callsign, altitude, ground speed, and origin/destination when available. The map refreshes every 10 to 15 seconds.

## Prerequisites

- GitHub account and a code editor
- Ability to run `python3 -m http.server 8000` locally
- Free account on OpenSky Network for higher rate limits (anonymous works but is throttled): https://opensky-network.org/

## Data sources and API notes

**Primary: OpenSky Network REST API**
- Endpoint: `https://opensky-network.org/api/states/all`
- Bounding box parameters `lamin`, `lomin`, `lamax`, `lomax` filter to your area of interest.
- Anonymous rate limit: one request every 10 seconds. Authenticated: one per 5 seconds.
- Returns arrays of state vectors. Columns are documented at https://openskynetwork.github.io/opensky-api/rest.html
- Response shape:
  ```json
  {
    "time": 1710000000,
    "states": [
      ["icao24", "callsign", "origin_country", ..., longitude, latitude, ..., heading, ...],
      ...
    ]
  }
  ```
- Column index reference is in the docs. Callsign is column 1, longitude column 5, latitude column 6, heading column 10, altitude column 7.

**Suggested LGA bounding box**
```
lamin=40.70, lomin=-74.05, lamax=40.85, lomax=-73.80
```
This covers final approach and initial climb from all four LGA runways plus overlap with JFK arrivals, which is useful for context.

**Alternative feeds if OpenSky is rate limiting you**
- ADS-B Exchange (community feed, requires RapidAPI key): https://www.adsbexchange.com/data/
- FlightAware AeroAPI (paid after free tier): https://www.flightaware.com/aeroapi/portal/
- adsb.lol (community, free, may be intermittent): https://api.adsb.lol/

Airline schedule data (which flight is which) requires a separate call. FlightAware and AviationStack both offer this but are paid past small free tiers. For the tutorial, callsign is enough.

## Walkthrough (outline)

1. **HTML shell** with a full-viewport map div and a small info panel.
3. **MapLibre setup** with a light basemap tile source and center on `[-73.874, 40.777]` at zoom 11.
4. **Fetch loop** that calls the OpenSky states endpoint every 12 seconds with the LGA bounding box.
5. **Symbol layer** with a plane icon (SVG loaded into the sprite) rotated by heading. Use `icon-rotation-alignment: map`.
6. **Click handler** that reads the clicked state vector, formats altitude and speed, and shows a popup.
7. **Trails (optional):** keep the last N positions per `icao24` in memory and render a line layer for context.
8. **Filter to LGA-relevant traffic:** approximate by altitude below 8000 ft, or by callsign prefix if you obtain the schedule feed.

## Extensions and variations

- Filter arrivals only: keep states where altitude is descending over successive polls.
- Highlight aircraft type (regional jet vs widebody) from the `icao24` code via the OpenSky metadata endpoint.
- Sonify arrivals: web audio ping when a plane crosses the LGA fence polygon.
- Cross-reference with noise complaint 311 data by date.

## Common pitfalls

- OpenSky returns coordinates as `[lon, lat]` but as separate columns, not a pair. Read them by index.
- Heading can be null on the ground. Guard for null before rotating an icon.
- OpenSky occasionally returns 429 or 503. Wrap fetch in a retry with backoff. Do not hammer.
- CORS: OpenSky responds with CORS headers, so browser fetch works. If you switch to a paid provider, verify their CORS policy or proxy through Netlify Functions.
