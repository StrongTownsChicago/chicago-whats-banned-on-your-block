"""
scripts/05_build_transit_stations.py — One-time data prep script.

Generates data/transit-stations.json containing:
  - CTA L rail stations (deduped by map_id from Chicago Data Portal 8pix-ypme)
  - Metra rail stations (from OpenStreetMap Overpass API, Chicago bbox)
  - CCO qualifying bus corridor stops (sampled from local CTA GTFS, filtered by route)

Usage:
    uv run python scripts/05_build_transit_stations.py

For CTA bus corridors: Download the CTA GTFS zip from
  https://www.transitchicago.com/downloads/sch_data/
  and extract stops.txt, trips.txt, and stop_times.txt to scripts/
    scripts/cta_bus_stops.txt
    scripts/cta_trips.txt
    scripts/cta_stop_times.txt
  (or bus corridor stops will be skipped with a warning).

Output: data/transit-stations.json
"""

import csv
import json
import math
import os
import sys
import urllib.parse
import urllib.request

import requests

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OUTPUT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "transit-stations.json"
)

# Chicago bounding box (lat, lng) — includes city + small buffer
CHICAGO_LAT_MIN = 41.60
CHICAGO_LAT_MAX = 42.05
CHICAGO_LNG_MIN = -87.94
CHICAGO_LNG_MAX = -87.52

# Sampling interval for bus corridor stops (meters between sampled stops)
BUS_SAMPLE_INTERVAL_M = 500

# CCO qualifying bus routes — full list from Table 17-17-0400-A of the enacted
# Connected Communities Ordinance (July 2022). Source:
# https://www.chicago.gov/content/dam/city/sites/etod/Pdfs/final_etod_ordinance.pdf
# Includes CTA local, express (X-prefix), and limited (J-prefix) variants,
# plus lettered branch suffixes (e.g. 8A, 49B). The Pace Pulse Milwaukee Line
# is omitted here because it uses Pace GTFS, not CTA GTFS.
CCO_QUALIFYING_ROUTES = {
    # Numeric routes (68)
    "2", "3", "4", "6", "7", "8", "9", "11", "12", "15",
    "20", "21", "22", "26", "28", "29", "34", "36", "39", "43",
    "47", "49", "53", "54", "55", "56", "60", "62", "63", "66",
    "67", "68", "70", "71", "72", "73", "74", "75", "76", "77",
    "78", "79", "80", "81", "82", "84", "85", "87", "88", "91",
    "92", "95", "106", "108", "111", "115", "119", "134", "135", "136",
    "143", "146", "147", "148", "151", "155", "157", "172",
    # Lettered branch / express variants (8)
    "8A", "49B", "53A", "54B", "85A", "J14", "X9", "X49",
}

# Paths for manually-downloaded CTA GTFS files
SCRIPTS_DIR = os.path.dirname(__file__)
CTA_BUS_STOPS_PATH = os.path.join(SCRIPTS_DIR, "cta_bus_stops.txt")
CTA_BUS_TRIPS_PATH = os.path.join(SCRIPTS_DIR, "cta_trips.txt")
CTA_BUS_STOP_TIMES_PATH = os.path.join(SCRIPTS_DIR, "cta_stop_times.txt")


# ---------------------------------------------------------------------------
# CTA Rail stations (from Chicago Data Portal Socrata API)
# ---------------------------------------------------------------------------


