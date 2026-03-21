/**
 * spatial.js — Zoning and ward data fetching, and Turf.js point-in-polygon spatial queries.
 *
 * Single responsibility: load zoning and ward GeoJSON datasets, then answer
 * "what zone/ward is this point in?" queries using browser-side Turf.js.
 *
 * Both fetch functions are designed to be called once on page load and the
 * results cached in app.js. The query functions (findZoneClass, findWard)
 * are pure — they take data and return results, making them fully testable.
 *
 * Data sources:
 * - Zoning: Chicago ArcGIS REST API (gisapps.chicago.gov) — Zoning Boundaries layer.
 *   The Socrata dataset 7cve-jgbp previously used here now returns null geometries.
 * - Wards: Chicago Data Portal Socrata (p293-wvbd) — still valid.
 */

// ArcGIS REST API — Chicago Zoning Boundaries (Layer 1)
// Returns real polygon geometry with ZONE_CLASS property.
// Max 2000 records per request; 14,874 total features requires pagination.
const ZONING_ARCGIS_BASE =
  "https://gisapps.chicago.gov/arcgis/rest/services/ExternalApps/Zoning/MapServer/1/query";
const ZONING_PAGE_SIZE = 2000;
const ZONING_TOTAL_FEATURES = 15000; // upper bound; actual ~14,874

// Ward boundaries — Socrata (geometry only; no alderperson data)
const WARD_GEOJSON_URL_PRIMARY =
  "https://data.cityofchicago.org/resource/p293-wvbd.geojson";
const WARD_ARCGIS_URL =
  "https://gisapps.chicago.gov/arcgis/rest/services/ExternalApps/Zoning/MapServer/6/query?where=1%3D1&outFields=ward,alderman&outSR=4326&f=geojson&resultRecordCount=60";

/**
 * Static alderperson lookup — current 2023–2027 term.
 * URL pattern: chicago.gov/city/en/about/wards/{NN}.html (zero-padded).
 * Source: Chicago City Clerk + chicago.gov/city/en/about/wards.html
 */
