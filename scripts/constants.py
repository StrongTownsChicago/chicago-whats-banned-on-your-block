"""Shared constants for the Chicago zoning use table extraction pipeline."""

# URLs for the three Title 17 use table sections
SECTION_URLS: dict[str, str] = {
    "business": "https://codelibrary.amlegal.com/codes/chicago/latest/chicago_il/0-0-0-2623048",
    "residential": "https://codelibrary.amlegal.com/codes/chicago/latest/chicago_il/0-0-0-2620261",
    "manufacturing": "https://codelibrary.amlegal.com/codes/chicago/latest/chicago_il/0-0-0-2637580",
}

# Mapping from use-table column header to the zone_class values it represents.
# Business/Commercial columns: each B/C type has three intensity variants.
# Residential columns: each RS/RT/RM type maps to itself (no variants).
# Manufacturing columns: each M type maps to itself.
#
# Source: Chicago Title 17 ordinance, confirmed against Socrata dataset 7cve-jgbp.
ZONE_TYPE_TO_CLASSES: dict[str, list[str]] = {
    # Business districts (§17-3-0207)
    "B1": ["B1-1", "B1-2", "B1-3"],
    "B2": ["B2-1", "B2-2", "B2-3"],
    "B3": ["B3-1", "B3-2", "B3-3"],
    # Commercial districts (§17-3-0207)
    "C1": ["C1-1", "C1-2", "C1-3"],
    "C2": ["C2-1", "C2-2", "C2-3"],
    "C3": ["C3-1", "C3-2", "C3-3"],
    # Residential single-family and townhouse districts (§17-2-0207)
    # Column names in the ordinance table are "RS-1", "RS-2", "RS-3", "RT-3.5", "RT-4".
    # RT-3 does not have its own column in the table (it is absent from §17-2-0207).
    "RS-1": ["RS-1"],
    "RS-2": ["RS-2"],
    "RS-3": ["RS-3"],
    "RT-3.5": ["RT-3.5"],
    "RT-4": ["RT-4"],
    # Residential multi-unit districts (§17-2-0207)
    # The ordinance table combines RM-5/RM-5.5 into one column and RM-6/RM-6.5 into one column.
    # Column names in the table are "RM-4.5", "RM-5-5.5", "RM-6-6.5".
    "RM-4.5": ["RM-4.5"],
    "RM-5-5.5": ["RM-5", "RM-5.5"],
    "RM-6-6.5": ["RM-6", "RM-6.5"],
    # Manufacturing districts (§17-5-0207)
    "M1": ["M1-1", "M1-2", "M1-3"],
    "M2": ["M2-1", "M2-2", "M2-3"],
    "M3": ["M3-1", "M3-2", "M3-3"],
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
    "multi_unit_residential",
    "live_work_unit",
    "artist_live_work",
    # Food and retail
    "neighborhood_grocery_small",
    "food_production_artisan",
    "eating_drinking_limited",
    "eating_drinking_general",
    # Personal services
    "hair_salon_barbershop",
    "personal_service",
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
    # Lodging
    "bed_and_breakfast",
]

# Valid permission codes used in the ordinance use tables.
# "-" (plain dash) is used in the HTML for "not permitted" (not the em dash "—").
# "P/S" is a conditional variant where permission depends on conditions.
VALID_PERMISSION_CODES: frozenset[str] = frozenset({"P", "S", "PD", "—", "\u2014", "-"})
