"""Tips and tricks (category Tipy a triky, Gether 10. 10. 2026). Not part of the monthly meta update – each trick is
checked against its dated source when it is added.

Write every text yourself in SK and CZ – facts from the sources listed in each guide, never copied prose. Sources are
named only in the sources list, never in the text (Gether, 10. 10. 2026).
"""

from .render import t

CATEGORY = 'tipy'
# year-month of the source the tricks were checked against – shown as "Stav k augustu 2025" in every guide
VERIFIED = '2025-08'
NOTE = t('Triky fungujú, kým ich Lilith nezmení – pred väčšou akciou ich over na malom počte jednotiek.',
         'Triky fungují, dokud je Lilith nezmění – před větší akcí je ověř na malém počtu jednotek.')  # fmt: skip

CH_SIEGE = ('WarDaddyChadski: 52 Days of Speed Ups For Free? Use this Old Trick (08/2025)',
            'https://www.youtube.com/watch?v=h1PRC3mPSSI')  # fmt: skip

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
]
