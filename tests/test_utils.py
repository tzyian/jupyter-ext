from selenepy import utils


def test_safe_int():
    assert utils.safe_int("10") == 10
    assert utils.safe_int(None, fallback=5) == 5
    assert utils.safe_int("notint", fallback=-1) == -1


def test_trim_text():
    assert utils.trim_text("  hello  ", 10) == "hello"
    long_text = "x" * 50
    res = utils.trim_text(long_text, 10)
    assert len(res) <= 11  # includes ellipsis
    assert res.endswith("…")


def test_format_snapshot_for_prompt_minimal():
    snapshot = {
        "path": "notebook.ipynb",
        "activeCellIndex": 1,
        "outline": [],
        "cells": [{"cellIndex": 0, "cellType": "code", "source": "print(1)"}],
    }
    text = utils.format_snapshot_for_prompt(snapshot)
    assert "Notebook path: notebook.ipynb" in text
    assert "Cell 0 [code]:" in text
