/**
 * app.js — Top-level controller for "What's Banned on Your Block?"
 *
 * Single responsibility: wire DOM events to module calls and update the DOM
 * with results. No business logic lives here — all classification and spatial
 * query logic is delegated to the imported modules.
 */

import { MAPBOX_TOKEN } from "./config.js";
import {
  initMap,
  addZoningLayer,
  placeAddressMarker,
  registerMapClickHandler,
  ZONING_TILES_URL,
} from "./map.js";
import { fetchZoneClass, fetchWardGeoJSON, findWard } from "./spatial.js";
import { geocodeAddress } from "./geocode.js";
import { getCCOStatus } from "./cco.js";
import { getADUStatus } from "./adu.js";
import { WARD_OPT_IN_INFO } from "./adu-ward-data.js";
import {
  isBuildActDistrict,
  applyBuildActOverrides,
  getBuildActAduOverride,
  getBuildActUnlockCount,
} from "./build-act.js";
import {
  fetchUseTable,
  getRestrictedUses,
  isPDDistrict,
  isPOSDistrict,
  isPMDDistrict,
  isTDistrict,
  isDDowntownDistrict,
  normalizeZoneClass,
  SLUG_CATEGORY,
} from "./use-table.js";

// =====================================================================
// Application state
// =====================================================================

const state = {
  map: null,
  wardGeoJSON: null,
  useTable: null,
  transitStations: null,
  buildActMode: false,
  lastLookup: null,
};

// =====================================================================
// DOM references
// =====================================================================

const sidePanel = document.getElementById("side-panel");
const panelToggle = document.getElementById("panel-toggle");
const introPanel = document.getElementById("intro-panel");
const addressForm = document.getElementById("address-form");
const addressInput = document.getElementById("address-input");
const addressError = document.getElementById("address-error");
const dataLoadingBanner = document.getElementById("data-loading-banner");
const dataErrorBanner = document.getElementById("data-error-banner");
const resultsPanel = document.getElementById("results-panel");
const resultsLoading = document.getElementById("results-loading");
const resultsContent = document.getElementById("results-content");
const districtLabel = document.getElementById("district-label");
const neighborhoodLabel = document.getElementById("neighborhood-label");
const pdMessage = document.getElementById("pd-message");
const allPermittedMsg = document.getElementById("all-permitted-message");
const noDataMessage = document.getElementById("no-data-message");
const restrictedUses = document.getElementById("restricted-uses");
const bannedSection = document.getElementById("banned-section");
const bannedList = document.getElementById("banned-list");
const specialUseSection = document.getElementById("special-use-section");
const specialUseList = document.getElementById("special-use-list");
const conditionalSection = document.getElementById("conditional-section");
const conditionalList = document.getElementById("conditional-list");
const permittedSection = document.getElementById("permitted-section");
const permittedList = document.getElementById("permitted-list");
const permittedCount = document.getElementById("permitted-count");
const policyExceptionsDivider = document.getElementById(
  "policy-exceptions-divider",
);
const ccoCallout = document.getElementById("cco-callout");
const aduOptinCta = document.getElementById("adu-optin-cta");
const aduOptinBody = document.getElementById("adu-optin-body");
const aduCallout = document.getElementById("adu-callout");
const aduCalloutTitle = document.getElementById("adu-callout-title");
const aduCalloutBody = document.getElementById("adu-callout-body");
const wardCta = document.getElementById("ward-cta");
const wardLabel = document.getElementById("ward-label");
const wardLink = document.getElementById("ward-link");
const wardAlderperson = document.getElementById("ward-alderperson");

// BUILD Act DOM references
const buildActToggleRow = document.getElementById("build-act-toggle-row");
const buildActToggle = document.getElementById("build-act-toggle");
const buildActBanner = document.getElementById("build-act-banner");
const buildActBannerDismiss = document.getElementById(
  "build-act-banner-dismiss",
);
const buildActSection = document.getElementById("build-act-section");
const buildActList = document.getElementById("build-act-list");
const buildActTeaser = document.getElementById("build-act-teaser");
const buildActTeaserCta = document.getElementById("build-act-teaser-cta");
const buildActTeaserCount = document.getElementById("build-act-teaser-count");

// =====================================================================
// Utility helpers
// =====================================================================

