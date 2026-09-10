"""AI-assisted transaction categorization.

Given a batch of parsed bank transactions plus the user's category/payee lists,
an LLM suggests a category and payee for each. Two providers are supported and
selected from whichever API key is configured (env / .env.local, never
hardcoded):

* ``anthropic`` -- Claude (default model: Haiku, the cheapest tier), via the
  official ``anthropic`` SDK.
* ``gemini``    -- Google Gemini (developer key), via a plain HTTPS call (no
  extra SDK dependency, matching the currency-rate fetch pattern).

The model returns a category *by name* (reusing an existing one when it fits, or
proposing a new one, optionally with a parent). The backend resolves names to
existing category ids; unmatched names come back so the client can create the
category/subcategory on import. The user always reviews before saving.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Category, ObligationGroup, Payee

logger = logging.getLogger("ai_categorize")

CHUNK_SIZE = 60

SYSTEM_PROMPT = (
    "You categorize personal bank transactions for a finance app. Bank "
    "descriptions are mostly Brazilian Portuguese (Nubank and Santander). "
    "You are given the existing categories and known payees. For each "
    "transaction choose the best category and extract the counterparty "
    "(payee).\n"
    "Rules:\n"
    "- Prefer an existing category, returned exactly as shown. If none fits, "
    "propose a concise new category name (and a parent when it is naturally a "
    "sub-category, e.g. parent 'Food', category 'Groceries').\n"
    "- amount is signed: negative = money leaving the account (expense), "
    "positive = money arriving (income). Use the sign to disambiguate (e.g. "
    "'PIX RECEBIDO' is income, 'PIX ENVIADO' is an expense).\n"
    "- For payee, reuse a known payee name verbatim when the transaction "
    "clearly involves them; otherwise return a cleaned human/company name "
    "(Title Case, no CPF/CNPJ/account numbers). Use null when there is no "
    "meaningful counterparty (bank fees, interest, internal yield like 'RDB').\n"
    "- confidence is 0.0-1.0.\n"
    "Respond with ONLY a JSON array, one object per transaction, in the same "
    "order, shaped exactly: "
    '{"index": <int>, "category": <string|null>, "parent": <string|null>, '
    '"payee": <string|null>, "confidence": <number>}. '
    "category is the (leaf) category name; parent is its parent category name "
    "or null. No prose, no code fences."
)


class AICategorizationError(RuntimeError):
    pass


def resolve_provider() -> str | None:
    choice = (settings.ai_provider or "").strip().lower()
    if choice == "anthropic" and settings.anthropic_api_key:
        return "anthropic"
    if choice == "gemini" and settings.gemini_api_key:
        return "gemini"
    if not choice:
        if settings.anthropic_api_key:
            return "anthropic"
        if settings.gemini_api_key:
            return "gemini"
    return None


def is_enabled() -> bool:
    return resolve_provider() is not None


def active_model() -> str | None:
    provider = resolve_provider()
    if provider == "anthropic":
        return settings.anthropic_model
    if provider == "gemini":
        return settings.gemini_model
    return None


def _fold(text: str) -> str:
    return " ".join(str(text).strip().lower().split())


def _category_context(db: Session):
    cats = db.query(Category).filter(Category.is_hidden == False).all()  # noqa: E712
    by_id = {c.category_id: c for c in cats}
    options = []
    lookup: dict[str, int] = {}  # normalized name -> id
    for c in cats:
        parent = by_id.get(c.parent_category_id) if c.parent_category_id else None
        full = f"{parent.name}: {c.name}" if parent else c.name
        options.append(full)
        lookup[_fold(full)] = c.category_id
        # also index by leaf name (first wins) so a bare leaf still resolves
        lookup.setdefault(_fold(c.name), c.category_id)
    return options, lookup


def _payee_names(db: Session) -> list[str]:
    return [p.name for p in db.query(Payee).order_by(Payee.name).all()]


def _extract_json_array(text: str) -> list:
    text = (text or "").strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1] if text.count("```") >= 2 else text
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1 or end < start:
        raise AICategorizationError("Model did not return a JSON array")
    return json.loads(text[start : end + 1])


def _call_anthropic(
    context_text: str, txns_text: str, max_tokens: int, system_prompt: str = SYSTEM_PROMPT
) -> str:
    try:
        import anthropic  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover
        raise AICategorizationError(
            "The 'anthropic' package is required for the Anthropic provider."
        ) from exc

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    try:
        response = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": context_text,
                            # stable across chunks/imports -> cache it
                            "cache_control": {"type": "ephemeral"},
                        },
                        {"type": "text", "text": txns_text},
                    ],
                }
            ],
        )
    except anthropic.APIError as exc:
        raise AICategorizationError(f"Anthropic API error: {exc}") from exc
    return "".join(b.text for b in response.content if b.type == "text")


def _call_gemini(context_text: str, txns_text: str, system_prompt: str = SYSTEM_PROMPT) -> str:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent?key={settings.gemini_api_key}"
    )
    body = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [
            {"role": "user", "parts": [{"text": context_text + "\n\n" + txns_text}]}
        ],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(  # noqa: S310 (fixed https host)
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        raise AICategorizationError(f"Gemini API error ({exc.code}): {detail}") from exc
    except urllib.error.URLError as exc:
        raise AICategorizationError(f"Gemini request failed: {exc}") from exc

    try:
        return payload["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as exc:
        raise AICategorizationError("Unexpected Gemini response shape") from exc


def _resolve_category_payee(item: dict, lookup: dict[str, int]) -> dict:
    """Shared shaping for one LLM suggestion: resolve a category name to an
    existing id when possible, else pass the proposed name(s) through as-is."""
    category = item.get("category")
    parent = item.get("parent")
    category = category.strip() if isinstance(category, str) and category.strip() else None
    parent = parent.strip() if isinstance(parent, str) and parent.strip() else None

    category_id = None
    if category:
        full = f"{parent}: {category}" if parent else category
        category_id = lookup.get(_fold(full)) or lookup.get(_fold(category))
    if category_id:
        # Matched an existing category -> client just selects it.
        category = None
        parent = None

    payee = item.get("payee")
    payee = payee.strip() if isinstance(payee, str) and payee.strip() else None

    return {
        "category_id": category_id,
        "category": category,
        "parent": parent,
        "payee": payee,
        "confidence": item.get("confidence"),
    }


def _classify_chunk(provider, lookup, chunk, context_text) -> list[dict]:
    txns_text = "Transactions to categorize:\n" + json.dumps(chunk, ensure_ascii=False)
    if provider == "anthropic":
        raw = _call_anthropic(context_text, txns_text, min(16000, 400 + 80 * len(chunk)))
    else:
        raw = _call_gemini(context_text, txns_text)

    parsed = _extract_json_array(raw)
    return [
        {"index": item["index"], **_resolve_category_payee(item, lookup)}
        for item in parsed
        if isinstance(item, dict) and "index" in item
    ]


def suggest_categorization(db: Session, transactions: list[dict]) -> list[dict]:
    """Return ``{index, category_id, category, parent, payee, confidence}`` per txn.

    ``transactions`` items are ``{index, description, amount}``. ``category_id``
    is set when the suggestion matches an existing category; otherwise
    ``category``/``parent`` hold a proposed new (sub)category to create.
    """
    provider = resolve_provider()
    if provider is None:
        raise AICategorizationError(
            "AI categorization is not configured (set ANTHROPIC_API_KEY or GEMINI_API_KEY)."
        )
    if not transactions:
        return []

    options, lookup = _category_context(db)
    payees = _payee_names(db)
    context_text = "Existing categories and known payees:\n" + json.dumps(
        {"categories": options, "known_payees": payees[:400]}, ensure_ascii=False
    )

    suggestions: list[dict] = []
    for start in range(0, len(transactions), CHUNK_SIZE):
        chunk = transactions[start : start + CHUNK_SIZE]
        try:
            suggestions.extend(_classify_chunk(provider, lookup, chunk, context_text))
        except AICategorizationError:
            raise
        except (ValueError, KeyError, json.JSONDecodeError) as exc:
            logger.error("Failed to parse categorization response: %s", exc)
            raise AICategorizationError(
                "Could not parse the categorization response."
            ) from exc

    return suggestions


SYSTEM_PROMPT_OBLIGATIONS = (
    "You categorize recurring bills/obligations for a personal finance app "
    "(Brazilian Portuguese context). You are given the existing categories and "
    "known payees. Each obligation is a budgeted bill (rent, utilities, a "
    "subscription) -- not a bank transaction. For each one, choose the best "
    "category and, if identifiable, a payee.\n"
    "Rules:\n"
    "- Prefer an existing category, returned exactly as shown. If none fits, "
    "propose a concise new category name (and a parent when it is naturally a "
    "sub-category).\n"
    "- For payee, reuse a known payee name verbatim when it clearly matches; "
    "otherwise return a cleaned name or null.\n"
    "- confidence is 0.0-1.0.\n"
    "Respond with ONLY a JSON array, one object per obligation, in the same "
    "order, shaped exactly: "
    '{"index": <int>, "category": <string|null>, "parent": <string|null>, '
    '"payee": <string|null>, "confidence": <number>}. '
    "No prose, no code fences."
)


def _classify_obligation_chunk(provider, lookup, chunk, context_text) -> list[dict]:
    items_text = "Obligations to categorize:\n" + json.dumps(chunk, ensure_ascii=False)
    if provider == "anthropic":
        raw = _call_anthropic(
            context_text,
            items_text,
            min(16000, 400 + 80 * len(chunk)),
            system_prompt=SYSTEM_PROMPT_OBLIGATIONS,
        )
    else:
        raw = _call_gemini(context_text, items_text, system_prompt=SYSTEM_PROMPT_OBLIGATIONS)

    parsed = _extract_json_array(raw)
    return [
        {"index": item["index"], **_resolve_category_payee(item, lookup)}
        for item in parsed
        if isinstance(item, dict) and "index" in item
    ]


def suggest_obligation_categories(db: Session, obligations: list[dict]) -> list[dict]:
    """Return ``{index, category_id, category, parent, payee, confidence}`` per obligation.

    ``obligations`` items are ``{index, name, note}``. Mirrors
    ``suggest_categorization`` exactly (same chunking/resolution), just with an
    obligation-framed prompt instead of a bank-transaction one.
    """
    provider = resolve_provider()
    if provider is None:
        raise AICategorizationError(
            "AI categorization is not configured (set ANTHROPIC_API_KEY or GEMINI_API_KEY)."
        )
    if not obligations:
        return []

    options, lookup = _category_context(db)
    payees = _payee_names(db)
    context_text = "Existing categories and known payees:\n" + json.dumps(
        {"categories": options, "known_payees": payees[:400]}, ensure_ascii=False
    )

    suggestions: list[dict] = []
    for start in range(0, len(obligations), CHUNK_SIZE):
        chunk = obligations[start : start + CHUNK_SIZE]
        try:
            suggestions.extend(_classify_obligation_chunk(provider, lookup, chunk, context_text))
        except AICategorizationError:
            raise
        except (ValueError, KeyError, json.JSONDecodeError) as exc:
            logger.error("Failed to parse obligation categorization response: %s", exc)
            raise AICategorizationError(
                "Could not parse the categorization response."
            ) from exc

    return suggestions


SYSTEM_PROMPT_CATEGORY_MATCH = (
    "You match raw category labels -- often from a Brazilian Portuguese personal-finance "
    "spreadsheet -- to the closest category in this app, for an obligation (budgeted "
    "recurring/one-off bill) import. This is translation-aware: a label may be in "
    "Portuguese while the matching category is named in English, or vice versa (e.g. "
    "'Faculdade' or 'Universidade' means the same thing as an existing 'Education' or "
    "'Educação' category; 'Aluguel' means the same as 'Rent' or 'Housing'). Judge by "
    "MEANING, translating between languages as needed, not by surface spelling.\n"
    "You are given the full list of existing categories. For each label:\n"
    "- If an existing category's meaning matches it (even loosely, once translated), "
    "return it EXACTLY as shown in the list -- do not force a weak match, but do not miss "
    "an obvious translation either.\n"
    "- If truly nothing existing fits, propose a concise NEW category name that captures "
    "the label's meaning: translate it (matching the language/style most of the existing "
    "categories are written in) rather than copying the raw label verbatim -- e.g. a label "
    "meaning 'salary advance' becomes a new category named for that concept, not left as "
    "the untranslated original text. Include a parent only when it is naturally a "
    "sub-category of one of the EXISTING top-level categories.\n"
    "Respond with ONLY a JSON array, one object per label, in the same order, shaped "
    'exactly: {"index": <int>, "category": <string|null>, "parent": <string|null>}. '
    "When matching an existing category, category/parent must be copied EXACTLY as they "
    "appear in the existing categories list. When proposing a new one, category is the new "
    "name and parent is an existing top-level category name or null. No prose, no code "
    "fences."
)


def _match_category_chunk(provider, lookup, chunk, context_text) -> list[dict]:
    items_text = "Labels to match:\n" + json.dumps(chunk, ensure_ascii=False)
    if provider == "anthropic":
        raw = _call_anthropic(
            context_text,
            items_text,
            min(16000, 400 + 60 * len(chunk)),
            system_prompt=SYSTEM_PROMPT_CATEGORY_MATCH,
        )
    else:
        raw = _call_gemini(context_text, items_text, system_prompt=SYSTEM_PROMPT_CATEGORY_MATCH)

    parsed = _extract_json_array(raw)
    results = []
    for item in parsed:
        if not isinstance(item, dict) or "index" not in item:
            continue
        resolved = _resolve_category_payee(item, lookup)
        results.append(
            {
                "index": item["index"],
                "category_id": resolved["category_id"],
                "category": resolved["category"],
                "parent": resolved["parent"],
            }
        )
    return results


def suggest_category_matches(db: Session, labels: list[str]) -> list[dict]:
    """Match raw category labels (e.g. from a spreadsheet import) to the closest
    EXISTING category, translating between languages/spellings as needed, and
    proposing a concise NEW (translated) category name when nothing existing
    fits well enough.

    Returns ``{index, category_id, category, parent}`` per label, in the same
    order. ``category_id`` is set when an existing category matches; otherwise
    it is ``None`` and ``category``/``parent`` hold a proposed new (sub)category
    name for the caller (import) to create on apply, instead of falling back to
    the raw, untranslated spreadsheet text.
    """
    provider = resolve_provider()
    if provider is None:
        raise AICategorizationError(
            "AI categorization is not configured (set ANTHROPIC_API_KEY or GEMINI_API_KEY)."
        )
    if not labels:
        return []

    options, lookup = _category_context(db)
    context_text = "Existing categories:\n" + json.dumps({"categories": options}, ensure_ascii=False)

    items = [{"index": i, "label": label} for i, label in enumerate(labels)]
    results: list[dict] = []
    for start in range(0, len(items), CHUNK_SIZE):
        chunk = items[start : start + CHUNK_SIZE]
        try:
            results.extend(_match_category_chunk(provider, lookup, chunk, context_text))
        except AICategorizationError:
            raise
        except (ValueError, KeyError, json.JSONDecodeError) as exc:
            logger.error("Failed to parse category-match response: %s", exc)
            raise AICategorizationError("Could not parse the category-match response.") from exc

    return results


SYSTEM_PROMPT_GROUP_MATCH = (
    "You match a raw bill/obligation name -- from a personal-finance spreadsheet import -- "
    "to the closest EXISTING recurring-obligation GROUP name in this app, if any. A group is "
    "a reusable template for one recurring bill (e.g. \"Aluguel\", \"Netflix\", \"Salário\"). "
    "Judge by meaning/spelling similarity (abbreviations, minor wording differences, accents), "
    "not exact string equality -- e.g. 'ALUGUEL APTO CENTRO' should match an existing group "
    "named 'Aluguel'.\n"
    "You are given the full list of existing group names. For each label, return the single "
    "existing group name that clearly refers to the SAME recurring bill, or null if truly "
    "nothing matches (do not force a weak match, and never invent a new group name -- groups "
    "are only ever created manually by the user, not by this matching step).\n"
    "Respond with ONLY a JSON array, one object per label, in the same order, shaped exactly: "
    '{"index": <int>, "group": <string|null>}. group must be copied EXACTLY as it appears in '
    "the existing group names list. No prose, no code fences."
)


def _group_context(db: Session):
    groups = db.query(ObligationGroup).all()
    options = [g.name for g in groups]
    lookup = {_fold(g.name): g.obligation_group_id for g in groups}
    return options, lookup


def _match_group_chunk(provider, lookup, chunk, context_text) -> list[dict]:
    items_text = "Labels to match:\n" + json.dumps(chunk, ensure_ascii=False)
    if provider == "anthropic":
        raw = _call_anthropic(
            context_text,
            items_text,
            min(16000, 400 + 60 * len(chunk)),
            system_prompt=SYSTEM_PROMPT_GROUP_MATCH,
        )
    else:
        raw = _call_gemini(context_text, items_text, system_prompt=SYSTEM_PROMPT_GROUP_MATCH)

    parsed = _extract_json_array(raw)
    results = []
    for item in parsed:
        if not isinstance(item, dict) or "index" not in item:
            continue
        group_name = item.get("group")
        group_name = group_name.strip() if isinstance(group_name, str) and group_name.strip() else None
        group_id = lookup.get(_fold(group_name)) if group_name else None
        results.append({"index": item["index"], "obligation_group_id": group_id})
    return results


def suggest_group_matches(db: Session, labels: list[str]) -> list[dict]:
    """Match raw obligation names (e.g. from a spreadsheet import) to an
    EXISTING ObligationGroup by name/spelling similarity (not translation --
    unlike category matching, both sides are typically the same language).

    Returns ``{index, obligation_group_id}`` per label, in the same order.
    ``obligation_group_id`` is ``None`` when nothing existing is a good match
    -- this never proposes creating a new group; groups are only ever
    created manually by the user.
    """
    provider = resolve_provider()
    if provider is None:
        raise AICategorizationError(
            "AI categorization is not configured (set ANTHROPIC_API_KEY or GEMINI_API_KEY)."
        )
    if not labels:
        return []

    options, lookup = _group_context(db)
    if not options:
        return [{"index": i, "obligation_group_id": None} for i in range(len(labels))]

    context_text = "Existing obligation group names:\n" + json.dumps({"groups": options}, ensure_ascii=False)

    items = [{"index": i, "label": label} for i, label in enumerate(labels)]
    results: list[dict] = []
    for start in range(0, len(items), CHUNK_SIZE):
        chunk = items[start : start + CHUNK_SIZE]
        try:
            results.extend(_match_group_chunk(provider, lookup, chunk, context_text))
        except AICategorizationError:
            raise
        except (ValueError, KeyError, json.JSONDecodeError) as exc:
            logger.error("Failed to parse group-match response: %s", exc)
            raise AICategorizationError("Could not parse the group-match response.") from exc

    return results


_GENERIC_SYSTEM_PROMPT = (
    "You are a helpful assistant for a personal finance app. Answer concisely, "
    "using only the information provided in the user message. No prose "
    "preamble, no markdown headers, no code fences."
)


def call_llm_text(context_text: str, payload_text: str, max_tokens: int = 300) -> str:
    """Generic short free-text completion, reusing whichever provider is configured.

    Unlike ``suggest_categorization``/``suggest_obligation_categories`` (which
    force a structured JSON-array response), this returns raw text -- used
    where the caller wants a short natural-language answer (e.g. explaining an
    obligation transaction-match suggestion) rather than a machine-parsed list.
    """
    provider = resolve_provider()
    if provider is None:
        raise AICategorizationError(
            "AI is not configured (set ANTHROPIC_API_KEY or GEMINI_API_KEY)."
        )
    if provider == "anthropic":
        return _call_anthropic(
            context_text, payload_text, max_tokens, system_prompt=_GENERIC_SYSTEM_PROMPT
        )
    return _call_gemini(context_text, payload_text, system_prompt=_GENERIC_SYSTEM_PROMPT)
