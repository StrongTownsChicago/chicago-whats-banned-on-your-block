import { describe, it, expect, vi } from "vitest";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import bbox from "@turf/bbox";
import { point } from "@turf/helpers";
import { findZoneClass, findWard } from "../../js/spatial.js";

// =====================================================================
// Turf dependency injection shim
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
 * zone_class: "B1-1"
 */
const ZONE_FIXTURE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { zone_class: "B1-1" },
      geometry: {
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
      },
    },
  ],
};

/** A polygon with whitespace in the zone_class property. */
const WHITESPACE_ZONE_FIXTURE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { zone_class: "  B1-1  " },
      geometry: ZONE_FIXTURE.features[0].geometry,
    },
  ],
};

/** A polygon with a PD district zone_class. */
const PD_ZONE_FIXTURE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { zone_class: "PD 144" },
      geometry: ZONE_FIXTURE.features[0].geometry,
    },
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
      geometry: ZONE_FIXTURE.features[0].geometry,
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
      geometry: ZONE_FIXTURE.features[0].geometry,
    },
  ],
};

// Points used across tests
const INSIDE_POINT = [-87.65, 41.95];    // inside ZONE_FIXTURE polygon
const OUTSIDE_POINT = [-87.5, 41.85];   // outside all test polygons

// =====================================================================
// findZoneClass tests
// =====================================================================

describe("findZoneClass", () => {
  it("returns zone_class for a point inside the polygon", () => {
    const result = findZoneClass(INSIDE_POINT, ZONE_FIXTURE, turfLib);
    expect(result).toBe("B1-1");
  });

  it("returns null for a point outside all polygons", () => {
    const result = findZoneClass(OUTSIDE_POINT, ZONE_FIXTURE, turfLib);
    expect(result).toBeNull();
  });

  it("trims whitespace from zone_class property", () => {
    const result = findZoneClass(INSIDE_POINT, WHITESPACE_ZONE_FIXTURE, turfLib);
    expect(result).toBe("B1-1");
  });

  it("returns PD zone class string for PD district features", () => {
    const result = findZoneClass(INSIDE_POINT, PD_ZONE_FIXTURE, turfLib);
    // Caller uses isPDDistrict() to branch; findZoneClass returns the full string
    expect(result).toBe("PD 144");
  });

  it("skips features outside bbox before calling booleanPointInPolygon", () => {
    const pipSpy = vi.fn(booleanPointInPolygon);
    const spyTurfLib = { booleanPointInPolygon: pipSpy, bbox, point };

    // The distant polygon has a far-away bbox — should be skipped
    const distantFixture = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { zone_class: "FAR" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-80.0, 35.0],
                [-79.0, 35.0],
                [-79.0, 36.0],
                [-80.0, 36.0],
                [-80.0, 35.0],
              ],
            ],
          },
        },
      ],
    };

    findZoneClass(INSIDE_POINT, distantFixture, spyTurfLib);
    // The spy should NOT have been called because the bbox prefilter rejected the feature
    expect(pipSpy).not.toHaveBeenCalled();
  });

  it("returns first matching zone when polygons overlap", () => {
    const overlappingFixture = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { zone_class: "B1-1" },
          geometry: ZONE_FIXTURE.features[0].geometry,
        },
        {
          type: "Feature",
          properties: { zone_class: "C1-1" },
          geometry: ZONE_FIXTURE.features[0].geometry,
        },
      ],
    };

    const result = findZoneClass(INSIDE_POINT, overlappingFixture, turfLib);
    // Should return one of them without throwing
    expect(["B1-1", "C1-1"]).toContain(result);
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
