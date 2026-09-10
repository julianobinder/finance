"""Parse bank statement exports into a normalized tabular structure.

Supported sources (auto-detected from magic bytes / content):

* ``nubank_csv``    -- Nubank account CSV export (Data, Valor, Identificador, Descrição).
* ``santander_xls`` -- Santander current export, legacy binary ``.xls`` (BIFF/OLE2).
* ``santander_pdf`` -- Santander "Extrato Consolidado Inteligente" PDF statement.
* ``generic_csv``   -- any other CSV: first row is treated as the header.

Every parser returns the same shape so the existing client-side import
pipeline can consume it unchanged::

    {
        "format": "santander_xls",
        "headers": ["Data", "Descrição", "Documento", "Valor"],
        "rows": [["14/07/2026", "PAGAMENTO ...", "035017", "-34.53"], ...],
        "meta": {"period_start": "...", "opening_balance": 0.01, ...},
    }

The canonical header names MUST match the seeded import-template field
names (see ``app/seed_import_templates.py``) because the client maps
columns to fields by matching header text case-insensitively.

Amounts are always emitted as a signed, dot-decimal string with no
thousands separator (e.g. ``"-3140.00"``) so the browser's ``parseFloat``
based amount parser reads them correctly regardless of the source locale.
"""

from __future__ import annotations

import csv
import io
import re
import subprocess
import tempfile
import unicodedata
from pathlib import Path

# Canonical output headers. Keep in sync with app/seed_import_templates.py.
NUBANK_HEADERS = ["Data", "Valor", "Identificador", "Descrição"]
SANTANDER_HEADERS = ["Data", "Descrição", "Documento", "Valor"]

_MONTHS_PT = {
    "janeiro": 1, "fevereiro": 2, "marco": 3, "abril": 4, "maio": 5, "junho": 6,
    "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11,
    "dezembro": 12,
}

_DATE_DMY = re.compile(r"^\d{2}/\d{2}/\d{4}$")
_DATE_DM = re.compile(r"^(\d{2})/(\d{2})$")
# A Brazilian currency token, optionally with a trailing minus (debit) sign.
_BR_AMOUNT = re.compile(r"^-?\d{1,3}(?:\.\d{3})*,\d{2}-?$")


class StatementParseError(ValueError):
    """Raised when a statement file cannot be parsed."""


def _fold(text: str) -> str:
    """Lower-case and strip accents for tolerant header/keyword matching."""
    normalized = unicodedata.normalize("NFKD", str(text))
    stripped = "".join(c for c in normalized if not unicodedata.combining(c))
    return stripped.strip().lower()