function showElement(el) {
  el.hidden = false;
}
function hideElement(el) {
  el.hidden = true;
}

function showAddressError(message) {
  addressError.textContent = message;
  showElement(addressError);
}

function clearAddressError() {
  addressError.textContent = "";
  hideElement(addressError);
}

function showDataErrorBanner(message) {
  dataErrorBanner.textContent = message;
  showElement(dataErrorBanner);
}

/**
 * Extract a short neighborhood/city name from a Mapbox place_name string.
 * place_name format: "123 N State St, Chicago, Illinois 60601, United States"
 *
 * @param {string} placeName
 * @returns {string}
 */
function extractNeighborhood(placeName) {
  const parts = placeName.split(",").map((s) => s.trim());
  // Second part is typically neighborhood or city name
  return parts.length > 1 ? parts[1] : "";
}

// =====================================================================
// Data loading
// =====================================================================

/**
 * Returns a Promise that resolves once the MapLibre map style is fully loaded.
 * Handles both the case where the style has already loaded and where it hasn't yet.
 *
 * @param {maplibregl.Map} map
 * @returns {Promise<void>}
 */
function waitForMapStyle(map) {
  return new Promise((resolve) => {
    if (map.isStyleLoaded()) {
      resolve();
    } else {
      map.once("load", resolve);
    }
  });
}

async function loadAllData() {
  showElement(dataLoadingBanner);

  const errors = [];

  // Fetch ward, use-table, and transit data in parallel;
  // Zoning polygons are loaded lazily via PMTiles (no fetch needed here).
  const [wardResult, useTableResult, transitResult] = await Promise.allSettled([
    fetchWardGeoJSON(),
    fetchUseTable(),
    fetch("data/transit-stations.json").then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
  ]);

  hideElement(dataLoadingBanner);

  // Add zoning tile layer (PMTiles — loaded lazily by MapLibre as tiles enter viewport)
  await waitForMapStyle(state.map);
  addZoningLayer(state.map, ZONING_TILES_URL);

  if (wardResult.status === "fulfilled") {
    state.wardGeoJSON = wardResult.value;
  } else {
    console.error("Ward GeoJSON load failed:", wardResult.reason);
    // Ward CTA will be hidden in results — non-critical failure
  }

  if (useTableResult.status === "fulfilled") {
    state.useTable = useTableResult.value;
  } else {
    console.error("Use table load failed:", useTableResult.reason);
    errors.push("Use table unavailable. Zoning lookup is disabled.");
  }

  if (transitResult.status === "fulfilled") {
    state.transitStations = transitResult.value;
  } else {
    console.warn("Transit stations load failed:", transitResult.reason);
    // Non-critical: CCO callout simply won't show
  }

  if (errors.length > 0) {
    showDataErrorBanner(errors.join(" "));
  }
}

// =====================================================================
// Address lookup flow
// =====================================================================

/**
 * Core lookup: given a resolved [lng, lat] and optional place name,
 * find the zone, ward, and restricted uses, then render results.
 *
 * @param {[number, number]} lngLat
 * @param {string} placeName
 */
async function lookupLocation(lngLat, placeName) {
  placeAddressMarker(state.map, lngLat);

  const rawZoneClass = await fetchZoneClass(lngLat);
  const zoneClass = rawZoneClass ? normalizeZoneClass(rawZoneClass) : null;
  const ward = state.wardGeoJSON ? findWard(lngLat, state.wardGeoJSON) : null;

  let restrictedUsesResult = null;
  const skipLookup =
    !zoneClass ||
    isPDDistrict(zoneClass) ||
    isPOSDistrict(zoneClass) ||
    isPMDDistrict(zoneClass) ||
    isTDistrict(zoneClass);
  if (!skipLookup && state.useTable) {
    restrictedUsesResult = getRestrictedUses(zoneClass, state.useTable);
  }

  const ccoStatus =
    state.transitStations && zoneClass
      ? getCCOStatus(lngLat, zoneClass, state.transitStations)
      : { eligible: false, distanceMiles: null, nearestName: null };

  const aduStatus = zoneClass
    ? getADUStatus(zoneClass, ward ? ward.ward : null, WARD_OPT_IN_INFO)
    : { zoneEligible: false };

  state.buildActMode = false;
  state.lastLookup = {
    zoneClass,
    placeName,
    uses: restrictedUsesResult,
    ward,
    ccoStatus,
    aduStatus,
  };

  hideElement(resultsLoading);
  renderResultsForCurrentMode();
}

