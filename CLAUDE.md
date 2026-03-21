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
```

Note: Step 02 (`02_llm_clean.py`) is semi-manual — the Chicago Code Library is a JS SPA that requires a headless browser to render. The committed `cleaned/cleaned_*.json` files are the authoritative outputs of that step.

### Deployment

Hosted on Cloudflare Pages. The `main` branch auto-deploys. Build command is `npm run build`, which generates `js/config.js` from the `MAPBOX_TOKEN` environment variable set in the Pages dashboard.

## Architecture

### Data Flow

```
User enters address
  → geocode.js (Mapbox Geocoding API v5) → [lon, lat]
  → spatial.js (Turf.js point-in-polygon, ArcGIS/Socrata APIs) → zoning district (e.g. "B1-2") + ward
  → use-table.js (bundled data/use-table.json) → permission codes for 21 tracked uses
  → app.js updates DOM with banned/special-use/permitted results
```

`app.js` is the controller that wires events and orchestrates the other modules. The other JS modules are stateless and export pure functions.

### Key Data Structures

**`data/use-table.json`** — the central data file, built by the Python pipeline:
```json
{ "B1-1": { "daycare_center": "P", "shelter": "—", "brewery": "S" }, ... }
```
- 37 districts × 21 use slugs
- Permission codes: `"P"` (permitted by right), `"S"` (special use hearing), `"—"` (banned), `"P/S"`, `"P/-"`

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
| Mapbox Geocoding API v5 | Address → coordinates |

### Critical Sync Requirement

The 21 use slugs in `scripts/constants.py::ADVOCACY_USES` must stay in sync with `USE_DISPLAY_LABELS` and `SLUG_CATEGORY` in `js/use-table.js`. These are the only two places that enumerate uses.

### Alderperson Data

Hard-coded in `spatial.js` as a static dict of 50 wards → `{ name, url }`. Updated manually after each election cycle (current data: 2023–2027 term).

### Tests

- **JavaScript** (`tests/js/*.test.js`): 3 files, 31 tests via Vitest (Node environment)
- **Python** (`tests/test_*.py`): 4 files via pytest with fixtures in `tests/fixtures/`
