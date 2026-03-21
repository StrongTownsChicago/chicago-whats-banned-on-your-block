/**
 * geocode.js — Mapbox Geocoding API wrapper.
 *
 * Single responsibility: convert a Chicago street address string to
 * a { lngLat, placeName } result using the Mapbox Geocoding API v5.
 *
 * The bbox parameter constrains results to the Chicago metro area,
 * preventing spurious matches for common street names.
 */

const GEOCODING_BASE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";

// Chicago metro bounding box: west, south, east, north
const CHICAGO_BBOX = "-88.0,41.6,-87.5,42.1";

/**
 * Geocode an address string to a lat/lon using the Mapbox Geocoding API.
 *
 * @param {string} address - Street address to geocode.
 * @param {string} mapboxToken - Mapbox public access token.
 * @returns {Promise<{ lngLat: [number, number], placeName: string } | null>}
 *   Returns null if no results are found, the API returns an error, or a
 *   network error occurs. Never throws.
 */
export async function geocodeAddress(address, mapboxToken) {
  try {
    const encodedAddress = encodeURIComponent(address);
    const url =
      `${GEOCODING_BASE_URL}/${encodedAddress}.json` +
      `?country=US` +
      `&bbox=${CHICAGO_BBOX}` +
      `&access_token=${mapboxToken}`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Geocoding API returned HTTP ${response.status} for address: ${address}`);
      return null;
    }

    const data = await response.json();

    if (!data.features || data.features.length === 0) {
      return null;
    }

    const firstResult = data.features[0];
    const lngLat = firstResult.center; // [longitude, latitude]
    const placeName = firstResult.place_name || address;

    return { lngLat, placeName };
  } catch (error) {
    console.error("Geocoding request failed:", error);
    return null;
  }
}
