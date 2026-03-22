"""
scripts/06_fetch_zoning_geojson.py — Fetch Chicago zoning polygons from ArcGIS.

Fetches all ~14,874 zoning district polygons from the Chicago ArcGIS REST API
in paginated 2,000-record pages. Normalizes ZONE_CLASS → zone_class, filters
out null geometries, and writes a GeoJSON FeatureCollection to data/zoning.geojson.

Usage:
    uv run python scripts/06_fetch_zoning_geojson.py

Output: data/zoning.geojson
"""

import json
import logging
import os
import sys

import requests

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

OUTPUT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "zoning.geojson"
)

ZONING_ARCGIS_BASE = (
    "https://gisapps.chicago.gov/arcgis/rest/services/ExternalApps/Zoning/MapServer/1/query"
)
PAGE_SIZE = 2000
TOTAL_SLOTS = 15000  # upper bound; actual ~14,874


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def fetch_page(offset: int) -> list[dict]:
    """Fetch one page of zoning features from the ArcGIS REST API."""
    params = {
        "where": "1=1",
        "outFields": "ZONE_CLASS",
        "outSR": "4326",
        "f": "geojson",
        "resultRecordCount": str(PAGE_SIZE),
        "resultOffset": str(offset),
    }
    logging.info("Fetching offset %d ...", offset)
    resp = requests.get(ZONING_ARCGIS_BASE, params=params, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    return data.get("features", [])


def normalize_feature(feature: dict) -> dict | None:
    """Normalize a single feature: rename ZONE_CLASS → zone_class, skip null geometry."""
    if feature.get("geometry") is None:
        return None
    props = feature.get("properties") or {}
    zone_class = props.get("ZONE_CLASS") or props.get("zone_class") or ""
    return {
        **feature,
        "properties": {"zone_class": zone_class},
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    offsets = list(range(0, TOTAL_SLOTS, PAGE_SIZE))
    all_features: list[dict] = []

    for offset in offsets:
        try:
            page = fetch_page(offset)
        except requests.RequestException as exc:
            logging.error("Failed to fetch offset %d: %s", offset, exc)
            sys.exit(1)
        all_features.extend(page)

    logging.info("Fetched %d raw features", len(all_features))

    normalized = []
    for f in all_features:
        result = normalize_feature(f)
        if result is not None:
            normalized.append(result)

    logging.info("Normalized %d features (dropped %d null geometries)",
                 len(normalized), len(all_features) - len(normalized))

    fc = {
        "type": "FeatureCollection",
        "features": normalized,
    }

    with open(OUTPUT_PATH, "w") as fh:
        json.dump(fc, fh)

    size_mb = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)
    logging.info("Wrote %s (%.1f MB, %d features)", OUTPUT_PATH, size_mb, len(normalized))