const WARD_INFO = {
   1: { alderperson: "Daniel La Spata",         url: "https://www.chicago.gov/city/en/about/wards/01.html" },
   2: { alderperson: "Brian Hopkins",            url: "https://www.chicago.gov/city/en/about/wards/02.html" },
   3: { alderperson: "Pat Dowell",               url: "https://www.chicago.gov/city/en/about/wards/03.html" },
   4: { alderperson: "Lamont J. Robinson",       url: "https://www.chicago.gov/city/en/about/wards/04.html" },
   5: { alderperson: "Desmon C. Yancy",          url: "https://www.chicago.gov/city/en/about/wards/05.html" },
   6: { alderperson: "William E. Hall",          url: "https://www.chicago.gov/city/en/about/wards/06.html" },
   7: { alderperson: "Gregory I. Mitchell",      url: "https://www.chicago.gov/city/en/about/wards/07.html" },
   8: { alderperson: "Michelle A. Harris",       url: "https://www.chicago.gov/city/en/about/wards/08.html" },
   9: { alderperson: "Anthony Beale",            url: "https://www.chicago.gov/city/en/about/wards/09.html" },
  10: { alderperson: "Peter Chico",              url: "https://www.chicago.gov/city/en/about/wards/10.html" },
  11: { alderperson: "Nicole T. Lee",            url: "https://www.chicago.gov/city/en/about/wards/11.html" },
  12: { alderperson: "Julia M. Ramirez",         url: "https://www.chicago.gov/city/en/about/wards/12.html" },
  13: { alderperson: "Marty Quinn",              url: "https://www.chicago.gov/city/en/about/wards/13.html" },
  14: { alderperson: "Jeylu B. Gutierrez",       url: "https://www.chicago.gov/city/en/about/wards/14.html" },
  15: { alderperson: "Raymond A. Lopez",         url: "https://www.chicago.gov/city/en/about/wards/15.html" },
  16: { alderperson: "Stephanie D. Coleman",     url: "https://www.chicago.gov/city/en/about/wards/16.html" },
  17: { alderperson: "David H. Moore",           url: "https://www.chicago.gov/city/en/about/wards/17.html" },
  18: { alderperson: "Derrick G. Curtis",        url: "https://www.chicago.gov/city/en/about/wards/18.html" },
  19: { alderperson: "Matthew J. O'Shea",        url: "https://www.chicago.gov/city/en/about/wards/19.html" },
  20: { alderperson: "Jeanette B. Taylor",       url: "https://www.chicago.gov/city/en/about/wards/20.html" },
  21: { alderperson: "Ronnie L. Mosley",         url: "https://www.chicago.gov/city/en/about/wards/21.html" },
  22: { alderperson: "Michael D. Rodriguez",     url: "https://www.chicago.gov/city/en/about/wards/22.html" },
  23: { alderperson: "Silvana Tabares",          url: "https://www.chicago.gov/city/en/about/wards/23.html" },
  24: { alderperson: "Monique L. Scott",         url: "https://www.chicago.gov/city/en/about/wards/24.html" },
  25: { alderperson: "Byron Sigcho-Lopez",       url: "https://www.chicago.gov/city/en/about/wards/25.html" },
  26: { alderperson: "Jessica L. Fuentes",       url: "https://www.chicago.gov/city/en/about/wards/26.html" },
  27: { alderperson: "Walter R. Burnett",        url: "https://www.chicago.gov/city/en/about/wards/27.html" },
  28: { alderperson: "Jason C. Ervin",           url: "https://www.chicago.gov/city/en/about/wards/28.html" },
  29: { alderperson: "Chris Taliaferro",         url: "https://www.chicago.gov/city/en/about/wards/29.html" },
  30: { alderperson: "Ruth Cruz",                url: "https://www.chicago.gov/city/en/about/wards/30.html" },
  31: { alderperson: "Felix Cardona, Jr.",       url: "https://www.chicago.gov/city/en/about/wards/31.html" },
  32: { alderperson: "Scott Waguespack",         url: "https://www.chicago.gov/city/en/about/wards/32.html" },
  33: { alderperson: "Rossana Rodriguez Sanchez",url: "https://www.chicago.gov/city/en/about/wards/33.html" },
  34: { alderperson: "William Conway",           url: "https://www.chicago.gov/city/en/about/wards/34.html" },
  35: { alderperson: "Anthony J. Quezada",       url: "https://www.chicago.gov/city/en/about/wards/35.html" },
  36: { alderperson: "Gilbert Villegas",         url: "https://www.chicago.gov/city/en/about/wards/36.html" },
  37: { alderperson: "Emma Mitts",               url: "https://www.chicago.gov/city/en/about/wards/37.html" },
  38: { alderperson: "Nicholas Sposato",         url: "https://www.chicago.gov/city/en/about/wards/38.html" },
  39: { alderperson: "Samantha Nugent",          url: "https://www.chicago.gov/city/en/about/wards/39.html" },
  40: { alderperson: "Andre Vasquez, Jr.",       url: "https://www.chicago.gov/city/en/about/wards/40.html" },
  41: { alderperson: "Anthony V. Napolitano",    url: "https://www.chicago.gov/city/en/about/wards/41.html" },
  42: { alderperson: "Brendan Reilly",           url: "https://www.chicago.gov/city/en/about/wards/42.html" },
  43: { alderperson: "Timmy Knudsen",            url: "https://www.chicago.gov/city/en/about/wards/43.html" },
  44: { alderperson: "Bennett R. Lawson",        url: "https://www.chicago.gov/city/en/about/wards/44.html" },
  45: { alderperson: "James M. Gardiner",        url: "https://www.chicago.gov/city/en/about/wards/45.html" },
  46: { alderperson: "Angela Clay",              url: "https://www.chicago.gov/city/en/about/wards/46.html" },
  47: { alderperson: "Matthew J. Martin",        url: "https://www.chicago.gov/city/en/about/wards/47.html" },
  48: { alderperson: "Leni Manaa-Hoppenworth",   url: "https://www.chicago.gov/city/en/about/wards/48.html" },
  49: { alderperson: "Maria E. Hadden",          url: "https://www.chicago.gov/city/en/about/wards/49.html" },
  50: { alderperson: "Debra L. Silverstein",     url: "https://www.chicago.gov/city/en/about/wards/50.html" },
};

