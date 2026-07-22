"""Build Subway_6_3D.geojson -- the 6 train's route and stations with track elevation.

Same method as build_l_3d.py:
  * station coordinates come from AllSubwayStations_20260716.geojson (WGS84 in properties),
  * real ground-surface elevation is fetched per station from the USGS 3DEP DEM (EPQS API),
  * structure type is documented, not guessed (sources cited below),
  * depth/height relative to street is a representative engineering-scale approximation,
    because the MTA does not publish as-built track profiles.

Structure sources (fetched and verified):
  * IRT Lexington Avenue Line -- infobox Character: "Underground"; no elevated/open-cut/
    viaduct section. Covers every Manhattan station the 6 serves.
    https://en.wikipedia.org/wiki/IRT_Lexington_Avenue_Line
  * IRT Pelham Line -- infobox Character: "Underground (Hunts Point & South) / Elevated
    (North of Hunts Point)". The line rises onto elevated structure over Whitlock Avenue at
    East 165th Street, just south of Whitlock Avenue station.
    https://en.wikipedia.org/wiki/IRT_Pelham_Line
  * Boundary confirmed station-by-station: Hunts Point Avenue infobox Structure =
    "Underground"; Whitlock Avenue infobox Structure = "Elevated".
"""

import json, math, time, urllib.request

FT2M = 0.3048
ROUTE_ID = "6"

# ---- documented structure type per station ----
UNDERGROUND_MANHATTAN = [
    "Brooklyn Bridge - City Hall", "Canal St", "Spring St", "Bleecker St", "Astor Pl",
    "14 St - Union Sq", "23 St", "28 St", "33 St", "Grand Central - 42 St", "51 St",
    "59 St", "68 St - Hunter College", "77 St", "86 St", "96 St", "103 St", "110 St",
    "116 St", "125 St",
]
UNDERGROUND_BRONX = [
    "3 Av - 138 St", "Brook Av", "Cypress Av", "E 143 St - St Mary's St", "E 149 St",
    "Longwood Av", "Hunts Point Av",
]
ELEVATED_BRONX = [
    "Whitlock Av", "Elder Av", "Morrison Av- Sound View", "St Lawrence Av", "Parkchester",
    "Castle Hill Av", "Zerega Av", "Westchester Sq - E Tremont Av", "Middletown Rd",
    "Buhre Av", "Pelham Bay Park",
]

STRUCTURE = {}
for _n in UNDERGROUND_MANHATTAN + UNDERGROUND_BRONX:
    STRUCTURE[_n] = "underground"
for _n in ELEVATED_BRONX:
    STRUCTURE[_n] = "elevated"

# ---- depth offset in metres: positive = below street, negative = above street ----
# Representative values by structure type, not surveyed per-station data:
#   * Lexington Avenue Line is cut-and-cover under Lexington/Park Avenue -> ~9 m.
#   * The Harlem River crossing (125 St <-> 3 Av-138 St) runs through the Lexington Avenue
#     Tunnel and must clear the riverbed, so the two flanking stations sit deeper (~12 m).
#     The Harlem River is far narrower and shallower than the East River, so this is less
#     deep than the L's East River tube anchors (20 m in build_l_3d.py).
#   * The Bronx subway section shallows out as it approaches the portal at E 165th St.
#   * Standard NYC elevated structure clearance -> ~8 m above street.
DEPTH_M = {name: 9 for name in UNDERGROUND_MANHATTAN}
DEPTH_M.update({
    "125 St": 12,          # Manhattan side of the Harlem River tunnel
    "3 Av - 138 St": 12,   # Bronx side of the Harlem River tunnel
    "Brook Av": 9, "Cypress Av": 9, "E 143 St - St Mary's St": 8, "E 149 St": 8,
    "Longwood Av": 7, "Hunts Point Av": 6,   # shallowing toward the portal
})
DEPTH_M.update({name: -8 for name in ELEVATED_BRONX})


def haversine_m(lon1, lat1, lon2, lat2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# ---- route line (already WGS84, ordered Brooklyn Bridge -> Pelham Bay Park) ----
route = json.load(open("Subway_6_official.geojson", encoding="utf-8"))
line = route["features"][0]["geometry"]["coordinates"]

# ---- stations serving this route ----
allst = json.load(open("AllSubwayStations_20260716.geojson", encoding="utf-8"))
stations = []
for f in allst["features"]:
    p = f["properties"]
    trains = [t.strip() for t in p["trains"].replace(" ", ",").split(",") if t]
    if ROUTE_ID in trains:
        stations.append({"name": p["stop_name"], "lat": p["stop_lat"], "lon": p["stop_lon"]})

missing = sorted(s["name"] for s in stations if s["name"] not in STRUCTURE)
if missing:
    raise SystemExit("No documented structure type for: " + ", ".join(missing))

# ---- real ground-surface elevation from USGS EPQS (feet) ----
for s in stations:
    url = ("https://epqs.nationalmap.gov/v1/json?x=%s&y=%s&units=Feet&wkid=4326"
           "&includeDate=false" % (s["lon"], s["lat"]))
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "research-script"})
            with urllib.request.urlopen(req, timeout=25) as resp:
                s["surface_ft"] = json.load(resp)["value"]
            break
        except Exception:
            time.sleep(1.5)
    else:
        raise SystemExit("elevation fetch failed for " + s["name"])
    time.sleep(0.15)

