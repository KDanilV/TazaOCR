from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path

from compare_quality import (
    DEFAULT_ACTUAL_DIR,
    EXPECTED_WORKBOOK,
    cell_similarity,
    load_actual_tables,
    load_expected_tables,
    max_width,
    normalize_number,
    value_at,
)


ERROR_CATEGORIES = (
    "ocr_text_error",
    "missing_numeric_value",
    "wrong_row",
    "wrong_column",
    "missing_row",
    "extra_row",
    "missing_cell",
    "extra_cell",
    "merge_split_issue",
    "empty_cell_shift",
    "cyrillic_ocr_garbage",
    "unknown",
)
STRUCTURE_CATEGORIES = {
    "wrong_row",
    "wrong_column",
    "missing_row",
    "extra_row",
    "missing_cell",
    "extra_cell",
    "merge_split_issue",
    "empty_cell_shift",
}
DEFAULT_TOP_ERROR_LIMIT = 8


@dataclass(frozen=True)
class ErrorExample:
    category: str
    row: int
    column: int
    expected: str
    actual: str
    message: str
    actualRow: int | None = None
    actualColumn: int | None = None


@dataclass(frozen=True)
class SheetErrorSummary:
    file: str
    totalComparedCells: int
    exactMatches: int
    mismatchCount: int
    errorBreakdown: dict[str, int]
    topErrors: list[ErrorExample]
    suspectedMainCause: str
    status: str = "ok"


def main() -> None:
    args = parse_args()
    expected = load_expected_tables(args.expected)
    actual = load_actual_tables(args.actual)
    summaries = [
        classify_sheet(name, expected_table, actual.get(name), top_error_limit=args.top_errors)
        for name, expected_table in expected.items()
    ]
    print_report(summaries, args.format)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Classify OCR table errors by likely cause.")
    parser.add_argument("--expected", type=Path, default=EXPECTED_WORKBOOK)
    parser.add_argument("--actual", type=Path, default=DEFAULT_ACTUAL_DIR)
    parser.add_argument("--format", choices=("json", "csv"), default="json")
    parser.add_argument("--top-errors", type=int, default=DEFAULT_TOP_ERROR_LIMIT)
    return parser.parse_args()


def classify_sheet(
    name: str,
    expected: list[list[str]],
    actual: list[list[str]] | None,
    top_error_limit: int = DEFAULT_TOP_ERROR_LIMIT,
) -> SheetErrorSummary:
    if actual is None:
        breakdown = empty_breakdown()
        breakdown["missing_row"] = len(expected)
        breakdown["missing_cell"] = count_non_empty_cells(expected)
        breakdown["missing_numeric_value"] = count_numeric_cells(expected)
        mismatch_count = count_non_empty_cells(expected)
        examples = collect_missing_sheet_examples(expected, top_error_limit)
        return SheetErrorSummary(
            file=name,
            totalComparedCells=mismatch_count,
            exactMatches=0,
            mismatchCount=mismatch_count,
            errorBreakdown=breakdown,
            topErrors=examples,
            suspectedMainCause=suspected_main_cause(breakdown),
            status="missing",
        )

    row_count = max(len(expected), len(actual))
    col_count = max(max_width(expected), max_width(actual))
    actual_locations = index_actual_values(actual)
    counters = empty_breakdown()
    top_errors: list[ErrorExample] = []
    exact_matches = 0
    total_compared = 0

    for row_index in range(row_count):
        expected_row_has_data = row_has_data(expected, row_index)
        actual_row_has_data = row_has_data(actual, row_index)
        if expected_row_has_data and not actual_row_has_data:
            counters["missing_row"] += 1
            add_error(top_errors, top_error_limit, row_level_error("missing_row", row_index, expected, actual))
        if actual_row_has_data and not expected_row_has_data:
            counters["extra_row"] += 1
            add_error(top_errors, top_error_limit, row_level_error("extra_row", row_index, expected, actual))

        for col_index in range(col_count):
            expected_value = value_at(expected, row_index, col_index)
            actual_value = value_at(actual, row_index, col_index)
            if not expected_value and not actual_value:
                continue

            total_compared += 1
            if expected_value == actual_value:
                exact_matches += 1
                continue

            categories = classify_cell_error(
                expected,
                actual,
                actual_locations,
                row_index,
                col_index,
                expected_value,
                actual_value,
            )
            for category in categories:
                counters[category] += 1

            add_error(
                top_errors,
                top_error_limit,
                build_cell_error(categories[0], row_index, col_index, expected_value, actual_value, actual_locations),
            )

    return SheetErrorSummary(
        file=name,
        totalComparedCells=total_compared,
        exactMatches=exact_matches,
        mismatchCount=total_compared - exact_matches,
        errorBreakdown=counters,
        topErrors=top_errors,
        suspectedMainCause=suspected_main_cause(counters),
    )


