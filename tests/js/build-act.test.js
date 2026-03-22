import { describe, it, expect } from "vitest";
import {
  isBuildActDistrict,
  applyBuildActOverrides,
  getBuildActUnlockCount,
  getBuildActAduOverride,
} from "../../js/build-act.js";

// =========================================================================
// Fixtures
// =========================================================================

// RS-1 / RS-2: all four middle-housing slugs are banned
const USES_RS1 = {
  banned: [
    { slug: "two_flat", label: "2-flat / coach house" },
    { slug: "three_flat", label: "3-flat" },
    { slug: "four_flat", label: "4-flat" },
    { slug: "townhouse", label: "Townhouse" },
    { slug: "daycare_center", label: "Daycare center" },
  ],
  specialUse: [],
  conditional: [],
  permitted: [{ slug: "single_family_detached", label: "Single-family detached home" }],
};

// RS-3: two_flat is already permitted; three_flat/four_flat/townhouse are banned
const USES_RS3 = {
  banned: [
    { slug: "three_flat", label: "3-flat" },
    { slug: "four_flat", label: "4-flat" },
    { slug: "townhouse", label: "Townhouse" },
    { slug: "daycare_center", label: "Daycare center" },
  ],
  specialUse: [],
  conditional: [],
  permitted: [
    { slug: "single_family_detached", label: "Single-family detached home" },
    { slug: "two_flat", label: "2-flat / coach house" },
  ],
};

// Non-RS zone
const USES_B1 = {
  banned: [],
  specialUse: [{ slug: "daycare_center", label: "Daycare center" }],
  conditional: [],
  permitted: [{ slug: "retail_sales_general", label: "Corner store or retail shop" }],
};

// RS-1 where all BUILD Act target slugs are already in permitted (edge case)
const USES_RS1_ALL_PERMITTED = {
  banned: [{ slug: "daycare_center", label: "Daycare center" }],
  specialUse: [],
  conditional: [],
  permitted: [
    { slug: "two_flat", label: "2-flat / coach house" },
    { slug: "three_flat", label: "3-flat" },
    { slug: "four_flat", label: "4-flat" },
    { slug: "townhouse", label: "Townhouse" },
  ],
};

// ADU status fixture: ward has not opted in
const ADU_NOT_OPTED_IN = {
  zoneEligible: true,
  available: false,
  wardOptIn: "not_opted_in",
  blockLimits: false,
  homeownerReq: false,
  adminAdj: false,
  notes: null,
};

// ADU status fixture: ward fully opted in
const ADU_FULL = {
  zoneEligible: true,
  available: true,
  wardOptIn: "full",
  blockLimits: false,
  homeownerReq: false,
  adminAdj: false,
  notes: null,
};

// =========================================================================
// isBuildActDistrict
// =========================================================================

