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
YT = 'https://www.youtube.com/watch?v='
STTUU_TRASH = ('Sttuu: HUGE Value Strategy for One Man’s Trash', YT + 'Y-6j81pYjug')
STTUU_SPEEDUPS = ('Sttuu: Stop Wasting Speed-ups! The Math Most Players Get Wrong', YT + 'sdQoGspNsoQ')
STTUU_BIRTHDAY = ('Sttuu: Too Many RoK Players Are Sleeping on This', YT + '2GlARLxYI5M')
STTUU_SETTINGS = ('Sttuu: Most Players Are Using the Wrong Combat Settings', YT + 'Py6yVF1qwkM')
STTUU_TIPS = ('Sttuu: 20 Tips and Tricks That Make a HUGE Difference', YT + 'N6yQuWNsWZU')
STTUU_LESSONS = ('Sttuu: Even Experienced Players Learn These Lessons the Hard Way', YT + 'XBD_j0D-k3Q')
CHIS_ARMS = ('Chisgule Gaming: Arms Training Guide to 1st', YT + 'q4jCY9dVCaY')
CHIS_ARMS_ORDER = ('Chisgule Gaming: Copy this exact Arms Training Order', YT + 'VtJaNg2Na0I')
CHIS_HOLY = ('Chisgule Gaming: Shocking Gem Value of Holy Knights Treasure', YT + 'gJfbc44gTSQ')
CHIS_MATERIALS = ('Chisgule Gaming: Get More Materials NOW', YT + '7cvT0K-dUus')
CHIS_TRANSMUTE = ('Chisgule Gaming: Save Transmutation Crystals', YT + 'hO870US6AH8')
CHIS_ARMAMENT = ('Chisgule Gaming: Don’t make this armament mistake', YT + 'NmtyQ9YcWhI')
CHIS_MIGRATION = ('Chisgule Gaming: Top 8 Migration Mistakes', YT + 'yQfN2Vome9E')
CHIS_SLEEPER = ('Chisgule Gaming: Sleeper Accounts in Rise of Kingdoms', YT + 'WzPDjn5Y4uc')
CHIS_SPEEDUPS = ('Chisgule Gaming: All ways to get Speedups in Rise of Kingdoms', YT + '3avRwxToaVU')
CHIS_NEW = ('Chisgule Gaming: 16+ New Player Tips and Tricks', YT + 'UDZOvNAra8s')
# no published source – Gether's own routine, confirmed in game (10. 10. 2026)
GETHER = (t('Gether, R4 KD 1035 – overené v hre', 'Gether, R4 KD 1035 – ověřeno ve hře'), '')

