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
]