def _decode(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _norm_amount_br(value: str) -> float | None:
    """Convert a Brazilian-formatted currency string to a float.

    Handles ``1.297,75`` (credit), ``1.297,75-`` (trailing-minus debit) and
    ``-3.140,00`` (leading-minus debit). Returns ``None`` for blanks.
    """
    text = (value or "").strip()
    if not text:
        return None
    negative = False
    if text.endswith("-"):
        negative = True
        text = text[:-1].strip()
    if text.startswith("-"):
        negative = True
        text = text[1:].strip()
    text = text.replace(".", "").replace(",", ".")
    text = re.sub(r"[^\d.]", "", text)
    if not text or text == ".":
        return None
    number = float(text)
    return -number if negative else number


def detect_format(filename: str | None, data: bytes) -> str:
    name = (filename or "").lower()
    if data[:4] == b"%PDF":
        return "santander_pdf"
    if data[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":  # OLE2 compound doc = BIFF .xls
        return "santander_xls"
    text = _decode(data)
    head = text[:4000]
    folded = _fold(head)
    if "identificador" in folded and "valor" in folded:
        return "nubank_csv"
    if "extrato de conta corrente" in folded or "credito (r$)" in folded:
        return "santander_csv"
    return "generic_csv"


# --------------------------------------------------------------------------- #
# Nubank CSV
# --------------------------------------------------------------------------- #
def _find_col(header: list[str], *candidates: str) -> int | None:
    folded = [_fold(h) for h in header]
    for candidate in candidates:
        for idx, value in enumerate(folded):
            if value == candidate or value.startswith(candidate):
                return idx
    return None


def parse_nubank_csv(data: bytes) -> dict:
    rows = list(csv.reader(io.StringIO(_decode(data))))
    rows = [r for r in rows if any(str(c).strip() for c in r)]
    if len(rows) < 2:
        raise StatementParseError("Nubank CSV has no data rows")

    header = rows[0]
    i_data = _find_col(header, "data")
    i_valor = _find_col(header, "valor")
    i_id = _find_col(header, "identificador")
    i_desc = _find_col(header, "descricao")
    if i_data is None or i_valor is None:
        raise StatementParseError("Nubank CSV missing Data/Valor columns")

    def cell(row: list[str], idx: int | None) -> str:
        if idx is None or idx >= len(row):
            return ""
        return str(row[idx]).strip()

    out_rows: list[list[str]] = []
    for row in rows[1:]:
        data_val = cell(row, i_data)
        valor = cell(row, i_valor)
        if not data_val or not valor:
            continue
        out_rows.append([data_val, valor, cell(row, i_id), cell(row, i_desc)])

    return {
        "format": "nubank_csv",
        "headers": list(NUBANK_HEADERS),
        "rows": out_rows,
        "meta": {"transaction_count": len(out_rows)},
    }


# --------------------------------------------------------------------------- #
# Santander XLS / CSV (shared column-matrix logic)
# --------------------------------------------------------------------------- #
def _santander_rows_from_matrix(matrix: list[list[str]]) -> tuple[list[list[str]], dict]:
    header_idx = None
    for idx, row in enumerate(matrix):
        folded = [_fold(c) for c in row]
        if any(c == "data" for c in folded) and any("credito" in c for c in folded):
            header_idx = idx
            break
    if header_idx is None:
        raise StatementParseError("Could not find the Santander statement header row")

    header = [str(c).strip() for c in matrix[header_idx]]
    folded = [_fold(h) for h in header]

    def col(*keys: str) -> int | None:
        for key in keys:
            for idx, value in enumerate(folded):
                if value.startswith(key):
                    return idx
        return None

    i_data = col("data")
    i_desc = col("descricao")
    i_doc = col("docto", "documento", "n documento", "no documento")
    i_cred = col("credito")
    i_deb = col("debito")
    i_saldo = col("saldo")

    def cell(row: list, idx: int | None) -> str:
        if idx is None or idx >= len(row):
            return ""
        return str(row[idx]).strip()

    out_rows: list[list[str]] = []
    opening_balance = None
    for row in matrix[header_idx + 1:]:
        data_val = cell(row, i_data)
        desc = cell(row, i_desc)
        if _fold(desc).startswith("saldo anterior"):
            opening_balance = _norm_amount_br(cell(row, i_saldo))
            continue
        if not _DATE_DMY.match(data_val):
            continue  # skips TOTAL and the summary footer block
        credit = cell(row, i_cred)
        debit = cell(row, i_deb)
        value = _norm_amount_br(credit) if credit else _norm_amount_br(debit)
        if value is None:
            continue
        desc = re.sub(r"\s{2,}", " ", desc).strip()
        out_rows.append([data_val, desc, cell(row, i_doc), f"{value:.2f}"])

    meta: dict = {"transaction_count": len(out_rows)}
    if opening_balance is not None:
        meta["opening_balance"] = opening_balance
    return out_rows, meta


def parse_santander_xls(data: bytes) -> dict:
    try:
        import xlrd  # noqa: PLC0415 (optional, heavy dependency)
    except ImportError as exc:  # pragma: no cover - environment guard
        raise StatementParseError(
            "Reading legacy .xls files requires the 'xlrd' package"
        ) from exc

    try:
        book = xlrd.open_workbook(file_contents=data)
    except Exception as exc:  # xlrd raises a variety of errors
        raise StatementParseError(f"Invalid Santander .xls file: {exc}") from exc

    sheet = book.sheet_by_index(0)
    matrix = [
        [sheet.cell_value(r, c) for c in range(sheet.ncols)]
        for r in range(sheet.nrows)
    ]
    rows, meta = _santander_rows_from_matrix(matrix)
    return {
        "format": "santander_xls",
        "headers": list(SANTANDER_HEADERS),
        "rows": rows,
        "meta": meta,
    }


def parse_santander_csv(data: bytes) -> dict:
    matrix = list(csv.reader(io.StringIO(_decode(data))))
    rows, meta = _santander_rows_from_matrix(matrix)
    return {
        "format": "santander_csv",
        "headers": list(SANTANDER_HEADERS),
        "rows": rows,
        "meta": meta,
    }


# --------------------------------------------------------------------------- #
# Santander PDF (Extrato Consolidado Inteligente)
# --------------------------------------------------------------------------- #
def _pdf_to_layout_text(data: bytes) -> str:
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as tmp:
        tmp.write(data)
        tmp.flush()
        try:
            result = subprocess.run(  # noqa: S603
                ["pdftotext", "-layout", tmp.name, "-"],  # noqa: S607
                capture_output=True,
                check=True,
                timeout=60,
            )
        except FileNotFoundError as exc:  # pragma: no cover - environment guard
            raise StatementParseError(
                "Reading PDF statements requires the 'poppler-utils' package "
                "(pdftotext) to be installed"
            ) from exc
        except subprocess.CalledProcessError as exc:
            raise StatementParseError(f"Could not read PDF: {exc}") from exc
    return result.stdout.decode("utf-8", errors="replace")


def _infer_pdf_year(lines: list[str]) -> int | None:
    pattern = re.compile(
        r"(" + "|".join(_MONTHS_PT) + r"|mar[çc]o)\s*/\s*(\d{4})"
    )
    for line in lines:
        match = pattern.search(_fold(line))
        if match:
            return int(match.group(2))
    return None


def parse_santander_pdf(data: bytes) -> dict:
    text = _pdf_to_layout_text(data)
    lines = text.splitlines()
    year = _infer_pdf_year(lines)

    # The checking-account movement block is delimited by the opening and
    # closing "SALDO EM <dd/mm>" lines. Everything outside (investment
    # sections, per-period summaries, service tables) is ignored.
    saldo_lines = [i for i, line in enumerate(lines) if re.search(r"\bSALDO EM\b", line)]
    if len(saldo_lines) < 2:
        raise StatementParseError(
            "Could not locate the checking-account movement block in the PDF"
        )
    start, stop = saldo_lines[0], saldo_lines[1]

    def saldo_amount(line: str) -> float | None:
        tokens = re.split(r"\s{2,}", line.strip())
        for token in reversed(tokens):
            if _BR_AMOUNT.match(token):
                return _norm_amount_br(token)
        return None

    opening_balance = saldo_amount(lines[start])
    closing_balance = saldo_amount(lines[stop])

    out_rows: list[list[str]] = []
    current_date: str | None = None
    pending: list[str] | None = None
    for raw in lines[start + 1:stop]:
        stripped = raw.strip()
        if not stripped:
            continue
        tokens = re.split(r"\s{2,}", stripped)
        leading_date = None
        dm = _DATE_DM.match(tokens[0])
        if dm:
            leading_date = tokens[0]
            current_date = tokens[0]

        amount_positions = [i for i, t in enumerate(tokens) if _BR_AMOUNT.match(t)]
        if amount_positions:
            first = amount_positions[0]
            desc_tokens = [t for t in tokens[:first] if t != "-"]
            if leading_date:
                desc_tokens = desc_tokens[1:]
            document = ""
            if desc_tokens and re.fullmatch(r"\d{4,}", desc_tokens[-1]):
                document = desc_tokens.pop()
            desc = re.sub(r"\s{2,}", " ", " ".join(desc_tokens)).strip()
            value = _norm_amount_br(tokens[first])
            if value is None:
                continue
            date_str = ""
            if current_date and year:
                date_str = f"{current_date}/{year}"
            elif current_date:
                date_str = current_date
            out_rows.append([date_str, desc, document, f"{value:.2f}"])
            pending = out_rows[-1]
        elif pending is not None and not _DATE_DM.match(tokens[0]):
            # Continuation line: counterparty / extra detail for the last txn.
            extra = re.sub(r"\s{2,}", " ", stripped).strip()
            pending[1] = (pending[1] + " " + extra).strip()
            pending = None

    meta: dict = {"transaction_count": len(out_rows)}
    if year:
        meta["year"] = year
    if opening_balance is not None:
        meta["opening_balance"] = opening_balance
    if closing_balance is not None:
        meta["closing_balance"] = closing_balance
    return {
        "format": "santander_pdf",
        "headers": list(SANTANDER_HEADERS),
        "rows": out_rows,
        "meta": meta,
    }


# --------------------------------------------------------------------------- #
# Generic CSV passthrough
# --------------------------------------------------------------------------- #
def parse_generic_csv(data: bytes) -> dict:
    rows = list(csv.reader(io.StringIO(_decode(data))))
    rows = [r for r in rows if any(str(c).strip() for c in r)]
    if not rows:
        raise StatementParseError("CSV file is empty")
    headers = [str(c).strip() for c in rows[0]]
    width = len(headers)
    out_rows = [
        [str(c).strip() for c in (row + [""] * width)[:width]] for row in rows[1:]
    ]
    return {
        "format": "generic_csv",
        "headers": headers,
        "rows": out_rows,
        "meta": {"transaction_count": len(out_rows)},
    }


# --------------------------------------------------------------------------- #
# Dispatch
# --------------------------------------------------------------------------- #
_PARSERS = {
    "nubank_csv": parse_nubank_csv,
    "santander_xls": parse_santander_xls,
    "santander_csv": parse_santander_csv,
    "santander_pdf": parse_santander_pdf,
    "generic_csv": parse_generic_csv,
}


def parse_statement(filename: str | None, data: bytes, fmt: str | None = None) -> dict:
    """Parse ``data`` into normalized ``{format, headers, rows, meta}``.

    ``fmt`` forces a specific parser; otherwise the format is auto-detected.
    """
    if not data:
        raise StatementParseError("Empty file")
    resolved = fmt or detect_format(filename, data)
    parser = _PARSERS.get(resolved)
    if parser is None:
        raise StatementParseError(f"Unsupported statement format: {resolved}")
    return parser(data)


def parse_statement_path(path: str, fmt: str | None = None) -> dict:
    file_path = Path(path)
    return parse_statement(file_path.name, file_path.read_bytes(), fmt)
