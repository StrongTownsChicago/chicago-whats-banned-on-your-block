"""Unit tests for scripts/01_fetch_ordinance.py."""

import io
from pathlib import Path

import pandas as pd
import pytest
import responses as responses_lib

from fetch_ordinance import (
    extract_largest_table,
    fetch_html,
    flatten_multiindex_columns,
    save_raw_csv,
    strip_non_data_rows,
)


# ---------------------------------------------------------------------------
# extract_largest_table
# ---------------------------------------------------------------------------

def _make_html(*tables: str) -> str:
    """Wrap one or more <table> snippets in minimal HTML."""
    body = "\n".join(tables)
    return f"<html><body>{body}</body></html>"


def _simple_table(rows: int, cols: int = 2) -> str:
    # AmLegal uses <td> for all cells (including headers); header=[0,1,2] expects 3 header rows.
    headers = "".join(
        "<tr>" + "".join(f"<td>H{lvl}_{i}</td>" for i in range(cols)) + "</tr>"
        for lvl in range(3)
    )
    data = "".join(
        "<tr>" + "".join(f"<td>r{r}c{i}</td>" for i in range(cols)) + "</tr>"
        for r in range(rows)
    )
    return f"<table>{headers}{data}</table>"


class TestExtractLargestTable:
    def test_returns_larger_of_two_tables(self):
        html = _make_html(_simple_table(5), _simple_table(20))
        df = extract_largest_table(html)
        assert len(df) == 20

    def test_returns_single_table(self):
        html = _make_html(_simple_table(7))
        df = extract_largest_table(html)
        assert len(df) == 7

    def test_raises_value_error_on_no_tables(self):
        html = "<html><body><p>No tables here</p></body></html>"
        with pytest.raises(ValueError, match="No tables found"):
            extract_largest_table(html)

    def test_raises_value_error_on_div_lookalike(self):
        html = "<html><body><div class='table'>fake</div></body></html>"
        with pytest.raises(ValueError, match="No tables found"):
            extract_largest_table(html)

    def test_deterministic_on_tied_row_counts(self):
        """When two tables have the same row count, result is still a valid DataFrame."""
        html = _make_html(_simple_table(10), _simple_table(10))
        df = extract_largest_table(html)
        assert len(df) == 10


# ---------------------------------------------------------------------------
# flatten_multiindex_columns
# ---------------------------------------------------------------------------

class TestFlattenMultiindexColumns:
    def test_business_district_columns_deduplicated(self):
        """('Zoning Districts', 'B1', 'B1') → 'B1' (all non-Unnamed parts the same)."""
        arrays = [
            ["USE GROUP", "USE GROUP", "Zoning Districts", "Zoning Districts"],
            ["Use Category", "Specific Use Type", "B1", "B2"],
            ["Use Category", "Specific Use Type", "B1", "B2"],
        ]
        mi = pd.MultiIndex.from_arrays(arrays)
        df = pd.DataFrame([["Housing", "Detached House", "P", "S"]], columns=mi)
        result = flatten_multiindex_columns(df)
        assert list(result.columns) == [
            "Use Category",
            "Specific Use Type",
            "B1",
            "B2",
        ]

    def test_residential_district_columns_joined_with_dash(self):
        """('Zoning Districts', 'RS', '1') → 'RS-1'; ('Zoning Districts', 'RT', '3.5') → 'RT-3.5'."""
        arrays = [
            ["Zoning Districts", "Zoning Districts", "Zoning Districts"],
            ["RS", "RT", "RM"],
            ["1", "3.5", "4.5"],
        ]
        mi = pd.MultiIndex.from_arrays(arrays)
        df = pd.DataFrame([["P", "P", "P"]], columns=mi)
        result = flatten_multiindex_columns(df)
        assert list(result.columns) == ["RS-1", "RT-3.5", "RM-4.5"]

    def test_unnamed_prefix_stripped(self):
        arrays = [
            ["Unnamed: 0_level_0", "Zoning Districts"],
            ["Unnamed: 0_level_1", "B1"],
            ["Use Category", "B1"],
        ]
        mi = pd.MultiIndex.from_arrays(arrays)
        df = pd.DataFrame([["Housing", "P"]], columns=mi)
        result = flatten_multiindex_columns(df)
        # First col: all Unnamed filtered → parts = ["Use Category"] → "Use Category"
        assert result.columns[0] == "Use Category"
        # Second col: Unnamed filtered → parts = ["Zoning Districts", "B1"] → "B1" (last)
        assert result.columns[1] == "B1"

    def test_single_level_columns_returned_as_is(self):
        df = pd.DataFrame({"A": [1], "B": [2]})
        result = flatten_multiindex_columns(df)
        assert list(result.columns) == ["A", "B"]

    def test_does_not_mutate_original(self):
        arrays = [["G1", "G2"], ["C1", "C2"], ["C1", "C2"]]
        mi = pd.MultiIndex.from_arrays(arrays)
        df = pd.DataFrame([[1, 2]], columns=mi)
        flatten_multiindex_columns(df)
        assert isinstance(df.columns, pd.MultiIndex)


# ---------------------------------------------------------------------------
# save_raw_csv
# ---------------------------------------------------------------------------

