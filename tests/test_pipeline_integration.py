"""Integration tests for the structured data pipeline."""

import json
from pathlib import Path

import pytest

from curate_and_merge import (
    expand_zone_classes,
    fill_missing_uses,
    filter_to_advocacy_uses,
    write_output,
)
from fetch_ordinance import extract_largest_table, flatten_multiindex_columns, strip_non_data_rows

FIXTURES_DIR = Path(__file__).parent / "fixtures"

# Minimal zone map covering only B1, B2, B3 (matching the fixture HTML columns)
FIXTURE_ZONE_MAP: dict[str, list[str]] = {
    "B1": ["B1-1", "B1-2", "B1-3"],
    "B2": ["B2-1", "B2-2", "B2-3"],
    "B3": ["B3-1", "B3-2", "B3-3"],
}

# Advocacy slugs that appear in cleaned_business_fixture.json
FIXTURE_ADVOCACY_USES: list[str] = [
    "daycare_center",
    "food_production_artisan",
    "live_work_unit",
    "hair_salon_barbershop",
    "neighborhood_grocery_small",
]


# ---------------------------------------------------------------------------
# End-to-end pipeline with fixture HTML + pre-written cleaned JSON
# ---------------------------------------------------------------------------

class TestEndToEndWithFixtureHtml:
    @pytest.fixture()
    def fixture_html(self) -> str:
        return (FIXTURES_DIR / "sample_use_table.html").read_text(encoding="utf-8")

    @pytest.fixture()
    def cleaned_rows(self) -> list[dict[str, str]]:
        return json.loads((FIXTURES_DIR / "cleaned_business_fixture.json").read_text(encoding="utf-8"))

    def test_extract_largest_table_returns_use_table(self, fixture_html: str):
        """The large table (use table) should be selected over the small decoy."""
        df = extract_largest_table(fixture_html)
        # The use table has 5 data rows + header rows; the decoy has 1 data row.
        assert len(df) > 1

    def test_strip_non_data_rows_removes_headers(self, fixture_html: str):
        df = extract_largest_table(fixture_html)
        df = flatten_multiindex_columns(df)
        stripped = strip_non_data_rows(df)
        # Only the 5 data rows should remain (2 category headers + legend removed)
        assert len(stripped) == 5

    def test_full_pipeline_produces_correct_zone_classes(
        self, cleaned_rows: list[dict[str, str]], tmp_path: Path
    ):
        filtered = filter_to_advocacy_uses(cleaned_rows, FIXTURE_ADVOCACY_USES)
        expanded = expand_zone_classes(filtered, FIXTURE_ZONE_MAP)
        filled = fill_missing_uses(expanded, FIXTURE_ADVOCACY_USES)

        out_path = tmp_path / "use-table.json"
        write_output(filled, out_path)
        result = json.loads(out_path.read_text(encoding="utf-8"))

        expected_zone_classes = {
            zc for zcs in FIXTURE_ZONE_MAP.values() for zc in zcs
        }
        assert set(result.keys()) == expected_zone_classes

    def test_b1_variants_have_identical_permissions(self, cleaned_rows: list[dict[str, str]]):
        """B1-1, B1-2, B1-3 share one column and must have identical permission values."""
        filtered = filter_to_advocacy_uses(cleaned_rows, FIXTURE_ADVOCACY_USES)
        expanded = expand_zone_classes(filtered, FIXTURE_ZONE_MAP)
        filled = fill_missing_uses(expanded, FIXTURE_ADVOCACY_USES)

        for slug in FIXTURE_ADVOCACY_USES:
            assert filled["B1-1"][slug] == filled["B1-2"][slug] == filled["B1-3"][slug], (
                f"B1 variants differ for {slug}: "
                f"B1-1={filled['B1-1'][slug]}, B1-2={filled['B1-2'][slug]}, B1-3={filled['B1-3'][slug]}"
            )

    def test_all_use_slugs_present_in_every_zone_class(self, cleaned_rows: list[dict[str, str]]):
        filtered = filter_to_advocacy_uses(cleaned_rows, FIXTURE_ADVOCACY_USES)
        expanded = expand_zone_classes(filtered, FIXTURE_ZONE_MAP)
        filled = fill_missing_uses(expanded, FIXTURE_ADVOCACY_USES)

        for zone_class, uses in filled.items():
            for slug in FIXTURE_ADVOCACY_USES:
                assert slug in uses, f"{zone_class} is missing {slug}"

    def test_permission_values_match_fixture(self, cleaned_rows: list[dict[str, str]]):
        """Specific known values from the fixture should be correct after expansion."""
        filtered = filter_to_advocacy_uses(cleaned_rows, FIXTURE_ADVOCACY_USES)
        expanded = expand_zone_classes(filtered, FIXTURE_ZONE_MAP)

        # From cleaned_business_fixture.json: daycare_center B1=S, B2=P, B3=P
        assert expanded["B1-1"]["daycare_center"] == "S"
        assert expanded["B2-1"]["daycare_center"] == "P"
        assert expanded["B3-1"]["daycare_center"] == "P"

        # live_work_unit B1=—, B2=S, B3=P
        assert expanded["B1-1"]["live_work_unit"] == "—"
        assert expanded["B2-1"]["live_work_unit"] == "S"
        assert expanded["B3-1"]["live_work_unit"] == "P"


