from bs4 import BeautifulSoup

from app.scrapers.utils import extract_contact_phone, extract_image_urls_from_html


def test_extract_contact_phone_ignores_image_file_numbers():
    html = '<img src="https://imgar.zonapropcdn.com/avisos/1/00/59/58/75/00/360x266/2064833162.jpg">'

    assert extract_contact_phone(html) is None


def test_extract_contact_phone_from_whatsapp_link():
    html = '<a href="https://api.whatsapp.com/send?phone=5491122334455">WhatsApp</a>'

    assert extract_contact_phone(html) == "+5491122334455"


def test_extract_contact_phone_from_raw_whatsapp_url():
    url = "https://web.whatsapp.com/send?phone=5491122334455&text=Hola"

    assert extract_contact_phone(url) == "+5491122334455"


def test_extract_images_filters_icons_and_keeps_property_photos():
    html = """
    <article>
      <img src="https://imgar.zonapropcdn.com/avisos/1/00/59/58/75/00/360x266/2064833162.jpg?isFirstImage=true">
      <img src="https://img10.naventcdn.com/listado/images/right-arrow.svg">
      <img src="https://imgar.zonapropcdn.com/empresas/130x70/logo_inmobiliaria.jpg">
      <img src="https://img10.naventcdn.com/ficha/map/Zonaprop/58093519E.png">
      <img src="https://img10.naventcdn.com/ficha/images/qr-registro.png">
      <img src="https://img10.naventcdn.com/ficha/images/favicon.png">
    </article>
    """

    images = extract_image_urls_from_html(html, BeautifulSoup(html, "html.parser"))

    assert images == ["https://imgar.zonapropcdn.com/avisos/1/00/59/58/75/00/360x266/2064833162.jpg?isFirstImage=true"]
