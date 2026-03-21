"""Unit tests for scripts/04_validate.py."""

from conftest import MINIMAL_ADVOCACY_USES, MINIMAL_ZONE_MAP
from validate import generate_spot_checks, validate_structure

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# A minimal but complete zone-class → use-slug mapping built from test constants.
# All zone_classes from MINIMAL_ZONE_MAP, all slugs from MINIMAL_ADVOCACY_USES.
def _complete_data(permission: str = "P") -> dict[str, dict[str, str]]:
    """Build a fully-formed dataset using production constants (what validate_structure checks)."""
    from constants import ADVOCACY_USES, ZONE_TYPE_TO_CLASSES
    all_classes = [zc for zcs in ZONE_TYPE_TO_CLASSES.values() for zc in zcs]
    return {zc: {slug: permission for slug in ADVOCACY_USES} for zc in all_classes}


# ---------------------------------------------------------------------------
# validate_structure
# ---------------------------------------------------------------------------

class TestValidateStructure:
    def test_passes_complete_data(self):
        data = _complete_data()
        errors = validate_structure(data)
        assert errors == []

    def test_catches_missing_zone_class(self):
        data = _complete_data()
        # Remove B1-2 which should be present according to ZONE_TYPE_TO_CLASSES
        data.pop("B1-2", None)
        # Patch the expected set by passing a subset-only dataset that is missing B1-2
        # validate_structure uses the production ZONE_TYPE_TO_CLASSES, so just ensure
        # the error mentions the missing class.
        errors = validate_structure(data)
        assert any("B1-2" in e for e in errors)

    def test_catches_missing_use_slug(self):
        from constants import ZONE_TYPE_TO_CLASSES, ADVOCACY_USES
        all_classes = [zc for zcs in ZONE_TYPE_TO_CLASSES.values() for zc in zcs]
        # Build data with all zone_classes but drop one slug from B1-1
        data = {zc: {slug: "P" for slug in ADVOCACY_USES} for zc in all_classes}
        data["B1-1"].pop("daycare_center")
        errors = validate_structure(data)
        assert any("B1-1" in e and "daycare_center" in e for e in errors)

    def test_catches_invalid_permission_code(self):
        from constants import ZONE_TYPE_TO_CLASSES, ADVOCACY_USES
        all_classes = [zc for zcs in ZONE_TYPE_TO_CLASSES.values() for zc in zcs]
        data = {zc: {slug: "P" for slug in ADVOCACY_USES} for zc in all_classes}
        data["B1-1"]["daycare_center"] = "X"  # invalid
        errors = validate_structure(data)
        assert any("X" in e and "B1-1" in e and "daycare_center" in e for e in errors)

    def test_catches_lowercase_permission_code(self):
        from constants import ZONE_TYPE_TO_CLASSES, ADVOCACY_USES
        all_classes = [zc for zcs in ZONE_TYPE_TO_CLASSES.values() for zc in zcs]
        data = {zc: {slug: "P" for slug in ADVOCACY_USES} for zc in all_classes}
        data["B1-1"]["daycare_center"] = "p"  # lowercase is invalid
        errors = validate_structure(data)
        assert any("p" in e for e in errors)

    def test_allows_conditional_permission_variant(self):
        from constants import ZONE_TYPE_TO_CLASSES, ADVOCACY_USES
        all_classes = [zc for zcs in ZONE_TYPE_TO_CLASSES.values() for zc in zcs]
        data = {zc: {slug: "P" for slug in ADVOCACY_USES} for zc in all_classes}
        data["B1-1"]["daycare_center"] = "P/conditional"
        errors = validate_structure(data)
        # P/conditional should be accepted (base permission P is valid)
        assert not any("P/conditional" in e for e in errors)

    def test_multiple_errors_all_reported(self):
        from constants import ZONE_TYPE_TO_CLASSES, ADVOCACY_USES
        all_classes = [zc for zcs in ZONE_TYPE_TO_CLASSES.values() for zc in zcs]
        data = {zc: {slug: "P" for slug in ADVOCACY_USES} for zc in all_classes}
        data["B1-1"]["daycare_center"] = "X"
        data["B2-1"]["live_work_unit"] = "Y"
        errors = validate_structure(data)
        assert any("X" in e for e in errors)
        assert any("Y" in e for e in errors)


# ---------------------------------------------------------------------------
# generate_spot_checks
# ---------------------------------------------------------------------------

class TestGenerateSpotChecks:
    def _full_data(self) -> dict[str, dict[str, str]]:
        """Use production constants to build a realistic dataset for spot-check tests."""
        from constants import ZONE_TYPE_TO_CLASSES, ADVOCACY_USES
        all_classes = [zc for zcs in ZONE_TYPE_TO_CLASSES.values() for zc in zcs]
        # Mix of P, S, PD, — to exercise the boundary-biasing logic
        data: dict[str, dict[str, str]] = {}
        codes = ["P", "S", "PD", "—"]
        for i, zc in enumerate(all_classes):
            data[zc] = {slug: codes[(i + j) % 4] for j, slug in enumerate(ADVOCACY_USES)}
        return data

    def test_returns_requested_count(self):
        data = self._full_data()
        checks = generate_spot_checks(data, n=30, seed=42)
        assert len(checks) == 30

    def test_returns_fewer_than_requested_when_data_small(self):
        # 2 zone_classes × 2 slugs = 4 total cells; ask for 10
        data = {"B1-1": {"a": "S", "b": "P"}, "B1-2": {"a": "P", "b": "—"}}
        checks = generate_spot_checks(data, n=10)
        assert len(checks) <= 4

    def test_each_entry_has_required_fields(self):
        data = self._full_data()
        checks = generate_spot_checks(data, n=5, seed=0)
        required = {"zone_class", "use_slug", "permission", "ordinance_section", "amlegal_url"}
        for entry in checks:
            assert required.issubset(entry.keys()), f"Missing fields in {entry}"

    def test_permission_values_match_data(self):
        data = self._full_data()
        checks = generate_spot_checks(data, n=20, seed=7)
        for entry in checks:
            assert entry["permission"] == data[entry["zone_class"]][entry["use_slug"]]

    def test_reproducible_with_seed(self):
        data = self._full_data()
        a = generate_spot_checks(data, n=10, seed=99)
        b = generate_spot_checks(data, n=10, seed=99)
        assert a == b

    def test_different_seeds_differ(self):
        data = self._full_data()
        a = generate_spot_checks(data, n=10, seed=1)
        b = generate_spot_checks(data, n=10, seed=2)
        # Very unlikely to be identical with different seeds on a large dataset
        assert a != b

    def test_result_and_note_fields_are_empty_strings(self):
        data = self._full_data()
        checks = generate_spot_checks(data, n=5, seed=0)
        for entry in checks:
            assert entry["result"] == ""
            assert entry["note"] == ""
