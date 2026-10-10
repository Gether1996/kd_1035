"""Commander pairing guides (category Commanderi). Kept up to date by the monthly meta update.

Write every text yourself in SK and CZ – facts from the sources listed in each guide, never copied prose.
Field, garrison and rally pairs follow the YouTube creator WarDaddyChadski (Gether, 9. 10. 2026): his dated guides,
read as transcripts (tools/youtube/transcripts.py). Websites stay the source for PvE, F2P, gathering and talent trees.
"""

from .render import t

CATEGORY = 'commanderi'
# year-month of the last check against current sources – shown as "Stav k októbru 2026" in every guide
VERIFIED = '2026-10'
NOTE = t('Meta sa mení s každou fázou KvK aj s novými commandermi.', 'Meta se mění s každou fází KvK i s novými commandery.')

CAV = t('jazda', 'jízda')
INF = t('pechota', 'pěchota')
ARCH = t('lukostrelci', 'lučištníci')

AC_PAIRS = ('AllClash: Best Commander Pairings (08/2026)', 'https://www.allclash.com/best-commander-pairings-defense-rally-open-field-canyon-barbarians/')
AC_TIERS = ('AllClash: Commander Tier List (09/2026)', 'https://www.allclash.com/best-commanders-tier-list-in-rise-of-kingdoms-with-talents/')
LD_PAIRS = ('LDShop: Best Commander Pairings (08/2026)', 'https://www.ldshop.gg/blog/rise-of-kingdoms/best-commander-pairings.html')
RKG_PAIRS = ('Rise of Kingdoms Guides: Commander Pairings', 'https://riseofkingdomsguides.com/guides/commander-pairings/')


def chadski(title, video):
    return (f'WarDaddyChadski: {title}', f'https://www.youtube.com/watch?v={video}')


# trade %, report counts and tiers he quotes come from RoKBattles and the InfoCat tier list
CH_CAV = chadski('New Cavalry Guide (10/2026)', 'xWsT2Rvah3c')
CH_MARSHAL = chadski('Marshal’s Rage Is Crushing It In The Field (10/2026)', 'y856Fl0wdM0')
CH_IVAN = chadski('Ivan Guide (09/2026)', '17Lliq80gyY')
CH_LINEUPS = chadski('Meta Field March Line Ups (09/2026)', 'ygzfMwMHMbc')
CH_RALLY = chadski('New Cavalry Rally Cooks: Marshal Is A Beast (09/2026)', 'XbjoUTC7gl0')
CH_MARSHAL_RALLY = chadski('William Marshal Will Slay: Cavalry Rally Is Back (08/2026)', 'V162nzgycf0')
CH_INF = chadski('Infantry Smashes: March Guide (07/2026)', 'DhzkpvsGZys')
CH_INF_NEXT = chadski('Next Infantry Commander and The Future Of Infantry (09/2026)', '4oKImx5E1Zk')
CH_LEADERSHIP = chadski('Leadership Commanders and Equipment In 2026 (09/2026)', 'qEbVnm5tKec')
CH_INVEST = chadski('Best Commanders To Invest In (08/2026)', 'aSqsOL2RwN8')
CH_KP = chadski('In-Depth Analysis Of Meta Commanders (07/2026)', 'KsezGgjId_c')
CH_ARCH = chadski('The End Of Zhuge: Archer Guide (07/2026)', 'ycX5S_GcRmw')
CH_ARCH_NEXT = chadski('Next Generation Archers (09/2026)', 'OCxCxzKX_hg')
CH_GARRISON = chadski('Meta Garrison Guide (08/2026)', 'mkh_eDDCY3I')
CH_SWARM = chadski('Swarm Meta Punishes (09/2026)', 'bur8GUukxQc')


OPEN_FIELD = ['primary', 'secondary', 'why', 'talents']
WITH_TROOPS = ['primary', 'secondary', 'troops', 'why']

