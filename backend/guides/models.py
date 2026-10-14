import re
import unicodedata
from html import unescape

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.utils.html import strip_tags
from django.utils.text import Truncator

from .sanitize import clean_html

# the points of a commander pair (CommanderPair), as the page allows
PAIR_POINTS_MAX = 500


def fold(name: str) -> str:
    """A commander's name without diacritics and case, like the page's fold(): "Jan Žižka" = "jan zizka"."""
    return unicodedata.normalize('NFD', name).encode('ascii', 'ignore').decode().casefold().strip()


class Guide(models.Model):
    """A guide page. The category value is also its URL part: /navody/<category>/<slug>."""

    class Category(models.TextChoices):
        COMMANDERS = 'commanderi', 'Commanderi (páry)'
        EQUIPMENT = 'vybava', 'Výbava'
        EVENTS = 'eventy', 'Eventy'
        TIPS = 'tipy', 'Tipy a triky'

    class Specialty(models.TextChoices):
        """Commander specialties of the game – the values are the slugs of their in-game tags (icons). BARBARIAN_FORT is
        no commander tag: the fort emblem cut from Gether's rally screenshot, for the fort tips (10. 10. 2026)."""

        CAVALRY = 'cavalry', 'Jazda'
        INFANTRY = 'infantry', 'Pechota'
        ARCHER = 'archer', 'Lukostrelci'
        LEADERSHIP = 'leadership', 'Leadership'
        # siege commanders carry the 'Engineering' tag in the game (Gether 11. 10. 2026: siege marches)
        ENGINEERING = 'engineering', 'Siege (engineering)'
        GARRISON = 'garrison', 'Garrison'
        CONQUERING = 'conquering', 'Conquering (rally)'
        PEACEKEEPING = 'peacekeeping', 'Peacekeeping (barbari)'
        GATHERING = 'gathering', 'Gathering (zber)'
        BARBARIAN_FORT = 'barbarian-fort', 'Barbarský fort (tipy)'

    category = models.CharField('kategória', max_length=16, choices=Category.choices)
    specialty = models.CharField(
        'špecializácia',
        max_length=16,
        choices=Specialty.choices,
        blank=True,
        help_text='Herná ikona špecializácie commanderov pri návode v zozname, aby ho hráč rýchlo našiel. '
        'Prázdne = bez ikony. Automaticky aktualizovaným návodom ju nastavuje meta (backend/guides/meta).',
    )
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


class CommanderPair(models.Model):
    """A commander pair of the KvK evaluation (/vyhodnocovanie) and its points, 100 = a full meta pair. A table in the
    database, not a file (Gether 13. 10. 2026: "json na commanderov nie je dobré riešenie, … databázovo") – edited in
    the admin or in Premenné on the page, live without a deploy. Each order of a pair is its own row (Slim: "achilles
    ivan je lepší ivan achilles" – Ivan IV first is the better one); a pair not here, or with 0 points, is not evaluated.
    The names are checked against the roster by the admin form and the API (guides.pairs), not here: a row the list
    edits only the points of must not fail on its names."""

    primary = models.CharField('primárny', max_length=64)
    secondary = models.CharField('sekundárny', max_length=64)
    points = models.DecimalField(
        'body',
        max_digits=4,
        decimal_places=1,
        validators=[MinValueValidator(0), MaxValueValidator(PAIR_POINTS_MAX)],
        help_text='100 = plný meta pár, skóre marchu × body / 100; 0 = nehodnotí sa.',
    )
    updated_at = models.DateTimeField('upravené', auto_now=True)

    class Meta:
        ordering = ['-points', 'primary', 'secondary']
        verbose_name = 'pár commanderov (vyhodnocovanie)'
        verbose_name_plural = 'páry commanderov (vyhodnocovanie)'
        constraints = [models.UniqueConstraint(fields=['primary', 'secondary'], name='one_row_per_pair_order')]

    def __str__(self):
        return f'{self.primary} + {self.secondary}'


class CommanderFormation(models.Model):
    """The formations a commander leading a march should use – for the KvK evaluation (/vyhodnocovanie, Gether 14. 10.
    2026; Slim: "nastaviť každého commandera, akú má mať formáciu"). A table in the database like the pairs: edited in
    the admin or in Premenné on the page. A march whose primary commander is here and that uses another formation scores
    its armaments × the variable "iná formácia"; a commander not here (or with no formation) takes any. The first values
    came from meta-rok.com and RoKBattles (migration 0014). The name is checked against the roster by the admin form and
    the API (guides.formations), the formations against armory.json."""

    commander = models.CharField('commander', max_length=64, unique=True)
    formations = models.JSONField(
        'formácie', default=list, blank=True, help_text='Odporúčané formácie v poradí; prázdne = hocijaká.'
    )
    updated_at = models.DateTimeField('upravené', auto_now=True)

    class Meta:
        ordering = ['commander']
        verbose_name = 'formácia commandera (vyhodnocovanie)'
        verbose_name_plural = 'formácie commanderov (vyhodnocovanie)'

    def __str__(self):
        return self.commander