def fetch_cta_rail_stations() -> list[dict]:
    """Fetch CTA L station coordinates from Chicago Data Portal, dedup by map_id."""
    url = "https://data.cityofchicago.org/resource/8pix-ypme.json"
    params = {
        "$select": "station_name,map_id,location",
        "$limit": 500,
    }
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    rows = resp.json()

    seen_map_ids: set[str] = set()
    stations = []
    for row in rows:
        map_id = row.get("map_id", "")
        if map_id in seen_map_ids:
            continue
        seen_map_ids.add(map_id)

        loc = row.get("location", {})
        lat_str = loc.get("latitude") or loc.get("lat")
        lng_str = loc.get("longitude") or loc.get("lon")
        if lat_str is None or lng_str is None:
            continue
        try:
            lat = float(lat_str)
            lng = float(lng_str)
        except (ValueError, TypeError):
            continue

        stations.append(
            {
                "name": row.get("station_name", f"CTA Station {map_id}"),
                "lng": lng,
                "lat": lat,
                "type": "rail",
                "source": "cta",
            }
        )

    print(f"  CTA rail: {len(stations)} unique stations (from {len(rows)} rows)")
    return stations


# ---------------------------------------------------------------------------
# Metra stations (from OpenStreetMap Overpass API)
# ---------------------------------------------------------------------------


def fetch_metra_stations() -> list[dict]:
    """
    Fetch Metra station coordinates from OpenStreetMap via Overpass API.
    Filters to Chicago bounding box.
    """
    query = (
        f"[out:json][timeout:25];"
        f"node[\"railway\"=\"station\"][\"network\"~\"Metra\",i]"
        f"({CHICAGO_LAT_MIN},{CHICAGO_LNG_MIN},{CHICAGO_LAT_MAX},{CHICAGO_LNG_MAX});"
        f"out;"
    )
    url = "https://overpass-api.de/api/interpreter"
    data = urllib.parse.urlencode({"data": query}).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"User-Agent": "use-table-reform/1.0 (StrongTownsChicago data prep)"},
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        result = json.loads(r.read())

    elements = result.get("elements", [])
    stations = []
    for elem in elements:
        lat = elem.get("lat")
        lng = elem.get("lon")
        name = elem.get("tags", {}).get("name", f"Metra Station {elem.get('id', '')}")
        if lat is None or lng is None:
            continue
        stations.append(
            {
                "name": name,
                "lng": lng,
                "lat": lat,
                "type": "rail",
                "source": "metra",
            }
        )

    print(f"  Metra rail: {len(stations)} stations within Chicago bbox (via OSM)")
    return stations