function expandPanel() {
  sidePanel.classList.remove("is-collapsed");
  panelToggle.classList.remove("is-collapsed");
  panelToggle.setAttribute("aria-expanded", "true");
  panelToggle.setAttribute("aria-label", "Collapse panel");
  panelToggle.title = "Collapse panel";
}

async function handleAddressSubmit(event) {
  event.preventDefault();
  clearAddressError();
  expandPanel();
  hideElement(introPanel);

  const address = addressInput.value.trim();
  if (!address) return;

  showElement(resultsPanel);
  showElement(resultsLoading);
  hideElement(resultsContent);

  const geocodeResult = await geocodeAddress(address, MAPBOX_TOKEN);
  if (!geocodeResult) {
    hideElement(resultsLoading);
    hideElement(resultsPanel);
    showAddressError(
      "Address not found. Try a full street address (e.g. 2442 N Milwaukee Ave, Chicago).",
    );
    return;
  }

  try {
    await lookupLocation(geocodeResult.lngLat, geocodeResult.placeName);
  } catch (err) {
    hideElement(resultsLoading);
    hideElement(resultsPanel);
    showAddressError("Zone lookup failed. Please try again.");
    console.error("lookupLocation failed:", err);
  }
}

async function handleMapClick(lngLat) {
  clearAddressError();
  expandPanel();
  hideElement(introPanel);
  showElement(resultsPanel);
  showElement(resultsLoading);
  hideElement(resultsContent);
  try {
    await lookupLocation(lngLat, "Chicago, Illinois");
  } catch (err) {
    hideElement(resultsLoading);
    hideElement(resultsPanel);
    showAddressError("Zone lookup failed. Please try again.");
    console.error("lookupLocation failed:", err);
  }
}

// =====================================================================
// BUILD Act rendering helper
// =====================================================================

/**
 * Re-render results for the current BUILD Act mode state.
 * Reads from state.lastLookup and applies overrides when buildActMode is active.
 * Guards against null lastLookup (called only after a completed lookup).
 */
function renderResultsForCurrentMode() {
  if (!state.lastLookup) return;
  const { zoneClass, placeName, uses, ward, ccoStatus, aduStatus } =
    state.lastLookup;
  if (state.buildActMode && isBuildActDistrict(zoneClass) && uses !== null) {
    const overriddenUses = applyBuildActOverrides(zoneClass, uses);
    const overriddenAdu = getBuildActAduOverride(zoneClass, aduStatus);
    renderResults(
      zoneClass,
      placeName,
      overriddenUses,
      ward,
      {},
      ccoStatus,
      overriddenAdu,
    );
  } else {
    renderResults(zoneClass, placeName, uses, ward, {}, ccoStatus, aduStatus);
  }
}

// =====================================================================
// DOM rendering
// =====================================================================

/**
 * Update the results panel DOM with lookup results.
 * No business logic — accepts data, updates DOM.
 *
 * @param {string | null} zoneClass
 * @param {string} placeName - Full Mapbox place_name string
 * @param {{ banned, specialUse, conditional } | null} uses - From getRestrictedUses
 * @param {{ ward, alderperson, url } | null} ward
 * @param {{ zoningUnavailable?: boolean }} [flags]
 * @param {{ eligible: boolean, distanceMiles: number|null, nearestName: string|null } | null} [ccoStatus]
 * @param {{ zoneEligible: boolean, available?: boolean, wardOptIn?: string, blockLimits?: boolean, homeownerReq?: boolean, adminAdj?: boolean, notes?: string|null } | null} [aduStatus]
 */