GUIDES = [
    {
        'slug': 'ako-skladat-pary-commanderov',
        'title': t('Ako skladať páry commanderov', 'Jak skládat páry commanderů'),
        'blocks': [
            ('p', t(
                'Primárny commander dáva armáde talenty, výbavu aj kapacitu jednotiek, sekundárny prispieva skillmi. '
                'Pravidlá, podľa ktorých sa oplatí páry skladať a investovať do nich.',
                'Primární commander dává armádě talenty, výbavu i kapacitu jednotek, sekundární přispívá skilly. '
                'Pravidla, podle kterých se vyplatí páry skládat a investovat do nich.',
            )),
            ('note',),
            ('h2', t('Rýchly prehľad', 'Rychlý přehled')),
            ('pairs', ['troops', 'primary', 'secondary'], [
                {'troops': t('Jazda – pole', 'Jízda – pole'), 'primary': 'Ivan IV', 'secondary': 'Achilles'},
                {'troops': t('Jazda – pole, alternatíva', 'Jízda – pole, alternativa'), 'primary': 'Arthur Pendragon', 'secondary': 'Ivan IV'},
                {'troops': t('Pechota – pole', 'Pěchota – pole'), 'primary': 'Sun Tzu Prime', 'secondary': 'Liu Che'},
                {'troops': t('Lukostrelci – pole', 'Lučištníci – pole'), 'primary': 'Qin Shi Huang', 'secondary': 'Yi Seong-Gye'},
                {'troops': t('Garrison', 'Garrison'), 'primary': 'Gorgo', 'secondary': 'Tokugawa Ieyasu'},
                {'troops': t('Rally', 'Rally'), 'primary': 'Subutai', 'secondary': 'William Marshal'},
                {'troops': t('Barbari a pevnosti', 'Barbaři a pevnosti'), 'primary': 'Minamoto', 'secondary': 'Cao Cao'},
                {'troops': t('F2P začiatok', 'F2P začátek'), 'primary': 'Sun Tzu', 'secondary': 'Aethelflaed'},
                {'troops': t('Zber surovín', 'Sběr surovin'), 'primary': 'Constance', 'secondary': 'Matilda of Flanders'},
            ]),
            ('h2', t('Pravidlá', 'Pravidla')),
            ('ul', [
                t('<strong>Primárny slot</strong> patrí commanderovi, do ktorého máš najviac investované. Rátajú sa len jeho talenty a výbava a jeho level určuje kapacitu jednotiek.',
                  '<strong>Primární slot</strong> patří commanderovi, do kterého máš nejvíc investováno. Počítají se jen jeho talenty a výbava a jeho level určuje kapacitu jednotek.'),
                t('<strong>Sekundárny</strong> prispieva skillmi. Niektorí commanderi sú navrhnutí iba ako sekundárni (napríklad Imhotep) a na primárnom slote sú slabší.',
                  '<strong>Sekundární</strong> přispívá skilly. Někteří commandeři jsou navržení jen jako sekundární (například Imhotep) a na primárním slotu jsou slabší.'),
                t('<strong>Skilly:</strong> najprv 5511, potom 5555, expertíza až nakoniec. Napríklad Sun Tzu Prime má na 5511 len asi 70 % svojej sily. Niektorým sekundárnym 5511 stačí – Ivarovi the Boneless za Sun Tzu Prime či Williamovi Marshalovi v poli.',
                  '<strong>Skilly:</strong> nejdřív 5511, potom 5555, expertíza až nakonec. Například Sun Tzu Prime má na 5511 jen asi 70 % své síly. Některým sekundárním 5511 stačí – Ivarovi the Boneless za Sun Tzu Prime či Williamu Marshalovi v poli.'),
                t('<strong>Zlaté hlavy</strong> daj commanderom, ktorí vydržia roky. Sú to Qin Shi Huang, Sun Tzu Prime, Achilles, Liu Che a Ivan IV. Alp Arslan, Heraclius ani Vercingetorix za ne nestoja.',
                  '<strong>Zlaté hlavy</strong> dej commanderům, kteří vydrží roky. Jsou to Qin Shi Huang, Sun Tzu Prime, Achilles, Liu Che a Ivan IV. Alp Arslan, Heraclius ani Vercingetorix za to nestojí.'),
                t('<strong>Jeden pár naplno</strong> je viac ako tri rozrobené. Hotový starší pár nerozbíjaj kvôli novému, napoly rozrobenému commanderovi.',
                  '<strong>Jeden pár naplno</strong> je víc než tři rozdělané. Hotový starší pár nerozbíjej kvůli novému, napůl rozdělanému commanderovi.'),
                t('<strong>Leadership commanderi</strong> (Hector, Philip II) patria v poli iba na sekundárny slot, na primárny sa ich talenty nehodia. Jediný nutný je Hector – kvôli garrisonom.',
                  '<strong>Leadership commandeři</strong> (Hector, Philip II) patří v poli jen na sekundární slot, na primární se jejich talenty nehodí. Jediný nutný je Hector – kvůli garrisonům.'),
                t('<strong>Typ jednotiek musí sedieť</strong>, miešané armády sa nevyplácajú. Výnimkou je Hector: jeho poškodenie sa riadi primárnym commanderom – za pechotou smite, za jazdou combo, za lukostrelcami skill.',
                  '<strong>Typ jednotek musí sedět</strong>, smíšené armády se nevyplácejí. Výjimkou je Hector: jeho poškození se řídí primárním commanderem – za pěchotou smite, za jízdou combo, za lučištníky skill.'),
                t('<strong>Tier list nie je investičná rada.</strong> Niektorí starší commanderi sa oplatia len pred Season of Conquest (KvK4) a meta sa mení s každou fázou KvK.',
                  '<strong>Tier list není investiční rada.</strong> Někteří starší commandeři se vyplatí jen před Season of Conquest (KvK4) a meta se mění s každou fází KvK.'),
                t('<strong>Výbava a technológie</strong> často prevážia tier. Dobre vybavený slabší pár porazí zle vybavený top pár.',
                  '<strong>Výbava a technologie</strong> často převáží tier. Dobře vybavený slabší pár porazí špatně vybavený top pár.'),
                t('<strong>Plánuj podľa počtu armád.</strong> Dvaja prémioví commanderi, ktorí vedia viesť vlastnú armádu, by nemali byť v jednej – napríklad Ivan IV a Achilles patria do rôznych armád, keď ich máš dve.',
                  '<strong>Plánuj podle počtu armád.</strong> Dva prémioví commandeři, kteří umí vést vlastní armádu, by neměli být v jedné – například Ivan IV a Achilles patří do různých armád, když jich máš dvě.'),
            ]),
            ('sources', [CH_CAV, CH_LINEUPS, CH_GARRISON, CH_RALLY, CH_MARSHAL, CH_INVEST, CH_LEADERSHIP, CH_INF, CH_IVAN, AC_TIERS, AC_PAIRS]),
        ],
    },
    {
        'slug': 'pary-pre-jazdu',
        'specialty': 'cavalry',
        'title': t('Páry commanderov pre jazdu', 'Páry commanderů pro jízdu'),
        'blocks': [
            ('p', t(
                'Najlepšie jazdecké armády na otvorené pole. S Ivanom IV a Williamom Marshalom je jazda opäť najsilnejšia.',
                'Nejlepší jízdní armády na otevřené pole. S Ivanem IV a Williamem Marshalem je jízda opět nejsilnější.',
            )),
            ('note',),
            ('pairs', OPEN_FIELD, [
                {'primary': 'Ivan IV', 'secondary': 'Achilles', 'talents': 'Cavalry + Combo',
                 'why': t('Najlepšia samostatná jazdecká armáda: asi 138 % trade na takmer pol milióna reportov. Ivan patrí na primárny slot, jeho aktívny skill zasiahne tri ciele a pri rozdelení medzi ciele stráca menej poškodenia ako Achillov.',
                          'Nejlepší samostatná jízdní armáda: asi 138 % trade na téměř půl milionu reportů. Ivan patří na primární slot, jeho aktivní skill zasáhne tři cíle a při rozdělení mezi cíle ztrácí méně poškození než Achillův.')},
                {'primary': 'Arthur Pendragon', 'secondary': 'Ivan IV', 'talents': 'Combo + Cavalry',
                 'why': t('Druhá najlepšia (asi 120 % trade na zhruba 940 000 reportoch). Ivanova obrana a zdravie držia krehkého Arthura dlhšie v boji. Arthur musí byť primárny.',
                          'Druhá nejlepší (asi 120 % trade na zhruba 940 000 reportech). Ivanova obrana a zdraví drží křehkého Arthura déle v boji. Arthur musí být primární.')},
                {'primary': 'Attila', 'secondary': 'Achilles',
                 'why': t('Stále asi 121 % trade. Má dobrý trade aj bez presného ovládania, preto sa hodí aj menej skúseným hráčom.',
                          'Pořád asi 121 % trade. Má dobrý trade i bez přesného ovládání, proto se hodí i méně zkušeným hráčům.')},
                {'primary': 'Achilles', 'secondary': 'Gang Gamchan', 'talents': 'Cavalry + Combo',
                 'why': t('Druhá armáda k Arthurovi s Ivanom – spolu najlepšia a najbežnejšia dvojica jazdeckých armád. Gang potrebuje partnera s plošným combom, ako je Achilles.',
                          'Druhá armáda k Arthurovi s Ivanem – spolu nejlepší a nejběžnější dvojice jízdních armád. Gang potřebuje partnera s plošným combem, jako je Achilles.')},
                {'primary': 'Achilles', 'secondary': 'William Marshal',
                 'why': t('Keď nemáš Ganga ani Attilu. Marshalovi stačí 5511: jeho combo zasahuje tri sekundy po sebe, takže stále spúšťa talenty na rage. S armádou Arthur + Ivan IV tvorí rovnako dobrú dvojicu ako ostatné.',
                          'Když nemáš Ganga ani Attilu. Marshalovi stačí 5511: jeho combo zasahuje tři sekundy po sobě, takže pořád spouští talenty na rage. S armádou Arthur + Ivan IV tvoří stejně dobrou dvojici jako ostatní.')},
                {'primary': 'Attila / Gang Gamchan', 'secondary': 'William Marshal',
                 'why': t('Tretia jazdecká armáda: Marshal dodá Attilovi rage, ktorý potrebuje. Funguje aj Gang Gamchan + Marshal, Achilles potom ide k Attilovi.',
                          'Třetí jízdní armáda: Marshal dodá Attilovi rage, který potřebuje. Funguje i Gang Gamchan + Marshal, Achilles pak jde k Attilovi.')},
            ]),
            ('h2', t('Zostavy', 'Sestavy')),
            ('lineups', [
                (t('Dve armády', 'Dvě armády'), [('Arthur Pendragon', 'Ivan IV'), ('Achilles', 'Gang Gamchan')]),
                (t('Bez Ganga', 'Bez Ganga'), [('Arthur Pendragon', 'Ivan IV'), ('Attila', 'Achilles')]),
                (t('Bez Ganga aj Attilu', 'Bez Ganga i Attily'), [('Arthur Pendragon', 'Ivan IV'), ('Achilles', 'William Marshal')]),
                (t('Tri armády', 'Tři armády'), [('Arthur Pendragon', 'Ivan IV'), ('Achilles', 'Gang Gamchan'), ('Attila', 'William Marshal')]),
                (t('Tri bez Attilu', 'Tři bez Attily'), [('Arthur Pendragon', 'William Marshal'), ('Achilles', 'Gang Gamchan'), ('Ivan IV', 'Hector')]),
            ]),
            ('h2', t('Tipy', 'Tipy')),
            ('ul', [
                t('Talenty pre combo jazdu: A Good Day to Die, Undying Fury a No Quarter. Impenetrable má zmysel len v Sunset Canyon.',
                  'Talenty pro combo jízdu: A Good Day to Die, Undying Fury a No Quarter. Impenetrable má smysl jen v Sunset Canyon.'),
                t('Ivan IV je len na pole. Na rally ani garrison sa nehodí, jeho skilly fungujú iba v boji v teréne.',
                  'Ivan IV je jen na pole. Na rally ani garrison se nehodí, jeho skilly fungují jen v boji v terénu.'),
                t('Máš Arthura a Achilla v jednej armáde? Oplatí sa získať Ivana IV a rozdeliť ich do dvoch armád.',
                  'Máš Arthura a Achilla v jedné armádě? Vyplatí se získat Ivana IV a rozdělit je do dvou armád.'),
            ]),
            ('sources', [CH_CAV, CH_MARSHAL, CH_IVAN, CH_LINEUPS, ('AllClash: Ivan IV Builds (08/2026)', 'https://www.allclash.com/best-ivan-iv-builds-talent-tree-skill-order-best-pairing-in-rise-of-kingdoms/')]),
        ],
    },
    {
        'slug': 'pary-pre-pechotu',
        'specialty': 'infantry',
        'title': t('Páry commanderov pre pechotu', 'Páry commanderů pro pěchotu'),
        'blocks': [
            ('p', t(
                'Pechota na otvorené pole stojí na Sun Tzu Prime – najlepšie s Liu Che, Bai Qim alebo Ivarom.',
                'Pěchota na otevřené pole stojí na Sun Tzu Prime – nejlépe s Liu Che, Bai Qim nebo Ivarem.',
            )),
            ('note',),
            ('pairs', OPEN_FIELD, [
                {'primary': 'Sun Tzu Prime', 'secondary': 'Liu Che', 'talents': 'Infantry + Versatility + Smite',
                 'why': t('Najlepšia pechota. Liu Che spomalí až päť cieľov o 40 %, takže súper neujde – ideálne do bitiek s ústupmi a návratmi.',
                          'Nejlepší pěchota. Liu Che zpomalí až pět cílů o 40 %, takže soupeř neuteče – ideální do bitev s ústupy a návraty.')},
                {'primary': 'Sun Tzu Prime', 'secondary': 'Bai Qi', 'talents': 'Infantry + Versatility + Smite',
                 'why': t('Do dlhých bitiek bez ústupu: poškodenie Bai Qiho stále dobíja Sun Tzuov rage. Sun Tzu Prime potrebuje na aktívny skill len 900 rage.',
                          'Do dlouhých bitev bez ústupu: poškození Bai Qiho pořád dobíjí Sun Tzuův rage. Sun Tzu Prime potřebuje na aktivní skill jen 900 rage.')},
                {'primary': 'Sun Tzu Prime', 'secondary': 'Ivar the Boneless', 'talents': 'Infantry + Versatility + Smite',
                 'why': t('Prekvapenie podľa dát RoKBattles: asi 132 % trade na 109 000 bitkách. Ivar dodá rage a plošný útok na tri ciele a stačí mu 5511.',
                          'Překvapení podle dat RoKBattles: asi 132 % trade na 109 000 bitvách. Ivar dodá rage a plošný útok na tři cíle a stačí mu 5511.')},
                {'primary': 'Bai Qi', 'secondary': 'Liu Che', 'talents': 'Infantry + Versatility + Smite',
                 'why': t('Druhá armáda k Sun Tzu + Ivar, spolu najlepšia dvojica peších armád. Jediná meta pechota bez Sun Tzua.',
                          'Druhá armáda k Sun Tzu + Ivar, spolu nejlepší dvojice pěších armád. Jediná meta pěchota bez Sun Tzua.')},
                {'primary': 'Bai Qi', 'secondary': 'Hector',
                 'why': t('Pri troch armádach, keď Bai Qi a Liu Che idú každý inam. Hector za pechotou pridáva smite poškodenie.',
                          'Při třech armádách, když Bai Qi a Liu Che jdou každý jinam. Hector za pěchotou přidává smite poškození.')},
                {'primary': 'Scipio Africanus Prime', 'secondary': 'Liu Che',
                 'why': t('Tretia armáda. Úprava stromu Support a bonus z múzea vrátili Scipia do hry, no stále je podceňovaný.',
                          'Třetí armáda. Úprava stromu Support a bonus z muzea vrátily Scipia do hry, ale pořád je podceňovaný.')},
            ]),
            ('h2', t('Zostavy', 'Sestavy')),
            ('lineups', [
                (t('Dve armády', 'Dvě armády'), [('Sun Tzu Prime', 'Ivar the Boneless'), ('Bai Qi', 'Liu Che')]),
                (t('Tri armády', 'Tři armády'), [('Sun Tzu Prime', 'Ivar the Boneless'), ('Bai Qi', 'Hector'), ('Scipio Africanus Prime', 'Liu Che')]),
                (t('Tri, alternatíva', 'Tři, alternativa'), [('Sun Tzu Prime', 'Ivar the Boneless'), ('Bai Qi', 'Hector'), ('Liu Che', 'Philip II')]),
            ]),
            ('h2', t('Tipy', 'Tipy')),
            ('ul', [
                t('Sun Tzu Prime chce expertízu. Na 5511 má len asi 70 % sily.',
                  'Sun Tzu Prime chce expertízu. Na 5511 má jen asi 70 % síly.'),
                t('Do Williama Wallacea ani Vercingetorixa už neinvestuj. Wallace poslúži namiesto Ivara, ak ho už máš.',
                  'Do Williama Wallace ani Vercingetorixe už neinvestuj. Wallace poslouží místo Ivara, pokud ho už máš.'),
            ]),
            ('sources', [CH_INF, CH_LINEUPS, CH_KP, CH_INF_NEXT, CH_INVEST, ('AllClash: Sun Tzu Prime Builds', 'https://www.allclash.com/best-sun-tzu-prime-builds-talents-skill-order-pairing-equipment-in-rise-of-kingdoms/')]),
        ],
    },
    {
        'slug': 'pary-pre-lukostrelcov',
        'specialty': 'archer',
        'title': t('Páry commanderov pre lukostrelcov', 'Páry commanderů pro lučištníky'),
        'blocks': [
            ('p', t(
                'Lukostrelci na otvorené pole: Qin Shi Huang s Yi Seong-Gyem je najlepšia armáda v hre.',
                'Lučištníci na otevřené pole: Qin Shi Huang s Yi Seong-Gyem je nejlepší armáda ve hře.',
            )),
            ('note',),
            ('pairs', OPEN_FIELD, [
                {'primary': 'Qin Shi Huang', 'secondary': 'Yi Seong-Gye', 'talents': 'Archer + Versatility + Skill',
                 'why': t('Najlepšia armáda v hre. Podľa dát komunity má asi o 35 % lepší trade ako Qin so Zhuge Liangom.',
                          'Nejlepší armáda ve hře. Podle dat komunity má asi o 35 % lepší trade než Qin se Zhuge Liangem.')},
                {'primary': 'Qin Shi Huang', 'secondary': 'Zhuge Liang', 'talents': 'Archer + Versatility + Skill',
                 'why': t('Solídna druhá voľba namiesto Yi Seong-Gyeho – za Qina patrí jeden alebo druhý. Ciele zasiahnuté Zhugeovým skillom spôsobujú 3 sekundy o 15 % menej poškodenia.',
                          'Solidní druhá volba místo Yi Seong-Gyeho – za Qina patří jeden nebo druhý. Cíle zasažené Zhugeovým skillem způsobují 3 sekundy o 15 % méně poškození.')},
                {'primary': 'Hermann Prime', 'secondary': 'Alp Arslan', 'talents': 'Archer + Versatility + Support',
                 'why': t('Najlepšia druhá lukostrelecká armáda, hoci má negatívny trade (pod 90 %). Hermannove jedy s Alpom zvyšujú skill poškodenie, ktoré cieľ dostáva od Qina. Uvádza sa aj ako Alp Arslan + Hermann Prime.',
                          'Nejlepší druhá lučištnická armáda, i když má negativní trade (pod 90 %). Hermannovy jedy s Alpem zvyšují skill poškození, které cíl dostává od Qina. Uvádí se i jako Alp Arslan + Hermann Prime.')},
                {'primary': 'Qin Shi Huang', 'secondary': 'Shajar al-Durr',
                 'why': t('Veľmi výdržná armáda, silná hlavne v bojoch o oltáre. Shajar lieči a uzdraveným jednotkám pridá poškodenie bežného útoku.',
                          'Velmi výdržná armáda, silná hlavně v bojích o oltáře. Shajar léčí a uzdraveným jednotkám přidá poškození běžného útoku.')},
                {'primary': 'Zhuge Liang', 'secondary': 'Philip II',
                 'why': t('Len ako tretia lukostrelecká armáda. Philip pridá buffy a debuffy, armáda však má slabý trade (asi 64 %).',
                          'Jen jako třetí lučištnická armáda. Philip přidá buffy a debuffy, armáda ale má slabý trade (asi 64 %).')},
            ]),
            ('h2', t('Tipy', 'Tipy')),
            ('ul', [
                t('Pri piatich armádach stačí jedna lukostrelecká (Qin). Dve majú zmysel až pri šiestich: dve jazdecké, dve pešie a dve lukostrelecké.',
                  'Při pěti armádách stačí jedna lučištnická (Qin). Dvě mají smysl až při šesti: dvě jízdní, dvě pěší a dvě lučištnické.'),
                t('Do Alp Arslana nedávaj zlaté hlavy. Začiatkom roka 2027 sa čaká nový lukostrelecký commander s plošným útokom – šetri na neho.',
                  'Do Alp Arslana nedávej zlaté hlavy. Začátkem roku 2027 se čeká nový lučištnický commander s plošným útokem – šetři na něj.'),
            ]),
            ('sources', [CH_ARCH, CH_ARCH_NEXT, CH_LINEUPS, CH_INVEST, CH_KP]),
        ],
    },
    {
        'slug': 'pary-pre-garrison',
        'specialty': 'garrison',
        'title': t('Páry commanderov pre garrison', 'Páry commanderů pro garrison'),
        'blocks': [
            ('p', t(
                'Obrana mesta, vlajok a budov. Univerzálny garrison neexistuje – pár vyber podľa toho, či na teba chodia rally alebo swarm.',
                'Obrana města, vlajek a budov. Univerzální garrison neexistuje – pár vyber podle toho, jestli na tebe chodí rally nebo swarm.',
            )),
            ('note',),
            ('pairs', WITH_TROOPS, [
                {'primary': 'Gorgo', 'secondary': 'Tokugawa Ieyasu', 'troops': INF,
                 'why': t('Najlepšia obrana proti rally, hlavne s formáciou Pincer 2.0. Gorgo patrí vždy na primárny slot. Proti swarmu slabá.',
                          'Nejlepší obrana proti rally, hlavně s formací Pincer 2.0. Gorgo patří vždy na primární slot. Proti swarmu slabá.')},
                {'primary': 'Gorgo', 'secondary': 'Hector', 'troops': INF,
                 'why': t('Proti rally rovnako dobrá ako s Tokugawom a znesie aj trochu miešané posily, keď treba udržať vlajku.',
                          'Proti rally stejně dobrá jako s Tokugawou a snese i trochu smíšené posily, když je potřeba udržet vlajku.')},
                {'primary': 'Attila', 'secondary': 'David IV', 'troops': CAV,
                 'why': t('Najlepšia obrana proti swarmu a najuniverzálnejšia. Attilu sa nedá umlčať. Proti novým jazdeckým rally a pechote s Pincer 2.0 slabne.',
                          'Nejlepší obrana proti swarmu a nejuniverzálnější. Attilu nelze umlčet. Proti novým jízdním rally a pěchotě s Pincer 2.0 slábne.')},
                {'primary': 'Hayam Wuruk', 'secondary': 'Hector', 'troops': ARCH,
                 'why': t('Meta lukostrelecký garrison proti rally jeden na jedného, hlavne proti pechote. Proti swarmu a jazdeckým rally slabý.',
                          'Meta lučištnický garrison proti rally jeden na jednoho, hlavně proti pěchotě. Proti swarmu a jízdním rally slabý.')},
                {'primary': 'David IV', 'secondary': 'Hector', 'troops': CAV,
                 'why': t('Proti rally jeden na jedného, keď ti nehrozí swarm. David potrebuje sekundárneho s combo útokom.',
                          'Proti rally jeden na jednoho, když ti nehrozí swarm. David potřebuje sekundárního s combo útokem.')},
                {'primary': 'Gorgo', 'secondary': 'Charles Martel', 'troops': INF,
                 'why': t('Trestá swarm silným protiútokom, proti rally však prehráva.',
                          'Trestá swarm silným protiútokem, proti rally ale prohrává.')},
            ]),
            ('h2', t('Tipy', 'Tipy')),
            ('ul', [
                t('Swarm = veľa samostatných armád naraz na jeden cieľ. Dnes ho používajú kráľovstvá vo všetkých seedoch, preto maj v zálohe aj pár proti swarmu.',
                  'Swarm = hodně samostatných armád najednou na jeden cíl. Dnes ho používají království ve všech seedech, proto měj v záloze i pár proti swarmu.'),
                t('Alternatíva pre lukostrelcov: Hayam Wuruk + Choe Yeong lieči viac a obstojí aj proti swarmu.',
                  'Alternativa pro lučištníky: Hayam Wuruk + Choe Yeong léčí víc a obstojí i proti swarmu.'),
                t('Miešané garrisony (napríklad s Heracliom) dnes rýchlo padajú.',
                  'Smíšené garrisony (například s Heracliem) dnes rychle padají.'),
                t('V KvK s artefaktmi je najlepšia Gorgo + David IV s formáciou Arch.',
                  'V KvK s artefakty je nejlepší Gorgo + David IV s formací Arch.'),
            ]),
            ('sources', [CH_SWARM, CH_GARRISON, CH_LEADERSHIP, CH_RALLY]),
        ],
    },
    {
        'slug': 'pary-pre-rally',
        'specialty': 'conquering',
        'title': t('Páry commanderov pre rally', 'Páry commanderů pro rally'),
        'blocks': [
            ('p', t(
                'Útoky na pevnosti, vlajky a mestá. Rally páry stoja na talentoch Conquering a s Williamom Marshalom je opäť silný aj jazdecký rally.',
                'Útoky na pevnosti, vlajky a města. Rally páry stojí na talentech Conquering a s Williamem Marshalem je opět silný i jízdní rally.',
            )),
            ('note',),
            ('pairs', WITH_TROOPS, [
                {'primary': 'Subutai', 'secondary': 'William Marshal', 'troops': CAV,
                 'why': t('Prvý skutočný combo pár na jazdecký rally. V testoch porazil lukostrelecké garrisony aj David IV + Hector, proti Gorgo + Tokugawa skončil zhruba nerozhodne.',
                          'První skutečný combo pár na jízdní rally. V testech porazil lučištnické garrisony i David IV + Hector, proti Gorgo + Tokugawa skončil zhruba nastejno.')},
                {'primary': 'Attila', 'secondary': 'William Marshal', 'troops': CAV,
                 'why': t('Na protiútoky a ciele, na ktoré ide swarm. Silný proti lukostreleckým garrisonom (Hayam Wuruk), proti Gorgovi a David IV + Hector slabší.',
                          'Na protiútoky a cíle, na které jde swarm. Silný proti lučištnickým garrisonům (Hayam Wuruk), proti Gorgovi a David IV + Hector slabší.')},
                {'primary': 'Attila', 'secondary': 'Subutai', 'troops': CAV,
                 'why': t('Staršia osvedčená voľba na jazdecký rally.',
                          'Starší osvědčená volba pro jízdní rally.')},
                {'primary': 'Ivar the Boneless', 'secondary': 'Bai Qi', 'troops': INF,
                 'why': t('Ivar má efekty proti combu a proti jazde, Bai Qi pridá plošné poškodenie. Funguje aj Sun Tzu Prime + Ivar.',
                          'Ivar má efekty proti combu a proti jízdě, Bai Qi přidá plošné poškození. Funguje i Sun Tzu Prime + Ivar.')},
                {'primary': 'Nebuchadnezzar II', 'secondary': 'Gilgamesh', 'troops': ARCH,
                 'why': t('Gilgamesh znižuje liečenie a obranu cieľa, takže rozbije garrison postavený na liečení.',
                          'Gilgamesh snižuje léčení a obranu cíle, takže rozbije garrison postavený na léčení.')},
            ]),
            ('h2', t('Tipy', 'Tipy')),
            ('ul', [
                t('Rally commander dostáva talenty Conquering, pri jazde Cavalry + Conquering + Combo.',
                  'Rally commander dostává talenty Conquering, u jízdy Cavalry + Conquering + Combo.'),
                t('William Marshal pri útoku na mesto alebo pevnosť spôsobí lukostrelcom o 25 % viac poškodenia a sám dostáva o 10 % menej.',
                  'William Marshal při útoku na město nebo pevnost způsobí lučištníkům o 25 % víc poškození a sám dostává o 10 % méně.'),
                t('Ivan IV sa na rally nehodí, všetky jeho skilly fungujú len v poli.',
                  'Ivan IV se na rally nehodí, všechny jeho skilly fungují jen v poli.'),
            ]),
            ('sources', [CH_RALLY, CH_MARSHAL_RALLY, CH_IVAN, AC_TIERS, ('AllClash: William Marshal Builds (08/2026)', 'https://www.allclash.com/best-william-marshal-builds-talent-tree-skill-order-best-pairing-in-rise-of-kingdoms/')]),
        ],
    },
    {
        'slug': 'pary-na-barbarov-a-pevnosti',
        'specialty': 'peacekeeping',
        'title': t('Páry commanderov na barbarov a pevnosti', 'Páry commanderů na barbary a pevnosti'),
        'blocks': [
            ('p', t(
                'PvE páry na barbarov, barbarské pevnosti a levelovanie commanderov. Väčšina je dostupná aj bez míňania peňazí.',
                'PvE páry na barbary, barbarské pevnosti a levelování commanderů. Většina je dostupná i bez utrácení peněz.',
            )),
            ('note',),
            ('pairs', WITH_TROOPS, [
                {'primary': 'Minamoto', 'secondary': 'Cao Cao', 'troops': t('pevnosti', 'pevnosti'),
                 'why': t('Peacekeeping talenty a silný úder na jeden cieľ. Najlacnejší legendárny commander, investuj však len pred Season of Conquest.',
                          'Peacekeeping talenty a silný úder na jeden cíl. Nejlevnější legendární commander, investuj ale jen před Season of Conquest.')},
                {'primary': 'Boudica', 'secondary': 'Aethelflaed', 'troops': t('pevnosti aj barbari', 'pevnosti i barbaři'),
                 'why': t('Silné skilly a bonusy proti barbarom. Aethelflaed kúpiš v obchode Expedície.',
                          'Silné skilly a bonusy proti barbarům. Aethelflaed koupíš v obchodě Expedice.')},
                {'primary': 'Belisarius', 'secondary': 'Cao Cao', 'troops': t('pevnosti aj barbari', 'pevnosti i barbaři'),
                 'why': t('Lacná a rýchla jazdecká voľba.',
                          'Levná a rychlá jízdní volba.')},
                {'primary': 'Aethelflaed', 'secondary': 'Lohar', 'troops': t('barbari, levelovanie', 'barbaři, levelování'),
                 'why': t('Lohar dáva +35 % poškodenia barbarom a +70 % EXP. Nechaj ho na sekundárnom slote, Aethelflaed má lepší talentový strom.',
                          'Lohar dává +35 % poškození barbarům a +70 % EXP. Nech ho na sekundárním slotu, Aethelflaed má lepší talentový strom.')},
                {'primary': 'Boudica', 'secondary': 'Lohar', 'troops': t('barbari', 'barbaři'),
                 'why': t('Boudica obnovuje rage a lieči, vydrží dlhé série útokov.',
                          'Boudica obnovuje rage a léčí, vydrží dlouhé série útoků.')},
                {'primary': 'Yi Seong-Gye', 'secondary': t('ktokoľvek', 'kdokoli'), 'troops': t('barbari', 'barbaři'),
                 'why': t('Kruhový plošný útok zasiahne viac barbarov za cenu jedného útoku.',
                          'Kruhový plošný útok zasáhne víc barbarů za cenu jednoho útoku.')},
            ]),
            ('h2', t('Tipy', 'Tipy')),
            ('ul', [
                t('Talenty Peacekeeping znižujú cenu AP za útok na barbarov.',
                  'Talenty Peacekeeping snižují cenu AP za útok na barbary.'),
                t('Commandera, ktorého práve levelíš, daj na sekundárny slot.',
                  'Commandera, kterého právě levelíš, dej na sekundární slot.'),
                t('Lohara získaš z eventu Lohar’s Trial.',
                  'Lohara získáš z eventu Lohar’s Trial.'),
                t('Zlaté hlavy nemíňaj na commanderov, ktorí slúžia len na pevnosti.',
                  'Zlaté hlavy neutrácej za commandery, kteří slouží jen na pevnosti.'),
            ]),
            ('sources', [AC_TIERS, ('Heaven Guardian: Barbarians and Forts Guide (10/2026)', 'https://heaven-guardian.com/rise-of-kingdoms-dominate-barbarians-forts-guide/'), ('Rise of Kingdoms Guides: Lohar', 'https://riseofkingdomsguides.com/talent-tree/lohar/')]),
        ],
    },
    {
        'slug': 'pary-pre-f2p-a-zaciatok',
        'title': t('Páry commanderov pre F2P a začiatok hry', 'Páry commanderů pro F2P a začátek hry'),
        'blocks': [
            ('p', t(
                'Páry bez zlatých hláv a veľkých nákupov, s ktorými prežiješ prvé KvK. Neskôr ich nahradia legendárni commanderi.',
                'Páry bez zlatých hlav a velkých nákupů, se kterými přežiješ první KvK. Později je nahradí legendární commandeři.',
            )),
            ('note',),
            ('pairs', ['primary', 'secondary', 'troops', 'why'], [
                {'primary': 'Sun Tzu', 'secondary': 'Aethelflaed', 'troops': INF,
                 'why': t('Plošné debuffy a Sun Tzuove plošné skilly. Aethelflaed z obchodu Expedície, Sun Tzu je epický.',
                          'Plošné debuffy a Sun Tzuovy plošné skilly. Aethelflaed z obchodu Expedice, Sun Tzu je epický.')},
                {'primary': 'Bjorn Ironside', 'secondary': 'Sun Tzu', 'troops': INF,
                 'why': t('Najdostupnejší PvP pár na začiatok, dvaja epickí commanderi. Bjorn spraví cieľ zraniteľnejším a Sun Tzu udrie silnejšie.',
                          'Nejdostupnější PvP pár na začátek, dva epičtí commandeři. Bjorn udělá cíl zranitelnějším a Sun Tzu udeří silněji.')},
                {'primary': 'Charles Martel', 'secondary': 'Sun Tzu', 'troops': INF,
                 'why': t('Odolný Martel a plošné poškodenie Sun Tzua. Silné v KvK1–2, investuj len pred Season of Conquest.',
                          'Odolný Martel a plošné poškození Sun Tzua. Silné v KvK1–2, investuj jen před Season of Conquest.')},
                {'primary': 'Richard', 'secondary': 'Joan of Arc', 'troops': INF,
                 'why': t('Odolná armáda na pole. Epická Joan of Arc pridá krátke buffy a rage.',
                          'Odolná armáda na pole. Epická Joan of Arc přidá krátké buffy a rage.')},
                {'primary': 'Pelagius', 'secondary': 'Baibars', 'troops': CAV,
                 'why': t('Lacná jazda na začiatok z epických commanderov.',
                          'Levná jízda na začátek z epických commanderů.')},
                {'primary': 'Yi Seong-Gye', 'secondary': 'Imhotep / El Cid', 'troops': ARCH,
                 'why': t('Yi Seong-Gye je dlhodobá investícia použiteľná v každej fáze KvK a neskôr sekunduje Qin Shi Huangovi.',
                          'Yi Seong-Gye je dlouhodobá investice použitelná v každé fázi KvK a později sekunduje Qin Shi Huangovi.')},
            ]),
            ('h2', t('Na koho sa sústrediť podľa fázy KvK', 'Na koho se soustředit podle fáze KvK')),
            ('lineups', [
                ('KvK1', [('Sun Tzu',), ('Yi Seong-Gye',), ('Richard',), ('Charles Martel',)]),
                ('KvK2', [('Alexander the Great',), ('Saladin',), ('Yi Seong-Gye',), ('Charles Martel',)]),
                ('KvK3', [('Alexander the Great',), ('Yi Seong-Gye',), ('Saladin',), ('Edward of Woodstock',)]),
            ]),
            ('sources', [LD_PAIRS, ('LootBar: KvK Tier List 2026', 'https://www.lootbar.com/blog/en/rise-of-kingdoms-2026-kvk-tier-list.html'), RKG_PAIRS]),
        ],
    },
    {
        'slug': 'pary-na-zber-surovin',
        'specialty': 'gathering',
        'title': t('Páry commanderov na zber surovín', 'Páry commanderů na sběr surovin'),
        'blocks': [
            ('p', t(
                'Zberači pre hlavný účet aj farmy. Najviac prinesú tí, ktorí po dokončení zberu pridajú suroviny navyše. Na zber posielaj obliehacie jednotky.',
                'Sběrači pro hlavní účet i farmy. Nejvíc přinesou ti, kteří po dokončení sběru přidají suroviny navíc. Na sběr posílej obléhací jednotky.',
            )),
            ('note',),
            ('pairs', ['primary', 'secondary', 'why'], [
                # Gether: highlight commanders with extra resources after gathering (skills checked on rokstats, 10/2026)
                {'primary': 'Constance', 'secondary': 'Matilda of Flanders',
                 'why': t('Obe pridajú suroviny navyše po dokončení zberu: Constance až 10 % (skill Queen of Sicily na 5. leveli), Matilda 10 % z expertízy. Constance kúpiš v obchode Expedície.',
                          'Obě přidají suroviny navíc po dokončení sběru: Constance až 10 % (skill Queen of Sicily na 5. levelu), Matilda 10 % z expertízy. Constance koupíš v obchodě Expedice.')},
                {'primary': 'Pepin III', 'secondary': 'Seondeok',
                 'why': t('Legendárni zberači, obaja s expertízou dávajú +10 % surovín po dokončení zberu. Seondeok pridá obliehacím jednotkám +30 % nosnosť.',
                          'Legendární sběrači, oba s expertízou dávají +10 % surovin po dokončení sběru. Seondeok přidá obléhacím jednotkám +30 % nosnost.')},
                {'primary': 'Casimir III', 'secondary': t('ktokoľvek', 'kdokoli'),
                 'why': t('+20 % rýchlosť zberu, navyše na zlate, a +15 % kapacita.',
                          '+20 % rychlost sběru, navíc na zlatě, a +15 % kapacita.')},
                {'primary': 'Yahya ibn Khalid', 'secondary': t('ktokoľvek', 'kdokoli'),
                 'why': t('Najnovší zberač (júl 2026) zameraný na zlato.',
                          'Nejnovější sběrač (červenec 2026) zaměřený na zlato.')},
            ]),
            ('h2', t('Tipy', 'Tipy')),
            ('ul', [
                t('Zberača dostaň aspoň na level 37 – odomkne sa talent Superior Tools (približne +25 % rýchlosť zberu).',
                  'Sběrače dostaň aspoň na level 37 – odemkne se talent Superior Tools (přibližně +25 % rychlost sběru).'),
                t('Skill na suroviny navyše po zbere majú len Constance, Matilda of Flanders, Pepin III a Seondeok. Cleopatra, Ishida, Yahya ani Casimir tento skill nemajú.',
                  'Skill na suroviny navíc po sběru mají jen Constance, Matilda of Flanders, Pepin III a Seondeok. Cleopatra, Ishida, Yahya ani Casimir tento skill nemají.'),
                t('Talent The More The Better v strome Gathering pridáva suroviny po zbere každému zberačovi.',
                  'Talent The More The Better ve stromu Gathering přidává suroviny po sběru každému sběrači.'),
            ]),
            ('sources', [AC_TIERS, ('ROK Stats: Commanders (skilly z herného klienta, 10/2026)', 'https://app.rokstats.online/commanders'),
                         ('Rise of Kingdoms Guides: Farming and Gathering', 'https://riseofkingdomsguides.com/farminggathering-guide/'), ('AllClash: Yahya ibn Khalid Builds (07/2026)', 'https://www.allclash.com/best-yahya-ibn-khalid-builds-talent-tree-skill-order-best-pairing-in-rise-of-kingdoms/')]),
        ],
    },
]
