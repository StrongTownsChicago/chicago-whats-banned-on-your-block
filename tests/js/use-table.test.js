import { describe, it, expect } from "vitest";
import {
  getRestrictedUses,
  isPDDistrict,
  isDDowntownDistrict,
  USE_DISPLAY_LABELS,
  ADVOCACY_USES_LIST,
} from "../../js/use-table.js";

// =====================================================================
// Minimal use table fixtures for isolated testing
// =====================================================================

/** A minimal use table with one zone containing a mix of permission codes. */
const MIXED_USE_TABLE = {
  "B1-1": {
    daycare_center:       "—",     // banned
    live_work_unit:       "S",     // special use
    hair_salon_barbershop: "P/S",  // conditional
    personal_service:     "P/-",   // conditional
    single_family_detached: "P",   // permitted — should be excluded
    two_flat:             "P",
    three_flat:           "P",
    four_flat:            "P",
    multi_unit_residential: "P",
    artist_live_work:     "P",
    neighborhood_grocery_small: "P",
    food_production_artisan: "P",
    eating_drinking_limited: "P",
    eating_drinking_general: "P",
    community_center:     "P",
    place_of_worship:     "P",
    urban_farm:           "P",
    community_garden:     "P",
    medical_clinic:       "P",
    bed_and_breakfast:    "P",
    daycare_home:         "P",
  },
};

/** A zone where all 21 uses are permitted. */
const ALL_PERMITTED_TABLE = {
  "RS-3": Object.fromEntries(ADVOCACY_USES_LIST.map((slug) => [slug, "P"])),
};

/** A zone where one use has the Unicode replacement character encoding artifact. */
const UFFFD_TABLE = {
  "C1-1": {
    ...Object.fromEntries(ADVOCACY_USES_LIST.map((slug) => [slug, "P"])),
    daycare_center: "\ufffd", // encoding artifact — should be treated as banned
  },
};

// =====================================================================
// getRestrictedUses tests
// =====================================================================

describe("getRestrictedUses", () => {
  it("classifies em-dash entries as banned", () => {
    const result = getRestrictedUses("B1-1", MIXED_USE_TABLE);
    expect(result).not.toBeNull();
    expect(result.banned).toHaveLength(1);
    expect(result.banned[0]).toMatchObject({ slug: "daycare_center", label: expect.any(String) });
  });

  it("normalizes \\ufffd replacement character to banned", () => {
    const result = getRestrictedUses("C1-1", UFFFD_TABLE);
    expect(result).not.toBeNull();
    expect(result.banned.some((e) => e.slug === "daycare_center")).toBe(true);
  });

  it("classifies S entries as special use", () => {
    const result = getRestrictedUses("B1-1", MIXED_USE_TABLE);
    expect(result).not.toBeNull();
    expect(result.specialUse).toHaveLength(1);
    expect(result.specialUse[0]).toMatchObject({ slug: "live_work_unit", label: expect.any(String) });
  });

  it("classifies P/S entries as permitted (by-right at standard size)", () => {
    const result = getRestrictedUses("B1-1", MIXED_USE_TABLE);
    expect(result).not.toBeNull();
    const slugs = result.permitted.map((e) => e.slug);
    expect(slugs).toContain("hair_salon_barbershop");
    // P/S must not appear in conditional
    expect(result.conditional.map((e) => e.slug)).not.toContain("hair_salon_barbershop");
  });

  it("classifies P/- entries as conditional", () => {
    const result = getRestrictedUses("B1-1", MIXED_USE_TABLE);
    expect(result).not.toBeNull();
    const slugs = result.conditional.map((e) => e.slug);
    expect(slugs).toContain("personal_service");
  });

  it("classifies P entries into the permitted array", () => {
    const result = getRestrictedUses("RS-3", ALL_PERMITTED_TABLE);
    expect(result).not.toBeNull();
    expect(result.banned).toHaveLength(0);
    expect(result.specialUse).toHaveLength(0);
    expect(result.conditional).toHaveLength(0);
    expect(result.permitted).toHaveLength(ADVOCACY_USES_LIST.length);
  });

  it("returns null for an unknown zone class", () => {
    const result = getRestrictedUses("ZZ-99", MIXED_USE_TABLE);
    expect(result).toBeNull();
  });

  it("preserves ADVOCACY_USES_LIST order within each category", () => {
    const multiZoneTable = {
      "TEST": {
        ...Object.fromEntries(ADVOCACY_USES_LIST.map((slug) => [slug, "—"])),
      },
    };

    const result = getRestrictedUses("TEST", multiZoneTable);
    const bannedSlugs = result.banned.map((e) => e.slug);

    // The banned array should follow the ADVOCACY_USES_LIST order
    const filteredCanonical = ADVOCACY_USES_LIST.filter((slug) =>
      bannedSlugs.includes(slug)
    );
    expect(bannedSlugs).toEqual(filteredCanonical);
  });

  it("handles a realistic mixed district with P, S, —, P/S codes", () => {
    const result = getRestrictedUses("B1-1", MIXED_USE_TABLE);
    expect(result).not.toBeNull();
    // Verify the structure is correct and nothing throws
    expect(Array.isArray(result.banned)).toBe(true);
    expect(Array.isArray(result.specialUse)).toBe(true);
    expect(Array.isArray(result.conditional)).toBe(true);
    // single_family_detached is "P" → must appear in permitted, not restricted
    expect(result.permitted.map((e) => e.slug)).toContain("single_family_detached");
    const restrictedSlugs = [
      ...result.banned.map((e) => e.slug),
      ...result.specialUse.map((e) => e.slug),
      ...result.conditional.map((e) => e.slug),
    ];
    expect(restrictedSlugs).not.toContain("single_family_detached");
  });
});

