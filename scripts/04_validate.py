"""
Step 04: Validate the structural correctness of use-table.json and generate
a human spot-check report.

Inputs:  data/use-table.json
Outputs: validation_report.json (spot-check checklist for human review)
         stdout: pass/fail summary with error details

Structural checks are fully automated.
The spot-check step requires a human to open each ordinance URL and verify
the permission code against the live ordinance text.
"""

import json
import logging
import random
import sys
from pathlib import Path

# Allow imports from sibling scripts/ directory when run as a script
sys.path.insert(0, str(Path(__file__).parent))

from constants import ADVOCACY_USES, SECTION_URLS, VALID_PERMISSION_CODES, ZONE_TYPE_TO_CLASSES

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# All expected zone_classes (flat set of all values in ZONE_TYPE_TO_CLASSES)
ALL_EXPECTED_ZONE_CLASSES: frozenset[str] = frozenset(
    zone_class
    for zone_classes in ZONE_TYPE_TO_CLASSES.values()
    for zone_class in zone_classes
)

# Map each zone_class back to its source ordinance section for spot-check links
_BUSINESS_ZONE_CLASSES: frozenset[str] = frozenset(
    zc
    for key, zcs in ZONE_TYPE_TO_CLASSES.items()
    for zc in zcs
    if key.startswith(("B", "C"))
)
_RESIDENTIAL_ZONE_CLASSES: frozenset[str] = frozenset(
    zc
    for key, zcs in ZONE_TYPE_TO_CLASSES.items()
    for zc in zcs
    if key.startswith(("R",))
)
_MANUFACTURING_ZONE_CLASSES: frozenset[str] = frozenset(
    zc
    for key, zcs in ZONE_TYPE_TO_CLASSES.items()
    for zc in zcs
    if key.startswith(("M",))
)


def _section_for_zone_class(zone_class: str) -> str:
    """Return the ordinance section name for a given zone_class."""
    if zone_class in _BUSINESS_ZONE_CLASSES:
        return "business"
    if zone_class in _RESIDENTIAL_ZONE_CLASSES:
        return "residential"
    if zone_class in _MANUFACTURING_ZONE_CLASSES:
        return "manufacturing"
    return "unknown"


def validate_structure(data: dict[str, dict[str, str]]) -> list[str]:
    """Run all structural checks on the use-table data.

    Checks:
    1. All expected zone_classes (from ZONE_TYPE_TO_CLASSES) are present.
    2. All use_slugs from ADVOCACY_USES are present for every zone_class.
    3. All permission values are in the valid set.

    Args:
        data: The loaded use-table dict {zone_class: {use_slug: permission}}.

    Returns:
        List of error strings. Empty list means all checks passed.
    """
    errors: list[str] = []

    # Check 1: all expected zone_classes are present
    present_zone_classes = set(data.keys())
    missing_zone_classes = ALL_EXPECTED_ZONE_CLASSES - present_zone_classes
    for zone_class in sorted(missing_zone_classes):
        errors.append(f"Missing zone_class: {zone_class!r} (expected from ZONE_TYPE_TO_CLASSES)")

    # Check 2: all advocacy use_slugs present for every zone_class
    advocacy_set = set(ADVOCACY_USES)
    for zone_class, uses in sorted(data.items()):
        missing_slugs = advocacy_set - set(uses.keys())
        for slug in sorted(missing_slugs):
            errors.append(
                f"Zone class {zone_class!r} is missing use_slug {slug!r} (expected from ADVOCACY_USES)"
            )

    # Check 3: all permission values are valid
    for zone_class, uses in sorted(data.items()):
        for slug, permission in sorted(uses.items()):
            # Allow "P/conditional" and "S/conditional" variants
            base_permission = permission.split("/")[0] if "/" in permission else permission
            if base_permission not in VALID_PERMISSION_CODES:
                errors.append(
                    f"Invalid permission code {permission!r} at "
                    f"zone_class={zone_class!r}, use_slug={slug!r}"
                )

    return errors


