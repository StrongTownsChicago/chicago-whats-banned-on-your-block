# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"What's Banned on Your Block?" — a fully static web app by Strong Towns Chicago that lets residents look up what land uses are banned, restricted, or permitted on their property under Chicago's zoning code. No backend or database; all spatial queries run in the browser.

## Commands

### Local Development

```bash
# Serve the app locally (required for ES modules to load)
python -m http.server 8000
# Copy the config template and add your Mapbox token
cp js/config.js.example js/config.js
```

### Testing

```bash
# JavaScript tests (Vitest)
npm test

# Python pipeline tests (pytest)
uv run pytest

# Run all tests
npm test && uv run pytest
```

### Data Pipeline (Python)

```bash
uv run python scripts/01_fetch_ordinance.py   # Fetch ordinance tables from Chicago Code Library
uv run python scripts/03_curate_and_merge.py  # Merge cleaned JSONs → data/use-table.json
uv run python scripts/04_validate.py          # Validate and produce validation_report.json
uv run python scripts/05_build_transit_stations.py  # Build data/transit-stations.json (CCO feature)
```

Note: Step 02 (`02_llm_clean.py`) is semi-manual — the Chicago Code Library is a JS SPA that requires a headless browser to render. The committed `cleaned/cleaned_*.json` files are the authoritative outputs of that step.

Note: `scripts/05_build_transit_stations.py` fetches CTA rail stations from the Chicago Data Portal and Metra stations from OpenStreetMap automatically. For CTA bus corridor stops, it requires manually downloaded CTA GTFS files placed at `scripts/cta_bus_stops.txt`, `scripts/cta_trips.txt`, and `scripts/cta_stop_times.txt` (from https://www.transitchicago.com/downloads/sch_data/). The committed `data/transit-stations.json` is the authoritative output.

### Deployment

Hosted on Cloudflare Pages. The `main` branch auto-deploys. Build command is `npm run build`, which generates `js/config.js` from the `MAPBOX_TOKEN` environment variable set in the Pages dashboard.

## Architecture

### Data Flow

```
User enters address
  → geocode.js (Mapbox Geocoding API v5) → [lon, lat]
  → spatial.js (Turf.js point-in-polygon, ArcGIS/Socrata APIs) → zoning district (e.g. "B1-2") + ward
  → use-table.js (bundled data/use-table.json) → permission codes for 21 tracked uses
  → cco.js (Turf.js distance, bundled data/transit-stations.json) → CCO proximity status
  → adu.js + adu-ward-data.js (ward opt-in lookup) → ADU eligibility status
  → app.js updates DOM with banned/special-use/permitted results + policy callouts
```

`app.js` is the controller that wires events and orchestrates the other modules. The other JS modules are stateless and export pure functions.

### Key Data Structures

**`data/use-table.json`** — the central data file, built by the Python pipeline:
```json
{ "B1-1": { "daycare_center": "P", "shelter": "—", "brewery": "S" }, ... }
```
- 37 districts × 21 use slugs
- Permission codes: `"P"` (permitted by right), `"S"` (special use hearing), `"—"` (banned), `"P/S"`, `"P/-"`

**`data/transit-stations.json`** — bundled transit station coordinates for CCO proximity checks:
```json
[
  { "name": "California", "lng": -87.6969, "lat": 41.9219, "type": "rail", "source": "cta" },
  { "name": "Bus 79 / 79th St & Halsted", "lng": -87.644, "lat": 41.750, "type": "bus", "route": "79" }
]
```
- Generated once by `scripts/05_build_transit_stations.py` and committed
- `type: "rail"` → ½ mile threshold; `type: "bus"` → ¼ mile threshold (CCO qualifying corridors)
- Sources: CTA L stops (Chicago Data Portal `8pix-ypme`), Metra (OpenStreetMap), CTA bus (GTFS)

**`scripts/constants.py`** — the authoritative source for:
- `ADVOCACY_USES` — ordered list of 21 use slugs (must match `USE_DISPLAY_LABELS` in `js/use-table.js`)
- `ZONE_TYPE_TO_CLASSES` — maps abbreviated district names to full class lists
- `SECTION_URLS` — Chicago Municipal Code ordinance URLs

### Runtime Data Sources

| Source | What for |
|--------|----------|
| ArcGIS REST API (`gisapps.chicago.gov` Layer 1) | Chicago zoning polygons (14,874 features, paginated in 2,000-record pages) |
| Socrata `p293-wvbd` | Ward boundaries for alderperson lookup |
| `data/use-table.json` (bundled) | Permission rules — never fetched at runtime |
| `data/transit-stations.json` (bundled) | CCO transit proximity check — never fetched at runtime after page load |
| Mapbox Geocoding API v5 | Address → coordinates |

### Critical Sync Requirement

The 21 use slugs in `scripts/constants.py::ADVOCACY_USES` must stay in sync with `USE_DISPLAY_LABELS` and `SLUG_CATEGORY` in `js/use-table.js`. These are the only two places that enumerate uses.

### Alderperson Data

Hard-coded in `spatial.js` as a static dict of 50 wards → `{ name, url }`. Updated manually after each election cycle (current data: 2023–2027 term).

### Tests

- **JavaScript** (`tests/js/*.test.js`): 5 files via Vitest (Node environment). New modules `cco.js` and `adu.js` use `@turf/distance` injected via the `turfLib` pattern (same as `spatial.js`).
- **Python** (`tests/test_*.py`): 4 files via pytest with fixtures in `tests/fixtures/`