export function renderResults(
  zoneClass,
  placeName,
  uses,
  ward,
  flags = {},
  ccoStatus = null,
  aduStatus = null,
) {
  // Reset all sections
  hideElement(pdMessage);
  hideElement(allPermittedMsg);
  hideElement(noDataMessage);
  hideElement(restrictedUses);
  hideElement(policyExceptionsDivider);
  hideElement(ccoCallout);
  hideElement(aduOptinCta);
  hideElement(aduCallout);
  hideElement(wardCta);

  bannedList.innerHTML = "";
  specialUseList.innerHTML = "";
  conditionalList.innerHTML = "";
  permittedList.innerHTML = "";
  permittedCount.textContent = "";
  permittedSection.removeAttribute("open");

  hideElement(bannedSection);
  hideElement(specialUseSection);
  hideElement(conditionalSection);
  hideElement(permittedSection);

  // Reset BUILD Act elements
  hideElement(buildActToggleRow);
  hideElement(buildActBanner);
  hideElement(buildActTeaser);
  hideElement(buildActSection);
  buildActList.innerHTML = "";

  // District header
  if (zoneClass) {
    districtLabel.textContent = zoneClass;
  } else if (flags.zoningUnavailable) {
    districtLabel.textContent = "—";
  } else {
    districtLabel.textContent = "Outside Chicago";
  }

  neighborhoodLabel.textContent = extractNeighborhood(placeName);

  // BUILD Act toggle visibility (shown for RS-1/2/3 regardless of other state)
  if (zoneClass && isBuildActDistrict(zoneClass)) {
    showElement(buildActToggleRow);
    buildActToggle.setAttribute("aria-checked", String(state.buildActMode));
    buildActToggle.classList.toggle("is-active", state.buildActMode);
  }

  // No zone match
  if (!zoneClass && !flags.zoningUnavailable) {
    noDataMessage.querySelector("p").textContent =
      "This address is outside Chicago's zoning data. Make sure you entered a Chicago address.";
    showElement(noDataMessage);
    showElement(resultsContent);
    return;
  }

  if (flags.zoningUnavailable) {
    noDataMessage.querySelector("p").textContent =
      "Zoning map data is currently unavailable. Spatial lookup is disabled.";
    showElement(noDataMessage);
    showElement(resultsContent);
    return;
  }

  // PD district
  if (isPDDistrict(zoneClass)) {
    showElement(pdMessage);
    renderWardCta(ward);
    showElement(resultsContent);
    return;
  }

  // POS district
  if (isPOSDistrict(zoneClass)) {
    noDataMessage.querySelector("p").textContent =
      "Parks and Open Space (POS) districts are not subject to the standard use table. Permitted uses are governed by the Chicago Park District and city ordinance.";
    showElement(noDataMessage);
    renderWardCta(ward);
    showElement(resultsContent);
    return;
  }

  // PMD district
  if (isPMDDistrict(zoneClass)) {
    noDataMessage.querySelector("p").textContent =
      "Planned Manufacturing Districts (PMD) have custom use restrictions set by individual district ordinances. Review the specific PMD ordinance for this area.";
    showElement(noDataMessage);
    renderWardCta(ward);
    showElement(resultsContent);
    return;
  }

  // T (Transportation) district
  if (isTDistrict(zoneClass)) {
    noDataMessage.querySelector("p").textContent =
      "Transportation (T) districts protect rail lines, busways, and road corridors. " +
      "This land is reserved for transportation infrastructure only and is not subject " +
      "to the standard use table. Rezoning is required before any other use is permitted.";
    showElement(noDataMessage);
    renderWardCta(ward);
    showElement(resultsContent);
    return;
  }

  // No use table data (e.g. RT-3 missing from dataset)
  if (uses === null) {
    noDataMessage.querySelector("p").textContent = isDDowntownDistrict(
      zoneClass,
    )
      ? "This Downtown district is governed by §17-4-0207. Many downtown parcels are subject to individual Planned Development (PD) ordinances that supersede the base use table — check the PD ordinance for this parcel."
      : "Zoning data is not available for this district type in our database.";
    showElement(noDataMessage);
    renderWardCta(ward);
    showElement(resultsContent);
    return;
  }

  const hasRestrictions =
    uses.banned.length > 0 ||
    uses.specialUse.length > 0 ||
    uses.conditional.length > 0;

  // Show positive message when nothing is banned/restricted
  if (!hasRestrictions) {
    showElement(allPermittedMsg);
  }

  // Always show the uses container (for permitted section at minimum)
  showElement(restrictedUses);

  // BUILD Act promoted uses section (visible in BUILD Act mode only)
  if (uses.promotedByBuildAct?.length > 0) {
    renderUseList(buildActList, uses.promotedByBuildAct);
    showElement(buildActSection);
  }

  if (uses.banned.length > 0) {
    renderUseList(bannedList, uses.banned);
    showElement(bannedSection);
  }

  if (uses.specialUse.length > 0) {
    renderUseList(specialUseList, uses.specialUse);
    showElement(specialUseSection);
  }

  if (uses.conditional.length > 0) {
    renderUseList(conditionalList, uses.conditional);
    showElement(conditionalSection);
  }

  if (uses.permitted.length > 0) {
    renderUseList(permittedList, uses.permitted);
    permittedCount.textContent = `(${uses.permitted.length})`;
    showElement(permittedSection);
  }

  // BUILD Act banner / teaser
  if (zoneClass && isBuildActDistrict(zoneClass)) {
    if (state.buildActMode) {
      showElement(buildActBanner);
    } else {
      const unlockCount = getBuildActUnlockCount(zoneClass, uses);
      if (unlockCount > 0) {
        buildActTeaserCount.textContent = unlockCount;
        showElement(buildActTeaser);
      }
    }
  }

  renderPolicyCallouts(ccoStatus, aduStatus, ward);
  renderWardCta(ward, zoneClass);
  showElement(resultsContent);
}

