import { describe, it, expect } from "vitest";
import distance from "@turf/distance";
import { point } from "@turf/helpers";
import { isCCOEligibleZone, getCCOStatus } from "../../js/cco.js";

const turfLib = { distance, point };

// Reference point: roughly Logan Square (inside Chicago)
// REF = [-87.6500, 41.9500]
//
// Actual turf.distance values from reference point:
//   [-87.6442, 41.9500] → 0.298 miles  (WITHIN ½ mile rail threshold)
//   [-87.6354, 41.9500] → 0.750 miles  (OUTSIDE ½ mile rail threshold)
//   [-87.6468, 41.9500] → 0.164 miles  (WITHIN ¼ mile bus threshold)
//   [-87.6450, 41.9500] → 0.257 miles  (OUTSIDE ¼ mile bus, WITHIN ½ mile rail)
const REF = [-87.65, 41.95];

const RAIL_NEAR = { name: "Near Rail", lng: -87.6442, lat: 41.95, type: "rail" };
const RAIL_FAR = { name: "Far Rail", lng: -87.6354, lat: 41.95, type: "rail" };
const BUS_NEAR = {
  name: "Bus 79 / Near Stop",
  lng: -87.6468,
  lat: 41.95,
  type: "bus",
  route: "79",
};
// BUS_OUTSIDE_QUARTER: 0.257 miles from REF — outside ¼ mile bus threshold (0.25),
// but inside ½ mile rail threshold (0.50)
const BUS_OUTSIDE_QUARTER = {
  name: "Bus 79 / Mid Stop",
  lng: -87.645,
  lat: 41.95,
  type: "bus",
  route: "79",
};

// =========================================================================
// isCCOEligibleZone
// =========================================================================

describe("isCCOEligibleZone", () => {
  it("returns true for RS-1", () => {
    expect(isCCOEligibleZone("RS-1")).toBe(true);
  });

  it("returns true for RS-2", () => {
    expect(isCCOEligibleZone("RS-2")).toBe(true);
  });

  it("returns true for RS-3", () => {
    expect(isCCOEligibleZone("RS-3")).toBe(true);
  });

  it("returns false for RT-4 (low-density residential but not RS)", () => {
    expect(isCCOEligibleZone("RT-4")).toBe(false);
  });

  it("returns false for RT-3.5", () => {
    expect(isCCOEligibleZone("RT-3.5")).toBe(false);
  });

  it("returns false for B1-1 (commercial)", () => {
    expect(isCCOEligibleZone("B1-1")).toBe(false);
  });

  it("returns false for C1-2", () => {
    expect(isCCOEligibleZone("C1-2")).toBe(false);
  });

  it("returns false for RM-4.5 (multi-unit residential)", () => {
    expect(isCCOEligibleZone("RM-4.5")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isCCOEligibleZone(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isCCOEligibleZone(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isCCOEligibleZone("")).toBe(false);
  });
});

// =========================================================================
// getCCOStatus — zone ineligible short-circuit
// =========================================================================

describe("getCCOStatus — zone ineligible short-circuit", () => {
  const stationsAtSamePoint = [
    { name: "Same Point Rail", lng: REF[0], lat: REF[1], type: "rail" },
  ];

  it("returns eligible:false for RT-4 even with station at same point", () => {
    const result = getCCOStatus(REF, "RT-4", stationsAtSamePoint, turfLib);
    expect(result.eligible).toBe(false);
    expect(result.distanceMiles).toBe(null);
    expect(result.nearestName).toBe(null);
  });

  it("returns eligible:false for B1-1 with station at same point", () => {
    const result = getCCOStatus(REF, "B1-1", stationsAtSamePoint, turfLib);
    expect(result.eligible).toBe(false);
  });

  it("returns eligible:false for null zone with stations present", () => {
    const result = getCCOStatus(REF, null, stationsAtSamePoint, turfLib);
    expect(result.eligible).toBe(false);
  });
});

// =========================================================================
// getCCOStatus — rail proximity within threshold
// =========================================================================

describe("getCCOStatus — rail proximity within ½ mile threshold", () => {
  it("RS-3 + rail station at ~0.35 miles → eligible", () => {
    const result = getCCOStatus(REF, "RS-3", [RAIL_NEAR], turfLib);
    expect(result.eligible).toBe(true);
    expect(result.distanceMiles).toBeLessThanOrEqual(0.5);
    expect(result.nearestName).toBe("Near Rail");
  });

  it("RS-1 parcel at same point as station → eligible with distanceMiles ~0", () => {
    const samePoint = [{ name: "On Parcel", lng: REF[0], lat: REF[1], type: "rail" }];
    const result = getCCOStatus(REF, "RS-1", samePoint, turfLib);
    expect(result.eligible).toBe(true);
    expect(result.distanceMiles).toBeLessThan(0.01);
    expect(result.nearestName).toBe("On Parcel");
  });
});

// =========================================================================
// getCCOStatus — rail proximity outside threshold
// =========================================================================

describe("getCCOStatus — rail proximity outside ½ mile threshold", () => {
  it("RS-3 + only rail station at ~0.72 miles → not eligible", () => {
    const result = getCCOStatus(REF, "RS-3", [RAIL_FAR], turfLib);
    expect(result.eligible).toBe(false);
    expect(result.nearestName).toBe(null);
    // nearestRailDist should be reported for informational use
    expect(result.distanceMiles).toBeGreaterThan(0.5);
  });
});

// =========================================================================
// getCCOStatus — bus proximity within threshold
// =========================================================================

describe("getCCOStatus — bus proximity within ¼ mile threshold", () => {
  it("RS-2 + bus stop at ~0.20 miles + far rail → eligible via bus", () => {
    const result = getCCOStatus(REF, "RS-2", [RAIL_FAR, BUS_NEAR], turfLib);
    expect(result.eligible).toBe(true);
    expect(result.distanceMiles).toBeLessThanOrEqual(0.25);
    expect(result.nearestName).toBe("Bus 79 / Near Stop");
  });
});

// =========================================================================
// getCCOStatus — bus proximity outside threshold
// =========================================================================

describe("getCCOStatus — bus proximity outside ¼ mile threshold", () => {
  it("RS-2 + bus stop at 0.257 miles (> 0.25) → not eligible via bus alone", () => {
    // BUS_OUTSIDE_QUARTER is at lng -87.645, 0.257 miles from REF — just outside ¼ mile
    const result = getCCOStatus(REF, "RS-2", [BUS_OUTSIDE_QUARTER], turfLib);
    expect(result.eligible).toBe(false);
  });

  it("RS-2 + bus at 0.257 miles + rail within ½ mile → eligible via rail", () => {
    // When both bus (outside ¼ mi) and rail (within ½ mi) are present,
    // rail proximity qualifies the parcel
    const result = getCCOStatus(REF, "RS-2", [BUS_OUTSIDE_QUARTER, RAIL_NEAR], turfLib);
    expect(result.eligible).toBe(true);
    expect(result.nearestName).toBe("Near Rail");
  });
});

// =========================================================================
// getCCOStatus — empty / null stations array
// =========================================================================

describe("getCCOStatus — empty or null stations", () => {
  it("RS-3 + empty stations array → not eligible", () => {
    const result = getCCOStatus(REF, "RS-3", [], turfLib);
    expect(result.eligible).toBe(false);
    expect(result.distanceMiles).toBe(null);
    expect(result.nearestName).toBe(null);
  });

  it("RS-3 + null stations → not eligible (defensive)", () => {
    const result = getCCOStatus(REF, "RS-3", null, turfLib);
    expect(result.eligible).toBe(false);
  });
});
