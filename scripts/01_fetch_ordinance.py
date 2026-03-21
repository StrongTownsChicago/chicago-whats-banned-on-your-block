"""
Step 01: Fetch and extract raw use tables from AmLegal ordinance HTML.

Outputs: raw/raw_{business,residential,manufacturing}.csv

Each CSV has flattened multi-level column headers in "level0|level1" format.
Category header rows (legend/description rows) are stripped before saving.
"""

import io
import logging
import sys
from pathlib import Path

import pandas as pd
import requests

# Allow imports from sibling scripts/ directory when run as a script
sys.path.insert(0, str(Path(__file__).parent))

from constants import SECTION_URLS

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# Browser-like headers to avoid Cloudflare bot challenges on AmLegal
REQUEST_HEADERS: dict[str, str] = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# Permission codes that appear in real data rows
PERMISSION_VALUES: frozenset[str] = frozenset({"P", "S", "PD", "—", "\u2014", ""})


def fetch_html(url: str, user_agent: str = REQUEST_HEADERS["User-Agent"]) -> str:
    """Fetch raw HTML from a URL.

    Args:
        url: The URL to fetch.
        user_agent: User-Agent string to send with the request.

    Returns:
        The raw HTML response body as a string.

    Raises:
        requests.HTTPError: If the server returns a non-200 status code.
    """
    headers = dict(REQUEST_HEADERS)
    headers["User-Agent"] = user_agent
    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    return response.text


def extract_largest_table(html: str) -> pd.DataFrame:
    """Parse all HTML tables and return the one with the most rows.

    Uses pandas.read_html() with lxml to handle colspan/rowspan automatically.
    Returns a DataFrame that may have MultiIndex columns for multi-row headers.

    Args:
        html: Raw HTML string containing one or more <table> elements.

    Returns:
        The largest DataFrame by row count.

    Raises:
        ValueError: If no tables are found in the HTML. This may indicate
                    that AmLegal returned a bot-challenge page.
    """
    # header=[0,1,2]: the AmLegal tables use <td> (not <th>) for header cells,
    # so pandas needs to be told explicitly that the first 3 rows are header rows.
    tables = pd.read_html(io.StringIO(html), flavor="lxml", header=[0, 1, 2])
    if not tables:
        raise ValueError(
            "No tables found in HTML — check if AmLegal is returning a bot challenge page."
        )
    return max(tables, key=len)


