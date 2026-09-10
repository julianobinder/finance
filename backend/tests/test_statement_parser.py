"""Tests for the bank-statement parser against the real sample exports
in the repository's ``coverage/`` directory.

The XLS test needs ``xlrd`` and the PDF test needs ``pdftotext``
(poppler-utils); both are skipped when the dependency is unavailable so
the suite still runs in minimal environments.
"""

import shutil
from pathlib import Path

import pytest

from app.statement_parser import (
    SANTANDER_HEADERS,
    StatementParseError,
    _norm_amount_br,
    detect_format,
    parse_statement,
    parse_statement_path,
)

# Real bank exports live in the gitignored coverage/ dir (they contain PII and
# are never committed), so tests that use them skip when the file is absent.
SAMPLES = Path(__file__).resolve().parents[2] / "coverage"
NUBANK = SAMPLES / "NU_95873586_01JAN2026_31JAN2026.csv"
SANTANDER_XLS = SAMPLES / "planilhaExtrato.xls"
SANTANDER_PDF = SAMPLES / "ComprovanteSantander-1784060360672.pdf"

# Committed, PII-free fixtures for CI coverage of the parsing logic.
FIXTURES = Path(__file__).resolve().parent / "fixtures"
SANTANDER_CSV_SAMPLE = FIXTURES / "santander_extrato_sample.csv"

requires_nubank = pytest.mark.skipif(
    not NUBANK.exists(), reason="Nubank sample export not present"
)
requires_xls = pytest.mark.skipif(
    not SANTANDER_XLS.exists(), reason="Santander .xls sample export not present"
)
requires_pdf = pytest.mark.skipif(
    not SANTANDER_PDF.exists(), reason="Santander PDF sample export not present"
)


def _valor_sum(result):
    idx = result["headers"].index("Valor")
    return round(sum(float(row[idx]) for row in result["rows"]), 2)


# --------------------------------------------------------------------------- #
# Amount normalization
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("1.297,75", 1297.75),      # credit
        ("1.297,75-", -1297.75),    # trailing-minus debit (PDF)
        ("-3.140,00", -3140.00),    # leading-minus debit (XLS)
        ("34,53", 34.53),
        ("6.483,69", 6483.69),
        (" 6,62 ", 6.62),
        ("", None),
        ("   ", None),
    ],
)
def test_norm_amount_br(raw, expected):
    assert _norm_amount_br(raw) == expected


# --------------------------------------------------------------------------- #
# Format detection
# --------------------------------------------------------------------------- #
@requires_nubank
def test_detect_nubank():
    assert detect_format(NUBANK.name, NUBANK.read_bytes()) == "nubank_csv"


@requires_xls
def test_detect_santander_xls():
    assert detect_format(SANTANDER_XLS.name, SANTANDER_XLS.read_bytes()) == "santander_xls"


@requires_pdf
def test_detect_santander_pdf():
    assert detect_format(SANTANDER_PDF.name, SANTANDER_PDF.read_bytes()) == "santander_pdf"


def test_detect_santander_csv():
    assert detect_format(
        SANTANDER_CSV_SAMPLE.name, SANTANDER_CSV_SAMPLE.read_bytes()
    ) == "santander_csv"


# --------------------------------------------------------------------------- #
# Nubank CSV
# --------------------------------------------------------------------------- #
@requires_nubank
def test_parse_nubank():
    result = parse_statement_path(str(NUBANK))
    assert result["format"] == "nubank_csv"
    assert result["headers"] == ["Data", "Valor", "Identificador", "Descrição"]
    assert len(result["rows"]) == 28

    first = result["rows"][0]
    assert first[0] == "05/01/2026"
    assert first[1] == "100.00"
    # Identificador (UUID) is preserved for later dedup.
    assert first[2] == "695c4911-3535-4dfe-9798-4da6b94b22c4"
    assert "cartão de crédito" in first[3]

    # This particular month nets to zero (paired Pix-credit top-ups).
    assert _valor_sum(result) == 0.0


