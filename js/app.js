/**
 * app.js — Top-level controller for "What's Banned on Your Block?"
 *
 * Single responsibility: wire DOM events to module calls and update the DOM
 * with results. No business logic lives here — all classification and spatial
 * query logic is delegated to the imported modules.
 */

import { MAPBOX_TOKEN } from "./config.js";
import { initMap, addZoningLayer, placeAddressMarker, registerMapClickHandler } from "./map.js";
import { fetchZoningGeoJSON, fetchWardGeoJSON, findZoneClass, findWard } from "./spatial.js";
import { geocodeAddress } from "./geocode.js";
import { fetchUseTable, getRestrictedUses, isPDDistrict, isPOSDistrict, isPMDDistrict, SLUG_CATEGORY } from "./use-table.js";

// =====================================================================
// Application state
// =====================================================================

const state = {
  map: null,
  zoningGeoJSON: null,
  wardGeoJSON: null,
  useTable: null,
};

// =====================================================================
// DOM references
// =====================================================================

const sidePanel       = document.getElementById("side-panel");
const panelToggle     = document.getElementById("panel-toggle");
const introPanel      = document.getElementById("intro-panel");
const addressForm     = document.getElementById("address-form");
const addressInput    = document.getElementById("address-input");
const addressError    = document.getElementById("address-error");
const dataLoadingBanner = document.getElementById("data-loading-banner");
const dataErrorBanner = document.getElementById("data-error-banner");
const resultsPanel    = document.getElementById("results-panel");
const resultsLoading  = document.getElementById("results-loading");
const resultsContent  = document.getElementById("results-content");
const districtLabel   = document.getElementById("district-label");
const neighborhoodLabel = document.getElementById("neighborhood-label");
const pdMessage       = document.getElementById("pd-message");
const allPermittedMsg = document.getElementById("all-permitted-message");
const noDataMessage   = document.getElementById("no-data-message");
const restrictedUses  = document.getElementById("restricted-uses");
const bannedSection   = document.getElementById("banned-section");
const bannedList      = document.getElementById("banned-list");
const specialUseSection = document.getElementById("special-use-section");
const specialUseList  = document.getElementById("special-use-list");
const conditionalSection = document.getElementById("conditional-section");
const conditionalList = document.getElementById("conditional-list");
const permittedSection = document.getElementById("permitted-section");
const permittedList   = document.getElementById("permitted-list");
const permittedCount  = document.getElementById("permitted-count");
const wardCta         = document.getElementById("ward-cta");
const wardLabel       = document.getElementById("ward-label");
const wardLink        = document.getElementById("ward-link");
const wardAlderperson = document.getElementById("ward-alderperson");

// =====================================================================
// Utility helpers
// =====================================================================

function showElement(el)  { el.hidden = false; }
function hideElement(el)  { el.hidden = true;  }

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

  // Fetch all data in parallel; also wait for the map style to be ready
  const [zoningResult, wardResult, useTableResult] = await Promise.allSettled([
    fetchZoningGeoJSON(),
    fetchWardGeoJSON(),
    fetchUseTable(),
  ]);

  hideElement(dataLoadingBanner);

  if (zoningResult.status === "fulfilled") {
    state.zoningGeoJSON = zoningResult.value;
    // Ensure map style is ready before adding layers
    await waitForMapStyle(state.map);
    addZoningLayer(state.map, state.zoningGeoJSON);
  } else {
    console.error("Zoning GeoJSON load failed:", zoningResult.reason);
    errors.push("Map data unavailable — spatial lookup is disabled.");
  }

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
    errors.push("Use table unavailable — zoning lookup is disabled.");
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

  if (!state.zoningGeoJSON) {
    hideElement(resultsLoading);
    renderResults(null, placeName, null, null, { zoningUnavailable: true });
    return;
  }

  const zoneClass = findZoneClass(lngLat, state.zoningGeoJSON);
  const ward = state.wardGeoJSON ? findWard(lngLat, state.wardGeoJSON) : null;

  let restrictedUsesResult = null;
  const skipLookup = !zoneClass || isPDDistrict(zoneClass) || isPOSDistrict(zoneClass) || isPMDDistrict(zoneClass);
  if (!skipLookup && state.useTable) {
    restrictedUsesResult = getRestrictedUses(zoneClass, state.useTable);
  }

  hideElement(resultsLoading);
  renderResults(zoneClass, placeName, restrictedUsesResult, ward);
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
    showAddressError("Address not found — try a full street address (e.g. 2442 N Milwaukee Ave, Chicago).");
    return;
  }

  await lookupLocation(geocodeResult.lngLat, geocodeResult.placeName);
}

async function handleMapClick(lngLat) {
  clearAddressError();
  expandPanel();
  hideElement(introPanel);
  showElement(resultsPanel);
  showElement(resultsLoading);
  hideElement(resultsContent);
  await lookupLocation(lngLat, "Chicago, Illinois");
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
 */
export function renderResults(zoneClass, placeName, uses, ward, flags = {}) {
  // Reset all sections
  hideElement(pdMessage);
  hideElement(allPermittedMsg);
  hideElement(noDataMessage);
  hideElement(restrictedUses);
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

  // District header
  if (zoneClass) {
    districtLabel.textContent = zoneClass;
  } else if (flags.zoningUnavailable) {
    districtLabel.textContent = "—";
  } else {
    districtLabel.textContent = "Outside Chicago";
  }

  neighborhoodLabel.textContent = extractNeighborhood(placeName);

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
      "Parks and Open Space (POS) districts are not subject to the standard use table — permitted uses are governed by the Chicago Park District and city ordinance.";
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

  // No use table data (e.g. RT-3 missing from dataset)
  if (uses === null) {
    noDataMessage.querySelector("p").textContent =
      "Zoning data is not available for this district type in our database.";
    showElement(noDataMessage);
    renderWardCta(ward);
    showElement(resultsContent);
    return;
  }

  const hasRestrictions = uses.banned.length > 0 || uses.specialUse.length > 0 || uses.conditional.length > 0;

  // Show positive message when nothing is banned/restricted
  if (!hasRestrictions) {
    showElement(allPermittedMsg);
  }

  // Always show the uses container (for permitted section at minimum)
  showElement(restrictedUses);

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

  renderWardCta(ward);
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
  const categories = new Set(uses.map((u) => SLUG_CATEGORY[u.slug]).filter(Boolean));
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
 * Render or hide the ward CTA section.
 *
 * @param {{ ward: number, alderperson: string, url: string } | null} ward
 */
function renderWardCta(ward) {
  if (!ward || !ward.ward) {
    hideElement(wardCta);
    return;
  }

  wardLabel.textContent = `Ward ${ward.ward}`;
  wardAlderperson.textContent = ward.alderperson || `Ward ${ward.ward} Alderperson`;
  wardLink.href = ward.url || "#";
  wardLink.textContent = `Contact ${ward.alderperson || `Ward ${ward.ward} Alderperson`} →`;

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

  // Panel collapse toggle
  panelToggle.addEventListener("click", () => {
    const collapsing = !sidePanel.classList.contains("is-collapsed");
    sidePanel.classList.toggle("is-collapsed");
    panelToggle.classList.toggle("is-collapsed");
    panelToggle.setAttribute("aria-expanded", String(!collapsing));
    panelToggle.setAttribute("aria-label", collapsing ? "Expand panel" : "Collapse panel");
    panelToggle.title = collapsing ? "Expand panel" : "Collapse panel";
  });
});
