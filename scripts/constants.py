"""Shared constants for the Chicago zoning use table extraction pipeline."""

# URLs for the three Title 17 use table sections
SECTION_URLS: dict[str, str] = {
    "business": "https://codelibrary.amlegal.com/codes/chicago/latest/chicago_il/0-0-0-2623048",
    "residential": "https://codelibrary.amlegal.com/codes/chicago/latest/chicago_il/0-0-0-2620261",
    "manufacturing": "https://codelibrary.amlegal.com/codes/chicago/latest/chicago_il/0-0-0-2637580",
    "downtown": "https://codelibrary.amlegal.com/codes/chicago/latest/chicagozoning_il/0-0-0-49338",
}

# Mapping from use-table column header to the zone_class values it represents.
# Business/Commercial columns: each B/C type has three intensity variants.
# Residential columns: each RS/RT/RM type maps to itself (no variants).
# Manufacturing columns: each M type maps to itself.
#
# Source: Chicago Title 17 ordinance, confirmed against Socrata dataset 7cve-jgbp.
ZONE_TYPE_TO_CLASSES: dict[str, list[str]] = {
    # Business districts (§17-3-0207)
    # -1.5 and -5 variants appear in the ArcGIS zoning layer; use permissions are
    # identical across all intensity suffixes within the same district type.
    "B1": ["B1-1", "B1-1.5", "B1-2", "B1-3", "B1-5"],
    "B2": ["B2-1", "B2-1.5", "B2-2", "B2-3", "B2-5"],
    "B3": ["B3-1", "B3-1.5", "B3-2", "B3-3", "B3-5"],
    # Commercial districts (§17-3-0207)
    # -5 variants (and C1-1.5) appear in the ArcGIS zoning layer; same use permissions.
    "C1": ["C1-1", "C1-1.5", "C1-2", "C1-3", "C1-5"],
    "C2": ["C2-1", "C2-2", "C2-3", "C2-5"],
    "C3": ["C3-1", "C3-2", "C3-3", "C3-5"],
    # Residential single-family and townhouse districts (§17-2-0207)
    # Column names in the ordinance table are "RS-1", "RS-2", "RS-3", "RT-3.5", "RT-4".
    # RT-3 does not have its own column in the table (it is absent from §17-2-0207).
    "RS-1": ["RS-1"],
    "RS-2": ["RS-2"],
    "RS-3": ["RS-3"],
    "RT-3.5": ["RT-3.5"],
    "RT-4": ["RT-4", "RT-4A"],
    # Residential multi-unit districts (§17-2-0207)
    # The ordinance table combines RM-5/RM-5.5 into one column and RM-6/RM-6.5 into one column.
    # Column names in the table are "RM-4.5", "RM-5-5.5", "RM-6-6.5".
    # RT-4A appears in the ArcGIS layer but has no ordinance column; same permissions as RT-4.
    "RM-4.5": ["RM-4.5"],
    "RM-5-5.5": ["RM-5", "RM-5.5"],
    "RM-6-6.5": ["RM-6", "RM-6.5"],
    # Manufacturing districts (§17-5-0207)
    "M1": ["M1-1", "M1-2", "M1-3"],
    "M2": ["M2-1", "M2-2", "M2-3"],
    "M3": ["M3-1", "M3-2", "M3-3"],
    # Downtown districts (§17-4-0207)
    # Numeric suffix is FAR/bulk tier only — use permissions are identical within each type.
    "DC": ["DC-12", "DC-16"],
    "DX": ["DX-3", "DX-5", "DX-7", "DX-10", "DX-12", "DX-16"],
    "DR": ["DR-3", "DR-5", "DR-7", "DR-10"],
    "DS": ["DS-3", "DS-5", "DS-7"],
}

# Ordered list of advocacy use slugs to include in the final output.
# Grouped by category for readability; order is preserved in the output JSON.
# These represent the uses most relevant to Strong Towns Chicago's reform agenda.
ADVOCACY_USES: list[str] = [
    # Housing
    "single_family_detached",
    "two_flat",
    "three_flat",
    "four_flat",
    "townhouse",
    "multi_unit_residential",
    # Food and retail
    "neighborhood_grocery_small",
    "food_production_artisan",
    "eating_drinking_limited",
    "eating_drinking_general",
    "tavern",
    "retail_sales_general",
    "liquor_store",
    # Personal services
    "hair_salon_barbershop",
    "personal_service",
    "body_art_services",
    # Childcare and education
    "daycare_center",
    "daycare_home",
    # Community and civic
    "community_center",
    "place_of_worship",
    "urban_farm",
    "community_garden",
    # Health
    "medical_clinic",
]

# Valid permission codes in the final use-table.json output.
# "-" (ASCII hyphen) is normalized to "—" during the merge step and does not appear in output.
# "P/S" and "P/-" are conditional variants where the permission depends on sub-conditions
# (e.g., permitted by-right for one building type, special use for another). The validate
# script strips everything after "/" before checking, so "P/S" is validated as "P".
# "PD" appears in the ordinance text but not in the current extracted data.
VALID_PERMISSION_CODES: frozenset[str] = frozenset({"P", "S", "PD", "—", "P/S", "P/-"})