/**
 * Build the URL for one paginated page of the ArcGIS zoning layer.
 *
 * @param {number} offset - Feature offset (0-based).
 * @returns {string}
 */
function buildZoningPageUrl(offset) {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "ZONE_CLASS",
    outSR: "4326",
    f: "geojson",
    resultRecordCount: String(ZONING_PAGE_SIZE),
    resultOffset: String(offset),
  });
  return `${ZONING_ARCGIS_BASE}?${params}`;
}

/**
 * Fetch one page of zoning GeoJSON from the ArcGIS REST API.
 *
 * @param {number} offset
 * @returns {Promise<GeoJSON.Feature[]>}
 */
async function fetchZoningPage(offset) {
  const response = await fetch(buildZoningPageUrl(offset));
  if (!response.ok) {
    throw new Error(`Zoning page fetch failed at offset ${offset}: HTTP ${response.status}`);
  }
  const data = await response.json();
  return data.features || [];
}

/**
 * Fetch all Chicago zoning district polygons from the ArcGIS REST API.
 * Fetches pages in parallel (8 requests × 2000 features = 16,000 slots for ~14,874 actual).
 *
 * Properties returned: { ZONE_CLASS: "B1-1" }
 * Normalized to lowercase key "zone_class" for consistency with the rest of the app.
 *
 * @returns {Promise<GeoJSON.FeatureCollection>}
 * @throws {Error} If any page request fails.
 */
export async function fetchZoningGeoJSON() {
  const offsets = [];
  for (let offset = 0; offset < ZONING_TOTAL_FEATURES; offset += ZONING_PAGE_SIZE) {
    offsets.push(offset);
  }

  const pages = await Promise.all(offsets.map(fetchZoningPage));
  const allFeatures = pages.flat();

  // Normalize ZONE_CLASS → zone_class for consistency with spatial query functions
  const normalizedFeatures = allFeatures
    .filter((f) => f.geometry !== null)
    .map((f) => ({
      ...f,
      properties: {
        zone_class: f.properties && (f.properties.ZONE_CLASS || f.properties.zone_class) || "",
      },
    }));

  return {
    type: "FeatureCollection",
    features: normalizedFeatures,
  };
}

/**
 * Fetch Chicago ward boundaries GeoJSON.
 * Tries Socrata first; falls back to the ArcGIS ward layer.
 *
 * @returns {Promise<GeoJSON.FeatureCollection>}
 * @throws {Error} If both sources fail.
 */
export async function fetchWardGeoJSON() {
  try {
    const response = await fetch(WARD_GEOJSON_URL_PRIMARY);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    // Validate that we got real features with geometry
    if (!data.features || data.features.length === 0 || data.features[0].geometry === null) {
      throw new Error("Socrata ward data has null geometries");
    }
    return data;
  } catch (primaryError) {
    console.warn("Ward GeoJSON Socrata source failed, trying ArcGIS fallback:", primaryError);
    const response = await fetch(WARD_ARCGIS_URL);
    if (!response.ok) {
      throw new Error(`Ward GeoJSON fetch failed on both sources: HTTP ${response.status}`);
    }
    return response.json();
  }
}

/**
 * Return a bounding box [west, south, east, north] for a GeoJSON feature,
 * or null if the geometry lacks coordinates.
 *
 * Uses turf.bbox which is bundled globally via the Turf CDN script.
 * When running in Node (Vitest), callers import turf directly.
 *
 * @param {GeoJSON.Feature} feature
 * @returns {[number,number,number,number] | null}
 */
