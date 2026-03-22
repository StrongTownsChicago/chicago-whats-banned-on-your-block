/**
 * spatial.js — Ward data fetching, Turf.js ward PIP queries, and ArcGIS zone class lookup.
 *
 * Responsibilities:
 * - Fetch ward GeoJSON and answer "what ward is this point in?" via Turf.js PIP.
 * - Answer "what zone class is this coordinate in?" via a single ArcGIS point query.
 *
 * Zone class lookup was moved from client-side Turf.js PIP (over ~14,874 polygons)
 * to a single ArcGIS point query per lookup (~400ms). Map rendering of zoning
 * polygons is now handled by PMTiles in map.js.
 *
 * Data sources:
 * - Zoning: Chicago ArcGIS REST API (gisapps.chicago.gov) — single point query.
 * - Wards: Chicago Data Portal Socrata (p293-wvbd) — still valid.
 */

// ArcGIS REST API — Chicago Zoning Boundaries (Layer 1)
// Used for single-point zone class queries.
const ZONING_ARCGIS_BASE =
  "https://gisapps.chicago.gov/arcgis/rest/services/ExternalApps/Zoning/MapServer/1/query";

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
 * Look up the zone class for a single coordinate via the ArcGIS REST API.
 *
 * Sends a point query to the same ArcGIS zoning layer previously used for
 * bulk polygon fetches. Returns the normalized zone class string (trimmed,
 * uppercased) or null if the point is outside all zoning polygons.
 *
 * @param {[number,number]} lngLat - [longitude, latitude]
 * @returns {Promise<string | null>} Normalized zone class, or null if no match.
 * @throws {Error} On HTTP error (non-200 response).
 */
export async function fetchZoneClass(lngLat) {
  const [lng, lat] = lngLat;
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    spatialRel: "esriSpatialRelIntersects",
    inSR: "4326",
    outFields: "ZONE_CLASS",
    f: "json",
  });
  const resp = await fetch(`${ZONING_ARCGIS_BASE}?${params}`);
  if (!resp.ok) throw new Error(`Zone query failed: HTTP ${resp.status}`);
  const data = await resp.json();
  const raw = data.features?.[0]?.attributes?.ZONE_CLASS;
  return raw ? String(raw).trim().toUpperCase() : null;
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