def flatten_multiindex_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Flatten MultiIndex columns from the AmLegal 3-row header into clean names.

    Handles three patterns found in the ordinance tables:

    - Business/Manufacturing district columns: all three levels repeat the zone
      identifier (e.g., ("Zoning Districts", "B1", "B1")) → "B1"
    - Residential district columns: level 1 is the zone type and level 2 is the
      sub-identifier (e.g., ("Zoning Districts", "RS", "1")) → "RS-1"
    - Use name columns: ("USE GROUP", "Use Category", "Specific Use Type") →
      "Specific Use Type" (the most specific non-Unnamed level is used)

    Args:
        df: DataFrame with potentially MultiIndex columns.

    Returns:
        DataFrame with single-level string column names.
    """
    if not isinstance(df.columns, pd.MultiIndex):
        return df

    _ZONE_TYPES = {"RS", "RT", "RM"}

    flat_columns = []
    for col in df.columns:
        parts = [str(level) for level in col if not str(level).startswith("Unnamed:")]
        if not parts:
            flat_columns.append(str(col[-1]))
            continue

        # Residential district: ("Zoning Districts", "RS", "1") → "RS-1"
        if len(parts) >= 3 and parts[1] in _ZONE_TYPES:
            flat_columns.append(f"{parts[1]}-{parts[2]}")
        # Business/Mfg district: all parts the same → use once (e.g. "B1|B1|B1" → "B1")
        elif len(set(parts)) == 1:
            flat_columns.append(parts[0])
        # All other columns: take the last non-Unnamed part (most specific level)
        else:
            flat_columns.append(parts[-1])

    df = df.copy()
    df.columns = flat_columns
    return df


def strip_non_data_rows(df: pd.DataFrame) -> pd.DataFrame:
    """Remove legend and category-header rows from the extracted DataFrame.

    A row is considered a non-data row if all district columns contain only
    values from PERMISSION_VALUES (P, S, PD, —, empty) OR if the row appears
    to be a legend/header description row (spanning text like "P = Permitted...").

    The strategy: find the district columns (those whose headers contain known
    zone identifiers) and drop rows where all district columns are non-permission
    values (i.e., contain explanatory text or are entirely empty/NaN without
    any permission code in any district column).

    Args:
        df: DataFrame with flattened column names.

    Returns:
        DataFrame containing only data rows.
    """
    district_cols = _identify_district_columns(df)
    if not district_cols:
        return df

    def is_data_row(row: pd.Series) -> bool:  # type: ignore[type-arg]
        """Return True if this row contains at least one valid permission value."""
        for col in district_cols:
            val = str(row[col]).strip()
            # Plain "-" is used in the HTML for "not permitted" (not em dash)
            if val in {"P", "S", "PD", "—", "\u2014", "-"}:
                return True
        return False

    return df[df.apply(is_data_row, axis=1)].reset_index(drop=True)


def _identify_district_columns(df: pd.DataFrame) -> list[str]:
    """Return column names that correspond to zoning district columns.

    District columns are identified by containing known zone type abbreviations
    (B1, B2, ..., RS-1, M1, etc.) in their header name.
    """
    zone_prefixes = (
        "B1", "B2", "B3",
        "C1", "C2", "C3",
        "RS-", "RT-", "RM-",
        "M1", "M2", "M3",
    )
    return [col for col in df.columns if any(col.strip().endswith(p) or col.strip() == p
                                             or _col_contains_zone(col, p)
                                             for p in zone_prefixes)]


def _col_contains_zone(col_name: str, prefix: str) -> bool:
    """Return True if col_name ends with the zone prefix after the last | separator."""
    part = col_name.split("|")[-1].strip()
    return part == prefix or part.startswith(prefix)


def save_raw_csv(df: pd.DataFrame, section_name: str, output_dir: Path) -> Path:
    """Flatten MultiIndex columns and write the DataFrame to a CSV file.

    Args:
        df: DataFrame to save (may have MultiIndex columns).
        section_name: Section identifier used in the filename (e.g., "business").
        output_dir: Directory where the CSV will be written.

    Returns:
        Path to the written CSV file.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    df = flatten_multiindex_columns(df)
    output_path = output_dir / f"raw_{section_name}.csv"
    df.to_csv(output_path, index=False, encoding="utf-8")
    return output_path


def main() -> None:
    """Fetch each ordinance section and save raw CSVs to the raw/ directory."""
    output_dir = Path(__file__).parent.parent / "raw"

    for section_name, url in SECTION_URLS.items():
        try:
            logger.info("Fetching %s from %s", section_name, url)
            html = fetch_html(url)

            logger.info("Extracting largest table from %s HTML (%d bytes)", section_name, len(html))
            df = extract_largest_table(html)
            df = flatten_multiindex_columns(df)
            df_data = strip_non_data_rows(df)

            output_path = save_raw_csv(df_data, section_name, output_dir)
            logger.info("Saved %s: %d rows × %d columns → %s", section_name, len(df_data),
                        len(df_data.columns), output_path)

            logger.info("Column names for %s:", section_name)
            for col in df_data.columns:
                logger.info("  %r", col)

            logger.info("First 5 rows of %s:", section_name)
            logger.info("\n%s", df_data.head().to_string())

        except Exception as exc:
            logger.error("Failed to process section %r: %s", section_name, exc)


if __name__ == "__main__":
    main()
