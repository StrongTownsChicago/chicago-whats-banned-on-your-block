/**
 * adu.js — ADU (Accessory Dwelling Unit) ordinance eligibility logic.
 *
 * Single responsibility: determine whether a given zone class and ward number
 * qualify for the ADU ordinance based on zone eligibility and ward opt-in status.
 *
 * No DOM, no network calls. Pure functions — fully testable in isolation.
 * Ward opt-in data is passed as a parameter (from adu-ward-data.js).
 */

/**
 * Zone classes eligible for the ADU ordinance.
 * RS-1, RS-2, RS-3: single-family and two-flat zones
 * RT-3.5, RT-4, RT-4A: low-density multi-family zones
 *
 * @type {Set<string>}
 */
export const ADU_ELIGIBLE_ZONES = new Set([
  "RS-1",
  "RS-2",
  "RS-3",
  "RT-3.5",
  "RT-4",
  "RT-4A",
]);

/**
 * Returns true if the given zone class is eligible for the ADU ordinance.
 *
 * @param {string | null | undefined} zoneClass
 * @returns {boolean}
 */
export function isADUEligibleZone(zoneClass) {
  if (!zoneClass || typeof zoneClass !== "string") return false;
  return ADU_ELIGIBLE_ZONES.has(zoneClass);
}

/**
 * Determine ADU ordinance status for a given zone class and ward number.
 *
 * Ward opt-in data is the sole source of truth for availability.
 * No date logic — if a ward is in the opt-in list as "full" or "partial",
 * ADU is available; otherwise it is not.
 *
 * @param {string | null | undefined} zoneClass
 * @param {number | null | undefined} wardNumber
 * @param {Object} wardOptInData - WARD_OPT_IN_INFO from adu-ward-data.js
 * @returns {{
 *   zoneEligible: boolean,
 *   available?: boolean,
 *   wardOptIn?: "full" | "partial" | "not_eligible" | "not_opted_in",
 *   blockLimits?: boolean,
 *   homeownerReq?: boolean,
 *   adminAdj?: boolean,
 *   notes?: string | null
 * }}
 */
export function getADUStatus(zoneClass, wardNumber, wardOptInData) {
  if (!isADUEligibleZone(zoneClass)) {
    return { zoneEligible: false };
  }

  const wardEntry = wardNumber != null ? wardOptInData[wardNumber] : undefined;

  if (!wardEntry) {
    return {
      zoneEligible: true,
      available: false,
      wardOptIn: "not_opted_in",
      blockLimits: false,
      homeownerReq: false,
      adminAdj: false,
      notes: null,
    };
  }

  const wardOptIn = wardEntry.type;
  const available = wardOptIn === "full" || wardOptIn === "partial";

  return {
    zoneEligible: true,
    available,
    wardOptIn,
    blockLimits: wardEntry.block_limits ?? false,
    homeownerReq: wardEntry.homeowner_req ?? false,
    adminAdj: wardEntry.admin_adj ?? false,
    notes: wardEntry.notes ?? null,
  };
}