# ---------------------------------------------------------------------------
# CCO qualifying bus corridor stops (from local CTA GTFS)
# ---------------------------------------------------------------------------


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Approximate haversine distance in meters between two points."""
    R = 6_371_000  # Earth radius in meters
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.asin(math.sqrt(a))


def load_cta_bus_stops() -> list[dict]:
    """
    Load CCO qualifying bus corridor stops from CTA GTFS.

    Requires:
      scripts/cta_bus_stops.txt  — stops.txt from CTA GTFS
      scripts/cta_trips.txt      — trips.txt from CTA GTFS
      scripts/cta_stop_times.txt — stop_times.txt from CTA GTFS

    Samples one stop per ~500m interval per route to keep JSON compact.
    """
    for path in [CTA_BUS_STOPS_PATH, CTA_BUS_TRIPS_PATH, CTA_BUS_STOP_TIMES_PATH]:
        if not os.path.exists(path):
            print(
                f"  CTA bus: {path} not found — skipping bus corridor stops.\n"
                "  Download CTA GTFS from https://www.transitchicago.com/downloads/sch_data/\n"
                "  and extract stops.txt → scripts/cta_bus_stops.txt,\n"
                "              trips.txt → scripts/cta_trips.txt,\n"
                "         stop_times.txt → scripts/cta_stop_times.txt"
            )
            return []

    # Load all stops within Chicago bbox
    print("  CTA bus: loading stops...")
    all_stops: dict[str, dict] = {}
    with open(CTA_BUS_STOPS_PATH, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            try:
                lat = float(row["stop_lat"])
                lng = float(row["stop_lon"])
            except (KeyError, ValueError):
                continue
            if not (
                CHICAGO_LAT_MIN <= lat <= CHICAGO_LAT_MAX
                and CHICAGO_LNG_MIN <= lng <= CHICAGO_LNG_MAX
            ):
                continue
            all_stops[row["stop_id"]] = {
                "name": row.get("stop_name", row["stop_id"]),
                "lat": lat,
                "lng": lng,
            }
    print(f"  CTA bus: {len(all_stops)} stops in Chicago bbox")

    # Load trips → map trip_id → route_id (qualifying routes only)
    print("  CTA bus: loading trips...")
    trip_to_route: dict[str, str] = {}
    with open(CTA_BUS_TRIPS_PATH, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            route_id = str(row.get("route_id", "")).strip()
            if route_id in CCO_QUALIFYING_ROUTES:
                trip_to_route[row["trip_id"]] = route_id

    print(f"  CTA bus: {len(trip_to_route)} trips for qualifying routes")

    # Load stop_times → collect stop_ids per qualifying route
    print("  CTA bus: loading stop_times (large file — may take a moment)...")
    route_stops: dict[str, set[str]] = {r: set() for r in CCO_QUALIFYING_ROUTES}
    with open(CTA_BUS_STOP_TIMES_PATH, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            trip_id = row.get("trip_id", "")
            route_id = trip_to_route.get(trip_id)
            if route_id and row["stop_id"] in all_stops:
                route_stops[route_id].add(row["stop_id"])

    # Sample stops per route at ~BUS_SAMPLE_INTERVAL_M spacing
    sampled: list[dict] = []
    for route_id, stop_ids in sorted(route_stops.items()):
        if not stop_ids:
            continue
        # Sort by lat/lng for consistent geographic ordering
        route_stop_list = sorted(
            [all_stops[sid] for sid in stop_ids], key=lambda s: (s["lat"], s["lng"])
        )
        last_lat: float | None = None
        last_lng: float | None = None
        for stop in route_stop_list:
            if last_lat is None or _haversine_m(
                last_lat, last_lng, stop["lat"], stop["lng"]
            ) >= BUS_SAMPLE_INTERVAL_M:
                sampled.append(
                    {
                        "name": f"Bus {route_id} / {stop['name']}",
                        "lng": stop["lng"],
                        "lat": stop["lat"],
                        "type": "bus",
                        "route": route_id,
                    }
                )
                last_lat, last_lng = stop["lat"], stop["lng"]

    routes_with_stops = sum(1 for s in route_stops.values() if s)
    print(
        f"  CTA bus: {len(sampled)} sampled stops across "
        f"{routes_with_stops} qualifying routes"
    )
    return sampled


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    print("Building transit-stations.json...")

    stations: list[dict] = []

    print("\nFetching CTA rail stations from Chicago Data Portal...")
    try:
        cta_rail = fetch_cta_rail_stations()
        stations.extend(cta_rail)
    except Exception as e:
        print(f"  ERROR fetching CTA rail stations: {e}", file=sys.stderr)

    print("\nFetching Metra stations from OpenStreetMap...")
    try:
        metra = fetch_metra_stations()
        stations.extend(metra)
    except Exception as e:
        print(f"  ERROR fetching Metra stations: {e}", file=sys.stderr)

    print("\nLoading CTA qualifying bus corridor stops from local GTFS...")
    try:
        bus_stops = load_cta_bus_stops()
        stations.extend(bus_stops)
    except Exception as e:
        print(f"  ERROR loading CTA bus stops: {e}", file=sys.stderr)

    if not stations:
        print("ERROR: No stations loaded. Aborting.", file=sys.stderr)
        sys.exit(1)

    output_path = os.path.abspath(OUTPUT_PATH)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(stations, f, indent=2)

    rail_count = sum(1 for s in stations if s["type"] == "rail")
    bus_count = sum(1 for s in stations if s["type"] == "bus")
    print(
        f"\nWrote {len(stations)} stations to {output_path}"
        f"\n  Rail: {rail_count} (CTA + Metra), Bus corridor: {bus_count}"
    )


if __name__ == "__main__":
    main()