# ---------------------------------------------------------------------------
# Constants correctness: zone_class set matches known expected set
# ---------------------------------------------------------------------------

class TestConstantsZoneClassCoverage:
    # Known zone_classes from Chicago Title 17, confirmed against Socrata 7cve-jgbp.
    # This is a fixed assertion — update it only when the ordinance or GIS data changes.
    EXPECTED_ZONE_CLASSES: frozenset[str] = frozenset({
        # Business
        "B1-1", "B1-2", "B1-3",
        "B2-1", "B2-2", "B2-3",
        "B3-1", "B3-2", "B3-3",
        # Commercial
        "C1-1", "C1-2", "C1-3",
        "C2-1", "C2-2", "C2-3",
        "C3-1", "C3-2", "C3-3",
        # Residential
        "RS-1", "RS-2", "RS-3",
        "RT-3.5", "RT-4",
        "RM-4.5", "RM-5", "RM-5.5", "RM-6", "RM-6.5",
        # Manufacturing
        "M1-1", "M1-2", "M1-3",
        "M2-1", "M2-2", "M2-3",
        "M3-1", "M3-2", "M3-3",
    })

    def _actual_zone_classes(self) -> frozenset[str]:
        from constants import ZONE_TYPE_TO_CLASSES
        return frozenset(zc for zcs in ZONE_TYPE_TO_CLASSES.values() for zc in zcs)

    def test_no_unexpected_zone_classes(self):
        """Catches typos like B1-4 or extra entries."""
        unexpected = self._actual_zone_classes() - self.EXPECTED_ZONE_CLASSES
        assert not unexpected, f"Unexpected zone_classes in constants: {unexpected}"

    def test_no_missing_zone_classes(self):
        """Catches accidentally omitted entries."""
        missing = self.EXPECTED_ZONE_CLASSES - self._actual_zone_classes()
        assert not missing, f"Zone_classes missing from constants: {missing}"


# ---------------------------------------------------------------------------
# Merge handles all three sections
# ---------------------------------------------------------------------------

class TestMergeHandlesAllThreeSections:
    def test_three_sections_produce_correct_union(self, tmp_path: Path):
        """Three minimal fixtures covering non-overlapping zone_classes merge correctly."""
        from curate_and_merge import merge_sections

        business = {"B1-1": {"daycare_center": "S"}, "B1-2": {"daycare_center": "S"}}
        residential = {"RS-1": {"daycare_center": "P"}}
        manufacturing = {"M1-1": {"daycare_center": "—"}}

        merged = merge_sections([business, residential, manufacturing])

        assert set(merged.keys()) == {"B1-1", "B1-2", "RS-1", "M1-1"}
        assert merged["B1-1"]["daycare_center"] == "S"
        assert merged["RS-1"]["daycare_center"] == "P"
        assert merged["M1-1"]["daycare_center"] == "—"

    def test_no_zone_class_appears_twice(self, tmp_path: Path):
        from curate_and_merge import merge_sections

        sections = [
            {"B1-1": {"x": "P"}},
            {"RS-1": {"x": "S"}},
            {"M1-1": {"x": "—"}},
        ]
        merged = merge_sections(sections)
        # Each key should appear exactly once (dict keys are unique by definition,
        # but we also verify no ValueError was raised)
        assert len(merged) == 3