class TestSaveRawCsv:
    def test_writes_csv_file(self, tmp_path: Path):
        df = pd.DataFrame({"col_a": [1, 2], "col_b": ["P", "S"]})
        out = save_raw_csv(df, "business", tmp_path)
        assert out.exists()
        assert out.name == "raw_business.csv"

    def test_flattens_multiindex_columns_in_csv(self, tmp_path: Path):
        # Business-style 3-level MultiIndex: all levels same → column name is deduped value.
        arrays = [["Zoning Districts", "Zoning Districts"], ["B1", "B2"], ["B1", "B2"]]
        mi = pd.MultiIndex.from_arrays(arrays)
        df = pd.DataFrame([["P", "S"]], columns=mi)
        out = save_raw_csv(df, "test", tmp_path)
        header = out.read_text(encoding="utf-8").splitlines()[0]
        assert "B1" in header
        assert "B2" in header

    def test_creates_output_dir_if_absent(self, tmp_path: Path):
        nested = tmp_path / "a" / "b"
        df = pd.DataFrame({"x": [1]})
        save_raw_csv(df, "section", nested)
        assert (nested / "raw_section.csv").exists()

    def test_returns_correct_path(self, tmp_path: Path):
        df = pd.DataFrame({"x": [1]})
        out = save_raw_csv(df, "manufacturing", tmp_path)
        assert out == tmp_path / "raw_manufacturing.csv"


# ---------------------------------------------------------------------------
# fetch_html
# ---------------------------------------------------------------------------

class TestFetchHtml:
    @responses_lib.activate
    def test_returns_html_on_200(self):
        responses_lib.add(
            responses_lib.GET,
            "https://example.com/ordinance",
            body="<html><body>content</body></html>",
            status=200,
        )
        result = fetch_html("https://example.com/ordinance")
        assert "content" in result

    @responses_lib.activate
    def test_raises_http_error_on_403(self):
        import requests

        responses_lib.add(
            responses_lib.GET,
            "https://example.com/ordinance",
            status=403,
        )
        with pytest.raises(requests.HTTPError):
            fetch_html("https://example.com/ordinance")

    @responses_lib.activate
    def test_raises_http_error_on_404(self):
        import requests

        responses_lib.add(
            responses_lib.GET,
            "https://example.com/ordinance",
            status=404,
        )
        with pytest.raises(requests.HTTPError):
            fetch_html("https://example.com/ordinance")

    @responses_lib.activate
    def test_raises_http_error_on_503(self):
        import requests

        responses_lib.add(
            responses_lib.GET,
            "https://example.com/ordinance",
            status=503,
        )
        with pytest.raises(requests.HTTPError):
            fetch_html("https://example.com/ordinance")

    @responses_lib.activate
    def test_sends_user_agent_header(self):
        responses_lib.add(
            responses_lib.GET,
            "https://example.com/ordinance",
            body="<html/>",
            status=200,
        )
        fetch_html("https://example.com/ordinance", user_agent="TestAgent/1.0")
        assert responses_lib.calls[0].request.headers["User-Agent"] == "TestAgent/1.0"


# ---------------------------------------------------------------------------
# strip_non_data_rows
# ---------------------------------------------------------------------------

class TestStripNonDataRows:
    def _df_with_districts(self, rows: list[dict]) -> pd.DataFrame:
        """Build a DataFrame with district columns B1, B2 plus a use name column."""
        return pd.DataFrame(rows)

    def test_keeps_rows_with_permission_values(self):
        df = self._df_with_districts([
            {"Use": "Day Care Center", "B1": "S", "B2": "P"},
            {"Use": "Hair Salon", "B1": "P", "B2": "P"},
        ])
        result = strip_non_data_rows(df)
        assert len(result) == 2

    def test_removes_category_header_rows(self):
        df = self._df_with_districts([
            {"Use": "A. Commercial Uses", "B1": float("nan"), "B2": float("nan")},
            {"Use": "Day Care Center", "B1": "S", "B2": "P"},
        ])
        result = strip_non_data_rows(df)
        assert len(result) == 1
        assert result.iloc[0]["Use"] == "Day Care Center"

    def test_removes_legend_rows(self):
        df = self._df_with_districts([
            {"Use": "P = Permitted; S = Special Use", "B1": float("nan"), "B2": float("nan")},
            {"Use": "Hair Salon", "B1": "P", "B2": "P"},
        ])
        result = strip_non_data_rows(df)
        assert len(result) == 1

    def test_keeps_rows_with_em_dash(self):
        df = self._df_with_districts([
            {"Use": "Live-Work Unit", "B1": "—", "B2": "S"},
        ])
        result = strip_non_data_rows(df)
        assert len(result) == 1

    def test_keeps_pd_permission_rows(self):
        df = self._df_with_districts([
            {"Use": "Some Use", "B1": "PD", "B2": "—"},
        ])
        result = strip_non_data_rows(df)
        assert len(result) == 1

    def test_returns_df_unchanged_if_no_district_columns(self):
        df = pd.DataFrame({"Use": ["A", "B"], "Notes": ["x", "y"]})
        result = strip_non_data_rows(df)
        assert len(result) == 2

    def test_resets_index_after_filtering(self):
        df = self._df_with_districts([
            {"Use": "Header", "B1": float("nan"), "B2": float("nan")},
            {"Use": "Day Care", "B1": "S", "B2": "P"},
        ])
        result = strip_non_data_rows(df)
        assert list(result.index) == [0]
