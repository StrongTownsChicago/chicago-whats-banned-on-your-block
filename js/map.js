/**
 * map.js — MapLibre GL JS initialization and layer management.
 *
 * Single responsibility: create and manage the map instance, zoning layers
 * (via PMTiles vector tiles), hover popups, and the address pin marker.
 */

// PMTiles protocol — register before any map source uses the pmtiles:// scheme.
// The `pmtiles` global is loaded from the CDN script in index.html.
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

// PMTiles URL for Chicago zoning polygons.
export const ZONING_TILES_URL = "pmtiles://https://zoning-districts-pmtiles.open-advocacy.com/zoning.pmtiles";

// Carto Positron basemap — no API key required
const BASEMAP_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// Chicago bounding box: [west, south, east, north]
const CHICAGO_BOUNDS = [-87.94, 41.64, -87.52, 42.03];

// Initial view: Chicago center
const CHICAGO_CENTER = [-87.63, 41.86];
const INITIAL_ZOOM = 11;

// Zone family color map
const ZONE_FAMILY_COLORS = {
  B: "#3b82f6", // blue         — Business
  C: "#f97316", // orange       — Commercial
  D: "#06b6d4", // cyan         — Downtown (DC, DX, DR, DS)
  M: "#8b5cf6", // purple       — Manufacturing
  PD: "#f59e0b", // amber        — Planned Development
  PMD: "#b45309", // rust/brown   — Planned Manufacturing District
  POS: "#15803d", // forest green — Parks & Open Space
  R: "#22c55e", // green        — Residential
  T: "#ec4899", // pink         — Transit-Served
};
const ZONE_FALLBACK_COLOR = "#64748b"; // slate — truly unknown

// Ordered legend entries: [label, color]
const LEGEND_ENTRIES = [
  ["Residential", ZONE_FAMILY_COLORS.R],
  ["Business", ZONE_FAMILY_COLORS.B],
  ["Commercial", ZONE_FAMILY_COLORS.C],
  ["Downtown", ZONE_FAMILY_COLORS.D],
  ["Manufacturing", ZONE_FAMILY_COLORS.M],
  ["Parks & Open Space", ZONE_FAMILY_COLORS.POS],
  ["Planned Development", ZONE_FAMILY_COLORS.PD],
  ["Planned Manufacturing District", ZONE_FAMILY_COLORS.PMD],
  ["Transit-Served", ZONE_FAMILY_COLORS.T],
];

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

  map.addControl(
    new maplibregl.NavigationControl({ showCompass: false }),
    "top-right",
  );
  map.addControl(
    new maplibregl.AttributionControl({ compact: true }),
    "bottom-right",
  );

  hoverPopup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 8,
  });

  createLegend(map);

  return map;
}

/**
 * Inject a hideable zone-color legend into the map container.
 *
 * @param {maplibregl.Map} map
 */
function createLegend(map) {
  const container = map.getContainer();

  const legend = document.createElement("div");
  legend.className = "map-legend";
  legend.setAttribute("aria-label", "Zone type legend");

  // Header row: title + toggle button
  const header = document.createElement("div");
  header.className = "map-legend__header";

  const title = document.createElement("span");
  title.className = "map-legend__title";
  title.textContent = "Zone types";

  const toggle = document.createElement("button");
  toggle.className = "map-legend__toggle";
  toggle.setAttribute("aria-expanded", "true");
  toggle.setAttribute("aria-controls", "map-legend-body");
  toggle.setAttribute("aria-label", "Hide legend");
  toggle.textContent = "Hide";

  header.appendChild(title);
  header.appendChild(toggle);
  legend.appendChild(header);

  // Body: list of color swatches
  const body = document.createElement("ul");
  body.className = "map-legend__body";
  body.id = "map-legend-body";

  for (const [label, color] of LEGEND_ENTRIES) {
    const item = document.createElement("li");
    item.className = "map-legend__item";

    const swatch = document.createElement("span");
    swatch.className = "map-legend__swatch";
    swatch.style.background = color;
    swatch.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.textContent = label;

    item.appendChild(swatch);
    item.appendChild(text);
    body.appendChild(item);
  }

  legend.appendChild(body);
  container.appendChild(legend);

  // Toggle visibility
  let expanded = true;
  toggle.addEventListener("click", () => {
    expanded = !expanded;
    body.hidden = !expanded;
    toggle.textContent = expanded ? "Hide" : "Show";
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-label", expanded ? "Hide legend" : "Show legend");
  });
}