# --------------------------------------------------------------------------- #
# Santander current (.xls)
# --------------------------------------------------------------------------- #
@requires_xls
def test_parse_santander_xls():
    pytest.importorskip("xlrd")
    result = parse_statement_path(str(SANTANDER_XLS))
    assert result["format"] == "santander_xls"
    assert result["headers"] == SANTANDER_HEADERS
    assert len(result["rows"]) == 8

    # Credit stays positive, debit becomes negative; both dot-decimal.
    values = [float(r[3]) for r in result["rows"]]
    assert -34.53 in values
    assert 34.53 in values
    assert -3140.00 in values
    assert 6483.69 in values

    # Docto column is carried through as the reference.
    assert result["rows"][0][2] == "035017"

    # SALDO ANTERIOR and TOTAL rows are excluded from transactions.
    descriptions = " ".join(r[1].upper() for r in result["rows"])
    assert "SALDO ANTERIOR" not in descriptions
    assert "TOTAL" not in descriptions

    # Reconciliation: opening balance + net movement == closing (6,62).
    assert result["meta"]["opening_balance"] == 970.92
    assert round(970.92 + _valor_sum(result), 2) == 6.62


# --------------------------------------------------------------------------- #
# Santander PDF statement
# --------------------------------------------------------------------------- #
@requires_pdf
@pytest.mark.skipif(shutil.which("pdftotext") is None, reason="poppler-utils not installed")
def test_parse_santander_pdf():
    result = parse_statement_path(str(SANTANDER_PDF))
    assert result["format"] == "santander_pdf"
    assert result["headers"] == SANTANDER_HEADERS
    assert len(result["rows"]) == 15

    # Year is inferred from the "janeiro/2025" statement header.
    assert result["meta"]["year"] == 2025
    for row in result["rows"]:
        assert row[0].endswith("/2025")

    # Trailing-minus debits are negative; credits positive.
    values = [float(r[3]) for r in result["rows"]]
    assert 3032.00 in values
    assert -1297.75 in values
    assert -3492.12 in values

    # Only the checking-account block is captured (investment sections excluded).
    assert result["meta"]["opening_balance"] == 0.01
    assert result["meta"]["closing_balance"] == 0.0
    assert round(0.01 + _valor_sum(result), 2) == 0.0


# --------------------------------------------------------------------------- #
# Santander CSV (shares the matrix logic with the .xls parser) - PII-free
# --------------------------------------------------------------------------- #
def test_parse_santander_csv_sample():
    result = parse_statement("santander_extrato_sample.csv", SANTANDER_CSV_SAMPLE.read_bytes())
    assert result["format"] == "santander_csv"
    assert result["headers"] == SANTANDER_HEADERS
    assert len(result["rows"]) == 2

    by_desc = {r[1]: r for r in result["rows"]}
    # Credit positive, debit negative, Brazilian format normalized.
    assert float(by_desc["PIX RECEBIDO FULANO DE TAL"][3]) == 1000.00
    assert float(by_desc["PAGAMENTO DE BOLETO OUTROS BANCOS EMPRESA EXEMPLO"][3]) == -250.50

    # SALDO ANTERIOR / TOTAL / footer rows excluded; opening balance captured.
    assert result["meta"]["opening_balance"] == 0.0
    assert round(0.0 + _valor_sum(result), 2) == 749.50


# --------------------------------------------------------------------------- #
# Errors
# --------------------------------------------------------------------------- #
def test_empty_file_raises():
    with pytest.raises(StatementParseError):
        parse_statement("empty.csv", b"")


def test_generic_csv_passthrough():
    data = b"Header A,Header B\n1,2\n3,4\n"
    result = parse_statement("thing.csv", data)
    assert result["format"] == "generic_csv"
    assert result["headers"] == ["Header A", "Header B"]
    assert result["rows"] == [["1", "2"], ["3", "4"]]
