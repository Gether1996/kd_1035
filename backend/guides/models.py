import re
from html import unescape

from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.utils.html import strip_tags
from django.utils.text import Truncator

from .sanitize import clean_html


class Guide(models.Model):
    """A guide page. The category value is also its URL part: /navody/<category>/<slug>."""

    class Category(models.TextChoices):
        COMMANDERS = 'commanderi', 'Commanderi (páry)'
        EQUIPMENT = 'vybava', 'Výbava'
        EVENTS = 'eventy', 'Eventy'

    category = models.CharField('kategória', max_length=16, choices=Category.choices)
    title_sk = models.CharField('nadpis (SK)', max_length=160)
    title_cs = models.CharField(
        'nadpis (CZ)', max_length=160, blank=True, help_text='Prázdne = na českej verzii sa zobrazí slovenský nadpis.'
    )
    slug = models.SlugField(
        'adresa (URL)', max_length=180, unique=True, help_text='Koniec adresy stránky – vyplní sa sám z nadpisu.'
    )
    html_sk = models.TextField(
        'obsah HTML (SK)',
        help_text='Vlož HTML. Skripty, &lt;style&gt; bloky a nebezpečné atribúty sa pri uložení odstránia.',
    )
    html_cs = models.TextField('obsah HTML (CZ)', blank=True, help_text='Prázdne = použije sa slovenský obsah.')
    is_published = models.BooleanField('zverejnený', default=True)
    auto_update = models.BooleanField(
        'aktualizovať automaticky',
        default=False,
        help_text='Obsah udržiava mesačná aktualizácia mety (backend/guides/meta). Ručná úprava nadpisu alebo '
        'obsahu ju vypne, aby ju ďalšia aktualizácia neprepísala.',
    )
    order = models.PositiveSmallIntegerField('poradie', default=0, help_text='Menšie číslo = vyššie v zozname.')
    created_at = models.DateTimeField('vytvorené', auto_now_add=True)
    updated_at = models.DateTimeField('upravené', auto_now=True)

    class Meta:
        ordering = ['category', 'order', '-created_at']
        verbose_name = 'návod'
        verbose_name_plural = 'návody'

    def __str__(self):
        return self.title_sk

    def save(self, *args, **kwargs):
        self.html_sk = clean_html(self.html_sk)
        self.html_cs = clean_html(self.html_cs)
        super().save(*args, **kwargs)

    def get_absolute_url(self):
        return f'/navody/{self.category}/{self.slug}'

    def excerpt(self, lang: str = 'sk') -> str:
        """Plain-text start of the guide (list preview + meta description)."""
        html = self.html_cs if lang == 'cs' and self.html_cs else self.html_sk

        def plain(fragment: str) -> str:
            return ' '.join(unescape(strip_tags(fragment)).split())

        # the first non-empty paragraph reads best; otherwise all text without tables/embeds
        for paragraph in re.findall(r'<p\b[^>]*>(.*?)</p>', html, flags=re.S | re.I):
            if text := plain(paragraph):
                return Truncator(text).chars(160)
        html = re.sub(r'<(table|iframe|figure)\b.*?</\1>', ' ', html, flags=re.S | re.I)
        html = re.sub(r'</?(div|h[1-6]|li|br|hr|blockquote|dt|dd)\b', r' \g<0>', html)
        return Truncator(plain(html)).chars(160)


class GuideImage(models.Model):
    """Image uploaded next to a guide; its URL is pasted into the guide HTML as <img src="...">."""

    guide = models.ForeignKey(Guide, on_delete=models.CASCADE, related_name='images', verbose_name='návod')
    image = models.ImageField('obrázok', upload_to='guides/%Y/%m/')
    uploaded_at = models.DateTimeField('nahrané', auto_now_add=True)

    class Meta:
        ordering = ['uploaded_at']
        verbose_name = 'obrázok'
        verbose_name_plural = 'obrázky (nahraj a skopíruj kód do HTML)'

    def __str__(self):
        return self.image.name


@receiver(post_delete, sender=GuideImage)
def _delete_image_file(sender, instance, **kwargs):
    # also runs when the whole guide is deleted (cascade)
    instance.image.delete(save=False)