# ---- cumulative distance along the route, and each station's position on it ----
cum = [0.0]
for i in range(1, len(line)):
    cum.append(cum[-1] + haversine_m(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]))

for s in stations:
    best_i, best_d = 0, float("inf")
    for i, (vlon, vlat) in enumerate(line):
        d = haversine_m(s["lon"], s["lat"], vlon, vlat)
        if d < best_d:
            best_d, best_i = d, i
    s["dist_m"] = cum[best_i]
    s["snap_err_m"] = best_d
    s["structure"] = STRUCTURE[s["name"]]
    s["depth_offset_m"] = DEPTH_M[s["name"]]
    s["surface_m"] = s["surface_ft"] * FT2M

stations.sort(key=lambda s: s["dist_m"])
print("max station snap error (m): %.1f" % max(s["snap_err_m"] for s in stations))

anchor_dist = [s["dist_m"] for s in stations]
anchor_depth = [s["depth_offset_m"] for s in stations]
anchor_surface = [s["surface_m"] for s in stations]


def interp(x, xs, ys):
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    for i in range(1, len(xs)):
        if x <= xs[i]:
            t = (x - xs[i - 1]) / (xs[i] - xs[i - 1])
            return ys[i - 1] + t * (ys[i] - ys[i - 1])
    return ys[-1]


# ---- steepest track grade between consecutive stations, as a sanity check ----
worst = (0.0, "")
for a, b in zip(stations, stations[1:]):
    run = b["dist_m"] - a["dist_m"]
    if run <= 0:
        continue
    rise = (b["surface_m"] - b["depth_offset_m"]) - (a["surface_m"] - a["depth_offset_m"])
    grade = abs(rise) / run * 100
    if grade > worst[0]:
        worst = (grade, "%s -> %s" % (a["name"], b["name"]))
print("steepest interpolated grade: %.2f%% (%s)" % worst)

# ---- 3D route line ----
line3d = []
for i, (lon, lat) in enumerate(line):
    d = cum[i]
    track_z = interp(d, anchor_dist, anchor_surface) - interp(d, anchor_dist, anchor_depth)
    line3d.append([lon, lat, round(track_z, 2)])

# ---- 3D station points ----
station_points = []
for s in stations:
    track_z = s["surface_m"] - s["depth_offset_m"]
    station_points.append({
        "type": "Feature",
        "properties": {
            "station": s["name"],
            "structure_type": s["structure"],
            "surface_elevation_m": round(s["surface_m"], 2),
            "depth_below_surface_m": s["depth_offset_m"],
            "track_elevation_m": round(track_z, 2),
            "track_elevation_ft": round(track_z / FT2M, 1),
            "dist_along_route_m": round(s["dist_m"], 1),
        },
        "geometry": {"type": "Point", "coordinates": [s["lon"], s["lat"], round(track_z, 2)]},
    })

fc = {
    "type": "FeatureCollection",
    "properties": {
        "description": "6 train (IRT Lexington Avenue Line + IRT Pelham Line) route and "
                       "stations with representative track elevation (z, meters).",
        "method": (
            "Surface elevation from USGS 3DEP DEM (EPQS API) at each station. Structure type "
            "from the IRT Lexington Avenue Line and IRT Pelham Line Wikipedia articles "
            "(Lexington Ave Line character: Underground; Pelham Line character: Underground "
            "Hunts Point & south / Elevated north of Hunts Point), with the portal confirmed "
            "station-by-station -- Hunts Point Av underground, Whitlock Av elevated. Track "
            "depth/height relative to street uses representative engineering-scale "
            "approximations (cut-and-cover ~9m, Harlem River tunnel clearance ~12m at 125 St "
            "and 3 Av-138 St, standard elevated structure ~8m) since MTA does not publish "
            "as-built track profiles. Depth is linearly interpolated along the route between "
            "stations by distance -- for visual representation only, not surveyed data."
        ),
        "z_units": "meters",
        "generated": "2026-07-22",
    },
    "features": [{
        "type": "Feature",
        "properties": {
            "route_id": "6",
            "route_long": "Lexington Avenue Local",
            "color": "00933C",
            "direction": "Brooklyn Bridge-City Hall -> Pelham Bay Park",
        },
        "geometry": {"type": "LineString", "coordinates": line3d},
    }] + station_points,
}

json.dump(fc, open("Subway_6_3D.geojson", "w", encoding="utf-8"), indent=1)
print("wrote Subway_6_3D.geojson  route pts: %d  stations: %d" % (len(line3d), len(station_points)))
