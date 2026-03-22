import { describe, it, expect } from "vitest";
import {
  getRestrictedUses,
  isPDDistrict,
  isPOSDistrict,
  isPMDDistrict,
  isTDistrict,
  isDDowntownDistrict,
  normalizeZoneClass,
  USE_DISPLAY_LABELS,
  SLUG_CATEGORY,
  ADVOCACY_USES_LIST,
} from "../../js/use-table.js";

// =====================================================================
// Minimal use table fixtures for isolated testing
// =====================================================================

/** A minimal use table with one zone containing a mix of permission codes. */
const MIXED_USE_TABLE = {
  "B1-1": {
    daycare_center:       "—",     // banned
    community_center:     "S",     // special use
    hair_salon_barbershop: "P/S",  // conditional
    personal_service:     "P/-",   // conditional
    single_family_detached: "P",   // permitted — should be excluded
    two_flat:             "P",
    three_flat:           "P",
    four_flat:            "P",
    multi_unit_residential: "P",
    neighborhood_grocery_small: "P",
    food_production_artisan: "P",
    eating_drinking_limited: "P",
    eating_drinking_general: "P",
    tavern:               "P",
    retail_sales_general: "P",
    place_of_worship:     "P",
    urban_farm:           "P",
    community_garden:     "P",
    medical_clinic:       "P",
    body_art_services:    "P",
    daycare_home:         "P",
  },
};

/** A zone where all tracked uses are permitted. */
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
    expect(result.specialUse[0]).toMatchObject({ slug: "community_center", label: expect.any(String) });
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

// =====================================================================
// isPOSDistrict tests
// =====================================================================

describe("isPOSDistrict", () => {
  it("returns true for POS zone classes", () => {
    expect(isPOSDistrict("POS-1")).toBe(true);
    expect(isPOSDistrict("POS")).toBe(true);
    expect(isPOSDistrict("POS-2")).toBe(true);
  });

  it("returns false for regular zone classes", () => {
    expect(isPOSDistrict("B1-1")).toBe(false);
    expect(isPOSDistrict("C3-2")).toBe(false);
    expect(isPOSDistrict("RS-3")).toBe(false);
    expect(isPOSDistrict("PD 144")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isPOSDistrict("pos-1")).toBe(true);
    expect(isPOSDistrict("Pos-2")).toBe(true);
  });

  it("returns false for empty or non-string inputs", () => {
    expect(isPOSDistrict("")).toBe(false);
    expect(isPOSDistrict(null)).toBe(false);
    expect(isPOSDistrict(undefined)).toBe(false);
  });
});

// =====================================================================
// isPMDDistrict tests
// =====================================================================

describe("isPMDDistrict", () => {
  it("returns true for PMD zone classes", () => {
    expect(isPMDDistrict("PMD-1")).toBe(true);
    expect(isPMDDistrict("PMD")).toBe(true);
    expect(isPMDDistrict("PMD-7")).toBe(true);
  });

  it("returns false for regular zone classes", () => {
    expect(isPMDDistrict("B1-1")).toBe(false);
    expect(isPMDDistrict("M1-2")).toBe(false);
    expect(isPMDDistrict("RS-3")).toBe(false);
    expect(isPMDDistrict("PD 144")).toBe(false);
    expect(isPMDDistrict("POS-1")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isPMDDistrict("pmd-1")).toBe(true);
    expect(isPMDDistrict("Pmd-7")).toBe(true);
  });

  it("returns false for empty or non-string inputs", () => {
    expect(isPMDDistrict("")).toBe(false);
    expect(isPMDDistrict(null)).toBe(false);
    expect(isPMDDistrict(undefined)).toBe(false);
  });
});

// =====================================================================
// isTDistrict tests
// =====================================================================

describe("isTDistrict", () => {
  it("returns true for the T zone class", () => {
    expect(isTDistrict("T")).toBe(true);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(isTDistrict("t")).toBe(true);
    expect(isTDistrict(" T ")).toBe(true);
  });

  it("returns false for zone classes that merely start with T", () => {
    expect(isTDistrict("T1")).toBe(false);
    expect(isTDistrict("T-1")).toBe(false);
  });

  it("returns false for regular zone classes", () => {
    expect(isTDistrict("B1-1")).toBe(false);
    expect(isTDistrict("RT-4")).toBe(false);
    expect(isTDistrict("PD 1")).toBe(false);
    expect(isTDistrict("PMD-1")).toBe(false);
  });

  it("returns false for empty or non-string inputs", () => {
    expect(isTDistrict("")).toBe(false);
    expect(isTDistrict(null)).toBe(false);
    expect(isTDistrict(undefined)).toBe(false);
  });
});

// =====================================================================
// normalizeZoneClass tests
// =====================================================================

describe("normalizeZoneClass", () => {
  it("maps known malformed ArcGIS variants to canonical form", () => {
    expect(normalizeZoneClass("RM4.5")).toBe("RM-4.5");
    expect(normalizeZoneClass("RM4-.5")).toBe("RM-4.5");
    expect(normalizeZoneClass("RM5.5")).toBe("RM-5.5");
  });

  it("passes through already-canonical zone classes unchanged", () => {
    expect(normalizeZoneClass("RM-4.5")).toBe("RM-4.5");
    expect(normalizeZoneClass("RM-5.5")).toBe("RM-5.5");
    expect(normalizeZoneClass("B1-1")).toBe("B1-1");
    expect(normalizeZoneClass("RT-4")).toBe("RT-4");
  });

  it("returns falsy input as-is", () => {
    expect(normalizeZoneClass(null)).toBeNull();
    expect(normalizeZoneClass(undefined)).toBeUndefined();
    expect(normalizeZoneClass("")).toBe("");
  });
});

// =====================================================================
// SLUG_CATEGORY coverage test
// =====================================================================

describe("SLUG_CATEGORY", () => {
  it("covers all slugs in ADVOCACY_USES_LIST", () => {
    for (const slug of ADVOCACY_USES_LIST) {
      expect(SLUG_CATEGORY).toHaveProperty(slug);
      expect(typeof SLUG_CATEGORY[slug]).toBe("string");
      expect(SLUG_CATEGORY[slug].length).toBeGreaterThan(0);
    }
  });

  it("has exactly as many entries as ADVOCACY_USES_LIST", () => {
    expect(Object.keys(SLUG_CATEGORY)).toHaveLength(ADVOCACY_USES_LIST.length);
  });
});
