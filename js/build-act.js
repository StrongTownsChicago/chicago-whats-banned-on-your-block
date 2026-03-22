/**
 * build-act.js — BUILD Act (HB5626) advocacy logic.
 *
 * Single responsibility: determine whether a zoning district is affected by
 * Illinois HB5626 (the BUILD Act), compute which banned uses would be
 * unlocked, and return modified data objects for BUILD Act mode rendering.
 *
 * HB5626 (introduced 2/19/2026) would mandate that RS-1, RS-2, and RS-3
 * districts permit middle housing (2-flats, 3-flats, 4-flats, townhouses)
 * and ADUs by right.
 *
 * No DOM, no network calls. Pure functions — fully testable in isolation.
 */

/** @type {ReadonlySet<string>} Zone classes subject to BUILD Act mandates */
const BUILD_ACT_DISTRICT_SET = new Set(["RS-1", "RS-2", "RS-3"]);

/**
 * Use slugs that HB5626 would require to be permitted by right in RS zones.
 * @type {ReadonlySet<string>}
 */
const BUILD_ACT_TARGET_SLUGS = new Set([
  "two_flat",
  "three_flat",
  "four_flat",
  "townhouse",
]);

/**
 * Returns true if the BUILD Act (HB5626) would apply to the given zone class.
 * Only RS-1, RS-2, and RS-3 zones are affected.
 *
 * @param {string | null | undefined} zoneClass
 * @returns {boolean}
 */
export function isBuildActDistrict(zoneClass) {
  if (!zoneClass || typeof zoneClass !== "string") return false;
  return BUILD_ACT_DISTRICT_SET.has(zoneClass);
}

/**
 * Apply BUILD Act overrides to a uses object.
 *
 * For BUILD Act districts, promotes banned uses that HB5626 would legalize
 * into a new `promotedByBuildAct` array and removes them from `banned`.
 * All other arrays (specialUse, conditional, permitted) pass through unchanged.
 *
 * For non-BUILD Act districts or null input, returns the input unchanged.
 * Does not mutate the input object.
 *
 * @param {string | null | undefined} zoneClass
 * @param {{ banned: Array<{slug: string, label: string}>, specialUse: Array, conditional: Array, permitted: Array } | null} uses
 * @returns {typeof uses}
 */
export function applyBuildActOverrides(zoneClass, uses) {
  if (uses === null || uses === undefined) return uses;
  if (!isBuildActDistrict(zoneClass)) return uses;

  const promotedByBuildAct = [];
  const remainingBanned = [];

  for (const use of uses.banned) {
    if (BUILD_ACT_TARGET_SLUGS.has(use.slug)) {
      promotedByBuildAct.push(use);
    } else {
      remainingBanned.push(use);
    }
  }

  return {
    ...uses,
    banned: remainingBanned,
    promotedByBuildAct,
  };
}

/**
 * Returns the number of banned uses that the BUILD Act would unlock for the
 * given zone class and current uses object.
 *
 * Returns 0 for non-BUILD Act districts.
 *
 * @param {string | null | undefined} zoneClass
 * @param {{ banned: Array<{slug: string, label: string}> } | null} uses
 * @returns {number}
 */
export function getBuildActUnlockCount(zoneClass, uses) {
  if (!uses) return 0;
  const overridden = applyBuildActOverrides(zoneClass, uses);
  if (!overridden || !overridden.promotedByBuildAct) return 0;
  return overridden.promotedByBuildAct.length;
}

/**
 * Returns a modified aduStatus with `buildActOverride: true` for BUILD Act
 * districts. HB5626 would supersede the ward opt-in requirement for RS zones.
 *
 * For non-BUILD Act districts or null/undefined aduStatus, returns the input
 * unchanged.
 *
 * @param {string | null | undefined} zoneClass
 * @param {{ zoneEligible: boolean, [key: string]: any } | null | undefined} aduStatus
 * @returns {typeof aduStatus}
 */
export function getBuildActAduOverride(zoneClass, aduStatus) {
  if (aduStatus === null || aduStatus === undefined) return aduStatus;
  if (!isBuildActDistrict(zoneClass)) return aduStatus;
  return { ...aduStatus, buildActOverride: true };
}