describe("isBuildActDistrict", () => {
  it("returns true for RS-1", () => {
    expect(isBuildActDistrict("RS-1")).toBe(true);
  });

  it("returns true for RS-2", () => {
    expect(isBuildActDistrict("RS-2")).toBe(true);
  });

  it("returns true for RS-3", () => {
    expect(isBuildActDistrict("RS-3")).toBe(true);
  });

  it("returns false for RT-4", () => {
    expect(isBuildActDistrict("RT-4")).toBe(false);
  });

  it("returns false for RT-3.5", () => {
    expect(isBuildActDistrict("RT-3.5")).toBe(false);
  });

  it("returns false for B1-1", () => {
    expect(isBuildActDistrict("B1-1")).toBe(false);
  });

  it("returns false for RM-4.5", () => {
    expect(isBuildActDistrict("RM-4.5")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isBuildActDistrict(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isBuildActDistrict(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isBuildActDistrict("")).toBe(false);
  });
});

// =========================================================================
// applyBuildActOverrides — RS-1 (all four middle-housing banned)
// =========================================================================

describe("applyBuildActOverrides — RS-1 (all four middle-housing banned)", () => {
  it("promotedByBuildAct contains exactly four slugs: two_flat, three_flat, four_flat, townhouse", () => {
    const result = applyBuildActOverrides("RS-1", USES_RS1);
    expect(result.promotedByBuildAct).toHaveLength(4);
    const slugs = result.promotedByBuildAct.map((u) => u.slug);
    expect(slugs).toContain("two_flat");
    expect(slugs).toContain("three_flat");
    expect(slugs).toContain("four_flat");
    expect(slugs).toContain("townhouse");
  });

  it("banned retains only non-BUILD-Act items (daycare_center)", () => {
    const result = applyBuildActOverrides("RS-1", USES_RS1);
    expect(result.banned).toHaveLength(1);
    expect(result.banned[0].slug).toBe("daycare_center");
  });

  it("specialUse, conditional, permitted arrays are passed through unchanged", () => {
    const result = applyBuildActOverrides("RS-1", USES_RS1);
    expect(result.specialUse).toStrictEqual(USES_RS1.specialUse);
    expect(result.conditional).toStrictEqual(USES_RS1.conditional);
    expect(result.permitted).toStrictEqual(USES_RS1.permitted);
  });

  it("does not mutate the input uses object", () => {
    const original = JSON.parse(JSON.stringify(USES_RS1));
    applyBuildActOverrides("RS-1", USES_RS1);
    expect(USES_RS1.banned).toHaveLength(original.banned.length);
    expect(USES_RS1).not.toHaveProperty("promotedByBuildAct");
  });
});

// =========================================================================
// applyBuildActOverrides — RS-3 (two_flat already permitted)
// =========================================================================

describe("applyBuildActOverrides — RS-3 (two_flat already permitted, not in banned)", () => {
  it("promotedByBuildAct contains three slugs: three_flat, four_flat, townhouse", () => {
    const result = applyBuildActOverrides("RS-3", USES_RS3);
    expect(result.promotedByBuildAct).toHaveLength(3);
    const slugs = result.promotedByBuildAct.map((u) => u.slug);
    expect(slugs).toContain("three_flat");
    expect(slugs).toContain("four_flat");
    expect(slugs).toContain("townhouse");
  });

  it("banned retains only non-BUILD-Act items (daycare_center)", () => {
    const result = applyBuildActOverrides("RS-3", USES_RS3);
    expect(result.banned).toHaveLength(1);
    expect(result.banned[0].slug).toBe("daycare_center");
  });

  it("two_flat remains in permitted (not duplicated into promotedByBuildAct)", () => {
    const result = applyBuildActOverrides("RS-3", USES_RS3);
    const promotedSlugs = result.promotedByBuildAct.map((u) => u.slug);
    expect(promotedSlugs).not.toContain("two_flat");
    const permittedSlugs = result.permitted.map((u) => u.slug);
    expect(permittedSlugs).toContain("two_flat");
  });
});

// =========================================================================
// applyBuildActOverrides — non-RS zone
// =========================================================================

describe("applyBuildActOverrides — non-RS zone", () => {
  it("B1-1: returns uses object with no promotedByBuildAct field added", () => {
    const result = applyBuildActOverrides("B1-1", USES_B1);
    expect(result).toBe(USES_B1);
  });
});

// =========================================================================
// applyBuildActOverrides — null uses input
// =========================================================================

describe("applyBuildActOverrides — null uses input", () => {
  it("returns null unchanged when uses is null", () => {
    expect(applyBuildActOverrides("RS-1", null)).toBe(null);
  });

  it("returns undefined unchanged when uses is undefined", () => {
    expect(applyBuildActOverrides("RS-1", undefined)).toBe(undefined);
  });
});

// =========================================================================
// getBuildActUnlockCount
// =========================================================================

describe("getBuildActUnlockCount", () => {
  it("RS-1 with all four banned → returns 4", () => {
    expect(getBuildActUnlockCount("RS-1", USES_RS1)).toBe(4);
  });

  it("RS-3 with three banned (two_flat already P) → returns 3", () => {
    expect(getBuildActUnlockCount("RS-3", USES_RS3)).toBe(3);
  });

  it("non-RS zone (B1-1) → returns 0", () => {
    expect(getBuildActUnlockCount("B1-1", USES_B1)).toBe(0);
  });

  it("RS-1 with no middle-housing in banned (all already P) → returns 0", () => {
    expect(getBuildActUnlockCount("RS-1", USES_RS1_ALL_PERMITTED)).toBe(0);
  });
});

// =========================================================================
// getBuildActAduOverride — RS zone with not_opted_in ADU status
// =========================================================================

describe("getBuildActAduOverride — RS zone with not_opted_in ADU status", () => {
  it("RS-1 + not_opted_in → returns object with buildActOverride: true", () => {
    const result = getBuildActAduOverride("RS-1", ADU_NOT_OPTED_IN);
    expect(result.buildActOverride).toBe(true);
  });

  it("RS-1 + not_opted_in → all existing fields preserved", () => {
    const result = getBuildActAduOverride("RS-1", ADU_NOT_OPTED_IN);
    expect(result.zoneEligible).toBe(ADU_NOT_OPTED_IN.zoneEligible);
    expect(result.wardOptIn).toBe(ADU_NOT_OPTED_IN.wardOptIn);
    expect(result.available).toBe(ADU_NOT_OPTED_IN.available);
    expect(result.blockLimits).toBe(ADU_NOT_OPTED_IN.blockLimits);
    expect(result.homeownerReq).toBe(ADU_NOT_OPTED_IN.homeownerReq);
    expect(result.notes).toBe(ADU_NOT_OPTED_IN.notes);
  });
});

// =========================================================================
// getBuildActAduOverride — RS zone with full ADU opt-in
// =========================================================================

describe("getBuildActAduOverride — RS zone with full ADU opt-in", () => {
  it("RS-3 + full opt-in → returns object with buildActOverride: true", () => {
    const result = getBuildActAduOverride("RS-3", ADU_FULL);
    expect(result.buildActOverride).toBe(true);
  });
});

// =========================================================================
// getBuildActAduOverride — non-RS zone
// =========================================================================

describe("getBuildActAduOverride — non-RS zone", () => {
  it("B1-1 + any ADU status → returns aduStatus unchanged (same reference)", () => {
    const result = getBuildActAduOverride("B1-1", ADU_FULL);
    expect(result).toBe(ADU_FULL);
  });

  it("RT-4 + full → returns aduStatus unchanged (no buildActOverride field)", () => {
    const result = getBuildActAduOverride("RT-4", ADU_FULL);
    expect(result).toBe(ADU_FULL);
    expect(result).not.toHaveProperty("buildActOverride");
  });
});

// =========================================================================
// getBuildActAduOverride — null/undefined aduStatus
// =========================================================================

describe("getBuildActAduOverride — null/undefined aduStatus", () => {
  it("null aduStatus for non-RS zone → returns null unchanged", () => {
    expect(getBuildActAduOverride("B1-1", null)).toBe(null);
  });

  it("null aduStatus for RS zone → returns null unchanged (no crash)", () => {
    expect(getBuildActAduOverride("RS-1", null)).toBe(null);
  });
});