/**
 * Populate a <ul> with use list items.
 *
 * @param {HTMLElement} listEl - The <ul> element to populate.
 * @param {Array<{ slug: string, label: string }>} uses
 */
function renderUseList(listEl, uses) {
  const fragment = document.createDocumentFragment();

  // Only add category subheadings when items span multiple categories
  const categories = new Set(
    uses.map((u) => SLUG_CATEGORY[u.slug]).filter(Boolean),
  );
  const showCategories = categories.size > 1;
  let currentCategory = null;

  for (const use of uses) {
    if (showCategories) {
      const category = SLUG_CATEGORY[use.slug];
      if (category && category !== currentCategory) {
        currentCategory = category;
        const header = document.createElement("li");
        header.className = "use-list__category";
        header.textContent = category;
        fragment.appendChild(header);
      }
    }
    const li = document.createElement("li");
    li.className = "use-list__item";
    li.textContent = use.label;
    fragment.appendChild(li);
  }

  listEl.appendChild(fragment);
}

/**
 * Render or hide the CCO and ADU policy callout sections.
 * Only called from the normal render path (not early-return paths for PD/POS/PMD/T).
 *
 * @param {{ eligible: boolean, distanceMiles: number|null, nearestName: string|null } | null} ccoStatus
 * @param {{ zoneEligible: boolean, available?: boolean, wardOptIn?: string, blockLimits?: boolean, homeownerReq?: boolean, adminAdj?: boolean, notes?: string|null } | null} aduStatus
 * @param {{ ward: number, alderperson: string, url: string } | null} ward
 */
