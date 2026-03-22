/**
 * cco.js — Connected Communities Ordinance (CCO) proximity eligibility logic.
 *
 * Single responsibility: determine whether a given coordinate and zone class
 * qualify for CCO density exceptions based on proximity to rail or bus stations.
 *
 * CCO (2022): RS-1/2/3 parcels within ½ mile of a CTA/Metra rail station or
 * ¼ mile of a qualifying bus corridor stop may qualify for RT-4 density
 * standards with 3+ units and ≥20% affordable units.
 *
 * No DOM, no network calls. Pure functions — fully testable in isolation.
 *
 * turfLib injection: accepts optional turfLib parameter for Node/Vitest
 * compatibility (browser uses global turf CDN object; tests inject @turf modules).
 * Mirrors the pattern used in spatial.js.
 */

/** @type {ReadonlySet<string>} Zone classes eligible for CCO exception */
const CCO_ELIGIBLE_ZONES = new Set(["RS-1", "RS-2", "RS-3"]);

/** Rail station proximity threshold (miles) */
const RAIL_THRESHOLD_MILES = 0.5;

/** Bus corridor stop proximity threshold (miles) */
const BUS_THRESHOLD_MILES = 0.25;

/**
 * Returns true if the given zone class qualifies for CCO density exceptions.
 * Only RS-1, RS-2, and RS-3 zones are eligible.
 *
 * @param {string | null | undefined} zoneClass
 * @returns {boolean}
 */
export function isCCOEligibleZone(zoneClass) {
  if (!zoneClass || typeof zoneClass !== "string") return false;
  return CCO_ELIGIBLE_ZONES.has(zoneClass);
}

/**
 * Determine CCO proximity status for a parcel at the given coordinates.
 *
 * Checks whether the parcel is within ½ mile of any rail station or ¼ mile
 * of any qualifying bus corridor stop in the bundled transit-stations data.
 *
 * @param {[number, number]} lngLat - [longitude, latitude] of the parcel
 * @param {string | null | undefined} zoneClass - Zoning district (e.g. "RS-3")
 * @param {Array<{name: string, lng: number, lat: number, type: "rail"|"bus", route?: string}>} stations
 *   - Transit station array from data/transit-stations.json
 * @param {{ distance: Function, point: Function } | null} [turfLib]
 *   - Turf library; defaults to global `turf` in browser. Inject in tests.
 * @returns {{ eligible: boolean, distanceMiles: number | null, nearestName: string | null }}
 */
export function getCCOStatus(lngLat, zoneClass, stations, turfLib) {
  const distanceFn =
    turfLib && turfLib.distance ? turfLib.distance : turf.distance;
  const pointFn = turfLib && turfLib.point ? turfLib.point : turf.point;

  if (!isCCOEligibleZone(zoneClass)) {
    return { eligible: false, distanceMiles: null, nearestName: null };
  }

  if (!stations || stations.length === 0) {
    return { eligible: false, distanceMiles: null, nearestName: null };
  }

  const parcelPoint = pointFn(lngLat);

  let nearestRailDist = Infinity;

  for (const station of stations) {
    let distMiles;
    try {
      distMiles = distanceFn(
        parcelPoint,
        pointFn([station.lng, station.lat]),
        { units: "miles" },
      );
    } catch {
      // Skip stations that cause turf errors (malformed coords)
      continue;
    }

    const threshold =
      station.type === "bus" ? BUS_THRESHOLD_MILES : RAIL_THRESHOLD_MILES;

    if (distMiles <= threshold) {
      return {
        eligible: true,
        distanceMiles: distMiles,
        nearestName: station.name,
      };
    }

    if (station.type === "rail" && distMiles < nearestRailDist) {
      nearestRailDist = distMiles;
    }
  }

  return {
    eligible: false,
    distanceMiles: nearestRailDist === Infinity ? null : nearestRailDist,
    nearestName: null,
  };
}
