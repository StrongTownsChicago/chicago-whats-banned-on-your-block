#!/usr/bin/env bash
# scripts/07_build_zoning_tiles.sh — Convert zoning GeoJSON to PMTiles.
#
# Requires: tippecanoe (https://github.com/felt/tippecanoe)
# Input:  data/zoning.geojson  (produced by scripts/06_fetch_zoning_geojson.py)
# Output: data/zoning.pmtiles
#
# Usage:
#   bash scripts/07_build_zoning_tiles.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INPUT="${SCRIPT_DIR}/../data/zoning.geojson"
OUTPUT="${SCRIPT_DIR}/../data/zoning.pmtiles"

if [ ! -f "$INPUT" ]; then
  echo "ERROR: $INPUT not found. Run scripts/06_fetch_zoning_geojson.py first."
  exit 1
fi

echo "Building PMTiles from $INPUT ..."

tippecanoe \
  -o "$OUTPUT" \
  -Z 9 \
  -z 16 \
  -l zoning \
  --simplify-only-low-zooms \
  --no-simplification-of-shared-nodes \
  --detect-shared-borders \
  --coalesce-densest-as-needed \
  --force \
  "$INPUT"

SIZE=$(stat --format="%s" "$OUTPUT" 2>/dev/null || stat -f "%z" "$OUTPUT" 2>/dev/null)
SIZE_MB=$(echo "scale=1; $SIZE / 1048576" | bc)

echo "Output: $OUTPUT ($SIZE_MB MB)"

if [ "$(echo "$SIZE_MB <= 20" | bc)" -eq 1 ]; then
  echo "Size is under 20 MB — safe to commit to git and serve from Cloudflare Pages."
else
  echo "WARNING: Size exceeds 20 MB. Upload to Cloudflare R2 instead of committing."
  echo "Update ZONING_TILES_URL in js/map.js to the R2 HTTPS URL."
fi
