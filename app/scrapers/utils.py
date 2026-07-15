from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import unquote, urlparse, parse_qs

from bs4 import BeautifulSoup


def normalize_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = re.sub(r"[^\d,.\-]", "", str(value))
    if not cleaned:
        return None
    if cleaned.count(",") and cleaned.count("."):
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif cleaned.count(",") and not cleaned.count("."):
        cleaned = cleaned.replace(",", ".")
    elif cleaned.count(".") == 1 and len(cleaned.rsplit(".", 1)[1]) == 3:
        # Argentine listing prices use dots as thousands separators (USD 120.000).
        cleaned = cleaned.replace(".", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def extract_json_ld(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    items: list[dict] = []
    for tag in soup.select('script[type="application/ld+json"]'):
        text = tag.string or tag.get_text(strip=True)
        if not text:
            continue
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, list):
            items.extend([item for item in parsed if isinstance(item, dict)])
        elif isinstance(parsed, dict):
            items.append(parsed)
    return items


def first_non_empty(*values):
    for value in values:
        if value not in (None, "", [], {}):
            return value
    return None


def unique_values(values: list[str], limit: int | None = None) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        output.append(value)
        if limit and len(output) >= limit:
            break
    return output


def extract_image_urls_from_html(html: str, soup: BeautifulSoup | None = None, limit: int = 20) -> list[str]:
    soup = soup or BeautifulSoup(html, "html.parser")
    images: list[str] = []

    for node in soup.select("img, source"):
        for attr in ("src", "data-src", "data-lazy", "data-original", "data-srcset", "srcset"):
            value = node.get(attr)
            if not value:
                continue
            images.extend(_image_candidates_from_text(value))

    for node in soup.select("[style]"):
        images.extend(_image_candidates_from_text(node.get("style") or ""))

    images.extend(_image_candidates_from_text(html))
    return unique_values([_clean_image_url(url) for url in images if _is_probable_image(url)], limit)


def extract_contact_phone(html: str, soup: BeautifulSoup | None = None) -> str | None:
    candidates: list[str] = []

    candidates.extend(_phone_candidates_from_url(str(html)))
    if soup is None and str(html).lower().startswith(("http://", "https://")):
        normalized = [_normalize_phone(candidate) for candidate in candidates]
        return first_non_empty(*[phone for phone in normalized if phone])

    soup = soup or BeautifulSoup(html, "html.parser")

    for node in soup.select("a[href]"):
        href = node.get("href") or ""
        lower_href = href.lower()
        if lower_href.startswith("tel:"):
            candidates.append(href.split(":", 1)[1])
        candidates.extend(_phone_candidates_from_url(href))

    for match in re.findall(r'"(?:phone|telefono|teléfono|whatsapp|whatsApp)"\s*:\s*"([^"]+)"', html, flags=re.IGNORECASE):
        candidates.append(unquote(match))

    normalized = [_normalize_phone(candidate) for candidate in candidates]
    return first_non_empty(*[phone for phone in normalized if phone])


def _phone_candidates_from_url(value: str) -> list[str]:
    parsed = urlparse(value)
    lower_value = value.lower()
    candidates: list[str] = []
    if "wa.me/" in lower_value:
        candidates.append(parsed.path.strip("/").split("/")[0])
    if "whatsapp" in lower_value:
        query = parse_qs(parsed.query)
        if query.get("phone"):
            candidates.append(query["phone"][0])
    return candidates


def _image_candidates_from_text(value: str) -> list[str]:
    decoded = unquote(value).replace("\\/", "/")
    urls = re.findall(r"https?://[^\s\"'<>),]+", decoded)
    srcset_urls = [part.strip().split(" ")[0] for part in decoded.split(",") if part.strip().startswith("http")]
    return urls + srcset_urls


def _is_probable_image(url: str) -> bool:
    lower = url.lower()
    if lower.endswith(".svg") or ".svg?" in lower:
        return False
    if any(token in lower for token in ("logo", "right-arrow", "placeholder", "sprite", "favicon", "qr-", "map/", "anunciante-premium")):
        return False
    return any(token in lower for token in (".jpg", ".jpeg", ".png", ".webp"))


def _clean_image_url(url: str) -> str:
    return url.rstrip("\\").rstrip("/")


def _normalize_phone(value: str) -> str | None:
    digits = re.sub(r"\D", "", value)
    if len(digits) < 8:
        return None
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("549"):
        return f"+{digits}"
    if digits.startswith("54"):
        return f"+{digits}"
    if digits.startswith("9") and len(digits) >= 11:
        return f"+54{digits}"
    if digits.startswith("11") and len(digits) == 10:
        return f"+549{digits}"
    return f"+54{digits}" if len(digits) <= 11 else f"+{digits}"
