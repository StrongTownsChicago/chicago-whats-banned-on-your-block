"""
Step 03: Curate, expand, and merge cleaned section JSONs into the final use-table.json.

Inputs:  cleaned/cleaned_{business,residential,manufacturing}.json
Output:  data/use-table.json

The output structure is:
    {zone_class: {use_slug: permission_code}}

Every zone_class in ZONE_TYPE_TO_CLASSES is guaranteed to be present.
Every use_slug in ADVOCACY_USES is guaranteed to be present for every zone_class.
Uses not found in any cleaned section default to "—".
"""

import json
import logging
import sys
from pathlib import Path

# Allow imports from sibling scripts/ directory when run as a script
sys.path.insert(0, str(Path(__file__).parent))

from constants import ADVOCACY_USES, ZONE_TYPE_TO_CLASSES

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

SECTION_NAMES: list[str] = ["business", "residential", "manufacturing"]


def load_cleaned_json(section_name: str, cleaned_dir: Path) -> list[dict[str, str]]:
    """Load a cleaned section JSON file and validate its structure.

    Args:
        section_name: Section identifier (e.g., "business").
        cleaned_dir: Directory containing the cleaned JSON files.

    Returns:
        List of use-row dicts, each with at least "use_slug" and one district key.

    Raises:
        FileNotFoundError: If the cleaned JSON file does not exist.
        ValueError: If any entry is missing "use_slug" or has no district columns.
    """
    path = cleaned_dir / f"cleaned_{section_name}.json"
    if not path.exists():
        raise FileNotFoundError(
            f"Cleaned JSON not found: {path}. "
            f"Run the agent-assisted step 02 to produce this file first."
        )

    with path.open(encoding="utf-8") as fh:
        rows: list[dict[str, str]] = json.load(fh)

    for i, row in enumerate(rows):
        if "use_slug" not in row:
            raise ValueError(
                f"Section {section_name!r}, entry {i}: missing required field 'use_slug'. "
                f"Entry: {row}"
            )
        district_keys = [k for k in row if k not in ("use_slug", "use_name")]
        if not district_keys:
            raise ValueError(
                f"Section {section_name!r}, entry {i} (slug={row.get('use_slug')!r}): "
                f"no district columns found."
            )

    return rows


def filter_to_advocacy_uses(
    rows: list[dict[str, str]],
    advocacy_uses: list[str],
    section_name: str = "",
) -> list[dict[str, str]]:
    """Keep only rows whose use_slug is in advocacy_uses.

    Logs a warning for any slug in advocacy_uses that is absent from the input.
    Some slugs only appear in certain ordinance sections — this is expected.

    Args:
        rows: All use-row dicts from a cleaned section JSON.
        advocacy_uses: The canonical list of slugs to retain.
        section_name: Used in log messages for context.

    Returns:
        Filtered list containing only advocacy rows.
    """
    advocacy_set = set(advocacy_uses)
    found_slugs = {row["use_slug"] for row in rows}

    missing = advocacy_set - found_slugs
    for slug in sorted(missing):
        logger.warning(
            "Section %r: advocacy slug %r not found in cleaned data (may appear in another section).",
            section_name,
            slug,
        )

    return [row for row in rows if row["use_slug"] in advocacy_set]


def expand_zone_classes(
    rows: list[dict[str, str]],
    zone_type_to_classes: dict[str, list[str]],
) -> dict[str, dict[str, str]]:
    """Transform use-row list into {zone_class: {use_slug: permission}} structure.

    Each district column in a row (e.g., "B1") is expanded to all zone_classes
    that column represents (e.g., B1-1, B1-2, B1-3).

    Columns not found in zone_type_to_classes are logged as warnings and skipped.

    Args:
        rows: Filtered list of use-row dicts.
        zone_type_to_classes: Mapping from column header to zone_class values.

    Returns:
        Nested dict: {zone_class: {use_slug: permission_code}}.
    """
    result: dict[str, dict[str, str]] = {}

    for row in rows:
        slug = row["use_slug"]
        for key, value in row.items():
            if key in ("use_slug", "use_name"):
                continue
            if key not in zone_type_to_classes:
                logger.warning(
                    "Column %r is not in ZONE_TYPE_TO_CLASSES — skipping. "
                    "Update constants.py if this column should be included.",
                    key,
                )
                continue
            for zone_class in zone_type_to_classes[key]:
                if zone_class not in result:
                    result[zone_class] = {}
                # Normalize ASCII hyphen ("-") to em dash ("—"): both mean "not permitted"
                # in the ordinance tables, but business tables use "-" while residential/
                # manufacturing tables use "—". Canonicalize to "—" throughout.
                result[zone_class][slug] = "—" if value == "-" else value

    return result


