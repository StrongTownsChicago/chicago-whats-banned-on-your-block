# What's Banned on Your Block?

A Chicago zoning lookup tool built by [Strong Towns Chicago](https://www.strongtownschicago.org/). Enter an address and it shows what the current zoning code prohibits, restricts to a special use hearing, or allows by right on that parcel.

## What it does

Chicago's zoning ordinance assigns every parcel to a district. Each district has a use table listing what activities are permitted, which require a Zoning Board of Appeals hearing, and which are banned outright. Uses not listed at all are also banned by default ([§17-3-0204](https://codelibrary.amlegal.com/codes/chicago/latest/chicagozoning_il/0-0-0-49164)).

This tool reads that use table for various categories (housing types, food and retail, personal services, childcare, community uses, and lodging) and displays results for any Chicago address. The about page at `about.html` has background, data sources, and reform context.

## How it works

The app is fully static. No backend, no database.

| Module            | Responsibility                                         |
| ----------------- | ------------------------------------------------------ |
| `js/app.js`       | Event wiring, DOM updates, orchestration               |
| `js/map.js`       | MapLibre initialization and zoning layer               |
| `js/spatial.js`   | Socrata fetch and Turf.js point-in-polygon lookup      |
| `js/geocode.js`   | Mapbox Geocoding API wrapper                           |
| `js/use-table.js` | Use table fetch, lookup, and permission classification |

Runtime data sources:

- `data/use-table.json` — bundled, built by the Python pipeline
- Socrata `7cve-jgbp` — Chicago zoning district polygons
- Socrata `p293-wvbd` — Chicago ward boundaries
- Mapbox Geocoding API v5 — address to lat/lon

## Data pipeline

The use table data is extracted from the Chicago Municipal Code (Title 17) and processed into `data/use-table.json`. The pipeline lives in `scripts/`:

```
scripts/01_fetch_ordinance.py   # fetch use tables from the ordinance
scripts/03_curate_and_merge.py  # normalize and merge into a single JSON
scripts/04_validate.py          # validate permission codes and structure
```

Run it with `uv run python scripts/01_fetch_ordinance.py` and so on. The raw HTML from the ordinance is not tracked in git; run the pipeline to regenerate it.

## Development

See [SETUP.md](SETUP.md) for full instructions. The short version:

```bash
cp js/config.js.example js/config.js   # add your Mapbox token
python -m http.server 8000             # serve locally
npm install && npm test                # JS unit tests (31)
uv run pytest                          # Python pipeline tests
```

## Deployment

Deployed on Cloudflare Pages. Set `MAPBOX_TOKEN` as an environment variable in the Pages dashboard, use `npm run build` as the build command, and `/` as the build output directory. The `_headers` file is picked up automatically by Cloudflare.

Full deployment checklist is in [SETUP.md](SETUP.md).

## Contributing

The use table covers the categories most relevant to Strong Towns Chicago's reform agenda. If you want to add categories, extend `scripts/constants.py` (`ADVOCACY_USES`) and run the pipeline. The JS unit tests in `tests/js/` cover the permission classification logic and should be updated alongside any use table changes.
