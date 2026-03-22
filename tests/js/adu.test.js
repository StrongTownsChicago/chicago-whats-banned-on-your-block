import { describe, it, expect } from "vitest";
import {
  isADUEligibleZone,
  getADUStatus,
  ADU_ELIGIBLE_ZONES,
} from "../../js/adu.js";

// Representative subset of WARD_OPT_IN_INFO used as test fixtures.
// Tests are isolated from adu-ward-data.js to avoid coupling.
const MOCK_WARD_DATA = {
  1: { type: "full", block_limits: false, homeowner_req: false, admin_adj: false },
  6: {
    type: "full",
    block_limits: true,
    homeowner_req: true,
    admin_adj: true,
    notes: "Whole ward (including the part currently in the pilot)",
  },
  14: {
    type: "partial",
    block_limits: true,
    homeowner_req: true,
    admin_adj: true,
    notes: "Partial. Only precincts 1, 4, 9, and 15",
  },
  30: {
    type: "partial",
    block_limits: true,
    homeowner_req: true,
    admin_adj: true,
    notes: "Partial. Whole ward except for precincts 1, 4, 9, and 21.",
  },
  3: {
    type: "not_eligible",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
    notes: "not eligible (no SFH zoning to opt-in)",
  },
};

// =========================================================================
// ADU_ELIGIBLE_ZONES constant
// =========================================================================

describe("ADU_ELIGIBLE_ZONES", () => {
  it("contains RS-1", () => {
    expect(ADU_ELIGIBLE_ZONES.has("RS-1")).toBe(true);
  });

  it("contains RS-2", () => {
    expect(ADU_ELIGIBLE_ZONES.has("RS-2")).toBe(true);
  });

  it("contains RS-3", () => {
    expect(ADU_ELIGIBLE_ZONES.has("RS-3")).toBe(true);
  });

  it("contains RT-3.5", () => {
    expect(ADU_ELIGIBLE_ZONES.has("RT-3.5")).toBe(true);
  });

  it("contains RT-4", () => {
    expect(ADU_ELIGIBLE_ZONES.has("RT-4")).toBe(true);
  });

  it("contains RT-4A", () => {
    expect(ADU_ELIGIBLE_ZONES.has("RT-4A")).toBe(true);
  });

  it("does not contain RT-3", () => {
    expect(ADU_ELIGIBLE_ZONES.has("RT-3")).toBe(false);
  });

  it("does not contain B1-1", () => {
    expect(ADU_ELIGIBLE_ZONES.has("B1-1")).toBe(false);
  });

  it("has exactly 6 entries", () => {
    expect(ADU_ELIGIBLE_ZONES.size).toBe(6);
  });
});

// =========================================================================
// isADUEligibleZone
// =========================================================================

