from __future__ import annotations

import asyncio
import json
import re
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup

from app.scrapers.base import ScrapedProperty, ScraperPageError
from app.scrapers.contact_actions import reveal_contact_url
from app.scrapers.playwright_client import page_context
from app.scrapers.utils import extract_contact_phone, extract_image_urls_from_html, extract_json_ld, first_non_empty, normalize_number


class ArgenpropScraper:
    portal = "argenprop"

    async def search(self, url: str) -> list[ScrapedProperty]:
        async with page_context() as page:
            await page.goto(url, wait_until="networkidle")
            await page.evaluate("window.scrollTo(0, Math.min(document.body.scrollHeight, 2200))")
            await page.wait_for_timeout(700)
            html = await page.content()
        self._ensure_valid_listing_page(html, url)
        listings = self._parse_listing_page(html, url)
        if not listings:
            raise ScraperPageError("Argenprop no mostró publicaciones reconocibles; puede haber cambiado el sitio")
        return listings

    async def search_pages(self, url: str, max_pages: int, delay_ms: int = 0) -> list[ScrapedProperty]:
        results: list[ScrapedProperty] = []
        seen_ids: set[str] = set()
        max_pages = max(1, max_pages)

        for page_number in range(1, max_pages + 1):
            page_url = self.page_url(url, page_number)
            listings = await self.search(page_url)
            new_listings = [listing for listing in listings if listing.source_property_id not in seen_ids]
            if not listings or not new_listings:
                break
            results.extend(new_listings)
            seen_ids.update(listing.source_property_id for listing in new_listings)
            if delay_ms and page_number < max_pages:
                await asyncio.sleep(delay_ms / 1000)
        return results

    def page_url(self, url: str, page_number: int) -> str:
        if page_number <= 1:
            return url
        parsed = urlparse(url)
        query = [(key, value) for key, value in parse_qsl(parsed.query, keep_blank_values=True) if not key.startswith("pagina-")]
        encoded = urlencode(query)
        page_token = f"pagina-{page_number}"
        return urlunparse(parsed._replace(query=f"{encoded}&{page_token}" if encoded else page_token))

    def _parse_listing_page(self, html: str, base_url: str) -> list[ScrapedProperty]:
        soup = BeautifulSoup(html, "html.parser")
        cards = soup.select("[data-property-id], .listing__item, .card, article")[:80]
        results: list[ScrapedProperty] = []
        seen_ids: set[str] = set()

        for card in cards:
            link = card.select_one("a[href*='/propiedades/'], a[href*='ficha-'], a[href*='-en-']")
            href = link.get("href") if link else None
            prop_id = card.get("data-property-id")
            if not prop_id and href:
                match = re.search(r"(\d{5,})", href)
                prop_id = match.group(1) if match else href
            if not href or not prop_id or prop_id in seen_ids:
                continue

            seen_ids.add(prop_id)
            card_html = str(card)
            price_text = self._text(card, "[class*='price']")
            results.append(
                ScrapedProperty(
                    source=self.portal,
                    source_property_id=str(prop_id),
                    url=urljoin(base_url, href),
                    title=first_non_empty(self._text(card, ".card__title"), self._text(card, "h2"), self._text(card, "h3")),
                    price=normalize_number(price_text),
                    currency=self._guess_currency(price_text),
                    address=first_non_empty(self._text(card, "[class*='address']"), self._text(card, "[class*='location']")),
                    location_label=self._text(card, "[class*='location']"),
                    operation=self._text(card, "[class*='operation']"),
                    property_type=self._text(card, "[class*='type']"),
                    total_m2=normalize_number(self._feature_from_card(card, "sup")),
                    covered_m2=normalize_number(self._feature_from_card(card, "cub")),
                    rooms=normalize_number(self._feature_from_card(card, "amb")),
                    bedrooms=normalize_number(self._feature_from_card(card, "dorm")),
                    bathrooms=normalize_number(self._feature_from_card(card, "ba")),
                    phone=extract_contact_phone(card_html, card),
                    image_urls=extract_image_urls_from_html(card_html, card, limit=6),
                    raw_data={"source": "listing"},
                )
            )

        for item in extract_json_ld(html):
            if item.get("@type") not in {"ItemList", "Offer", "SingleFamilyResidence", "Residence"}:
                continue
            for candidate in item.get("itemListElement", []):
                payload = candidate.get("item") or candidate
                href = payload.get("url")
                if not href:
                    continue
                prop_id = str(payload.get("@id") or payload.get("identifier") or href)
                if prop_id in seen_ids:
                    continue
                seen_ids.add(prop_id)
                offer = payload.get("offers") if isinstance(payload.get("offers"), dict) else {}
                address = payload.get("address") if isinstance(payload.get("address"), dict) else {}
                results.append(
                    ScrapedProperty(
                        source=self.portal,
                        source_property_id=prop_id,
                        url=href,
                        title=payload.get("name"),
                        address=address.get("streetAddress"),
                        price=normalize_number(offer.get("price")),
                        currency=offer.get("priceCurrency"),
                        image_urls=self._jsonld_images(payload),
                        phone=extract_contact_phone(json.dumps(payload)),
                        raw_data={"source": "jsonld"},
                    )
                )
        return results

    def _ensure_valid_listing_page(self, html: str, url: str) -> None:
        soup = BeautifulSoup(html, "html.parser")
        title = soup.title.get_text(" ", strip=True).lower() if soup.title else ""
        text = soup.get_text(" ", strip=True).lower()
        if "error 404" in title or "página no encontrada" in text or "pagina no encontrada" in text:
            raise ScraperPageError(f"Argenprop devolvió una página 404 para {url}")
        if "access denied" in title or "captcha" in text or "just a moment" in text:
            raise ScraperPageError("Argenprop bloqueó la consulta o solicitó una verificación")

    async def fetch_detail(self, url: str, listing_hint: ScrapedProperty) -> ScrapedProperty:
        async with page_context() as page:
            await page.goto(url, wait_until="networkidle")
            await page.evaluate("window.scrollTo(0, Math.min(document.body.scrollHeight, 2600))")
            await page.wait_for_timeout(700)
            contact_url = await self._reveal_contact_buttons(page)
            html = await page.content()
        soup = BeautifulSoup(html, "html.parser")
        next_data = self._extract_next_data(html)
        images = first_non_empty(self._extract_images(next_data, soup, html), listing_hint.image_urls, [])
        description = first_non_empty(self._text(soup, "[class*='description']"), self._text(soup, "article"))
        features = self._features_map(soup)
        return ScrapedProperty(
            **{
                **listing_hint.__dict__,
                "description": description,
                "amenities": self._extract_amenities(soup),
                "image_urls": images,
                "expenses": normalize_number(features.get("expensas")),
                "expenses_currency": self._guess_currency(features.get("expensas")),
                "parking_spaces": normalize_number(first_non_empty(features.get("cocheras"), features.get("cochera"))),
                "age_years": normalize_number(first_non_empty(features.get("antiguedad"), features.get("edad"))),
                "floor": features.get("piso"),
                "orientation": features.get("orientacion"),
                "condition": first_non_empty(features.get("estado"), features.get("condicion")),
                "real_estate": first_non_empty(self._text(soup, "[class*='publisher']"), self._text(soup, "[class*='agency']")),
                "phone": first_non_empty(self._extract_phone(next_data, html, soup), extract_contact_phone(contact_url or ""), listing_hint.phone),
                "whatsapp_url": first_non_empty(contact_url, listing_hint.whatsapp_url),
                "raw_data": {"source": "detail", "next_data_keys": list(next_data.keys())},
            }
        )

    def _extract_next_data(self, html: str) -> dict:
        match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
        if not match:
            return {}
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            return {}

    async def _reveal_contact_buttons(self, page) -> str | None:
        return await reveal_contact_url(page)

    async def _legacy_reveal_contact_buttons(self, page) -> None:
        clicked = await page.evaluate(
            """
            () => {
              const tokens = ['telefono', 'teléfono', 'whatsapp', 'contactar', 'ver número', 'ver numero'];
              let clicked = 0;
              for (const button of [...document.querySelectorAll('button')]) {
                const text = (button.innerText || button.textContent || '').toLowerCase();
                if (tokens.some((token) => text.includes(token))) {
                  button.click();
                  clicked += 1;
                  if (clicked >= 3) break;
                }
              }
              return clicked;
            }
            """
        )
        if clicked:
            await page.wait_for_timeout(900)

    def _extract_images(self, next_data: dict, soup: BeautifulSoup, html: str) -> list[str]:
        images: list[str] = []
        text = json.dumps(next_data)
        for match in re.findall(r"https://[^\"]+\.(?:jpg|jpeg|png|webp)", text):
            if match not in images:
                images.append(match)
        images.extend(extract_image_urls_from_html(html, soup, limit=20))
        return list(dict.fromkeys(images))[:20]

    def _extract_phone(self, next_data: dict, html: str, soup: BeautifulSoup) -> str | None:
        match = re.search(r'"phone"\s*:\s*"([^"]+)"', json.dumps(next_data))
        if match:
            return extract_contact_phone(match.group(1))
        return extract_contact_phone(html, soup)

    def _jsonld_images(self, payload: dict) -> list[str]:
        image = payload.get("image")
        if isinstance(image, str):
            return [image]
        if isinstance(image, list):
            return [item for item in image if isinstance(item, str)][:20]
        if isinstance(image, dict) and isinstance(image.get("url"), str):
            return [image["url"]]
        return []

    def _extract_amenities(self, soup: BeautifulSoup) -> list[str]:
        values: list[str] = []
        for node in soup.select("[class*='amenit'], [class*='feature'] li, [class*='tag']"):
            text = node.get_text(" ", strip=True)
            if text and len(text) < 60 and text not in values:
                values.append(text)
        return values[:30]

    def _features_map(self, soup: BeautifulSoup) -> dict[str, str]:
        features: dict[str, str] = {}
        for node in soup.select("li, div"):
            text = node.get_text(" ", strip=True)
            if ":" in text and len(text) < 80:
                key, value = text.split(":", 1)
                features[key.strip().lower()] = value.strip()
        return features

    def _feature_from_card(self, card, token: str) -> str | None:
        for node in card.select("li, span, div"):
            text = node.get_text(" ", strip=True).lower()
            if token in text:
                return text
        return None

    def _guess_currency(self, text: str | None) -> str | None:
        if not text:
            return None
        if "usd" in text.lower() or "u$s" in text.lower():
            return "USD"
        if "$" in text:
            return "ARS"
        return None

    def _text(self, node, selector: str) -> str | None:
        target = node.select_one(selector) if hasattr(node, "select_one") else None
        if target:
            return target.get_text(" ", strip=True)
        return None
