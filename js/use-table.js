/**
 * use-table.js — Use table fetch, lookup, and permission classification.
 *
 * Single responsibility: load data/use-table.json and classify uses for a
 * given zoning district into banned, special-use, and conditional categories.
 *
 * All exported functions except fetchUseTable are pure — they take data objects
 * and return structured results with no side effects or network calls.
 */

/**
 * Human-readable display labels for each advocacy use slug.
 * Must cover all 21 slugs from scripts/constants.py ADVOCACY_USES.
 *
 * This is the single source of truth for frontend display names.
 */
export const USE_DISPLAY_LABELS = {
  // Housing
  single_family_detached: "Single-family detached home",
  two_flat: "2-flat / coach house",
  three_flat: "3-flat",
  four_flat: "4-flat",
  multi_unit_residential: "Multi-unit residential (5+ units)",
  live_work_unit: "Live-work unit",
  artist_live_work: "Artist live-work space",
  // Food and retail
  neighborhood_grocery_small: "Small neighborhood grocery",
  food_production_artisan: "Commissary kitchen / artisan food production",
  eating_drinking_limited: "Café / limited food service",
  eating_drinking_general: "Restaurant / full food & drink service",
  // Personal services
  hair_salon_barbershop: "Hair salon / barbershop",
  personal_service: "Personal service business (tailor, laundry, etc.)",
  // Childcare and education
  daycare_center: "Daycare center",
  daycare_home: "Family daycare home",
  // Community and civic
  community_center: "Community center / social service",
  place_of_worship: "Place of worship",
  urban_farm: "Urban farm",
  community_garden: "Community garden",
  // Health
  medical_clinic: "Medical or dental clinic",
  // Lodging
  bed_and_breakfast: "Bed & breakfast",
};

/**
 * Canonical order of advocacy use slugs — matches constants.py ADVOCACY_USES.
 * Output arrays from getRestrictedUses preserve this order.
 */
export const ADVOCACY_USES_LIST = Object.keys(USE_DISPLAY_LABELS);

/**
 * Permission codes and how they map to display categories.
 */
const PERMISSION = {
  BANNED: "—",
  SPECIAL_USE: "S",
  // Unicode replacement character that appears as an encoding artifact in the data
  REPLACEMENT_CHAR: "\ufffd",
};

/**
 * Fetch the use table JSON from the bundled data file.
 *
 * @returns {Promise<Record<string, Record<string, string>>>}
 *   Keys are zone_class strings; values are objects mapping use slug → permission code.
 */
export async function fetchUseTable() {
  const response = await fetch("data/use-table.json");
  if (!response.ok) {
    throw new Error(`Failed to load use-table.json: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Normalize a raw permission code from the use table.
 * Treats the Unicode replacement character (\ufffd) as "—" (banned).
 *
 * @param {string} rawCode
 * @returns {string} Normalized permission code.
 */
function normalizePermissionCode(rawCode) {
  if (rawCode === PERMISSION.REPLACEMENT_CHAR) {
    return PERMISSION.BANNED;
  }
  return rawCode;
}

/**
 * Classify uses for a given zone_class into banned, special-use, conditional,
 * and permitted arrays. Output arrays preserve ADVOCACY_USES_LIST order.
 *
 * Code meanings:
 *   "P"   — Permitted by right.
 *   "P/S" — Permitted for standard-sized establishments; special use above a
 *            size threshold. Treated as permitted for display purposes.
 *   "P/-" — Permitted in some configurations, banned in others (e.g. existing
 *            non-conforming use allowed, new construction banned). Conditional.
 *   "S"   — Special use required (public hearing before ZBA).
 *   "—"   — Not permitted.
 *
 * @param {string} zoneClass - The zone class to look up (e.g. "B1-1").
 * @param {Record<string, Record<string, string>>} useTable - Full use table.
 * @returns {{
 *   banned: Array<{ slug: string, label: string }>,
 *   specialUse: Array<{ slug: string, label: string }>,
 *   conditional: Array<{ slug: string, label: string }>,
 *   permitted: Array<{ slug: string, label: string }>
 * } | null} Returns null if zoneClass is not found in the table.
 */
export function getRestrictedUses(zoneClass, useTable) {
  const districtData = useTable[zoneClass];
  if (!districtData) {
    return null;
  }

  const banned = [];
  const specialUse = [];
  const conditional = [];
  const permitted = [];

  for (const slug of ADVOCACY_USES_LIST) {
    const rawCode = districtData[slug];
    if (rawCode === undefined) continue;

    const code = normalizePermissionCode(rawCode);
    const entry = { slug, label: USE_DISPLAY_LABELS[slug] || slug };

    if (code === "P" || code === "P/S") {
      permitted.push(entry);
    } else if (code === PERMISSION.BANNED) {
      banned.push(entry);
    } else if (code === PERMISSION.SPECIAL_USE) {
      specialUse.push(entry);
    } else if (code === "P/-") {
      conditional.push(entry);
    }
    // Unknown codes are silently skipped
  }

  return { banned, specialUse, conditional, permitted };
}

/**
 * Determines whether a zone_class string represents a Planned Development district.
 * PD districts have custom zoning rules and are not in the use table.
 *
 * @param {string} zoneClass
 * @returns {boolean}
 */
export function isPDDistrict(zoneClass) {
  if (!zoneClass || typeof zoneClass !== "string") return false;
  return zoneClass.trim().toUpperCase().startsWith("PD");
}

/**
 * Determines whether a zone_class string represents a Parks and Open Space district.
 * POS districts are not in the use table.
 *
 * @param {string} zoneClass
 * @returns {boolean}
 */
export function isPOSDistrict(zoneClass) {
  if (!zoneClass || typeof zoneClass !== "string") return false;
  return zoneClass.trim().toUpperCase().startsWith("POS");
}

/**
 * Determines whether a zone_class string represents a Planned Manufacturing District.
 * PMD districts are not in the use table.
 *
 * @param {string} zoneClass
 * @returns {boolean}
 */
export function isPMDDistrict(zoneClass) {
  if (!zoneClass || typeof zoneClass !== "string") return false;
  return zoneClass.trim().toUpperCase().startsWith("PMD");
}