function renderPolicyCallouts(ccoStatus, aduStatus, ward) {
  const ccoVisible = ccoStatus && ccoStatus.eligible;

  // CCO callout
  if (ccoVisible) {
    showElement(ccoCallout);
  } else {
    hideElement(ccoCallout);
  }

  // ADU: hide everything if zone is not eligible
  if (!aduStatus || !aduStatus.zoneEligible) {
    hideElement(aduOptinCta);
    hideElement(aduCallout);
    if (ccoVisible) showElement(policyExceptionsDivider);
    else hideElement(policyExceptionsDivider);
    return;
  }

  // ADU: BUILD Act override — supersedes the ward opt-in requirement for RS zones
  if (aduStatus.buildActOverride && aduStatus.wardOptIn === "not_opted_in") {
    aduCalloutTitle.textContent = "ADU by Right (BUILD Act)";
    aduCalloutBody.textContent =
      "The BUILD Act would require ADUs to be permitted by right in RS zones, removing the ward opt-in requirement.";
    hideElement(aduOptinCta);
    showElement(aduCallout);
    showElement(policyExceptionsDivider);
    return;
  }

  // ADU: zone is eligible but ward hasn't opted in — show CTA to contact alderperson
  if (aduStatus.wardOptIn === "not_opted_in" && ward) {
    const alder = ward.alderperson || `Ward ${ward.ward} Alderperson`;
    aduOptinBody.textContent = `ADUs/granny flats could be allowed in this zone type, but Alder ${alder} (Ward ${ward.ward}) has chosen to block them. Contact them and tell them to act.`;
    showElement(aduOptinCta);
    hideElement(aduCallout);
    showElement(policyExceptionsDivider);
    return;
  }

  // ADU: ward is marked not_eligible (e.g. Ward 3) or ward unknown — hide both
  if (!aduStatus.available) {
    hideElement(aduOptinCta);
    hideElement(aduCallout);
    if (ccoVisible) showElement(policyExceptionsDivider);
    else hideElement(policyExceptionsDivider);
    return;
  }

  hideElement(aduOptinCta);

  const wardNum = ward ? ward.ward : null;
  const alder = ward ? ward.alderperson || `Ward ${wardNum} Alderperson` : null;
  let title, body;

  if (aduStatus.wardOptIn === "full") {
    title = "ADU / Coach House Eligible";
    body = `Alder ${alder} (Ward ${wardNum}) has opted in to the ADU Ordinance. A coach house, garage apartment, or internal conversion may be added to this parcel.`;
    const caveats = [];
    if (aduStatus.blockLimits) caveats.push("block-level unit limits apply");
    if (aduStatus.homeownerReq) caveats.push("owner-occupancy required");
    if (aduStatus.adminAdj)
      caveats.push("administrative adjustment may be required");
    if (caveats.length > 0) {
      body += ` Note: ${caveats.join(", ")}.`;
    }
    if (aduStatus.notes) body += ` ${aduStatus.notes}`;
  } else if (aduStatus.wardOptIn === "partial") {
    title = "ADU May Be Available";
    body = `Ward ${wardNum} has a partial opt-in. ${aduStatus.notes || "Check whether this precinct is included."}`;
  } else {
    // Unexpected wardOptIn value — hide callout
    hideElement(aduCallout);
    if (ccoVisible) showElement(policyExceptionsDivider);
    else hideElement(policyExceptionsDivider);
    return;
  }

  aduCalloutTitle.textContent = title;
  aduCalloutBody.textContent = body;
  showElement(aduCallout);
  showElement(policyExceptionsDivider);
}

/**
 * Render or hide the ward CTA section.
 *
 * @param {{ ward: number, alderperson: string, url: string } | null} ward
 * @param {string | null} [zoneClass] - Optional zone class; used to customize CTA text in BUILD Act mode.
 */
function renderWardCta(ward, zoneClass = null) {
  if (!ward || !ward.ward) {
    hideElement(wardCta);
    return;
  }

  const alder = ward.alderperson || `Ward ${ward.ward} Alderperson`;
  wardLabel.textContent = `Ward ${ward.ward}`;
  wardAlderperson.textContent = alder;
  wardLink.href = ward.url || "#";
  wardLink.textContent = `Contact ${alder} →`;

  showElement(wardCta);
}

// =====================================================================
// Initialization
// =====================================================================

document.addEventListener("DOMContentLoaded", async () => {
  state.map = initMap("map-container");
  await loadAllData();
  addressForm.addEventListener("submit", handleAddressSubmit);
  registerMapClickHandler(state.map, handleMapClick);

  // BUILD Act toggle
  buildActToggle.addEventListener("click", () => {
    if (!state.lastLookup) return;
    state.buildActMode = !state.buildActMode;
    renderResultsForCurrentMode();
  });

  buildActTeaserCta.addEventListener("click", () => {
    if (!state.lastLookup) return;
    state.buildActMode = true;
    renderResultsForCurrentMode();
  });

  buildActBannerDismiss.addEventListener("click", () => {
    hideElement(buildActBanner);
  });

  // Panel collapse toggle
  panelToggle.addEventListener("click", () => {
    const collapsing = !sidePanel.classList.contains("is-collapsed");
    sidePanel.classList.toggle("is-collapsed");
    panelToggle.classList.toggle("is-collapsed");
    panelToggle.setAttribute("aria-expanded", String(!collapsing));
    panelToggle.setAttribute(
      "aria-label",
      collapsing ? "Expand panel" : "Collapse panel",
    );
    panelToggle.title = collapsing ? "Expand panel" : "Collapse panel";
  });
});
