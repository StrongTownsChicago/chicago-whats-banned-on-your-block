/**
 * map.js — MapLibre GL JS initialization and layer management.
 *
 * Single responsibility: create and manage the map instance, zoning layers,
 * hover popups, and the address pin marker.
 */

// Carto Positron basemap — no API key required
const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// Chicago bounding box: [west, south, east, north]
const CHICAGO_BOUNDS = [-87.94, 41.64, -87.52, 42.03];

// Initial view: Chicago center
const CHICAGO_CENTER = [-87.63, 41.86];
const INITIAL_ZOOM = 11;

// Zone family color map (keyed on first letter of zone_class)
const ZONE_FAMILY_COLORS = {
  B: "#3b82f6", // blue  — Business
  C: "#f97316", // orange — Commercial
  M: "#8b5cf6", // purple — Manufacturing
  R: "#22c55e", // green  — Residential
};
const ZONE_FALLBACK_COLOR = "#94a3b8"; // grey for unknown/PD

let currentMarker = null;
let hoverPopup = null;

/**
 * Initialize the MapLibre map in the given container element.
 *
 * @param {string} containerId - ID of the DOM element to render the map into.
 * @returns {maplibregl.Map} The initialized map instance.
 */
export function initMap(containerId) {
  const map = new maplibregl.Map({
    container: containerId,
    style: BASEMAP_STYLE,
    center: CHICAGO_CENTER,
    zoom: INITIAL_ZOOM,
    maxBounds: [
      [CHICAGO_BOUNDS[0] - 0.5, CHICAGO_BOUNDS[1] - 0.5],
      [CHICAGO_BOUNDS[2] + 0.5, CHICAGO_BOUNDS[3] + 0.5],
    ],
    attributionControl: false,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(
    new maplibregl.AttributionControl({ compact: true }),
    "bottom-right"
  );

  hoverPopup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 8,
  });

  return map;
}

/**
 * Return the fill color expression for MapLibre based on zone_class first letter.
 *
 * @returns {Array} MapLibre expression for match-based coloring.
 */
function buildZoneColorExpression() {
  return [
    "match",
    ["slice", ["coalesce", ["get", "zone_class"], "?"], 0, 1],
    "B", ZONE_FAMILY_COLORS.B,
    "C", ZONE_FAMILY_COLORS.C,
    "M", ZONE_FAMILY_COLORS.M,
    "R", ZONE_FAMILY_COLORS.R,
    ZONE_FALLBACK_COLOR,
  ];
}

/**
 * Derive a human-readable zone type label from a zone_class string.
 *
 * @param {string} zoneClass
 * @returns {string}
 */
function describeZoneFamily(zoneClass) {
  const letter = (zoneClass || "").charAt(0).toUpperCase();
  const labels = {
    B: "Business district",
    C: "Commercial district",
    M: "Manufacturing district",
    R: "Residential district",
  };
  return labels[letter] || "Zoning district";
}

/**
 * Add the Chicago zoning GeoJSON as a fill layer with hover interaction.
 *
 * @param {maplibregl.Map} map
 * @param {GeoJSON.FeatureCollection} geojson - The zoning GeoJSON from Socrata.
 */
export function addZoningLayer(map, geojson) {
  if (map.getSource("zoning")) {
    map.getSource("zoning").setData(geojson);
    return;
  }

  map.addSource("zoning", {
    type: "geojson",
    data: geojson,
  });

  // Fill layer: semi-transparent, colored by zone family
  map.addLayer({
    id: "zoning-fill",
    type: "fill",
    source: "zoning",
    paint: {
      "fill-color": buildZoneColorExpression(),
      "fill-opacity": 0.3,
    },
  });

  // Outline layer: slightly more opaque at zone boundaries
  map.addLayer({
    id: "zoning-outline",
    type: "line",
    source: "zoning",
    paint: {
      "line-color": buildZoneColorExpression(),
      "line-opacity": 0.5,
      "line-width": 0.5,
    },
  });

  // Hover fill — invisible by default, highlighted on hover
  map.addLayer({
    id: "zoning-hover",
    type: "fill",
    source: "zoning",
    paint: {
      "fill-color": buildZoneColorExpression(),
      "fill-opacity": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        0.45,
        0,
      ],
    },
  });

  // Mousemove: show popup with zone_class info
  map.on("mousemove", "zoning-hover", (event) => {
    if (!event.features.length) return;

    map.getCanvas().style.cursor = "pointer";

    const feature = event.features[0];
    const zoneClass = (feature.properties.zone_class || "").trim();
    const familyLabel = describeZoneFamily(zoneClass);

    hoverPopup
      .setLngLat(event.lngLat)
      .setHTML(
        `<div class="zone-popup-label">${zoneClass || "Unknown"}</div>` +
        `<div class="zone-popup-type">${familyLabel}</div>`
      )
      .addTo(map);

    // Update feature hover state for visual highlight
    if (feature.id !== undefined) {
      map.setFeatureState(
        { source: "zoning", id: feature.id },
        { hover: true }
      );
    }
  });

  map.on("mouseleave", "zoning-hover", () => {
    map.getCanvas().style.cursor = "";
    hoverPopup.remove();
  });
}

/**
 * Place or replace the address pin marker on the map and fly to it.
 *
 * @param {maplibregl.Map} map
 * @param {[number, number]} lngLat - [longitude, latitude]
 */
export function placeAddressMarker(map, lngLat) {
  removeAddressMarker();

  currentMarker = new maplibregl.Marker({ color: "#dc2626" })
    .setLngLat(lngLat)
    .addTo(map);

  map.flyTo({
    center: lngLat,
    zoom: Math.max(map.getZoom(), 14),
    speed: 1.4,
    curve: 1.2,
  });
}

/**
 * Remove the address pin marker if one exists.
 */
export function removeAddressMarker() {
  if (currentMarker) {
    currentMarker.remove();
    currentMarker = null;
  }
}
