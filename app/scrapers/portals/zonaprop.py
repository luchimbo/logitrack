from __future__ import annotations

import asyncio
import json
import re
from urllib.parse import urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup

from app.scrapers.base import ScrapedProperty
from app.scrapers.contact_actions import reveal_contact_url
from app.scrapers.playwright_client import page_context
from app.scrapers.utils import extract_contact_phone, extract_image_urls_from_html, extract_json_ld, first_non_empty, normalize_number


class ZonapropScraper:
    portal = "zonaprop"

    async def search(self, url: str) -> list[ScrapedProperty]:
        async with page_context() as page:
            await page.goto(url, wait_until="domcontentloaded")
            await page.wait_for_timeout(1200)
            await page.evaluate("window.scrollTo(0, Math.min(document.body.scrollHeight, 2200))")
            await page.wait_for_timeout(700)
            html = await page.content()
        return self._parse_listing_page(html, url)

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
        path = re.sub(r"-pagina-\d+(?=\.html$)", "", parsed.path)
        if path.endswith(".html"):
            path = path[:-5] + f"-pagina-{page_number}.html"
        else:
            path = path.rstrip("/") + f"-pagina-{page_number}.html"
        return urlunparse(parsed._replace(path=path))

    def _parse_listing_page(self, html: str, base_url: str) -> list[ScrapedProperty]:
        soup = BeautifulSoup(html, "html.parser")
        cards = soup.select("[data-posting-id], [data-to-posting], article")[:80]
        results: list[ScrapedProperty] = []
        seen_ids: set[str] = set()

        for card in cards:
            prop_id = card.get("data-posting-id") or card.get("data-to-posting")
            link = card.select_one("a[href*='/propiedades/']")
            href = link.get("href") if link else None
            if not prop_id and href:
                match = re.search(r"(\d{5,})", href)
                prop_id = match.group(1) if match else href
            if not href or not prop_id or prop_id in seen_ids:
                continue

            seen_ids.add(str(prop_id))
            card_html = str(card)
            price_text = self._text(card, "[class*='price']")
            results.append(
                ScrapedProperty(
                    source=self.portal,
                    source_property_id=str(prop_id),
                    url=urljoin(base_url, href),
                    title=first_non_empty(self._text(card, "h2"), self._text(card, "h3")),
                    price=normalize_number(price_text),
                    currency=self._guess_currency(price_text),
                    expenses=normalize_number(self._find_text(card, "Expensas")),
                    address=first_non_empty(self._text(card, "[class*='postingLocation']"), self._text(card, "[class*='location']")),
                    location_label=self._text(card, "[class*='postingLocation']"),
                    operation=self._text(card, "[class*='operation']"),
                    property_type=self._text(card, "[class*='propertyType']"),
                    total_m2=normalize_number(self._find_text(card, "m² tot")),
                    covered_m2=normalize_number(self._find_text(card, "m² cub")),
                    rooms=normalize_number(self._find_text(card, "amb")),
                    bedrooms=normalize_number(self._find_text(card, "dorm")),
                    bathrooms=normalize_number(self._find_text(card, "baño")),
                    phone=extract_contact_phone(card_html, card),
                    image_urls=extract_image_urls_from_html(card_html, card, limit=6),
                    raw_data={"source": "listing"},
                )
            )

        for item in extract_json_ld(html):
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

    async def fetch_detail(self, url: str, listing_hint: ScrapedProperty) -> ScrapedProperty:
        async with page_context() as page:
            await page.goto(url, wait_until="domcontentloaded")
            await page.wait_for_timeout(1200)
            await page.evaluate("window.scrollTo(0, Math.min(document.body.scrollHeight, 2600))")
            await page.wait_for_timeout(700)
            contact_url = await self._reveal_contact_buttons(page)
            html = await page.content()
        soup = BeautifulSoup(html, "html.parser")
        data = self._extract_embedded_data(html)
        features = self._features_map(soup)
        images = first_non_empty(self._extract_images(data, soup, html), listing_hint.image_urls, [])
        return ScrapedProperty(
            **{
                **listing_hint.__dict__,
                "description": first_non_empty(self._text(soup, "[class*='description']"), self._text(soup, "article")),
                "amenities": self._extract_amenities(soup),
                "image_urls": images,
                "expenses": first_non_empty(listing_hint.expenses, normalize_number(features.get("expensas"))),
                "expenses_currency": self._guess_currency(features.get("expensas")),
                "parking_spaces": normalize_number(first_non_empty(features.get("cocheras"), features.get("cochera"))),
                "age_years": normalize_number(features.get("antiguedad")),
                "floor": features.get("piso"),
                "orientation": features.get("orientacion"),
                "condition": first_non_empty(features.get("estado"), features.get("condicion")),
                "real_estate": first_non_empty(self._text(soup, "[class*='publisher']"), self._text(soup, "[class*='agency']")),
                "phone": first_non_empty(extract_contact_phone(html, soup), extract_contact_phone(contact_url or ""), listing_hint.phone),
                "whatsapp_url": first_non_empty(contact_url, listing_hint.whatsapp_url),
                "raw_data": {"source": "detail", "embedded_keys": list(data.keys())},
            }
        )

    def _extract_embedded_data(self, html: str) -> dict:
        match = re.search(r"window\.__INITIAL_STATE__\s*=\s*({.*?});", html)
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

    def _extract_images(self, data: dict, soup: BeautifulSoup, html: str) -> list[str]:
        images: list[str] = []
        for match in re.findall(r"https://[^\"]+\.(?:jpg|jpeg|png|webp)", json.dumps(data)):
            if match not in images:
                images.append(match)
        images.extend(extract_image_urls_from_html(html, soup, limit=20))
        return list(dict.fromkeys(images))[:20]

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
        amenities: list[str] = []
        for node in soup.select("[class*='amenit'], [class*='feature'] li, [class*='tag']"):
            text = node.get_text(" ", strip=True)
            if text and len(text) < 60 and text not in amenities:
                amenities.append(text)
        return amenities[:30]

    def _features_map(self, soup: BeautifulSoup) -> dict[str, str]:
        features: dict[str, str] = {}
        for node in soup.select("li, div"):
            text = node.get_text(" ", strip=True)
            if ":" in text and len(text) < 80:
                key, value = text.split(":", 1)
                features[key.strip().lower()] = value.strip()
        return features

    def _find_text(self, node, token: str) -> str | None:
        token_lower = token.lower()
        for item in node.select("span, li, div"):
            text = item.get_text(" ", strip=True)
            if token_lower in text.lower():
                return text
        return None

    def _guess_currency(self, text: str | None) -> str | None:
        if not text:
            return None
        lower = text.lower()
        if "usd" in lower or "u$s" in lower:
            return "USD"
        if "$" in text:
            return "ARS"
        return None

    def _text(self, node, selector: str) -> str | None:
        target = node.select_one(selector) if hasattr(node, "select_one") else None
        if target:
            return target.get_text(" ", strip=True)
        return None
