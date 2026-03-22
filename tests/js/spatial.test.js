import { describe, it, expect, vi, afterEach } from "vitest";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import bbox from "@turf/bbox";
import { point } from "@turf/helpers";
import { fetchZoneClass, findWard } from "../../js/spatial.js";

// =====================================================================
// Turf dependency injection shim (used by findWard tests)
// =====================================================================

/**
 * In the browser, spatial.js uses the global `turf` object from the CDN script.
 * In Node/Vitest, we inject individual @turf/* packages via the turfLib parameter.
 */
const turfLib = { booleanPointInPolygon, bbox, point };

// =====================================================================
// Fixtures: minimal GeoJSON for deterministic tests
// =====================================================================

/**
 * A simple square polygon covering roughly [-87.7, 41.9] to [-87.6, 42.0].
 * Used as geometry for ward fixtures.
 */
const TEST_GEOMETRY = {
  type: "Polygon",
  coordinates: [
    [
      [-87.7, 41.9],
      [-87.6, 41.9],
      [-87.6, 42.0],
      [-87.7, 42.0],
      [-87.7, 41.9],
    ],
  ],
};

/** Ward fixture for ward 32. */
const WARD_FIXTURE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        ward: 32,
        alderman: "Scott Waguespack",
        website: "https://www.ward32.org/",
      },
      geometry: TEST_GEOMETRY,
    },
  ],
};

/** Ward fixture with no alderman field. */
const WARD_NO_ALDERMAN_FIXTURE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { ward: 5 },
      geometry: TEST_GEOMETRY,
    },
  ],
};

// Points used across tests
const INSIDE_POINT = [-87.65, 41.95];    // inside TEST_GEOMETRY polygon
const OUTSIDE_POINT = [-87.5, 41.85];   // outside all test polygons

// =====================================================================
// fetchZoneClass tests
// =====================================================================

describe("fetchZoneClass", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns normalized zone class on a successful ArcGIS response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ attributes: { ZONE_CLASS: " b1-1 " } }],
      }),
    }));

    const result = await fetchZoneClass([-87.65, 41.95]);
    expect(result).toBe("B1-1");
  });

  it("returns null when ArcGIS returns no features", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    }));

    const result = await fetchZoneClass([-87.65, 41.95]);
    expect(result).toBeNull();
  });

  it("throws an error on non-200 HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }));

    await expect(fetchZoneClass([-87.65, 41.95])).rejects.toThrow("503");
  });
});

// =====================================================================
// findWard tests
// =====================================================================

describe("findWard", () => {
  it("returns ward data for a point inside the ward polygon", () => {
    const result = findWard(INSIDE_POINT, WARD_FIXTURE, turfLib);
    expect(result).not.toBeNull();
    expect(result.ward).toBe(32);
    expect(result.alderperson).toBe("Scott Waguespack");
  });

  it("returns null for a point outside all ward polygons", () => {
    const result = findWard(OUTSIDE_POINT, WARD_FIXTURE, turfLib);
    expect(result).toBeNull();
  });

  it("handles missing alderperson field gracefully", () => {
    const result = findWard(INSIDE_POINT, WARD_NO_ALDERMAN_FIXTURE, turfLib);
    expect(result).not.toBeNull();
    // Should not throw; alderperson should be an empty string or similar
    expect(typeof result.alderperson).toBe("string");
    expect(result.ward).toBe(5);
  });
});