def generate_spot_checks(
    data: dict[str, dict[str, str]],
    n: int = 30,
    seed: int | None = None,
) -> list[dict[str, str]]:
    """Randomly sample n (zone_class, use_slug) pairs for human spot-checking.

    Each entry includes the permission value from the JSON and the ordinance URL
    for the relevant ordinance section, so the checker can open the source directly.

    Args:
        data: The loaded use-table dict {zone_class: {use_slug: permission}}.
        n: Number of spot-check entries to generate.
        seed: Optional random seed for reproducibility.

    Returns:
        List of spot-check entry dicts, each with:
            - zone_class
            - use_slug
            - permission (from the JSON)
            - ordinance_section (which section to check)
            - amlegal_url (direct link to the ordinance section)
    """
    all_cells: list[tuple[str, str]] = [
        (zone_class, slug)
        for zone_class, uses in data.items()
        for slug in uses
    ]

    rng = random.Random(seed)

    # Bias toward boundary cases (S and PD entries) which are higher-stakes
    boundary_cells = [(zc, slug) for zc, slug in all_cells if data[zc][slug] in ("S", "PD")]
    other_cells = [(zc, slug) for zc, slug in all_cells if data[zc][slug] not in ("S", "PD")]

    # Sample up to 60% from boundary cases, remainder from others
    n_boundary = min(int(n * 0.6), len(boundary_cells))
    n_other = min(n - n_boundary, len(other_cells))

    sampled = rng.sample(boundary_cells, n_boundary) + rng.sample(other_cells, n_other)
    rng.shuffle(sampled)
    sampled = sampled[:n]

    spot_checks: list[dict[str, str]] = []
    for zone_class, slug in sampled:
        section = _section_for_zone_class(zone_class)
        spot_checks.append(
            {
                "zone_class": zone_class,
                "use_slug": slug,
                "permission": data[zone_class][slug],
                "ordinance_section": section,
                "amlegal_url": SECTION_URLS.get(section, ""),
                "result": "",  # Human fills in "pass" or "fail"
                "note": "",  # Human fills in notes if "fail"
            }
        )

    return spot_checks


def main() -> None:
    """Run structural validation and generate the human spot-check report."""
    repo_root = Path(__file__).parent.parent
    use_table_path = repo_root / "data" / "use-table.json"
    report_path = repo_root / "validation_report.json"

    if not use_table_path.exists():
        logger.error("use-table.json not found at %s. Run step 03 first.", use_table_path)
        sys.exit(1)

    with use_table_path.open(encoding="utf-8") as fh:
        data: dict[str, dict[str, str]] = json.load(fh)

    logger.info("Loaded use-table.json: %d zone_classes", len(data))

    # Structural validation
    errors = validate_structure(data)
    if errors:
        print("\n=== STRUCTURAL VALIDATION FAILED ===")
        for error in errors:
            print(f"  ERROR: {error}")
        print(f"\n{len(errors)} error(s) found. Fix before publishing.")
    else:
        print("\n=== STRUCTURAL VALIDATION PASSED ===")
        print(f"  {len(data)} zone_classes, all with {len(ADVOCACY_USES)} use_slugs")
        print("  All permission codes valid.")

    # Spot-check report
    spot_checks = generate_spot_checks(data, n=30)
    report = {
        "metadata": {
            "use_table_path": str(use_table_path),
            "zone_class_count": len(data),
            "use_slug_count": len(ADVOCACY_USES),
            "structural_errors": len(errors),
        },
        "spot_checks": spot_checks,
    }

    with report_path.open("w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    print(f"\n=== SPOT-CHECK REPORT WRITTEN: {report_path} ===")
    print(f"  {len(spot_checks)} entries generated.")
    print("\nHuman spot-check instructions:")
    print("  1. Open validation_report.json")
    print("  2. For each entry, open the amlegal_url")
    print("  3. Find the use_name row and the zone district column")
    print("  4. Compare the permission code to the 'permission' field")
    print("  5. Set 'result' to 'pass' or 'fail'; add 'note' if fail")
    print("  6. Acceptance threshold: 28 of 30 checks must pass (93%+)")


if __name__ == "__main__":
    main()