function getFeatureBbox(feature) {
  try {
    // turf is loaded as a global in the browser; in tests it's passed via the
    // turfLib parameter to allow dependency injection.
    return turf.bbox(feature);
  } catch {
    return null;
  }
}

/**
 * Test whether a bounding box [west, south, east, north] contains a point [lng, lat].
 *
 * @param {[number,number,number,number]} bbox
 * @param {[number,number]} point - [longitude, latitude]
 * @returns {boolean}
 */
function bboxContainsPoint(bbox, point) {
  const [west, south, east, north] = bbox;
  const [lng, lat] = point;
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

/**
 * Find the zone_class of the zoning district containing the given point.
 *
 * Uses a bounding-box prefilter to skip ~99% of features before running
 * the more expensive booleanPointInPolygon check.
 *
 * @param {[number,number]} lngLat - [longitude, latitude]
 * @param {GeoJSON.FeatureCollection} zoningGeoJSON
 * @param {{ booleanPointInPolygon?: Function, bbox?: Function, point?: Function }} [turfLib]
 *   Turf functions to use — injected in tests, defaults to global `turf` in browser.
 * @returns {string | null} Normalized zone_class, or null if no match found.
 */
export function findZoneClass(lngLat, zoningGeoJSON, turfLib) {
  const pipFn = (turfLib && turfLib.booleanPointInPolygon)
    ? turfLib.booleanPointInPolygon
    : turf.booleanPointInPolygon;
  const bboxFn = (turfLib && turfLib.bbox)
    ? turfLib.bbox
    : turf.bbox;
  const pointFn = (turfLib && turfLib.point)
    ? turfLib.point
    : turf.point;

  const turfPoint = pointFn(lngLat);

  for (const feature of zoningGeoJSON.features) {
    // Bounding box prefilter
    let bbox;
    try {
      bbox = bboxFn(feature);
    } catch {
      continue;
    }

    if (!bboxContainsPoint(bbox, lngLat)) {
      continue;
    }

    // Full polygon test on candidates that pass the bbox check
    if (pipFn(turfPoint, feature)) {
      const rawZoneClass = feature.properties && feature.properties.zone_class;
      if (!rawZoneClass) return null;
      return String(rawZoneClass).trim().toUpperCase();
    }
  }

  return null;
}

/**
 * Find the ward number and alderperson for the given point.
 *
 * @param {[number,number]} lngLat - [longitude, latitude]
 * @param {GeoJSON.FeatureCollection} wardGeoJSON
 * @param {{ booleanPointInPolygon?: Function, bbox?: Function, point?: Function }} [turfLib]
 * @returns {{ ward: number, alderperson: string, url: string } | null}
 */
export function findWard(lngLat, wardGeoJSON, turfLib) {
  const pipFn = (turfLib && turfLib.booleanPointInPolygon)
    ? turfLib.booleanPointInPolygon
    : turf.booleanPointInPolygon;
  const bboxFn = (turfLib && turfLib.bbox)
    ? turfLib.bbox
    : turf.bbox;
  const pointFn = (turfLib && turfLib.point)
    ? turfLib.point
    : turf.point;

  const turfPoint = pointFn(lngLat);

  for (const feature of wardGeoJSON.features) {
    let bbox;
    try {
      bbox = bboxFn(feature);
    } catch {
      continue;
    }

    if (!bboxContainsPoint(bbox, lngLat)) {
      continue;
    }

    if (pipFn(turfPoint, feature)) {
      const props = feature.properties || {};
      const wardNumber = Number(props.ward || props.Ward || 0);
      const info = WARD_INFO[wardNumber];

      return {
        ward: wardNumber,
        alderperson: info ? info.alderperson : `Ward ${wardNumber} Alderperson`,
        url: info
          ? info.url
          : `https://www.chicago.gov/city/en/about/wards/${String(wardNumber).padStart(2, "0")}.html`,
      };
    }
  }

  return null;
}