GUIDES = [
    {
        'slug': 'speedupy-za-nepotrebne-siege',
        'title': t('Speedupy za nepotrebné siege jednotky', 'Speedupy za nepotřebné siege jednotky'),
        'blocks': [
            ('p', t(
                'Siege, ktoré v pochodoch nepoužiješ, premeníš na tréningové speedupy a suroviny a časť jednotiek dostaneš späť. '
                'Stačí plný hospital a kamarát v inej aliancii.',
                'Siege, které v pochodech nepoužiješ, proměníš na tréninkové speedupy a suroviny a část jednotek dostaneš zpět. '
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
                t('Kým je hospital plný, zomierajú aj jednotky zranené v iných bojoch. Rob to, keď je pokoj, a potom jednotky v hospitali vylieč.',
                  'Dokud je hospital plný, umírají i jednotky zraněné v jiných bojích. Dělej to, když je klid, a potom jednotky v hospitalu vyleč.'),
            ]),
            ('sources', [CH_SIEGE]),
        ],
    },
    {
        # confirmed in game by Gether (10. 10. 2026): the account with 90 %+ of the damage gets the full rewards;
        # his split: main 210k + farm 15k, or farm 20k + main 240k; the fort level does not matter
        'slug': 'maximum-speedupov-z-fortov',
        'specialty': 'barbarian-fort',
        'title': t('Maximum speedupov z fortov s vlastnou farmou', 'Maximum speedupů z fortů s vlastní farmou'),
        'blocks': [
            ('p', t(
                'Návod, ako robiť barbarské forty sám s vlastnou farmou a dostať z nich čo najviac speedupov.',
                'Návod, jak dělat barbarské forty sám s vlastní farmou a dostat z nich co nejvíc speedupů.',
            )),
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
                t('Na fort sa bežne chodí aspoň so 400 000 jednotkami. S menšou armádou sú straty väčšie, zranení idú do hospitalu a ten sa plní rýchlejšie.',
                  'Na fort se běžně chodí nejméně se 400 000 jednotkami. S menší armádou jsou ztráty větší, zranění jdou do hospitalu a ten se plní rychleji.'),
                t('Výmenou za to dostane main z každého fortu maximum speedupov, aké sa dá získať, a väčšinou aj AP flašky alebo gold key.',
                  'Na oplátku dostane main z každého fortu maximum speedupů, jaké se dá získat, a většinou i AP flašky nebo gold key.'),
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
    {
        'slug': 'speedupy-na-one-mans-trash',
        'title': t('Stavebné a výskumné speedupy na tréningové', 'Stavební a výzkumné speedupy na tréninkové'),
        'blocks': [
            ('p', t(
                'Pred každým Zenith of Power príde event One Man’s Trash. Vymeníš v ňom stavebné a výskumné speedupy za tréningové – oplatí sa šetriť si ich medzi eventmi.',
                'Před každým Zenith of Power přijde event One Man’s Trash. Vyměníš v něm stavební a výzkumné speedupy za tréninkové – vyplatí se šetřit si je mezi eventy.',
            )),
            ('h2', t('Ako na to', 'Jak na to')),
            ('ul', [
                t('<strong>Medzi eventmi šetri veľké speedupy</strong> (3 h, 8 h, 24 h) na stavbu a výskum. Na bežné stavanie minaj tie, ktorých máš najviac, a nič, čoho máš menej ako 800.',
                  '<strong>Mezi eventy šetři velké speedupy</strong> (3 h, 8 h, 24 h) na stavbu a výzkum. Na běžné stavění utrácej ty, kterých máš nejvíc, a nic, čeho máš méně než 800.'),
                t('<strong>Pozor na okamžitý výskum:</strong> pri 10-hodinovom výskume hra sama vyberie 8 h + 2 × 60 min. Radšej použi 10 × 60 min a osemhodinovku si nechaj na výmenu.',
                  '<strong>Pozor na okamžitý výzkum:</strong> u 10hodinového výzkumu hra sama vybere 8 h + 2 × 60 min. Raději použij 10 × 60 min a osmihodinovku si nech na výměnu.'),
                t('<strong>V evente</strong> dostaneš za každú minútu speedupu jeden Caravan Chit. Limit výmeny platí pre každý druh speedupu zvlášť.',
                  '<strong>V eventu</strong> dostaneš za každou minutu speedupu jeden Caravan Chit. Limit výměny platí pro každý druh speedupu zvlášť.'),
                t('<strong>Za chity kúp 8h tréningové speedupy</strong> so zľavou 75 % – minúta za minútu. Keď ich vyčerpáš, pokračuj na ďalšiu najvyššiu zľavu.',
                  '<strong>Za chity kup 8h tréninkové speedupy</strong> se slevou 75 % – minuta za minutu. Až je vyčerpáš, pokračuj na další nejvyšší slevu.'),
            ]),
            ('h2', t('Prečo sa to oplatí', 'Proč se to vyplatí')),
            ('ul', [
                t('Event je zhruba raz za 3 mesiace (okolo Veľkej noci, v júni, na výročie v septembri a na Vianoce), takže sa nazbiera dosť speedupov.',
                  'Event je zhruba jednou za 3 měsíce (kolem Velikonoc, v červnu, na výročí v září a o Vánocích), takže se nasbírá dost speedupů.'),
                t('Aj sto dní tréningových speedupov navyše je pre bežný účet veľký zisk.',
                  'I sto dní tréninkových speedupů navíc je pro běžný účet velký zisk.'),
            ]),
            ('h2', t('Na čo si dať pozor', 'Na co si dát pozor')),
            ('ul', [
                t('Liečebné speedupy stoja dva chity za minútu, 24h speedupy a suroviny sa neoplatia.',
                  'Léčebné speedupy stojí dva chity za minutu, 24h speedupy a suroviny se nevyplatí.'),
                t('Nevyužité chity ti ostanú do ďalšieho eventu.', 'Nevyužité chity ti zůstanou do dalšího eventu.'),
            ]),
            ('sources', [STTUU_TRASH]),
        ],
    },
    {
        'slug': 't4-na-zasobu',
        'title': t('Trénuj T4 do zásoby, na T5 ich vylepši', 'Trénuj T4 do zásoby, na T5 je vylepši'),
        'blocks': [
            ('p', t(
                'Sila jednotky nerastie s časom tréningu. Kto trénuje T4 do zásoby a vylepší ich na T5 až počas eventu, dostane za rovnaké speedupy oveľa viac sily.',
                'Síla jednotky neroste s časem tréninku. Kdo trénuje T4 do zásoby a vylepší je na T5 až během eventu, dostane za stejné speedupy mnohem víc síly.',
            )),
            ('h2', t('Ako na to', 'Jak na to')),
            ('ul', [
                t('<strong>Každý deň trénuj T4</strong> a nechaj ich v meste.', '<strong>Každý den trénuj T4</strong> a nech je ve městě.'),
                t('<strong>Na T5 ich vylepši</strong> počas Zenith of Power, Mightiest Governor alebo pri tréningovom bastióne v KvK. Najviac dostaneš, keď sa bastión a Mightiest Governor stretnú v ten istý deň.',
                  '<strong>Na T5 je vylepši</strong> během Zenith of Power, Mightiest Governor nebo u tréninkového bastionu v KvK. Nejvíc dostaneš, když se bastion a Mightiest Governor sejdou ve stejný den.'),
                t('<strong>Na denné úlohy</strong> typu „natrénuj 2 000 – 3 000 jednotiek“ trénuj T3 – T4 do 24 hodín nestihneš. Keď sa ponáhľaš, T2 so speedupmi sa ti vráti v odmene.',
                  '<strong>Na denní úkoly</strong> typu „natrénuj 2 000 – 3 000 jednotek“ trénuj T3 – T4 do 24 hodin nestihneš. Když spěcháš, T2 se speedupy se ti vrátí v odměně.'),
            ]),
            ('h2', t('Prečo sa to oplatí', 'Proč se to vyplatí')),
            ('ul', [
                t('T5 má silu 10, T4 silu 4. Vylepšenie T4 na T5 stojí tretinu času nového T5 tréningu, no dá 60 % jeho sily.',
                  'T5 má sílu 10, T4 sílu 4. Vylepšení T4 na T5 stojí třetinu času nového T5 tréninku, ale dá 60 % jeho síly.'),
                t('T3 na T5 stojí polovicu času za 70 % sily, T2 dve tretiny za 80 %.', 'T3 na T5 stojí polovinu času za 70 % síly, T2 dvě třetiny za 80 %.'),
            ]),
            ('h2', t('Na čo si dať pozor', 'Na co si dát pozor')),
            ('ul', [
                t('T1 do zásoby netrénuj – vylepšenie na T5 stojí viac speedupov ako nový T5.',
                  'T1 do zásoby netrénuj – vylepšení na T5 stojí víc speedupů než nový T5.'),
                t('Počas KvK a eventov T4 do zásoby netrénuj.', 'Během KvK a eventů T4 do zásoby netrénuj.'),
            ]),
            ('sources', [STTUU_SPEEDUPS]),
        ],
    },
    {
        'slug': 'narodeninovy-balik-lilith-pass',
        'title': t('Narodeninový balík zadarmo cez Lilith Pass', 'Narozeninový balíček zdarma přes Lilith Pass'),
        'blocks': [
            ('p', t(
                'Raz za rok si každý hráč môže vyzdvihnúť narodeninový balík zadarmo. Čím vyšší stupeň Lilith Pass, tým lepší balík.',
                'Jednou za rok si každý hráč může vyzvednout narozeninový balíček zdarma. Čím vyšší stupeň Lilith Pass, tím lepší balíček.',
            )),
            ('h2', t('Ako na to', 'Jak na to')),
            ('ul', [
                t('<strong>V mobile:</strong> Obchod → ROK Club → „go to ROK Club“ → na webe menu vľavo hore → Lilith Pass.',
                  '<strong>V mobilu:</strong> Obchod → ROK Club → „go to ROK Club“ → na webu menu vlevo nahoře → Lilith Pass.'),
                t('<strong>Na PC:</strong> vyhľadaj Lilith Pass a prihlás sa rovnako ako do hry.',
                  '<strong>Na PC:</strong> vyhledej Lilith Pass a přihlas se stejně jako do hry.'),
                t('<strong>Nastav si dátum narodenín</strong> a vyzdvihni limitovaný narodeninový balík. Vyber účet, na ktorý ho chceš poslať – príde ti do pošty v hre.',
                  '<strong>Nastav si datum narozenin</strong> a vyzvedni limitovaný narozeninový balíček. Vyber účet, na který ho chceš poslat – přijde ti do pošty ve hře.'),
            ]),
            ('h2', t('Prečo sa to oplatí', 'Proč se to vyplatí')),
            ('ul', [
                t('Body do Lilith Pass dostávaš aj za obyčajné prihlásenie, nielen za nákupy. Balík je zadarmo na každom stupni.',
                  'Body do Lilith Pass dostáváš i za obyčejné přihlášení, nejen za nákupy. Balíček je zdarma na každém stupni.'),
                t('Na stupni Platinum mal balík 3 000 gemov, 24h speedupy a suroviny.',
                  'Na stupni Platinum měl balíček 3 000 gemů, 24h speedupy a suroviny.'),
            ]),
            ('h2', t('Na čo si dať pozor', 'Na co si dát pozor')),
            ('ul', [
                t('Ďalší balík si vyzdvihneš až o rok, okolo nastaveného dátumu.', 'Další balíček si vyzvedneš až za rok, kolem nastaveného data.'),
            ]),
            ('sources', [STTUU_BIRTHDAY]),
        ],
    },
    {
        'slug': 'nastavenia-boja-bez-misklikov',
        'title': t('Nastavenia boja bez omylných klikov', 'Nastavení boje bez omylných kliků'),
        'blocks': [
            ('p', t(
                'Dve nastavenia boja ti v KvK ušetria omylné útoky a sprehľadnia obrazovku: filter mode a quick command.',
                'Dvě nastavení boje ti v KvK ušetří omylné útoky a zpřehlední obrazovku: filter mode a quick command.',
            )),
            ('h2', t('Ako na to', 'Jak na to')),
            ('ul', [
                t('<strong>V nastaveniach boja</strong> zapni filter mode, light mode a útok pochodom s polomerom 0.',
                  '<strong>V nastavení boje</strong> zapni filter mode, light mode a útok pochodem s poloměrem 0.'),
                t('<strong>Filter mode</strong> (vpravo dole): zapni light mode a zjednodušené efekty, skry mená, jednotky a portréty spojencov.',
                  '<strong>Filter mode</strong> (vpravo dole): zapni light mode a zjednodušené efekty, skryj jména, jednotky a portréty spojenců.'),
                t('<strong>Quick command</strong> (vľavo dole): odškrtni, na čo sa nemá dať kliknúť – spojenecké jednotky, barbarov, budovy a mestá, surovinové body a runy.',
                  '<strong>Quick command</strong> (vlevo dole): odškrtni, na co se nemá dát kliknout – spojenecké jednotky, barbary, budovy a města, surovinové body a runy.'),
            ]),
            ('h2', t('Prečo sa to oplatí', 'Proč se to vyplatí')),
            ('ul', [
                t('Mestá mimo vlajky mávajú silný garrison. Jeden omylný klik ťa stojí mŕtve jednotky.',
                  'Města mimo vlajku mívají silný garrison. Jeden omylný klik tě stojí mrtvé jednotky.'),
                t('S útokom pochodom stačí držať ľavé tlačidlo a prechádzať okolo vlajky – pochody samy zaútočia na posily, ktoré z nej vyjdú.',
                  'S útokem pochodem stačí držet levé tlačítko a přejíždět kolem vlajky – pochody samy zaútočí na posily, které z ní vyjdou.'),
            ]),
            ('h2', t('Na čo si dať pozor', 'Na co si dát pozor')),
            ('ul', [
                t('S quick command ľavý klik posiela jednotky, takže nič neprezrieš. Keď si chceš niečo pozrieť, vypni ho.',
                  'S quick command levý klik posílá jednotky, takže nic neprohlédneš. Když si chceš něco prohlédnout, vypni ho.'),
                t('Proti lagom aspoň raz za hodinu reštartuj hru.', 'Proti lagům aspoň jednou za hodinu restartuj hru.'),
            ]),
            ('sources', [STTUU_SETTINGS, STTUU_TIPS]),
        ],
    },
    {
        'slug': 'skryte-pity-vo-vybave-a-armamentoch',
        'title': t('Skryté pity vo výbave a armamentoch', 'Skryté pity ve výbavě a armamentech'),
        'blocks': [
            ('p', t(
                'Kovanie výbavy aj armamenty majú pity – istú odmenu po určitom počte pokusov. Hra ho ukazuje len pod ikonou informácií.',
                'Kování výbavy i armamenty mají pity – jistou odměnu po určitém počtu pokusů. Hra ho ukazuje jen pod ikonou informací.',
            )),
            ('h2', t('Kde ho nájdeš', 'Kde ho najdeš')),
            ('ul', [
                t('<strong>Kovanie:</strong> ikona informácií vpravo hore pri predmete. Piate kovanie toho istého predmetu má istý špeciálny talent, každé predtým 11 % šancu. Po zásahu sa počítadlo vynuluje.',
                  '<strong>Kování:</strong> ikona informací vpravo nahoře u předmětu. Páté kování stejného předmětu má jistý speciální talent, každé předtím 11% šanci. Po zásahu se počítadlo vynuluje.'),
                t('<strong>Transmutácia armamentov:</strong> každých 10 pokusov dá istý atribút zamknutého typu jednotiek, každých 30 istých 2,5 % a viac pre tento typ.',
                  '<strong>Transmutace armamentů:</strong> každých 10 pokusů dá jistý atribut zamčeného typu jednotek, každých 30 jistých 2,5 % a víc pro tento typ.'),
                t('<strong>Wish list armamentov:</strong> ukáže, do koľkých otvorení dostaneš vzácny alebo špeciálny atribút. Desiaty vzácny sa zmení na špeciálny.',
                  '<strong>Wish list armamentů:</strong> ukáže, do kolika otevření dostaneš vzácný nebo speciální atribut. Desátý vzácný se změní na speciální.'),
            ]),
            ('h2', t('Prečo sa to oplatí', 'Proč se to vyplatí')),
            ('ul', [
                t('Počítadlo ukazuje, koľko pokusov ti chýba – napríklad pri 8 z 30 transmutácií ešte 22 do istých 2,5 %.',
                  'Počítadlo ukazuje, kolik pokusů ti chybí – například při 8 z 30 transmutací ještě 22 do jistých 2,5 %.'),
                t('Pri treťom alebo štvrtom kovaní bez talentu môže byť výhodné predmet rozobrať a ukovať znova.',
                  'U třetího nebo čtvrtého kování bez talentu může být výhodné předmět rozebrat a ukovat znovu.'),
            ]),
            ('h2', t('Na čo si dať pozor', 'Na co si dát pozor')),
            ('ul', [
                t('Rozobratie legendárneho predmetu bez špeciálneho talentu vráti len polovicu materiálov.',
                  'Rozebrání legendárního předmětu bez speciálního talentu vrátí jen polovinu materiálů.'),
                t('Dobré armamenty hneď zamkni, aby ti ich hromadné rozoberanie nezobralo.',
                  'Dobré armamenty hned zamkni, aby ti je hromadné rozebírání nevzalo.'),
            ]),
            ('sources', [STTUU_TIPS, STTUU_LESSONS]),
        ],
    },
    {
        'slug': 'arms-training-vyssie-skore',
        'title': t('Arms Training: vyššie skóre aj bez veľkého rozšírenia', 'Arms Training: vyšší skóre i bez velkého rozšíření'),
        'blocks': [
            ('p', t(
                'V Arms Training proti Loharovi rozhoduje, koľko jednotiek ti na konci ostane. S dobrou prípravou sa dá dostať vysoko aj s 25 % rozšírením.',
                'V Arms Training proti Loharovi rozhoduje, kolik jednotek ti na konci zůstane. S dobrou přípravou se dá dostat vysoko i s 25% rozšířením.',
            )),
            ('h2', t('Ako na to', 'Jak na to')),
            ('ul', [
                t('<strong>Bojuj na aliančnom území.</strong> Výskum územia dáva veľký bonus k útoku. Pomôže aj bojová runa (zdravie) a aktívny aliančný buff.',
                  '<strong>Bojuj na aliančním území.</strong> Výzkum území dává velký bonus k útoku. Pomůže i bojová runa (zdraví) a aktivní alianční buff.'),
                t('<strong>Poradie skillov nastav vopred.</strong> Každé kráľovstvo má inú ponuku skillov – tie, ktoré chýbajú, preskoč a ostatné nechaj v poradí.',
                  '<strong>Pořadí skillů nastav předem.</strong> Každé království má jinou nabídku skillů – ty, které chybí, přeskoč a ostatní nech v pořadí.'),
                t('<strong>Daj si horn na rage</strong> a armádu vyšli ručne. Kliknutie na preset by ti mohlo vymeniť výbavu.',
                  '<strong>Dej si horn na rage</strong> a armádu vyšli ručně. Kliknutí na preset by ti mohlo vyměnit výbavu.'),
                t('<strong>Okolie vyčisti od barbarov</strong> druhým pochodom. Barbar, ktorý na teba zaútočí, ti zníži počet jednotiek a tým aj skóre.',
                  '<strong>Okolí vyčisti od barbarů</strong> druhým pochodem. Barbar, který na tebe zaútočí, ti sníží počet jednotek a tím i skóre.'),
                t('<strong>Teleport netreba.</strong> Prvý Lohar sa objaví náhodne, ďalší už pri tvojom pochode. Stačí presunúť pochod späť na územie.',
                  '<strong>Teleport není potřeba.</strong> První Lohar se objeví náhodně, další už u tvého pochodu. Stačí přesunout pochod zpět na území.'),
            ]),
            ('h2', t('Prečo sa to oplatí', 'Proč se to vyplatí')),
            ('ul', [
                t('S 25 % rozšírením a bez ďalších buffov sa takto dá dostať do top 4 kráľovstva.',
                  'S 25% rozšířením a bez dalších buffů se takhle dá dostat do top 4 království.'),
            ]),
            ('h2', t('Na čo si dať pozor', 'Na co si dát pozor')),
            ('ul', [
                t('Lohar sa nepočíta ako barbar, takže skilly s bonusom proti barbarom nepomôžu.',
                  'Lohar se nepočítá jako barbar, takže skilly s bonusem proti barbarům nepomůžou.'),
                t('Ikona, ktorá ukazuje, ktorý typ jednotiek je v kole oslabený, môže klamať. Over si to v záznamoch boja.',
                  'Ikona, která ukazuje, který typ jednotek je v kole oslabený, může klamat. Ověř si to v záznamech boje.'),
                t('Najvyššie miesta často berú hráči so skinom mesta, ktorý lieči jednotky.',
                  'Nejvyšší místa často berou hráči se skinem města, který léčí jednotky.'),
            ]),
            ('sources', [CHIS_ARMS, CHIS_ARMS_ORDER]),
        ],
    },
    {
        'slug': 'holy-knights-treasure',
        'title': t('Holy Knight’s Treasure: najviac za gemy', 'Holy Knight’s Treasure: nejvíc za gemy'),
        'blocks': [
            ('p', t(
                'Holy Knight’s Treasure je raz za mesiac a za gemy dá viac ako VIP obchod – blueprinty, materiály aj speedupy.',
                'Holy Knight’s Treasure je jednou za měsíc a za gemy dá víc než VIP obchod – blueprinty, materiály i speedupy.',
            )),
            ('h2', t('Ako na to', 'Jak na to')),
            ('ul', [
                t('<strong>Dotiahni ho aspoň na 10 točení</strong> – prvý pity stupeň dá kúsky blueprintu, ktorý si vyberieš.',
                  '<strong>Dotáhni ho aspoň na 10 točení</strong> – první pity stupeň dá kousky blueprintu, který si vybereš.'),
                t('<strong>Vzory sa každý mesiac striedajú.</strong> Najviac sa oplatí, keď je v ponuke vzor, ktorý potrebuješ.',
                  '<strong>Vzory se každý měsíc střídají.</strong> Nejvíc se vyplatí, když je v nabídce vzor, který potřebuješ.'),
                t('<strong>Nekuj hneď.</strong> Kovanie si nechaj na Alliance Mobilization.',
                  '<strong>Nekuj hned.</strong> Kování si nech na Alliance Mobilization.'),
            ]),
            ('h2', t('Prečo sa to oplatí', 'Proč se to vyplatí')),
            ('ul', [
                t('S odmenami za stupne dá každý gem asi 2,4-násobok hodnoty VIP obchodu, bez nich asi 1,6-násobok.',
                  'S odměnami za stupně dá každý gem asi 2,4násobek hodnoty VIP obchodu, bez nich asi 1,6násobek.'),
                t('Väčšinu hodnoty tvoria legendárne blueprinty, nie materiály.',
                  'Většinu hodnoty tvoří legendární blueprinty, ne materiály.'),
            ]),
            ('h2', t('Na čo si dať pozor', 'Na co si dát pozor')),
            ('ul', [
                t('Dáva len blueprinty, materiály a speedupy. Ak potrebuješ napríklad armamenty, gemy daj inam.',
                  'Dává jen blueprinty, materiály a speedupy. Pokud potřebuješ například armamenty, gemy dej jinam.'),
                t('Celých 100 točení stojí asi 48 000 gemov. Ak chceš už len speedupy a materiály, po 100 točeniach je lepší VIP obchod.',
                  'Celých 100 točení stojí asi 48 000 gemů. Pokud chceš už jen speedupy a materiály, po 100 točeních je lepší VIP obchod.'),
            ]),
            ('sources', [CHIS_HOLY, CHIS_MATERIALS]),
        ],
    },
    {
        'slug': 'armament-skusobne-rerolly',
        'title': t('Lacné rerolly na nepotrebnom armamente', 'Levné rerolly na nepotřebném armamentu'),
        'blocks': [
            ('p', t(
                'Namiesto drahého opravovania slabého armamentu skús šťastie na takom, ktorý nepoužívaš. Keď padne vysoký atribút, pokračuj s ním.',
                'Místo drahého opravování slabého armamentu zkus štěstí na takovém, který nepoužíváš. Když padne vysoký atribut, pokračuj s ním.',
            )),
            ('h2', t('Ako na to', 'Jak na to')),
            ('ul', [
                t('<strong>Vezmi nepoužívaný armament</strong> rovnakého slotu a transmutuj ho bez zamknutých atribútov.',
                  '<strong>Vezmi nepoužívaný armament</strong> stejného slotu a transmutuj ho bez zamčených atributů.'),
                t('<strong>Keď padne vysoký atribút</strong>, zamkni ho a rerolluj zvyšné.',
                  '<strong>Když padne vysoký atribut</strong>, zamkni ho a rerolluj zbylé.'),
                t('<strong>Hotový armament premeň</strong> na inscription, ktorú potrebuješ. Pri vzácnom armamente to stojí 3 conversion stones.',
                  '<strong>Hotový armament přeměň</strong> na inscription, kterou potřebuješ. U vzácného armamentu to stojí 3 conversion stones.'),
            ]),
            ('h2', t('Prečo sa to oplatí', 'Proč se to vyplatí')),
            ('ul', [
                t('Reroll bez zámku je najlacnejší, so zamknutým atribútom stojí trojnásobok a s dvoma päťnásobok. Vysoký atribút tak hľadáš za najnižšiu cenu.',
                  'Reroll bez zámku je nejlevnější, se zamčeným atributem stojí trojnásobek a se dvěma pětinásobek. Vysoký atribut tak hledáš za nejnižší cenu.'),
                t('V najhoršom prípade prídeš o armament, ktorý si aj tak nepoužíval.',
                  'V nejhorším případě přijdeš o armament, který jsi stejně nepoužíval.'),
            ]),
            ('h2', t('Na čo si dať pozor', 'Na co si dát pozor')),
            ('ul', [
                t('Bez zámku sa ti nebuduje pity – len skúšaš šťastie na vysoký atribút.', 'Bez zámku se ti nebuduje pity – jen zkoušíš štěstí na vysoký atribut.'),
                t('Legendárna inscription stojí pri premene 10 conversion stones.', 'Legendární inscription stojí při přeměně 10 conversion stones.'),
            ]),
            ('sources', [CHIS_TRANSMUTE, CHIS_ARMAMENT]),
        ],
    },
    {
        'slug': 'pred-migraciou',
        'title': t('Pred migráciou: na čo nezabudnúť', 'Před migrací: na co nezapomenout'),
        'blocks': [
            ('p', t(
                'Pri migrácii sa najčastejšie zbytočne stratia jednotky, gemy alebo suroviny. Trocha plánovania ich ušetrí.',
                'Při migraci se nejčastěji zbytečně ztratí jednotky, gemy nebo suroviny. Trocha plánování je ušetří.',
            )),
            ('h2', t('Ako na to', 'Jak na to')),
            ('ul', [
                t('<strong>Počkaj na vrátenie jednotiek po KvK.</strong> Pri najvyššom stupni KvK sa vráti až 65 % padlých jednotiek. Kto odíde skôr, dostane menej.',
                  '<strong>Počkej na vrácení jednotek po KvK.</strong> U nejvyššího stupně KvK se vrátí až 65 % padlých jednotek. Kdo odejde dřív, dostane méně.'),
                t('<strong>Miň suroviny, ktoré neprenesieš.</strong> Zlato daj do výbavy na zber, zvyšok do veľkého tréningu – ideálne pred Mightiest Governor alebo iným tréningovým eventom.',
                  '<strong>Utrať suroviny, které nepřeneseš.</strong> Zlato dej do výbavy na sběr, zbytek do velkého tréninku – ideálně před Mightiest Governor nebo jiným tréninkovým eventem.'),
                t('<strong>Po oznámení odchodu si daj štít</strong> (peace shield). Nie každé kráľovstvo sa k odchádzajúcim správa pekne.',
                  '<strong>Po oznámení odchodu si dej štít</strong> (peace shield). Ne každé království se k odcházejícím chová hezky.'),
                t('<strong>Neodchádzaj uprostred eventu.</strong> Najlepšie je prísť do nového kráľovstva počas eventu za gemy, napríklad Holy Knight’s Treasure – zahráš si ho v oboch.',
                  '<strong>Neodcházej uprostřed eventu.</strong> Nejlepší je přijít do nového království během eventu za gemy, například Holy Knight’s Treasure – zahraješ si ho v obou.'),
                t('<strong>Spoznaj hráčov nového kráľovstva</strong> na ich Discorde ešte pred príchodom.',
                  '<strong>Seznam se s hráči nového království</strong> na jejich Discordu ještě před příchodem.'),
            ]),
            ('h2', t('Prečo sa to oplatí', 'Proč se to vyplatí')),
            ('ul', [
                t('Pas vyjde lacnejšie, keď máš nižšiu silu – pomôže napríklad plný hospital.',
                  'Pas vyjde levněji, když máš nižší sílu – pomůže například plný hospital.'),
            ]),
            ('h2', t('Na čo si dať pozor', 'Na co si dát pozor')),
            ('ul', [
                t('Keď odchod oznámiš, aliancia ťa už nemusí prijať späť.', 'Když odchod oznámíš, aliance tě už nemusí přijmout zpět.'),
            ]),
            ('sources', [CHIS_MIGRATION, CHIS_SLEEPER]),
        ],
    },
    {
        'slug': 'speedupy-ktore-hraci-prehliadaju',
        'title': t('Speedupy, ktoré hráči prehliadajú', 'Speedupy, které hráči přehlížejí'),
        'blocks': [
            ('p', t(
                'Pár drobností, ktoré ti každý týždeň pridajú speedupy takmer bez námahy.',
                'Pár drobností, které ti každý týden přidají speedupy téměř bez námahy.',
            )),
            ('h2', t('Ako na to', 'Jak na to')),
            ('ul', [
                t('<strong>Mapy kráľovstva si nechaj.</strong> Keď je hmla vyčistená, každá mapa dá 5-minútový speedup – 200 máp je 200 takýchto speedupov.',
                  '<strong>Mapy království si nech.</strong> Když je mlha vyčištěná, každá mapa dá 5minutový speedup – 200 map je 200 takových speedupů.'),
                t('<strong>Aliančné truhly otváraj denne.</strong> Po 24 hodinách zmiznú a ich otvorenie dá aj aliančné kredity.',
                  '<strong>Alianční truhly otevírej denně.</strong> Po 24 hodinách zmizí a jejich otevření dá i alianční kredity.'),
                t('<strong>Vo VIP obchode</strong> si každý týždeň kúp 55-minútové speedupy za suroviny.',
                  '<strong>Ve VIP obchodě</strong> si každý týden kup 55minutové speedupy za suroviny.'),
                t('<strong>Nenechaj AP plné.</strong> Kým je ukazovateľ plný, AP sa nedopĺňajú a prichádzaš o ne.',
                  '<strong>Nenech AP plné.</strong> Dokud je ukazatel plný, AP se nedoplňují a přicházíš o ně.'),
                t('<strong>Urýchli stavbu kasární a akadémie.</strong> Počas vylepšovania v nich nemôžeš trénovať ani skúmať, takže speedup tam pomôže dvakrát.',
                  '<strong>Urychli stavbu kasáren a akademie.</strong> Během vylepšování v nich nemůžeš trénovat ani zkoumat, takže speedup tam pomůže dvakrát.'),
            ]),
            ('sources', [CHIS_SPEEDUPS, CHIS_NEW]),
        ],
    },
]