def classify_cell_error(
    expected: list[list[str]],
    actual: list[list[str]],
    actual_locations: dict[str, set[tuple[int, int]]],
    row_index: int,
    col_index: int,
    expected_value: str,
    actual_value: str,
) -> list[str]:
    categories: list[str] = []
    alternate_locations = actual_locations.get(expected_value, set()) if expected_value else set()
    same_row_locations = [location for location in alternate_locations if location[0] == row_index]
    same_column_locations = [location for location in alternate_locations if location[1] == col_index]

    if expected_value and not actual_value:
        categories.append("missing_cell")
    elif actual_value and not expected_value:
        categories.append("extra_cell")

    expected_number = normalize_number(expected_value)
    actual_number = normalize_number(actual_value)
    if expected_number and expected_number != actual_number:
        categories.append("missing_numeric_value")

    if expected_value and alternate_locations:
        if same_column_locations and (row_index, col_index) not in alternate_locations:
            categories.append("wrong_row")
        if same_row_locations and (row_index, col_index) not in alternate_locations:
            categories.append("wrong_column")

    if looks_like_empty_cell_shift(expected, actual, row_index, col_index):
        categories.append("empty_cell_shift")

    if looks_like_merge_split_issue(expected_value, actual_value, expected, actual, row_index, col_index):
        categories.append("merge_split_issue")

    if looks_like_cyrillic_garbage(expected_value, actual_value):
        categories.append("cyrillic_ocr_garbage")

    if expected_value and actual_value and not any(category in STRUCTURE_CATEGORIES for category in categories):
        categories.append("ocr_text_error")

    if not categories:
        categories.append("unknown")

    return dedupe(categories)


def looks_like_empty_cell_shift(
    expected: list[list[str]],
    actual: list[list[str]],
    row_index: int,
    col_index: int,
) -> bool:
    expected_value = value_at(expected, row_index, col_index)
    actual_value = value_at(actual, row_index, col_index)
    if not expected_value:
        return False

    left_actual = value_at(actual, row_index, col_index - 1) if col_index > 0 else ""
    right_actual = value_at(actual, row_index, col_index + 1)
    if expected_value in {left_actual, right_actual}:
        neighbor_index = col_index - 1 if left_actual == expected_value else col_index + 1
        return not value_at(expected, row_index, neighbor_index)

    left_expected = value_at(expected, row_index, col_index - 1) if col_index > 0 else ""
    right_expected = value_at(expected, row_index, col_index + 1)
    return bool(actual_value and actual_value in {left_expected, right_expected})


def looks_like_merge_split_issue(
    expected_value: str,
    actual_value: str,
    expected: list[list[str]],
    actual: list[list[str]],
    row_index: int,
    col_index: int,
) -> bool:
    if not expected_value and not actual_value:
        return False

    actual_joined = joined_neighbors(actual, row_index, col_index)
    expected_joined = joined_neighbors(expected, row_index, col_index)
    if expected_value and normalized_compact(expected_value) == normalized_compact(actual_joined):
        return True
    if actual_value and normalized_compact(actual_value) == normalized_compact(expected_joined):
        return True

    return False


