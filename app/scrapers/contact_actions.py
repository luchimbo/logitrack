from __future__ import annotations


async def reveal_contact_url(page) -> str | None:
    contact_url = await _current_whatsapp_url(page)
    if contact_url:
        return contact_url

    popup = None
    try:
        async with page.expect_popup(timeout=2500) as popup_info:
            clicked = await _click_contact_control(page, whatsapp_only=True)
            if not clicked:
                return None
        popup = await popup_info.value
        await popup.wait_for_load_state("domcontentloaded", timeout=5000)
        return popup.url
    except Exception:  # noqa: BLE001
        pass
    finally:
        if popup:
            await popup.close()

    clicked = await _click_contact_control(page, whatsapp_only=False)
    if clicked:
        await page.wait_for_timeout(900)
    return await _current_whatsapp_url(page)


async def _click_contact_control(page, whatsapp_only: bool) -> int:
    tokens = ["whatsapp"] if whatsapp_only else ["telefono", "teléfono", "whatsapp", "contactar", "ver número", "ver numero"]
    return await page.evaluate(
        """
        (tokens) => {
          let clicked = 0;
          for (const item of [...document.querySelectorAll('a, button')]) {
            const text = (item.innerText || item.textContent || item.href || '').toLowerCase();
            if (tokens.some((token) => text.includes(token))) {
              item.click();
              clicked += 1;
              if (clicked >= 3) break;
            }
          }
          return clicked;
        }
        """,
        tokens,
    )


async def _current_whatsapp_url(page) -> str | None:
    return await page.evaluate(
        """
        () => {
          const link = [...document.querySelectorAll('a[href]')]
            .map((item) => item.href)
            .find((href) => href && href.toLowerCase().includes('whatsapp'));
          return link || null;
        }
        """
    )
