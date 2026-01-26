from selenepy.suggestions.service import _safe_int, _trim_text, apply_scan_scope


def test_trim_text():
    assert _trim_text("  hello  ", 10) == "hello"
    assert _trim_text("this is a long string", 10) == "this is a…"
    assert _trim_text("exactlen10", 10) == "exactlen10"


def test_safe_int():
    assert _safe_int("123") == 123
    assert _safe_int(456) == 456
    assert _safe_int("abc") == 0
    assert _safe_int(None) == 0
    assert _safe_int("abc", fallback=5) == 5


def test_apply_scan_scope_full_mode():
    snapshot = {"cells": [{"cellIndex": 0}, {"cellIndex": 1}], "activeCellIndex": 0}
    result = apply_scan_scope(snapshot, "full", 3)
    assert result == snapshot


def test_apply_scan_scope_context_mode():
    cells = [{"cellIndex": i} for i in range(10)]
    outline = [{"cellIndex": i} for i in range(10)]
    snapshot = {
        "cells": cells,
        "outline": outline,
        "activeCellIndex": 5,
        "path": "test.ipynb",
    }

    # context_window = 2 means index 3, 4, 5, 6, 7
    result = apply_scan_scope(snapshot, "context", 2)

    assert len(result["cells"]) == 5
    assert [c["cellIndex"] for c in result["cells"]] == [3, 4, 5, 6, 7]
    assert len(result["outline"]) == 5
    assert [o["cellIndex"] for o in result["outline"]] == [3, 4, 5, 6, 7]
    assert result["scanWindow"] == {"start": 3, "end": 7}


def test_apply_scan_scope_edge_cases():
    # Empty cells
    snapshot = {"cells": [], "activeCellIndex": 0}
    assert apply_scan_scope(snapshot, "context", 1) == snapshot

    # Window size 0 (only active cell)
    cells = [{"cellIndex": 0}, {"cellIndex": 1}, {"cellIndex": 2}]
    snapshot = {"cells": cells, "activeCellIndex": 1}
    result = apply_scan_scope(snapshot, "context", 0)
    assert len(result["cells"]) == 1
    assert result["cells"][0]["cellIndex"] == 1
    assert result["scanWindow"] == {"start": 1, "end": 1}