def joined_neighbors(rows: list[list[str]], row_index: int, col_index: int) -> str:
    values = [
        value_at(rows, row_index, col_index - 1) if col_index > 0 else "",
        value_at(rows, row_index, col_index),
        value_at(rows, row_index, col_index + 1),
    ]
    return " ".join(value for value in values if value)


def build_cell_error(
    category: str,
    row_index: int,
    col_index: int,
    expected_value: str,
    actual_value: str,
    actual_locations: dict[str, set[tuple[int, int]]],
) -> ErrorExample:
    actual_location = first_location(actual_locations.get(expected_value, set()), row_index, col_index)
    return ErrorExample(
        category=category,
        row=row_index + 1,
        column=col_index + 1,
        expected=expected_value,
        actual=actual_value,
        actualRow=actual_location[0] + 1 if actual_location else None,
        actualColumn=actual_location[1] + 1 if actual_location else None,
        message=error_message(category, expected_value, actual_value, actual_location),
    )


def row_level_error(
    category: str,
    row_index: int,
    expected: list[list[str]],
    actual: list[list[str]],
) -> ErrorExample:
    expected_text = " | ".join(value for value in row_at(expected, row_index) if value)
    actual_text = " | ".join(value for value in row_at(actual, row_index) if value)
    return ErrorExample(
        category=category,
        row=row_index + 1,
        column=1,
        expected=expected_text,
        actual=actual_text,
        message=error_message(category, expected_text, actual_text, None),
    )


def error_message(
    category: str,
    expected_value: str,
    actual_value: str,
    actual_location: tuple[int, int] | None,
) -> str:
    if category == "wrong_row" and actual_location:
        return f"Expected value appears in row {actual_location[0] + 1} instead."
    if category == "wrong_column" and actual_location:
        return f"Expected value appears in column {actual_location[1] + 1} instead."
    if category == "missing_numeric_value":
        return "Expected numeric value is missing or was recognized as non-numeric text."
    if category == "merge_split_issue":
        return "Neighboring cells look joined or split around this position."
    if category == "empty_cell_shift":
        return "Neighboring data appears shifted through an expected empty cell."
    if category == "cyrillic_ocr_garbage":
        return "Expected Cyrillic text looks recognized as Latin/punctuation garbage."
    if category == "missing_row":
        return "Expected row is absent from actual output."
    if category == "extra_row":
        return "Actual output contains a row not present in expected data."
    if category == "missing_cell":
        return "Expected cell is empty in actual output."
    if category == "extra_cell":
        return "Actual output contains a value where expected is empty."
    if category == "ocr_text_error":
        return "Cell position matches, but recognized text differs."
    return f"Unexpected mismatch: expected {expected_value!r}, actual {actual_value!r}."


def index_actual_values(rows: list[list[str]]) -> dict[str, set[tuple[int, int]]]:
    locations: dict[str, set[tuple[int, int]]] = {}
    for row_index, row in enumerate(rows):
        for col_index, value in enumerate(row):
            if value:
                locations.setdefault(value, set()).add((row_index, col_index))
    return locations


def first_location(
    locations: set[tuple[int, int]],
    expected_row: int,
    expected_col: int,
) -> tuple[int, int] | None:
    if not locations:
        return None
    return sorted(locations, key=lambda location: abs(location[0] - expected_row) + abs(location[1] - expected_col))[0]


def row_at(rows: list[list[str]], row_index: int) -> list[str]:
    if row_index >= len(rows):
        return []
    return rows[row_index]


def row_has_data(rows: list[list[str]], row_index: int) -> bool:
    return any(row_at(rows, row_index))


def count_non_empty_cells(rows: list[list[str]]) -> int:
    return sum(1 for row in rows for value in row if value)


def count_numeric_cells(rows: list[list[str]]) -> int:
    return sum(1 for row in rows for value in row if normalize_number(value))


