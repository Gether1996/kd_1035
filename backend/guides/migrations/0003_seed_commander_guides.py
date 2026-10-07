"""Commander pairing guides – meta as of October 2026, written from the public sources listed in each guide.

Creates only guides whose slug does not exist yet, so edits made later in the admin are never overwritten.
"""

from django.db import migrations


def t(sk, cs):
    return {'sk': sk, 'cs': cs}


LABELS = {
    'sk': {
        'primary': 'Primárny', 'secondary': 'Sekundárny', 'pair': 'Primárny + sekundárny', 'troops': 'Jednotky',
        'why': 'Prečo to funguje', 'talents': 'Talenty', 'f2p': 'F2P', 'yes': 'áno', 'partly': 'čiastočne', 'no': 'nie',
        'sources': 'Zdroje',
        'note': 'Stav k októbru 2026. Meta sa mení s každou fázou KvK aj s novými commandermi.',
    },
    'cs': {
        'primary': 'Primární', 'secondary': 'Sekundární', 'pair': 'Primární + sekundární', 'troops': 'Jednotky',
        'why': 'Proč to funguje', 'talents': 'Talenty', 'f2p': 'F2P', 'yes': 'ano', 'partly': 'částečně', 'no': 'ne',
        'sources': 'Zdroje',
        'note': 'Stav k říjnu 2026. Meta se mění s každou fází KvK i s novými commandery.',
    },
}  # fmt: skip

CAV = t('jazda', 'jízda')
INF = t('pechota', 'pěchota')
ARCH = t('lukostrelci', 'lučištníci')
MIX = t('mix', 'mix')

AC_PAIRS = ('AllClash: Best Commander Pairings (08/2026)', 'https://www.allclash.com/best-commander-pairings-defense-rally-open-field-canyon-barbarians/')
AC_TIERS = ('AllClash: Commander Tier List (09/2026)', 'https://www.allclash.com/best-commanders-tier-list-in-rise-of-kingdoms-with-talents/')
LD_PAIRS = ('LDShop: Best Commander Pairings (08/2026)', 'https://www.ldshop.gg/blog/rise-of-kingdoms/best-commander-pairings.html')
RKG_PAIRS = ('Rise of Kingdoms Guides: Commander Pairings', 'https://riseofkingdomsguides.com/guides/commander-pairings/')


def text(value, lang):
    return value[lang] if isinstance(value, dict) else value


def render(blocks, lang):
    labels = LABELS[lang]
    html = []
    for block in blocks:
        kind = block[0]
        if kind == 'p':
            html.append(f'<p>{block[1][lang]}</p>')
        elif kind == 'note':
            html.append(f'<blockquote>{labels["note"]}</blockquote>')
        elif kind == 'h2':
            html.append(f'<h2>{block[1][lang]}</h2>')
        elif kind == 'ul':
            html.append('<ul>' + ''.join(f'<li>{item[lang]}</li>' for item in block[1]) + '</ul>')
        elif kind == 'pairs' and 'why' not in block[1]:
            # short overview: one value per column
            columns, rows = block[1], block[2]
            head = ''.join(f'<th scope="col">{labels[c]}</th>' for c in columns)
            body = []
            for row in rows:
                cells = [text(row[c], lang) for c in columns]
                cells = [f'<td><strong>{v}</strong></td>' if c == 'primary' else f'<td>{v}</td>' for c, v in zip(columns, cells)]
                body.append('<tr>' + ''.join(cells) + '</tr>')
            html.append(f'<table><thead><tr>{head}</tr></thead><tbody>{"".join(body)}</tbody></table>')
        elif kind == 'pairs':
            # pair, troops and talents are folded into two cells so the table stays readable on phones
            columns, rows = block[1], block[2]
            head = f'<th scope="col">{labels["pair"]}</th><th scope="col">{labels["why"]}</th>'
            if 'f2p' in columns:
                head += f'<th scope="col">{labels["f2p"]}</th>'
            body = []
            for row in rows:
                pair = f'<strong>{row["primary"]}</strong> + {text(row["secondary"], lang)}'
                if 'troops' in columns:
                    pair += f'<br><small>{text(row["troops"], lang)}</small>'
                why = text(row['why'], lang)
                if 'talents' in columns:
                    why += f'<br><small>{labels["talents"]}: {row["talents"]}</small>'
                cells = f'<td>{pair}</td><td>{why}</td>'
                if 'f2p' in columns:
                    cells += f'<td>{labels[row["f2p"]]}</td>'
                body.append(f'<tr>{cells}</tr>')
            html.append(f'<table><thead><tr>{head}</tr></thead><tbody>{"".join(body)}</tbody></table>')
        elif kind == 'sources':
            html.append(f'<h2>{labels["sources"]}</h2>')
            links = ''.join(f'<li><a href="{url}" target="_blank" rel="noopener noreferrer">{label}</a></li>' for label, url in block[1])
            html.append(f'<ul>{links}</ul>')
    # typographic apostrophes (Lohar’s Trial); attributes use double quotes
    return '\n'.join(html).replace("'", '’')