describe("isADUEligibleZone", () => {
  it("returns true for RS-1", () => {
    expect(isADUEligibleZone("RS-1")).toBe(true);
  });

  it("returns true for RS-2", () => {
    expect(isADUEligibleZone("RS-2")).toBe(true);
  });

  it("returns true for RS-3", () => {
    expect(isADUEligibleZone("RS-3")).toBe(true);
  });

  it("returns true for RT-3.5", () => {
    expect(isADUEligibleZone("RT-3.5")).toBe(true);
  });

  it("returns true for RT-4", () => {
    expect(isADUEligibleZone("RT-4")).toBe(true);
  });

  it("returns true for RT-4A", () => {
    expect(isADUEligibleZone("RT-4A")).toBe(true);
  });

  it("returns false for RT-3 (not in eligible set)", () => {
    expect(isADUEligibleZone("RT-3")).toBe(false);
  });

  it("returns false for B1-1", () => {
    expect(isADUEligibleZone("B1-1")).toBe(false);
  });

  it("returns false for C1-2", () => {
    expect(isADUEligibleZone("C1-2")).toBe(false);
  });

  it("returns false for RM-4.5", () => {
    expect(isADUEligibleZone("RM-4.5")).toBe(false);
  });

  it("returns false for RS-4 (does not exist; tests boundary)", () => {
    expect(isADUEligibleZone("RS-4")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isADUEligibleZone(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isADUEligibleZone(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isADUEligibleZone("")).toBe(false);
  });
});

// =========================================================================
// getADUStatus — zone ineligible
// =========================================================================

describe("getADUStatus — zone ineligible", () => {
  it("B1-1 zone returns zoneEligible:false", () => {
    const result = getADUStatus("B1-1", 1, MOCK_WARD_DATA);
    expect(result).toEqual({ zoneEligible: false });
  });

  it("RT-3 zone returns zoneEligible:false", () => {
    const result = getADUStatus("RT-3", 1, MOCK_WARD_DATA);
    expect(result).toEqual({ zoneEligible: false });
  });

  it("null zone returns zoneEligible:false", () => {
    const result = getADUStatus(null, 1, MOCK_WARD_DATA);
    expect(result).toEqual({ zoneEligible: false });
  });

  it("ineligible zone result has no 'available' key", () => {
    const result = getADUStatus("B1-1", 1, MOCK_WARD_DATA);
    expect(Object.keys(result)).toEqual(["zoneEligible"]);
  });
});

// =========================================================================
// getADUStatus — zone eligible, ward fully opted in (no restrictions)
// =========================================================================

describe("getADUStatus — zone eligible, ward fully opted in (no restrictions)", () => {
  it("RS-3 + ward 1 → available:true, full opt-in, no caveats", () => {
    const result = getADUStatus("RS-3", 1, MOCK_WARD_DATA);
    expect(result).toEqual({
      zoneEligible: true,
      available: true,
      wardOptIn: "full",
      blockLimits: false,
      homeownerReq: false,
      adminAdj: false,
      notes: null,
    });
  });
});

// =========================================================================
// getADUStatus — zone eligible, ward fully opted in (with restrictions)
// =========================================================================

describe("getADUStatus — zone eligible, ward fully opted in (with restrictions)", () => {
  it("RS-3 + ward 6 → available:true, full, all restrictions set", () => {
    const result = getADUStatus("RS-3", 6, MOCK_WARD_DATA);
    expect(result.zoneEligible).toBe(true);
    expect(result.available).toBe(true);
    expect(result.wardOptIn).toBe("full");
    expect(result.blockLimits).toBe(true);
    expect(result.homeownerReq).toBe(true);
    expect(result.adminAdj).toBe(true);
    expect(result.notes).toEqual(expect.stringContaining("pilot"));
  });
});

// =========================================================================
// getADUStatus — zone eligible, ward partial opt-in
// =========================================================================

describe("getADUStatus — zone eligible, ward partial opt-in", () => {
  it("RS-3 + ward 14 → available:true, partial opt-in, precinct notes", () => {
    const result = getADUStatus("RS-3", 14, MOCK_WARD_DATA);
    expect(result.zoneEligible).toBe(true);
    expect(result.available).toBe(true);
    expect(result.wardOptIn).toBe("partial");
    expect(result.blockLimits).toBe(true);
    expect(result.homeownerReq).toBe(true);
    expect(result.adminAdj).toBe(true);
    expect(result.notes).toEqual(expect.stringContaining("precincts"));
  });

  it("RS-3 + ward 30 → available:true, partial opt-in", () => {
    const result = getADUStatus("RS-3", 30, MOCK_WARD_DATA);
    expect(result.available).toBe(true);
    expect(result.wardOptIn).toBe("partial");
  });
});

// =========================================================================
// getADUStatus — zone eligible, ward not opted in
// =========================================================================

describe("getADUStatus — zone eligible, ward not opted in", () => {
  it("RS-3 + ward 7 (not in mock data) → not_opted_in, available:false", () => {
    const result = getADUStatus("RS-3", 7, MOCK_WARD_DATA);
    expect(result).toEqual({
      zoneEligible: true,
      available: false,
      wardOptIn: "not_opted_in",
      blockLimits: false,
      homeownerReq: false,
      adminAdj: false,
      notes: null,
    });
  });
});

// =========================================================================
// getADUStatus — zone eligible, ward is not_eligible (ward 3)
// =========================================================================

describe("getADUStatus — zone eligible, ward not_eligible", () => {
  it("RS-3 + ward 3 → available:false, wardOptIn:not_eligible", () => {
    const result = getADUStatus("RS-3", 3, MOCK_WARD_DATA);
    expect(result.zoneEligible).toBe(true);
    expect(result.available).toBe(false);
    expect(result.wardOptIn).toBe("not_eligible");
    expect(result.blockLimits).toBe(false);
    expect(result.homeownerReq).toBe(false);
    expect(result.adminAdj).toBe(false);
    expect(result.notes).toEqual(expect.stringContaining("not eligible"));
  });
});

// =========================================================================
// getADUStatus — zone eligible, wardNumber is null
// =========================================================================

describe("getADUStatus — zone eligible, wardNumber is null", () => {
  it("RS-3 + null ward → not_opted_in, available:false", () => {
    const result = getADUStatus("RS-3", null, MOCK_WARD_DATA);
    expect(result).toEqual({
      zoneEligible: true,
      available: false,
      wardOptIn: "not_opted_in",
      blockLimits: false,
      homeownerReq: false,
      adminAdj: false,
      notes: null,
    });
  });
});

// =========================================================================
// getADUStatus — RT zones also eligible
// =========================================================================

describe("getADUStatus — RT zones eligible", () => {
  it("RT-4 + ward 1 → zoneEligible:true, available:true", () => {
    const result = getADUStatus("RT-4", 1, MOCK_WARD_DATA);
    expect(result.zoneEligible).toBe(true);
    expect(result.available).toBe(true);
    expect(result.wardOptIn).toBe("full");
  });

  it("RT-4A + ward 1 → zoneEligible:true, available:true", () => {
    const result = getADUStatus("RT-4A", 1, MOCK_WARD_DATA);
    expect(result.zoneEligible).toBe(true);
    expect(result.available).toBe(true);
  });

  it("RT-3.5 + ward 1 → zoneEligible:true, available:true", () => {
    const result = getADUStatus("RT-3.5", 1, MOCK_WARD_DATA);
    expect(result.zoneEligible).toBe(true);
    expect(result.available).toBe(true);
  });
});