def looks_like_cyrillic_garbage(expected: str, actual: str) -> bool:
    if cyrillic_ratio(expected) < 0.35 or not actual:
        return False
    if cyrillic_ratio(actual) >= 0.25:
        return False
    return latin_ratio(actual) >= 0.25 or punctuation_ratio(actual) >= 0.25 or cell_similarity(expected, actual) < 0.25


def cyrillic_ratio(value: str) -> float:
    letters = re.findall(r"[A-Za-z\u0400-\u04ff]", value)
    if not letters:
        return 0.0
    return len(re.findall(r"[\u0400-\u04ff]", value)) / len(letters)


def latin_ratio(value: str) -> float:
    letters = re.findall(r"[A-Za-z\u0400-\u04ff]", value)
    if not letters:
        return 0.0
    return len(re.findall(r"[A-Za-z]", value)) / len(letters)


def punctuation_ratio(value: str) -> float:
    if not value:
        return 0.0
    punctuation = re.findall(r"[^A-Za-z\u0400-\u04ff0-9\s]", value)
    return len(punctuation) / len(value)


def normalized_compact(value: str) -> str:
    return re.sub(r"\s+", "", value).lower()


def dedupe(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        if value not in result:
            result.append(value)
    return result


def empty_breakdown() -> dict[str, int]:
    return {category: 0 for category in ERROR_CATEGORIES}


def add_error(errors: list[ErrorExample], limit: int, error: ErrorExample) -> None:
    if len(errors) < max(0, limit):
        errors.append(error)


def collect_missing_sheet_examples(expected: list[list[str]], limit: int) -> list[ErrorExample]:
    examples: list[ErrorExample] = []
    for row_index, row in enumerate(expected):
        for col_index, value in enumerate(row):
            if value:
                add_error(
                    examples,
                    limit,
                    ErrorExample(
                        category="missing_cell",
                        row=row_index + 1,
                        column=col_index + 1,
                        expected=value,
                        actual="",
                        message="Expected workbook sheet is missing from actual output.",
                    ),
                )
    return examples


def suspected_main_cause(breakdown: dict[str, int]) -> str:
    non_zero = [(category, count) for category, count in breakdown.items() if count > 0]
    if not non_zero:
        return "none"
    return sorted(non_zero, key=lambda item: (-item[1], ERROR_CATEGORIES.index(item[0])))[0][0]


def print_report(summaries: list[SheetErrorSummary], report_format: str) -> None:
    if report_format == "csv":
        print_csv_report(summaries)
        return

    print(json.dumps([summary_to_json(summary) for summary in summaries], ensure_ascii=False, indent=2))


def summary_to_json(summary: SheetErrorSummary) -> dict:
    payload = asdict(summary)
    payload["topErrors"] = [asdict(error) for error in summary.topErrors]
    return payload


def print_csv_report(summaries: list[SheetErrorSummary]) -> None:
    print(
        "file,totalComparedCells,exactMatches,mismatchCount,suspectedMainCause,"
        + ",".join(ERROR_CATEGORIES)
        + ",status"
    )
    totals: Counter[str] = Counter()
    for summary in summaries:
        print(
            f"{summary.file},{summary.totalComparedCells},{summary.exactMatches},{summary.mismatchCount},"
            f"{summary.suspectedMainCause},"
            + ",".join(str(summary.errorBreakdown[category]) for category in ERROR_CATEGORIES)
            + f",{summary.status}"
        )
        totals.update(summary.errorBreakdown)
        totals["totalComparedCells"] += summary.totalComparedCells
        totals["exactMatches"] += summary.exactMatches
        totals["mismatchCount"] += summary.mismatchCount

    overall_cause = suspected_main_cause({category: totals[category] for category in ERROR_CATEGORIES})
    print(
        f"overall,{totals['totalComparedCells']},{totals['exactMatches']},{totals['mismatchCount']},"
        f"{overall_cause},"
        + ",".join(str(totals[category]) for category in ERROR_CATEGORIES)
        + ",summary"
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