// =====================================================================
// isPDDistrict tests
// =====================================================================

describe("isPDDistrict", () => {
  it("returns true for zone classes starting with PD", () => {
    expect(isPDDistrict("PD 144")).toBe(true);
    expect(isPDDistrict("PD")).toBe(true);
    expect(isPDDistrict("PD1")).toBe(true);
  });

  it("returns false for regular zone classes", () => {
    expect(isPDDistrict("B1-1")).toBe(false);
    expect(isPDDistrict("C3-2")).toBe(false);
    expect(isPDDistrict("RS-3")).toBe(false);
    expect(isPDDistrict("M1-2")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isPDDistrict("pd 1")).toBe(true);
    expect(isPDDistrict("Pd 144")).toBe(true);
    expect(isPDDistrict("pD 55")).toBe(true);
  });

  it("returns false for empty or non-string inputs", () => {
    expect(isPDDistrict("")).toBe(false);
    expect(isPDDistrict(null)).toBe(false);
    expect(isPDDistrict(undefined)).toBe(false);
  });
});

// =====================================================================
// isDDowntownDistrict tests
// =====================================================================

describe("isDDowntownDistrict", () => {
  it("returns true for all four downtown district types", () => {
    expect(isDDowntownDistrict("DC-12")).toBe(true);
    expect(isDDowntownDistrict("DC-16")).toBe(true);
    expect(isDDowntownDistrict("DX-3")).toBe(true);
    expect(isDDowntownDistrict("DX-16")).toBe(true);
    expect(isDDowntownDistrict("DR-3")).toBe(true);
    expect(isDDowntownDistrict("DR-10")).toBe(true);
    expect(isDDowntownDistrict("DS-3")).toBe(true);
    expect(isDDowntownDistrict("DS-5")).toBe(true);
  });

  it("returns false for non-downtown zone classes", () => {
    expect(isDDowntownDistrict("B1-1")).toBe(false);
    expect(isDDowntownDistrict("C3-2")).toBe(false);
    expect(isDDowntownDistrict("M1-2")).toBe(false);
    expect(isDDowntownDistrict("RS-3")).toBe(false);
    expect(isDDowntownDistrict("PD 144")).toBe(false);
    expect(isDDowntownDistrict("PMD-1")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isDDowntownDistrict("dc-12")).toBe(true);
    expect(isDDowntownDistrict("Dx-5")).toBe(true);
    expect(isDDowntownDistrict("DR-7")).toBe(true);
  });

  it("returns false for empty or non-string inputs", () => {
    expect(isDDowntownDistrict("")).toBe(false);
    expect(isDDowntownDistrict(null)).toBe(false);
    expect(isDDowntownDistrict(undefined)).toBe(false);
  });
});

// =====================================================================
// USE_DISPLAY_LABELS coverage test
// =====================================================================

describe("USE_DISPLAY_LABELS", () => {
  it("covers all slugs in ADVOCACY_USES_LIST", () => {
    for (const slug of ADVOCACY_USES_LIST) {
      expect(USE_DISPLAY_LABELS).toHaveProperty(slug);
      expect(typeof USE_DISPLAY_LABELS[slug]).toBe("string");
      expect(USE_DISPLAY_LABELS[slug].length).toBeGreaterThan(0);
    }
  });

  it("has exactly as many entries as ADVOCACY_USES_LIST", () => {
    expect(Object.keys(USE_DISPLAY_LABELS)).toHaveLength(ADVOCACY_USES_LIST.length);
  });
});
