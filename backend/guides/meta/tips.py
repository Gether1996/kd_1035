"""Tips and tricks (category Tipy a triky, Gether 10. 10. 2026). Not part of the monthly meta update – each trick is
checked against its dated source when it is added.

Write every text yourself in SK and CZ – facts from the sources listed in each guide, never copied prose. Sources are
named only in the sources list, never in the text (Gether, 10. 10. 2026).
"""

from .render import t

CATEGORY = 'tipy'
# no "Stav k …" and no dates in tips and tricks (Gether, 10. 10. 2026)
VERIFIED = None
NOTE = t('Triky fungujú, kým ich Lilith nezmení – pred väčšou akciou ich over na malom počte jednotiek.',
         'Triky fungují, dokud je Lilith nezmění – před větší akcí je ověř na malém počtu jednotek.')  # fmt: skip

CH_SIEGE = ('WarDaddyChadski: 52 Days of Speed Ups For Free? Use this Old Trick',
            'https://www.youtube.com/watch?v=h1PRC3mPSSI')  # fmt: skip
# no published source – Gether's own routine, confirmed in game (10. 10. 2026)
GETHER = (t('Gether, R4 KD 1035 – overené v hre', 'Gether, R4 KD 1035 – ověřeno ve hře'), '')

GUIDES = [
    {
        'slug': 'speedupy-za-nepotrebne-siege',
        'title': t('Speedupy za nepotrebné siege jednotky', 'Speedupy za nepotřebné siege jednotky'),
        'blocks': [
            ('p', t(
                'Siege, ktoré v pochodoch nepoužiješ, premeníš na tréningové speedupy, suroviny a časť jednotiek späť. '
                'Stačí plný hospital a kamarát v inej aliancii.',
                'Siege, které v pochodech nepoužiješ, proměníš na tréninkové speedupy, suroviny a část jednotek zpět. '
                'Stačí plný hospital a kamarád v jiné alianci.',
            )),
            ('note',),
            ('h2', t('Ako na to', 'Jak na to')),
            ('ul', [
                t('<strong>Naplň hospital</strong> úplne do posledného miesta. Jednotky, ktoré sa doň už nezmestia, zomrú – o to tu ide.',
                  '<strong>Naplň hospital</strong> úplně do posledního místa. Jednotky, které se do něj už nevejdou, zemřou – o to tu jde.'),
                t('<strong>Ty ostaň vo svojej aliancii.</strong> Kamarát z nej odíde a pridá sa do inej, aby mohol útočiť na tvoje pochody.',
                  '<strong>Ty zůstaň ve své alianci.</strong> Kamarád z ní odejde a přidá se do jiné, aby mohl útočit na tvoje pochody.'),
                t('<strong>Pošli siege pochody na surovinový bod</strong> a nechaj kamaráta, nech ich tam porazí.',
                  '<strong>Pošli siege pochody na surovinový bod</strong> a nech kamaráda, ať je tam porazí.'),
                t('<strong>Počkaj na pomoc aliancie.</strong> Po stratách sa v aliancii sama objaví žiadosť o pomoc. Keď ju spojenci odkliknú (zhruba 15-krát), príde ti karavána s balíkom First Aid: tréningové speedupy, suroviny a časť jednotiek.',
                  '<strong>Počkej na pomoc aliance.</strong> Po ztrátách se v alianci sama objeví žádost o pomoc. Když ji spojenci odkliknou (zhruba 15krát), přijde ti karavana s balíčkem First Aid: tréninkové speedupy, suroviny a část jednotek.'),
                t('<strong>Opakuj</strong> asi 5–6-krát za deň. Odmena sa počas dňa zmenšuje, takže pri veľkom počte siege pokračuj po dennom resete.',
                  '<strong>Opakuj</strong> asi 5–6krát za den. Odměna se během dne zmenšuje, takže při velkém počtu siege pokračuj po denním resetu.'),
            ]),
            ('h2', t('Prečo sa to oplatí', 'Proč se to vyplatí')),
            ('ul', [
                t('Hráčka, ktorá takto prišla zhruba o 300 000 – 400 000 siege, získala spolu asi 52 dní tréningových speedupov.',
                  'Hráčka, která takhle přišla zhruba o 300 000 – 400 000 siege, získala dohromady asi 52 dní tréninkových speedupů.'),
                t('Siege sa oplatí trénovať každý deň kvôli denným úlohám – T4 je lacná. Čo potom v pochodoch nepoužiješ, premeníš týmto spôsobom na speedupy.',
                  'Siege se vyplatí trénovat každý den kvůli denním úkolům – T4 je levná. Co pak v pochodech nepoužiješ, proměníš tímto způsobem na speedupy.'),
                t('Nepotrebné siege dvíhajú silu účtu aj kráľovstva, podľa ktorej sa páruje KvK. T5 siege má rovnakú silu ako T5 jazda.',
                  'Nepotřebné siege zvedají sílu účtu i království, podle které se páruje KvK. T5 siege má stejnou sílu jako T5 jízda.'),
            ]),
            ('h2', t('Na čo si dať pozor', 'Na co si dát pozor')),
            ('ul', [
                t('Mŕtve jednotky sú preč natrvalo. Ak siege pochod používaš, nechaj si toľko jednotiek, koľko naň treba.',
                  'Mrtvé jednotky jsou pryč natrvalo. Pokud siege pochod používáš, nech si tolik jednotek, kolik na něj potřebuješ.'),
                t('Kým je hospital plný, zomierajú aj jednotky zranené v iných bojoch. Rob to v pokojnom čase a potom hospital vylieč.',
                  'Dokud je hospital plný, umírají i jednotky zraněné v jiných bojích. Dělej to v klidném čase a potom hospital vyleč.'),
            ]),
            ('sources', [CH_SIEGE]),
        ],
    },
    {
        # confirmed in game by Gether (10. 10. 2026): the account with 90 %+ of the damage gets the full rewards;
        # his split: main 210k + farm 15k, or farm 20k + main 240k; the fort level does not matter
        'slug': 'maximum-speedupov-z-fortov',
        'title': t('Maximum speedupov z fortov s vlastnou farmou', 'Maximum speedupů z fortů s vlastní farmou'),
        'blocks': [
            ('p', t(
                'Barbarský fort zober s vlastnou farmou namiesto spojencov. Keď main spraví aspoň 90 % damage, dostane '
                'z fortu maximálne odmeny – a s nimi veľa speedupov.',
                'Barbarský fort dej s vlastní farmou místo spojenců. Když main udělá aspoň 90 % damage, dostane z fortu '
                'maximální odměny – a s nimi hodně speedupů.',
            )),
            ('note',),
            ('h2', t('Ako na to', 'Jak na to')),
            ('ul', [
                t('<strong>Rally môže založiť main aj farma</strong>, druhý účet sa doň pridá. Na úrovni fortu nezáleží.',
                  '<strong>Rally může založit main i farma</strong>, druhý účet se do ní přidá. Na úrovni fortu nezáleží.'),
                t('<strong>Main musí spraviť aspoň 90 % damage.</strong> Farma pošle len malú armádu, main skoro všetko. Iba tak má main maximálne odmeny.',
                  '<strong>Main musí udělat aspoň 90 % damage.</strong> Farma pošle jen malou armádu, main skoro všechno. Jen tak má main maximální odměny.'),
                t('<strong>Main zakladá:</strong> main pošle 210 000 jednotiek, farma pridá 15 000.',
                  '<strong>Main zakládá:</strong> main pošle 210 000 jednotek, farma přidá 15 000.'),
                t('<strong>Farma zakladá:</strong> farma pošle 20 000 jednotiek, main pridá 240 000.',
                  '<strong>Farma zakládá:</strong> farma pošle 20 000 jednotek, main přidá 240 000.'),
            ]),
            # Gether's screenshots from the game (10. 10. 2026)
            ('figure', 'fort-rally-main-zaklada.webp', t('Main zakladá: main 216 300 jednotiek, farma 16 000.',
                                                       'Main zakládá: main 216 300 jednotek, farma 16 000.')),
            ('figure', 'fort-rally-farma-zaklada.webp', t('Farma zakladá: farma 20 000 jednotiek, main 246 000.',
                                                        'Farma zakládá: farma 20 000 jednotek, main 246 000.')),
            ('h2', t('Na čo si dať pozor', 'Na co si dát pozor')),
            ('ul', [
                t('Na fort sa bežne chodí s aspoň 400 000 jednotkami. Práve kvôli menšej armáde sú straty väčšie a zranení idú do hospitalu, takže sa plní rýchlejšie.',
                  'Na fort se běžně chodí s aspoň 400 000 jednotkami. Právě kvůli menší armádě jsou ztráty větší a zranění jdou do hospitalu, takže se plní rychleji.'),
                t('Za to má main za každý fort maximum speedupov, aké sa dá získať, a väčšinou aj AP flašky alebo gold key.',
                  'Za to má main za každý fort maximum speedupů, jaké se dá získat, a většinou i AP flašky nebo gold key.'),
            ]),
            ('rewards', [
                ('speedup', t('Speedupy – maximum za fort', 'Speedupy – maximum za fort')),
                ('ap-potion', t('AP flašky', 'AP flašky')),
                ('gold-key', t('Gold key', 'Gold key')),
            ]),
            ('figure', 'fort-report-94.webp', t('Report: main spravil 94 % damage a dostal odmeny Tier 10.',
                                              'Report: main udělal 94 % damage a dostal odměny Tier 10.')),
            ('sources', [GETHER]),
        ],
    },
]