/**
 * Return the fill color expression for MapLibre based on zone_class first letter.
 *
 * @returns {Array} MapLibre expression for match-based coloring.
 */
function buildZoneColorExpression() {
  const zc = ["coalesce", ["get", "zone_class"], "?"];
  return [
    "case",
    // Check longer prefixes first to avoid POS matching PD's "P"
    ["==", ["slice", zc, 0, 3], "POS"],
    ZONE_FAMILY_COLORS.POS,
    ["==", ["slice", zc, 0, 3], "PMD"],
    ZONE_FAMILY_COLORS.PMD,
    ["==", ["slice", zc, 0, 2], "PD"],
    ZONE_FAMILY_COLORS.PD,
    ["==", ["slice", zc, 0, 1], "B"],
    ZONE_FAMILY_COLORS.B,
    ["==", ["slice", zc, 0, 1], "C"],
    ZONE_FAMILY_COLORS.C,
    ["==", ["slice", zc, 0, 1], "D"],
    ZONE_FAMILY_COLORS.D,
    ["==", ["slice", zc, 0, 1], "M"],
    ZONE_FAMILY_COLORS.M,
    ["==", ["slice", zc, 0, 1], "R"],
    ZONE_FAMILY_COLORS.R,
    ["==", ["slice", zc, 0, 1], "T"],
    ZONE_FAMILY_COLORS.T,
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
  const zc = (zoneClass || "").trim().toUpperCase();
  if (zc.startsWith("POS")) return "Parks & Open Space";
  if (zc.startsWith("PMD")) return "Planned Manufacturing District";
  if (zc.startsWith("PD")) return "Planned Development";
  const labels = {
    B: "Business district",
    C: "Commercial district",
    D: "Downtown district",
    M: "Manufacturing district",
    R: "Residential district",
    T: "Transit-Served district",
  };
  return labels[letter] || "Zoning district";
}

/**
 * Add Chicago zoning polygons from a PMTiles vector tile source.
 *
 * @param {maplibregl.Map} map
 * @param {string} tilesUrl - PMTiles URL (e.g. "pmtiles:///data/zoning.pmtiles").
 */
export function addZoningLayer(map, tilesUrl) {
  if (map.getSource("zoning")) {
    return;
  }

  map.addSource("zoning", {
    type: "vector",
    url: tilesUrl,
  });

  // Fill layer: semi-transparent, colored by zone family
  map.addLayer({
    id: "zoning-fill",
    type: "fill",
    source: "zoning",
    "source-layer": "zoning",
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
    "source-layer": "zoning",
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
    "source-layer": "zoning",
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
          `<div class="zone-popup-type">${familyLabel}</div>`,
      )
      .addTo(map);

    // Update feature hover state for visual highlight
    if (feature.id !== undefined) {
      map.setFeatureState(
        { source: "zoning", id: feature.id },
        { hover: true },
      );
    }
  });

  map.on("mouseleave", "zoning-hover", () => {
    map.getCanvas().style.cursor = "";
    hoverPopup.remove();
  });
}

/**
 * Register a callback for map clicks anywhere on the canvas.
 * The callback receives a [longitude, latitude] array.
 *
 * @param {maplibregl.Map} map
 * @param {function([number, number]): void} callback
 */
export function registerMapClickHandler(map, callback) {
  map.on("click", (event) => {
    callback([event.lngLat.lng, event.lngLat.lat]);
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