OPEN_FIELD = ['primary', 'secondary', 'why', 'talents', 'f2p']
WITH_TROOPS = ['primary', 'secondary', 'troops', 'why', 'f2p']

GUIDES = [
    {
        'slug': 'ako-skladat-pary-commanderov',
        'title': t('Ako skladať páry commanderov', 'Jak skládat páry commanderů'),
        'blocks': [
            ('p', t(
                'Primárny commander dáva armáde talenty, výbavu aj kapacitu jednotiek, sekundárny prispieva skillmi. '
                'Pravidlá, podľa ktorých sa oplatí páry skladať a investovať.',
                'Primární commander dává armádě talenty, výbavu i kapacitu jednotek, sekundární přispívá skilly. '
                'Pravidla, podle kterých se vyplatí páry skládat a investovat.',
            )),
            ('note',),
            ('h2', t('Rýchly prehľad', 'Rychlý přehled')),
            ('pairs', ['troops', 'primary', 'secondary'], [
                {'troops': t('Jazda – pole', 'Jízda – pole'), 'primary': 'Arthur Pendragon', 'secondary': 'Achilles'},
                {'troops': t('Pechota – pole', 'Pěchota – pole'), 'primary': 'Sun Tzu Prime', 'secondary': 'Bai Qi'},
                {'troops': t('Lukostrelci – pole', 'Lučištníci – pole'), 'primary': 'Qin Shi Huang', 'secondary': 'Zhuge Liang'},
                {'troops': t('Garnizóna', 'Garnizona'), 'primary': 'Tokugawa Ieyasu', 'secondary': 'Gorgo'},
                {'troops': t('Rally', 'Rally'), 'primary': 'William Marshal', 'secondary': 'Subutai'},
                {'troops': t('Barbari a pevnosti', 'Barbaři a pevnosti'), 'primary': 'Minamoto', 'secondary': 'Cao Cao'},
                {'troops': t('F2P začiatok', 'F2P začátek'), 'primary': 'Sun Tzu', 'secondary': 'Aethelflaed'},
                {'troops': t('Zber surovín', 'Sběr surovin'), 'primary': 'Constance', 'secondary': 'Sarka'},
            ]),
            ('h2', t('Pravidlá', 'Pravidla')),
            ('ul', [
                t('<strong>Primárny slot</strong> patrí commanderovi, do ktorého máš najviac investované. Rátajú sa len jeho talenty a výbava a jeho level určuje kapacitu jednotiek.',
                  '<strong>Primární slot</strong> patří commanderovi, do kterého máš nejvíc investováno. Počítají se jen jeho talenty a výbava a jeho level určuje kapacitu jednotek.'),
                t('<strong>Sekundárny</strong> prispieva skillmi. Niektorí commanderi sú stavaní iba ako sekundárni (Subutai, William Marshal, Imhotep) a ako primárni strácajú.',
                  '<strong>Sekundární</strong> přispívá skilly. Někteří commandeři jsou stavění jen jako sekundární (Subutai, William Marshal, Imhotep) a jako primární ztrácejí.'),
                t('<strong>Skilly:</strong> najprv 5511, potom 5555, expertíza až nakoniec. Napríklad Sun Tzu Prime má na 5511 len asi 70 % svojej sily.',
                  '<strong>Skilly:</strong> nejdřív 5511, potom 5555, expertíza až nakonec. Například Sun Tzu Prime má na 5511 jen asi 70 % své síly.'),
                t('<strong>Jeden pár naplno</strong> je viac ako tri rozrobené. Hotový starší pár nerozbíjaj kvôli napoly rozbehnutému novému commanderovi.',
                  '<strong>Jeden pár naplno</strong> je víc než tři rozdělané. Hotový starší pár nerozbíjej kvůli napůl rozjetému novému commanderovi.'),
                t('<strong>Typ jednotiek musí sedieť.</strong> Výnimkou sú leadership commanderi (Philip II, Hector), Philip II z miešaných jednotiek dokonca ťaží.',
                  '<strong>Typ jednotek musí sedět.</strong> Výjimkou jsou leadership commandeři (Philip II, Hector), Philip II ze smíšených jednotek dokonce těží.'),
                t('<strong>Tier list nie je investičná rada.</strong> Niektorí starší commanderi sa oplatia len pred Season of Conquest (KvK4) a meta sa mení s každou fázou KvK.',
                  '<strong>Tier list není investiční rada.</strong> Někteří starší commandeři se vyplatí jen před Season of Conquest (KvK4) a meta se mění s každou fází KvK.'),
                t('<strong>Výbava a technológie</strong> často prevážia tier. Dobre vybavený slabší pár porazí zle vybavený top pár.',
                  '<strong>Výbava a technologie</strong> často převáží tier. Dobře vybavený slabší pár porazí špatně vybavený top pár.'),
                t('<strong>Zlaté hlavy</strong> (univerzálne legendárne sochy) nemíňaj na commanderov len na PvE alebo občasný rally či garnizónu.',
                  '<strong>Zlaté hlavy</strong> (univerzální legendární sochy) neutrácej za commandery jen na PvE nebo občasný rally či garnizonu.'),
                t('<strong>Plánuj podľa počtu armád.</strong> Dvaja prémioví commanderi, ktorí vedia viesť vlastnú armádu, nemajú sedieť v jednej.',
                  '<strong>Plánuj podle počtu armád.</strong> Dva prémioví commandeři, kteří umí vést vlastní armádu, nemají sedět v jedné.'),
            ]),
            ('sources', [AC_PAIRS, AC_TIERS, LD_PAIRS]),
        ],
    },
    {
        'slug': 'pary-pre-jazdu',
        'title': t('Páry commanderov pre jazdu', 'Páry commanderů pro jízdu'),
        'blocks': [
            ('p', t(
                'Najsilnejšie jazdecké armády na otvorené pole v aktuálnej mete. Všetko sa točí okolo Arthura Pendragona a combo útokov.',
                'Nejsilnější jízdní armády na otevřené pole v aktuální metě. Všechno se točí kolem Arthura Pendragona a combo útoků.',
            )),
            ('note',),
            ('pairs', OPEN_FIELD, [
                {'primary': 'Arthur Pendragon', 'secondary': 'Achilles', 'talents': 'Combo + Cavalry', 'f2p': 'no',
                 'why': t('Arthur výrazne zvyšuje šancu na combo, takže Achillov plošný útok na päť cieľov sa spúšťa stále dookola. Najistejšia top jazda.',
                          'Arthur výrazně zvyšuje šanci na combo, takže Achillův plošný útok na pět cílů se spouští pořád dokola. Nejjistější top jízda.')},
                {'primary': 'Arthur Pendragon', 'secondary': 'Ivan IV', 'talents': 'Combo + Cavalry', 'f2p': 'no',
                 'why': t('Ivan IV (august 2026) pridáva stabilné combo poškodenie a môže Achilla nahradiť. Časť zdrojov dáva Ivana na primárny slot.',
                          'Ivan IV (srpen 2026) přidává stabilní combo poškození a může Achilla nahradit. Část zdrojů dává Ivana na primární slot.')},
                {'primary': 'Ivan IV', 'secondary': 'Achilles', 'talents': 'Cavalry + Combo', 'f2p': 'no',
                 'why': t('Keď Arthur chýba alebo vedie inú armádu. Achilles je pre Ivana najlepší partner.',
                          'Když Arthur chybí nebo vede jinou armádu. Achilles je pro Ivana nejlepší partner.')},
                {'primary': 'Achilles', 'secondary': 'Gang Gamchan', 'talents': 'Cavalry + Combo', 'f2p': 'no',
                 'why': t('Druhá jazdecká armáda. Achillove plošné comba spúšťajú Gangovo liečenie a Gang dodá odolnosť, ktorá Achillovi chýba.',
                          'Druhá jízdní armáda. Achillova plošná comba spouštějí Gangovo léčení a Gang dodá odolnost, která Achillovi chybí.')},
                {'primary': 'Gang Gamchan', 'secondary': 'William Marshal', 'talents': 'Cavalry + Combo', 'f2p': 'no',
                 'why': t('Silná proti jednému cieľu. Meta okolo nej sa ešte ustaľuje.',
                          'Silná proti jednomu cíli. Meta kolem ní se ještě ustaluje.')},
            ]),
            ('h2', t('Tipy', 'Tipy')),
            ('ul', [
                t('Na Arthurovi ide hlavná investícia do stromu Combo, potom Cavalry.',
                  'Na Arthurovi jde hlavní investice do stromu Combo, potom Cavalry.'),
                t('Ivan IV: útočne talent „A Good Day to Die“, obranne „Impenetrable“.',
                  'Ivan IV: útočně talent „A Good Day to Die“, obranně „Impenetrable“.'),
                t('Staršia meta Alexander Nevsky + Joan of Arc Prime (2024–25) stále funguje, ak ju máš dotiahnutú. Nové investície však patria Arthurovi.',
                  'Starší meta Alexander Nevsky + Joan of Arc Prime (2024–25) pořád funguje, pokud ji máš dotaženou. Nové investice ale patří Arthurovi.'),
            ]),
            ('sources', [AC_PAIRS, AC_TIERS, ('AllClash: Ivan IV Builds (08/2026)', 'https://www.allclash.com/best-ivan-iv-builds-talent-tree-skill-order-best-pairing-in-rise-of-kingdoms/')]),
        ],
    },
    {
        'slug': 'pary-pre-pechotu',
        'title': t('Páry commanderov pre pechotu', 'Páry commanderů pro pěchotu'),
        'blocks': [
            ('p', t(
                'Pechota na otvorené pole stojí v aktuálnej mete na Sun Tzu Prime a smite poškodení Bai Qiho.',
                'Pěchota na otevřené pole stojí v aktuální metě na Sun Tzu Prime a smite poškození Bai Qiho.',
            )),
            ('note',),
            ('pairs', OPEN_FIELD, [
                {'primary': 'Sun Tzu Prime', 'secondary': 'Bai Qi', 'talents': 'Infantry + Versatility + Smite', 'f2p': 'no',
                 'why': t('Sun Tzu Prime potrebuje na aktívny skill len 900 rage namiesto 1000 a ku každému smite úderu Bai Qiho pridá plošné poškodenie.',
                          'Sun Tzu Prime potřebuje na aktivní skill jen 900 rage místo 1000 a ke každému smite úderu Bai Qiho přidá plošné poškození.')},
                {'primary': 'Sun Tzu Prime', 'secondary': 'Liu Che', 'talents': 'Infantry + Versatility + Smite', 'f2p': 'no',
                 'why': t('Rovnaký princíp, keď Bai Qi vedie inú armádu. Liu Che pridá plošné poškodenie.',
                          'Stejný princip, když Bai Qi vede jinou armádu. Liu Che přidá plošné poškození.')},
                {'primary': 'Bai Qi', 'secondary': 'Liu Che', 'talents': 'Infantry + Versatility + Smite', 'f2p': 'no',
                 'why': t('Silný plošný smite, spomalenia, debuffy a rýchly rage.',
                          'Silný plošný smite, zpomalení, debuffy a rychlý rage.')},
                {'primary': 'Sun Tzu Prime', 'secondary': 'William Wallace', 'talents': 'Infantry + Smite', 'f2p': 'no',
                 'why': t('Wallaceov kit je postavený priamo tak, aby Sun Tzu Prime vynikol.',
                          'Wallaceův kit je postavený přímo tak, aby Sun Tzu Prime vynikl.')},
                {'primary': 'Scipio Africanus Prime', 'secondary': 'Ragnar Prime', 'talents': 'Infantry', 'f2p': 'no',
                 'why': t('Doplnková armáda pre veľké účty so 7 pochodmi. Ragnar Prime patrí medzi silné voľby aktuálnej mety.',
                          'Doplňková armáda pro velké účty se 7 pochody. Ragnar Prime patří mezi silné volby aktuální mety.')},
            ]),
            ('h2', t('Tipy', 'Tipy')),
            ('ul', [
                t('Sun Tzu Prime chce expertízu. Na 5511 má len asi 70 % sily.',
                  'Sun Tzu Prime chce expertízu. Na 5511 má jen asi 70 % síly.'),
                t('Staršia meta Liu Che + Scipio Africanus Prime (2024–25) je dnes skôr okrajová.',
                  'Starší meta Liu Che + Scipio Africanus Prime (2024–25) je dnes spíš okrajová.'),
            ]),
            ('sources', [AC_PAIRS, AC_TIERS, ('AllClash: Sun Tzu Prime Builds', 'https://www.allclash.com/best-sun-tzu-prime-builds-talents-skill-order-pairing-equipment-in-rise-of-kingdoms/')]),
        ],
    },
    {
        'slug': 'pary-pre-lukostrelcov',
        'title': t('Páry commanderov pre lukostrelcov', 'Páry commanderů pro lučištníky'),
        'blocks': [
            ('p', t(
                'Lukostrelci na otvorené pole: Qin Shi Huang ako najsilnejšia samostatná armáda a Hermann Prime s Alp Arslanom ako druhá.',
                'Lučištníci na otevřené pole: Qin Shi Huang jako nejsilnější samostatná armáda a Hermann Prime s Alp Arslanem jako druhá.',
            )),
            ('note',),
            ('pairs', OPEN_FIELD, [
                {'primary': 'Qin Shi Huang', 'secondary': 'Zhuge Liang', 'talents': 'Archer + Versatility + Skill', 'f2p': 'no',
                 'why': t('Qin mení rage na plošné poškodenie, Zhuge Liang pridá ďalšie plošné poškodenie aj rage. Iba s lukostrelcami.',
                          'Qin mění rage na plošné poškození, Zhuge Liang přidá další plošné poškození i rage. Jen s lučištníky.')},
                {'primary': 'Hermann Prime', 'secondary': 'Alp Arslan', 'talents': 'Archer + Versatility + Support', 'f2p': 'no',
                 'why': t('Hermannove jedy a zníženie obrany sú presne to, čo Alp Arslan šíri na ďalšie ciele. Časť zdrojov dáva Alpa na primárny slot.',
                          'Hermannovy jedy a snížení obrany jsou přesně to, co Alp Arslan šíří na další cíle. Část zdrojů dává Alpa na primární slot.')},
                {'primary': 'Qin Shi Huang', 'secondary': 'Yi Seong-Gye', 'talents': 'Archer + Versatility + Skill', 'f2p': 'partly',
                 'why': t('Lacnejšia verzia jednotky, ktorá uvoľní Zhuge Lianga do inej armády.',
                          'Levnější verze jedničky, která uvolní Zhuge Lianga do jiné armády.')},
                {'primary': 'Alp Arslan', 'secondary': 'Zhuge Liang', 'talents': 'Archer + Skill', 'f2p': 'no',
                 'why': t('Ak nemáš Qin Shi Huanga. Veľa poškodenia, no Qin + Zhuge je lepší.',
                          'Pokud nemáš Qin Shi Huanga. Hodně poškození, ale Qin + Zhuge je lepší.')},
                {'primary': 'Hermann Prime', 'secondary': 'Yi Seong-Gye', 'talents': 'Archer + Versatility', 'f2p': 'partly',
                 'why': t('Starší lacnejší plošný pár. Silný vo veľkých bitkách, slabší jeden na jedného.',
                          'Starší levnější plošný pár. Silný ve velkých bitvách, slabší jeden na jednoho.')},
            ]),
            ('h2', t('Tipy', 'Tipy')),
            ('ul', [
                t('Pre Qin Shi Huanga aj Alp Arslana je ideálnym cieľom 5555.',
                  'Pro Qin Shi Huanga i Alp Arslana je ideálním cílem 5555.'),
                t('Staršia meta Zhuge Liang + Hermann Prime (2024–25) je dnes prekonaná dvojicami vyššie.',
                  'Starší meta Zhuge Liang + Hermann Prime (2024–25) je dnes překonaná dvojicemi výše.'),
            ]),
            ('sources', [AC_PAIRS, AC_TIERS, ('AllClash: Alp Arslan Builds (05/2026)', 'https://www.allclash.com/best-alp-arslan-builds-talent-tree-skill-order-best-pairing-in-rise-of-kingdoms/')]),
        ],
    },
    {
        'slug': 'pary-leadership-a-mix',
        'title': t('Páry commanderov pre leadership a mix', 'Páry commanderů pro leadership a mix'),
        'blocks': [
            ('p', t(
                'Leadership commanderi posilňujú akékoľvek jednotky a hodia sa ako doplnok do štvrtej až siedmej armády.',
                'Leadership commandeři posilují jakékoli jednotky a hodí se jako doplněk do čtvrté až sedmé armády.',
            )),
            ('note',),
            ('pairs', WITH_TROOPS, [
                {'primary': 'Liu Che', 'secondary': 'Philip II', 'troops': INF, 'f2p': 'no',
                 'why': t('Philip II zosilní všetko poškodenie a funguje s každým meta commanderom.',
                          'Philip II zesílí veškeré poškození a funguje s každým meta commanderem.')},
                {'primary': 'Philip II', 'secondary': 'Bai Qi', 'troops': MIX, 'f2p': 'no',
                 'why': t('Philip z miešaných jednotiek ťaží a Bai Qi pridá plošný smite.',
                          'Philip ze smíšených jednotek těží a Bai Qi přidá plošný smite.')},
                {'primary': 'Philip II', 'secondary': 'Ragnar Prime', 'troops': MIX, 'f2p': 'no',
                 'why': t('Najlepší partner pre Philipa podľa AllClash (marec 2026).',
                          'Nejlepší partner pro Philipa podle AllClash (březen 2026).')},
                {'primary': 'Arthur Pendragon', 'secondary': 'Hector', 'troops': CAV, 'f2p': 'no',
                 'why': t('Hector ako flexibilná leadership podpora pre combo jazdu, keď Achilles vedie inú armádu.',
                          'Hector jako flexibilní leadership podpora pro combo jízdu, když Achilles vede jinou armádu.')},
            ]),
            ('h2', t('Tipy', 'Tipy')),
            ('ul', [
                t('Philip II: talenty Leadership + Versatility + Support. Talent Rejuvenate nepreháňaj, prestrelí strop rage.',
                  'Philip II: talenty Leadership + Versatility + Support. Talent Rejuvenate nepřeháněj, přestřelí strop rage.'),
                t('Starý univerzálny mix Trajan + Aethelflaed je dnes slabý.',
                  'Starý univerzální mix Trajan + Aethelflaed je dnes slabý.'),
            ]),
            ('sources', [AC_PAIRS, AC_TIERS, ('AllClash: Philip II Builds', 'https://www.allclash.com/best-philip-ii-builds-talents-skill-order-pairing-equipment-in-rise-of-kingdoms/')]),
        ],
    },
    {
        'slug': 'pary-pre-garnizonu',
        'title': t('Páry commanderov pre garnizónu', 'Páry commanderů pro garnizonu'),
        'blocks': [
            ('p', t(
                'Obrana mesta, vlajok a budov. Garnizóna potrebuje odolnosť a kontru na rally, nie čisté poškodenie.',
                'Obrana města, vlajek a budov. Garnizona potřebuje odolnost a kontru na rally, ne čisté poškození.',
            )),
            ('note',),
            ('pairs', WITH_TROOPS, [
                {'primary': 'Tokugawa Ieyasu', 'secondary': 'Gorgo / Heraclius', 'troops': t('mix / pechota', 'mix / pěchota'), 'f2p': 'no',
                 'why': t('Tokugawa znižuje prichádzajúce skill poškodenie a oslabuje rally, Gorgo pridá zníženie poškodenia a protiútok.',
                          'Tokugawa snižuje příchozí skill poškození a oslabuje rally, Gorgo přidá snížení poškození a protiútok.')},
                {'primary': 'David IV', 'secondary': 'Hector', 'troops': t('akékoľvek', 'jakékoli'), 'f2p': 'no',
                 'why': t('Plošné poškodenie proti presile a odolnosť proti rally. Podľa AllClash kontra na lukostreleckú metu.',
                          'Plošné poškození proti přesile a odolnost proti rally. Podle AllClash kontra na lučištnickou metu.')},
                {'primary': 'Hayam Wuruk', 'secondary': 'Choe Yeong', 'troops': ARCH, 'f2p': 'no',
                 'why': t('Maximum liečenia a true damage. Tvrdá kontra na pechotu a útoky z viacerých strán.',
                          'Maximum léčení a true damage. Tvrdá kontra na pěchotu a útoky z více stran.')},
                {'primary': 'Choe Yeong', 'secondary': 'Zenobia / Heraclius', 'troops': ARCH, 'f2p': 'no',
                 'why': t('Alternatíva lukostreleckej garnizóny.',
                          'Alternativa lučištnické garnizony.')},
                {'primary': 'Yi Sun-sin', 'secondary': 'Theodora', 'troops': MIX, 'f2p': 'partly',
                 'why': t('Klasická obrana mesta so štítmi, znížením poškodenia a liečením. Dnes už slabšia.',
                          'Klasická obrana města se štíty, snížením poškození a léčením. Dnes už slabší.')},
            ]),
            ('h2', t('Tipy', 'Tipy')),
            ('ul', [
                t('Imhotep je najlepší epický garnizónny commander a takmer vždy ide ako sekundárny.',
                  'Imhotep je nejlepší epický garnizonní commander a téměř vždy jde jako sekundární.'),
                t('Ivar the Boneless má silné efekty proti combo a proti jazde.',
                  'Ivar the Boneless má silné efekty proti combo a proti jízdě.'),
                t('Talenty pre Tokugawu: build „Mixed Garrison“ (Infantry + Garrison + Smite).',
                  'Talenty pro Tokugawu: build „Mixed Garrison“ (Infantry + Garrison + Smite).'),
            ]),
            ('sources', [AC_TIERS, ('AllClash: Tokugawa Ieyasu Builds', 'https://www.allclash.com/best-tokugawa-ieyasu-builds-talents-skill-order-pairing-equipment-in-rise-of-kingdoms/'), ('LootBar: Best Garrison Commanders (08/2026)', 'https://www.lootbar.com/blog/en/top-best-garrison-commanders-in-rise-of-kingdoms.html')]),
        ],
    },
    {
        'slug': 'pary-pre-rally',
        'title': t('Páry commanderov pre rally', 'Páry commanderů pro rally'),
        'blocks': [
            ('p', t(
                'Útoky na pevnosti, vlajky a mestá. Rally páry stoja na talentoch Conquering a na tom, kto rozbije liečenie garnizóny.',
                'Útoky na pevnosti, vlajky a města. Rally páry stojí na talentech Conquering a na tom, kdo rozbije léčení garnizony.',
            )),
            ('note',),
            ('pairs', WITH_TROOPS, [
                {'primary': 'William Marshal', 'secondary': 'Subutai', 'troops': CAV, 'f2p': 'no',
                 'why': t('Marshal patrí k najlepším rally commanderom a Subutai je jeho ideálny partner. Poradie primárny/sekundárny sa v zdrojoch líši.',
                          'Marshal patří k nejlepším rally commanderům a Subutai je jeho ideální partner. Pořadí primární/sekundární se ve zdrojích liší.')},
                {'primary': 'Arthur Pendragon', 'secondary': 'Subutai', 'troops': CAV, 'f2p': 'no',
                 'why': t('Subutai je najlepší rally partner pre Arthura. Jeho expertíza zvýši bežné poškodenie, ktoré cieľ dostáva.',
                          'Subutai je nejlepší rally partner pro Arthura. Jeho expertíza zvýší běžné poškození, které cíl dostává.')},
                {'primary': 'Ivar the Boneless', 'secondary': 'Bai Qi', 'troops': INF, 'f2p': 'no',
                 'why': t('Ivar má efekty proti combo a proti jazde, Bai Qi pridá plošné poškodenie. Funguje aj Sun Tzu Prime + Ivar.',
                          'Ivar má efekty proti combo a proti jízdě, Bai Qi přidá plošné poškození. Funguje i Sun Tzu Prime + Ivar.')},
                {'primary': 'Nebuchadnezzar II', 'secondary': 'Gilgamesh', 'troops': ARCH, 'f2p': 'no',
                 'why': t('Gilgamesh znižuje liečenie a obranu cieľa, takže rozbije garnizóny postavené na liečení.',
                          'Gilgamesh snižuje léčení a obranu cíle, takže rozbije garnizony postavené na léčení.')},
                {'primary': 'William Marshal', 'secondary': 'Ivan IV', 'troops': CAV, 'f2p': 'no',
                 'why': t('Nové combo s viacnásobnými zásahmi. AllClash ho pre rally hodnotí opatrnejšie.',
                          'Nové combo s vícenásobnými zásahy. AllClash ho pro rally hodnotí opatrněji.')},
            ]),
            ('h2', t('Tipy', 'Tipy')),
            ('ul', [
                t('Rally commander dostáva talenty Conquering, pri jazde Cavalry + Conquering + Combo.',
                  'Rally commander dostává talenty Conquering, u jízdy Cavalry + Conquering + Combo.'),
                t('Staršia voľba Alexander Nevsky + Justinian (alebo Attila) stále funguje na vlajky a mestá.',
                  'Starší volba Alexander Nevsky + Justinian (nebo Attila) pořád funguje na vlajky a města.'),
            ]),
            ('sources', [AC_TIERS, ('AllClash: William Marshal Builds (08/2026)', 'https://www.allclash.com/best-william-marshal-builds-talent-tree-skill-order-best-pairing-in-rise-of-kingdoms/'), ('AllClash: Subutai Builds', 'https://www.allclash.com/best-subutai-builds-talents-skill-order-pairing-equipment-in-rise-of-kingdoms/'), ('LootBar: Best Rally Commanders (09/2026)', 'https://www.lootbar.com/blog/en/top-best-rally-commanders-in-rise-of-kingdoms.html')]),
        ],
    },
    {
        'slug': 'pary-na-barbarov-a-pevnosti',
        'title': t('Páry commanderov na barbarov a pevnosti', 'Páry commanderů na barbary a pevnosti'),
        'blocks': [
            ('p', t(
                'PvE páry na barbarov, barbarské pevnosti a levelovanie commanderov. Väčšina je dostupná aj bez míňania peňazí.',
                'PvE páry na barbary, barbarské pevnosti a levelování commanderů. Většina je dostupná i bez utrácení peněz.',
            )),
            ('note',),
            ('pairs', WITH_TROOPS, [
                {'primary': 'Minamoto', 'secondary': 'Cao Cao', 'troops': t('pevnosti', 'pevnosti'), 'f2p': 'partly',
                 'why': t('Peacekeeping talenty a silný úder na jeden cieľ. Najlacnejší legendárny commander, investuj však len pred Season of Conquest.',
                          'Peacekeeping talenty a silný úder na jeden cíl. Nejlevnější legendární commander, investuj ale jen před Season of Conquest.')},
                {'primary': 'Boudica', 'secondary': 'Aethelflaed', 'troops': t('pevnosti aj barbari', 'pevnosti i barbaři'), 'f2p': 'yes',
                 'why': t('Silné skilly a bonusy proti barbarom. Aethelflaed kúpiš v obchode Expedície.',
                          'Silné skilly a bonusy proti barbarům. Aethelflaed koupíš v obchodě Expedice.')},
                {'primary': 'Belisarius', 'secondary': 'Cao Cao', 'troops': t('pevnosti aj barbari', 'pevnosti i barbaři'), 'f2p': 'yes',
                 'why': t('Lacná a rýchla jazdecká voľba.',
                          'Levná a rychlá jízdní volba.')},
                {'primary': 'Aethelflaed', 'secondary': 'Lohar', 'troops': t('barbari, levelovanie', 'barbaři, levelování'), 'f2p': 'yes',
                 'why': t('Lohar dáva +35 % poškodenia barbarom a +70 % EXP. Nechaj ho sekundárneho, Aethelflaed má lepší talentový strom.',
                          'Lohar dává +35 % poškození barbarům a +70 % EXP. Nech ho sekundárního, Aethelflaed má lepší talentový strom.')},
                {'primary': 'Boudica', 'secondary': 'Lohar', 'troops': t('barbari', 'barbaři'), 'f2p': 'yes',
                 'why': t('Boudica obnovuje rage a lieči, vydrží dlhé série útokov.',
                          'Boudica obnovuje rage a léčí, vydrží dlouhé série útoků.')},
                {'primary': 'Yi Seong-Gye', 'secondary': t('ktokoľvek', 'kdokoli'), 'troops': t('barbari', 'barbaři'), 'f2p': 'yes',
                 'why': t('Kruhový plošný útok zasiahne viac barbarov za cenu jedného útoku.',
                          'Kruhový plošný útok zasáhne víc barbarů za cenu jednoho útoku.')},
            ]),
            ('h2', t('Tipy', 'Tipy')),
            ('ul', [
                t('Talenty Peacekeeping znižujú cenu akčných bodov za útok na barbarov.',
                  'Talenty Peacekeeping snižují cenu akčních bodů za útok na barbary.'),
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
                 'why': t('Najľahší skorý PvP pár z dvoch epických commanderov. Bjorn nanesie zraniteľnosť a Sun Tzu udrie silnejšie.',
                          'Nejsnazší raný PvP pár ze dvou epických commanderů. Bjorn nanese zranitelnost a Sun Tzu udeří silněji.')},
                {'primary': 'Charles Martel', 'secondary': 'Sun Tzu', 'troops': INF,
                 'why': t('Odolný Martel a plošné poškodenie Sun Tzua. Silné v KvK1–2, investuj len pred Season of Conquest.',
                          'Odolný Martel a plošné poškození Sun Tzua. Silné v KvK1–2, investuj jen před Season of Conquest.')},
                {'primary': 'Richard', 'secondary': 'Joan of Arc', 'troops': INF,
                 'why': t('Odolná armáda na pole. Epická Joan of Arc pridá krátke buffy a rage.',
                          'Odolná armáda na pole. Epická Joan of Arc přidá krátké buffy a rage.')},
                {'primary': 'Pelagius', 'secondary': 'Baibars', 'troops': CAV,
                 'why': t('Lacná skorá jazda z epických commanderov.',
                          'Levná raná jízda z epických commanderů.')},
                {'primary': 'Yi Seong-Gye', 'secondary': 'Imhotep / El Cid', 'troops': ARCH,
                 'why': t('Yi Seong-Gye je dlhodobá investícia použiteľná v každej fáze KvK a neskôr sekunduje Qin Shi Huangovi.',
                          'Yi Seong-Gye je dlouhodobá investice použitelná v každé fázi KvK a později sekunduje Qin Shi Huangovi.')},
            ]),
            ('h2', t('Na koho sa sústrediť podľa fázy KvK', 'Na koho se soustředit podle fáze KvK')),
            ('ul', [
                t('<strong>KvK1:</strong> Sun Tzu, Yi Seong-Gye, Richard, Charles Martel',
                  '<strong>KvK1:</strong> Sun Tzu, Yi Seong-Gye, Richard, Charles Martel'),
                t('<strong>KvK2:</strong> Alexander the Great, Saladin, Yi Seong-Gye, Charles Martel',
                  '<strong>KvK2:</strong> Alexander the Great, Saladin, Yi Seong-Gye, Charles Martel'),
                t('<strong>KvK3:</strong> Alexander the Great, Yi Seong-Gye, Saladin, Edward of Woodstock',
                  '<strong>KvK3:</strong> Alexander the Great, Yi Seong-Gye, Saladin, Edward of Woodstock'),
            ]),
            ('sources', [LD_PAIRS, ('LootBar: KvK Tier List 2026', 'https://www.lootbar.com/blog/en/rise-of-kingdoms-2026-kvk-tier-list.html'), RKG_PAIRS]),
        ],
    },
    {
        'slug': 'pary-na-zber-surovin',
        'title': t('Páry commanderov na zber surovín', 'Páry commanderů na sběr surovin'),
        'blocks': [
            ('p', t(
                'Zberači surovín pre hlavný účet aj farmy. Na zber posielaj obliehacie jednotky, majú najväčšiu kapacitu.',
                'Sběrači surovin pro hlavní účet i farmy. Na sběr posílej obléhací jednotky, mají největší kapacitu.',
            )),
            ('note',),
            ('pairs', ['primary', 'secondary', 'why', 'f2p'], [
                {'primary': 'Constance', 'secondary': 'Sarka / Joan of Arc', 'f2p': 'yes',
                 'why': t('Najlepšia zberačka, po dokončení zberu pridá bonusové suroviny. Kúpiš ju v obchode Expedície.',
                          'Nejlepší sběračka, po dokončení sběru přidá bonusové suroviny. Koupíš ji v obchodě Expedice.')},
                {'primary': 'Casimir III', 'secondary': t('ktokoľvek', 'kdokoli'), 'f2p': 'no',
                 'why': t('+20 % rýchlosť zberu, navyše na zlate, a +15 % kapacita.',
                          '+20 % rychlost sběru, navíc na zlatě, a +15 % kapacita.')},
                {'primary': 'Yahya ibn Khalid', 'secondary': t('ktokoľvek', 'kdokoli'), 'f2p': 'no',
                 'why': t('Najnovší zberač (júl 2026) zameraný na zlato.',
                          'Nejnovější sběrač (červenec 2026) zaměřený na zlato.')},
                {'primary': 'Pepin III', 'secondary': t('ktokoľvek', 'kdokoli'), 'f2p': 'no',
                 'why': t('Čistý zberač. Oplatí sa na farmy alebo pre spenderov.',
                          'Čistý sběrač. Vyplatí se na farmy nebo pro spendery.')},
            ]),
            ('h2', t('Tipy', 'Tipy')),
            ('ul', [
                t('Zberača dostaň aspoň na level 37, odomkne talent Superior Tools (približne +25 % rýchlosť zberu).',
                  'Sběrače dostaň aspoň na level 37, odemkne talent Superior Tools (přibližně +25 % rychlost sběru).'),
                t('Cleopatra, Seondeok a Ishida sú čistí farmári, neuprednostňuj ich.',
                  'Cleopatra, Seondeok a Ishida jsou čistí farmáři, neupřednostňuj je.'),
            ]),
            ('sources', [AC_TIERS, ('Rise of Kingdoms Guides: Farming and Gathering', 'https://riseofkingdomsguides.com/farminggathering-guide/'), ('AllClash: Yahya ibn Khalid Builds (07/2026)', 'https://www.allclash.com/best-yahya-ibn-khalid-builds-talent-tree-skill-order-best-pairing-in-rise-of-kingdoms/')]),
        ],
    },
]


def seed(apps, schema_editor):
    Guide = apps.get_model('guides', 'Guide')
    for order, guide in enumerate(GUIDES):
        Guide.objects.get_or_create(
            slug=guide['slug'],
            defaults={
                'category': 'commanderi',
                'title_sk': guide['title']['sk'],
                'title_cs': guide['title']['cs'],
                'html_sk': render(guide['blocks'], 'sk'),
                'html_cs': render(guide['blocks'], 'cs'),
                'order': order,
                'is_published': True,
            },
        )


class Migration(migrations.Migration):
    dependencies = [('guides', '0002_guideimage')]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
