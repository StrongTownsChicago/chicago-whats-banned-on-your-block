"""Unit tests for scripts/03_curate_and_merge.py."""

import json
import logging
from pathlib import Path

import pytest

from conftest import MINIMAL_ADVOCACY_USES, MINIMAL_ZONE_MAP
from curate_and_merge import (
    expand_zone_classes,
    fill_missing_uses,
    filter_to_advocacy_uses,
    load_cleaned_json,
    merge_sections,
    write_output,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_rows(*slugs: str, zone_cols: dict[str, str] | None = None) -> list[dict[str, str]]:
    """Build use-row dicts with the given slugs and optional district columns."""
    if zone_cols is None:
        zone_cols = {"B1": "P", "B2": "S"}
    return [{"use_slug": slug, "use_name": slug.replace("_", " "), **zone_cols} for slug in slugs]


# ---------------------------------------------------------------------------
# load_cleaned_json
# ---------------------------------------------------------------------------

class TestLoadCleanedJson:
    def test_loads_valid_file(self, tmp_path: Path):
        data = [{"use_slug": "daycare_center", "use_name": "Day Care", "B1": "S"}]
        (tmp_path / "cleaned_business.json").write_text(json.dumps(data), encoding="utf-8")
        result = load_cleaned_json("business", tmp_path)
        assert result == data

    def test_raises_file_not_found(self, tmp_path: Path):
        with pytest.raises(FileNotFoundError, match="cleaned_business.json"):
            load_cleaned_json("business", tmp_path)

    def test_raises_value_error_on_missing_use_slug(self, tmp_path: Path):
        data = [{"use_name": "Day Care", "B1": "S"}]
        (tmp_path / "cleaned_business.json").write_text(json.dumps(data), encoding="utf-8")
        with pytest.raises(ValueError, match="missing required field 'use_slug'"):
            load_cleaned_json("business", tmp_path)

    def test_raises_value_error_on_no_district_columns(self, tmp_path: Path):
        data = [{"use_slug": "daycare_center", "use_name": "Day Care"}]
        (tmp_path / "cleaned_business.json").write_text(json.dumps(data), encoding="utf-8")
        with pytest.raises(ValueError, match="no district columns found"):
            load_cleaned_json("business", tmp_path)


# ---------------------------------------------------------------------------
# filter_to_advocacy_uses
# ---------------------------------------------------------------------------

class TestFilterToAdvocacyUses:
    def test_keeps_only_advocacy_rows(self):
        rows = _make_rows("daycare_center", "live_work_unit", "nonadvocacy_use")
        result = filter_to_advocacy_uses(rows, MINIMAL_ADVOCACY_USES)
        slugs = [r["use_slug"] for r in result]
        assert "nonadvocacy_use" not in slugs
        assert "daycare_center" in slugs
        assert "live_work_unit" in slugs

    def test_empty_input_returns_empty(self):
        result = filter_to_advocacy_uses([], MINIMAL_ADVOCACY_USES)
        assert result == []

    def test_all_advocacy_rows_kept(self):
        rows = _make_rows(*MINIMAL_ADVOCACY_USES)
        result = filter_to_advocacy_uses(rows, MINIMAL_ADVOCACY_USES)
        assert len(result) == len(MINIMAL_ADVOCACY_USES)

    def test_logs_warning_for_missing_slug(self, caplog):
        rows = _make_rows("daycare_center")  # live_work_unit and hair_salon_barbershop missing
        with caplog.at_level(logging.WARNING):
            filter_to_advocacy_uses(rows, MINIMAL_ADVOCACY_USES, section_name="business")
        assert any("live_work_unit" in msg for msg in caplog.messages)

    def test_no_warning_when_all_slugs_present(self, caplog):
        rows = _make_rows(*MINIMAL_ADVOCACY_USES)
        with caplog.at_level(logging.WARNING):
            filter_to_advocacy_uses(rows, MINIMAL_ADVOCACY_USES)
        assert not caplog.records


# ---------------------------------------------------------------------------
# expand_zone_classes
# ---------------------------------------------------------------------------

class TestExpandZoneClasses:
    def test_b1_column_expands_to_three_classes(self):
        rows = [{"use_slug": "daycare_center", "use_name": "Day Care", "B1": "S"}]
        result = expand_zone_classes(rows, MINIMAL_ZONE_MAP)
        assert result["B1-1"]["daycare_center"] == "S"
        assert result["B1-2"]["daycare_center"] == "S"
        assert result["B1-3"]["daycare_center"] == "S"

    def test_single_class_column(self):
        rows = [{"use_slug": "live_work_unit", "use_name": "Live-Work", "RS-1": "P"}]
        result = expand_zone_classes(rows, MINIMAL_ZONE_MAP)
        assert result["RS-1"]["live_work_unit"] == "P"

    def test_em_dash_prohibited_maps_correctly(self):
        rows = [{"use_slug": "live_work_unit", "use_name": "Live-Work", "B1": "—"}]
        result = expand_zone_classes(rows, MINIMAL_ZONE_MAP)
        assert result["B1-1"]["live_work_unit"] == "—"
        assert result["B1-2"]["live_work_unit"] == "—"
        assert result["B1-3"]["live_work_unit"] == "—"

    def test_conditional_value_preserved(self):
        rows = [{"use_slug": "daycare_center", "use_name": "Day Care", "B2": "P/conditional"}]
        result = expand_zone_classes(rows, MINIMAL_ZONE_MAP)
        assert result["B2-1"]["daycare_center"] == "P/conditional"

    def test_unknown_column_skipped_with_warning(self, caplog):
        rows = [{"use_slug": "daycare_center", "use_name": "Day Care", "XX": "P"}]
        with caplog.at_level(logging.WARNING):
            result = expand_zone_classes(rows, MINIMAL_ZONE_MAP)
        assert "XX" in caplog.text
        assert result == {}  # No known columns → empty result

    def test_use_slug_and_use_name_not_treated_as_columns(self):
        rows = [{"use_slug": "daycare_center", "use_name": "Day Care", "B1": "P"}]
        result = expand_zone_classes(rows, MINIMAL_ZONE_MAP)
        for zone_class_uses in result.values():
            assert "use_slug" not in zone_class_uses
            assert "use_name" not in zone_class_uses

    def test_multiple_rows_multiple_columns(self):
        rows = [
            {"use_slug": "daycare_center", "use_name": "Day Care", "B1": "S", "B2": "P"},
            {"use_slug": "live_work_unit", "use_name": "Live-Work", "B1": "—", "B2": "S"},
        ]
        result = expand_zone_classes(rows, MINIMAL_ZONE_MAP)
        assert result["B1-1"]["daycare_center"] == "S"
        assert result["B2-1"]["daycare_center"] == "P"
        assert result["B1-1"]["live_work_unit"] == "—"
        assert result["B2-1"]["live_work_unit"] == "S"


# ---------------------------------------------------------------------------
# merge_sections
# ---------------------------------------------------------------------------

class TestMergeSections:
    def test_no_overlap_merges_correctly(self):
        a = {"B1-1": {"daycare_center": "S"}}
        b = {"RS-1": {"live_work_unit": "P"}}
        result = merge_sections([a, b])
        assert "B1-1" in result
        assert "RS-1" in result

    def test_one_empty_section(self):
        a = {}
        b = {"M1-1": {"urban_farm": "P"}}
        result = merge_sections([a, b])
        assert result == {"M1-1": {"urban_farm": "P"}}

    def test_three_sections_no_overlap(self):
        sections = [
            {"B1-1": {"x": "P"}},
            {"RS-1": {"x": "S"}},
            {"M1-1": {"x": "—"}},
        ]
        result = merge_sections(sections)
        assert set(result.keys()) == {"B1-1", "RS-1", "M1-1"}

    def test_zone_class_conflict_raises_value_error(self):
        a = {"B1-1": {"daycare_center": "S"}}
        b = {"B1-1": {"daycare_center": "P"}}  # same zone_class
        with pytest.raises(ValueError, match="B1-1"):
            merge_sections([a, b])

    def test_conflict_in_third_section_raises_value_error(self):
        sections = [
            {"B1-1": {"x": "P"}},
            {"RS-1": {"x": "S"}},
            {"B1-1": {"x": "—"}},  # repeated
        ]
        with pytest.raises(ValueError, match="B1-1"):
            merge_sections(sections)


# ---------------------------------------------------------------------------
# fill_missing_uses
# ---------------------------------------------------------------------------

class TestFillMissingUses:
    def test_missing_use_defaults_to_dash(self):
        merged = {"B1-1": {"daycare_center": "S"}, "RS-1": {"daycare_center": "P"}}
        result = fill_missing_uses(merged, MINIMAL_ADVOCACY_USES)
        # live_work_unit and hair_salon_barbershop were absent; should now be "—"
        assert result["B1-1"]["live_work_unit"] == "—"
        assert result["RS-1"]["hair_salon_barbershop"] == "—"

    def test_present_values_not_overwritten(self):
        merged = {
            "B1-1": {slug: "P" for slug in MINIMAL_ADVOCACY_USES},
        }
        result = fill_missing_uses(merged, MINIMAL_ADVOCACY_USES)
        for slug in MINIMAL_ADVOCACY_USES:
            assert result["B1-1"][slug] == "P"

    def test_logs_warning_for_slug_absent_from_all_zones(self, caplog):
        merged = {"B1-1": {}}
        with caplog.at_level(logging.WARNING):
            fill_missing_uses(merged, ["totally_missing_slug"])
        assert "totally_missing_slug" in caplog.text

    def test_all_zone_classes_get_all_slugs(self):
        merged = {
            "B1-1": {"daycare_center": "S"},
            "B1-2": {},
        }
        result = fill_missing_uses(merged, MINIMAL_ADVOCACY_USES)
        for zone_class in result:
            for slug in MINIMAL_ADVOCACY_USES:
                assert slug in result[zone_class]


# ---------------------------------------------------------------------------
# write_output
# ---------------------------------------------------------------------------

class TestWriteOutput:
    def test_writes_valid_json(self, tmp_path: Path):
        data = {"B1-1": {"daycare_center": "S"}}
        out = tmp_path / "data" / "use-table.json"
        write_output(data, out)
        loaded = json.loads(out.read_text(encoding="utf-8"))
        assert loaded == data

    def test_output_sorted_by_zone_class(self, tmp_path: Path):
        data = {"RS-1": {"x": "P"}, "B1-1": {"x": "S"}, "M1-1": {"x": "—"}}
        out = tmp_path / "use-table.json"
        write_output(data, out)
        loaded = json.loads(out.read_text(encoding="utf-8"))
        assert list(loaded.keys()) == sorted(data.keys())

    def test_creates_parent_directory(self, tmp_path: Path):
        out = tmp_path / "deeply" / "nested" / "use-table.json"
        write_output({"B1-1": {}}, out)
        assert out.exists()

    def test_file_ends_with_newline(self, tmp_path: Path):
        out = tmp_path / "use-table.json"
        write_output({"B1-1": {"x": "P"}}, out)
        content = out.read_bytes()
        assert content.endswith(b"\n")