def merge_sections(sections: list[dict[str, dict[str, str]]]) -> dict[str, dict[str, str]]:
    """Merge per-section {zone_class: {use_slug: permission}} dicts into one.

    The three ordinance sections cover distinct sets of districts (business,
    residential, manufacturing), so zone_class overlap between sections is an
    error indicating a constants or cleaning problem.

    Args:
        sections: List of per-section expanded dicts.

    Returns:
        Single merged dict covering all zone_classes.

    Raises:
        ValueError: If any zone_class appears in more than one section.
    """
    merged: dict[str, dict[str, str]] = {}

    for section_data in sections:
        for zone_class, uses in section_data.items():
            if zone_class in merged:
                raise ValueError(
                    f"Zone class conflict: {zone_class!r} appears in multiple sections. "
                    f"Check that ZONE_TYPE_TO_CLASSES entries do not overlap across sections."
                )
            merged[zone_class] = uses

    return merged


def fill_missing_uses(
    merged: dict[str, dict[str, str]],
    advocacy_uses: list[str],
) -> dict[str, dict[str, str]]:
    """Ensure every zone_class has an entry for every advocacy use.

    Uses not found for a given zone_class are defaulted to "—" (prohibited/not listed).
    A warning is logged for each slug that is completely absent across all zone_classes.

    Args:
        merged: Merged {zone_class: {use_slug: permission}} dict.
        advocacy_uses: Complete list of use slugs to include.

    Returns:
        Updated merged dict with all slugs present for every zone_class.
    """
    all_found_slugs: set[str] = set()
    for uses in merged.values():
        all_found_slugs.update(uses.keys())

    for slug in advocacy_uses:
        if slug not in all_found_slugs:
            logger.warning(
                "Advocacy slug %r was not found in any section — defaulting to '—' for all zone_classes.",
                slug,
            )

    for zone_class in merged:
        for slug in advocacy_uses:
            if slug not in merged[zone_class]:
                merged[zone_class][slug] = "—"

    return merged


def write_output(data: dict[str, dict[str, str]], output_path: Path) -> None:
    """Write the final use-table JSON sorted by zone_class key.

    Args:
        data: The complete {zone_class: {use_slug: permission}} dict.
        output_path: Destination file path (parent directories must exist).
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sorted_data = {zone_class: data[zone_class] for zone_class in sorted(data)}
    with output_path.open("w", encoding="utf-8") as fh:
        json.dump(sorted_data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def main() -> None:
    """Load cleaned JSONs, filter, expand, merge, fill gaps, and write output."""
    repo_root = Path(__file__).parent.parent
    cleaned_dir = repo_root / "cleaned"
    output_path = repo_root / "data" / "use-table.json"

    section_results: list[dict[str, dict[str, str]]] = []

    for section_name in SECTION_NAMES:
        try:
            rows = load_cleaned_json(section_name, cleaned_dir)
            filtered = filter_to_advocacy_uses(rows, ADVOCACY_USES, section_name=section_name)
            expanded = expand_zone_classes(filtered, ZONE_TYPE_TO_CLASSES)
            section_results.append(expanded)
            logger.info(
                "Section %r: %d use rows → %d zone_classes",
                section_name,
                len(filtered),
                len(expanded),
            )
        except FileNotFoundError as exc:
            logger.error("%s", exc)
            logger.error("Skipping section %r — run step 02 first.", section_name)

    if not section_results:
        logger.error("No sections loaded. Cannot produce output.")
        return

    merged = merge_sections(section_results)
    merged = fill_missing_uses(merged, ADVOCACY_USES)

    write_output(merged, output_path)
    logger.info("Wrote %s (%d zone_classes)", output_path, len(merged))

    # Summary: verify uniform use_slug coverage
    use_counts = {zone_class: len(uses) for zone_class, uses in merged.items()}
    unique_counts = set(use_counts.values())
    if len(unique_counts) == 1:
        (count,) = unique_counts
        logger.info("All zone_classes have %d use_slugs.", count)
    else:
        logger.warning("Uneven use_slug counts across zone_classes: %s", use_counts)


if __name__ == "__main__":
    main()
