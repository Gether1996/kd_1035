# Kingdom 1035 · CZ/SK Rise of Kingdoms

Promo web pre KD 1035 – jediné čisto slovensko-české kráľovstvo v Rise of Kingdoms.
Angular (prerendrované stránky, SK `/` + CZ `/cz`) + Django/DRF + SQLite, všetko v Dockeri.

Projektové pravidlá: [CLAUDE.md](CLAUDE.md).

## Lokálny vývoj

```bash
docker compose -f docker-compose.dev.yml up --build
```

- web: http://localhost:4200 (hot reload)
- admin: http://localhost:8000/admin/ (meno a heslo z `.env`)

### Databáza medzi PC (cez git)

Celá dev databáza (`backend/snapshot/db.sqlite3`) aj nahrané obrázky (`backend/media/`) sú v gite. Raz na každom PC zapni hooky:

```bash
git config core.hooksPath .githooks
```

- **commit** – databáza a obrázky sa pridajú do commitu samé (musí bežať Docker)
- **pull** – ak prišla nová databáza, načíta sa sama (stará sa predtým zálohuje do `./backups`)
- ručne: `sh .githooks/dbsync.sh export` / `sh .githooks/dbsync.sh import`

Obsah meň vždy len na jednom PC naraz a pred prácou daj `git pull`. Binárnu databázu git nevie zlúčiť.

## Nasadenie na server

1. `git clone https://github.com/Gether1996/kd_1035.git && cd kd_1035`
2. Vytvor `.env` podľa [.env.example](.env.example) (`DJANGO_DEBUG=0`, vlastný `DJANGO_SECRET_KEY`, doména v `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS` a `SITE_URL`).
3. `docker compose up -d --build`
4. Web beží na porte `WEB_PORT` (predvolene 8080). HTTPS rieši reverse proxy pred ním (napr. Caddy, Nginx Proxy Manager, Traefik).

Aktualizácia: `git pull && docker compose up -d --build`. Dáta zostanú.

## Dáta a zálohy

- Databáza (`db_data`) a nahrané súbory (`uploads`) sú v Docker volumes. Prežijú rebuild aj `docker compose down`.
- **Nikdy nespúšťaj `docker compose down -v`.** Zmaže volumes aj s databázou.
- Kontajner `worker` robí každých `BACKUP_INTERVAL_DAYS` (7) dní zálohu do `BACKUP_PATH` (`./backups`) a nechá posledných `BACKUP_KEEP` (8).

```bash
# záloha hneď
docker compose exec -u app worker python manage.py backup_db
# obnova (názov súboru z ./backups)
docker compose exec -u app worker python manage.py restore_db kd1035_2026-10-07_120000.sqlite3.gz
```

Zálohy z `./backups` si občas skopíruj aj mimo servera.

## Návody (commanderi, výbava, eventy)

Iba superuser, v admine → **Návody → Pridať návod**:

1. Vyber kategóriu, napíš nadpis (SK, voliteľne CZ). Adresa sa vyplní sama.
2. Do **obsah HTML (SK)** vlož HTML. CZ je nepovinné, bez neho sa zobrazí slovenský obsah.
3. Obrázky: dole v časti **Obrázky** nahraj súbor a ulož. Pri obrázku sa zobrazí kód `<img src="...">`, skopíruj ho do HTML na miesto, kde má byť.
4. Ulož. Hore je náhľad a tlačidlo „Zobraziť na stránke“.

Skripty, `<style>` bloky a nebezpečné atribúty sa pri uložení odstránia. Vzhľad (nadpisy, tabuľky, zoznamy) dodá web sám.

## Discord notifikácie o eventoch

1. Discord: **Server Settings → Integrations → Webhooks → New Webhook** → vyber kanál → **Copy Webhook URL** → `DISCORD_WEBHOOK_URL` v `.env`.
2. Voliteľne vytvor rolu (napr. „Eventy“), ktorú si hráči sami pridajú. Jej ID (Developer Mode → pravý klik na rolu → Copy Role ID) daj do `DISCORD_EVENT_ROLE_ID`. Ak ping nefunguje, zapni pri role „Allow anyone to @mention this role“.
3. `docker compose up -d` (načíta nový `.env`).
4. Admin (iba superuser) → **Discord notifikácie** → nadpis, text, čas. Worker správu pošle v zadanom čase. Akcia „Odoslať na Discord hneď“ slúži na test.

## Testy

```bash
docker compose -f docker-compose.dev.yml run --rm backend python manage.py test
docker compose -f docker-compose.dev.yml run --rm frontend npx ng test --watch=false
```
