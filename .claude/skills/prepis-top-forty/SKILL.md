---
name: prepis-top-forty
description: Rewrite the Hall of Fame's weekly fort destroyers (Ničiteľ pevností, top 3) on the live site kd1035.eu from Gether's screenshot of the game's Fort Destroyer Rankings and the accounts he names (farms do not count). Use when Gether runs /prepis-top-forty or sends that screenshot asking to update the Hall of Fame. Writes production data through his signed-in Chrome.
---

# /prepis-top-forty – the weekly fort destroyers on kd1035.eu

Gether sends a screenshot of **Fort Destroyer Rankings** and names the accounts that count (Gether 29. 10. 2026: „napíšem ti, ktoré účty sa vyberajú, nerátame farmy“). The top 3 of those go to the Hall of Fame's category `forts` on **production**. Asking for it is his approval of the write – do not ask again, but stop and ask when something does not add up (below).

## 1. Read the screenshot
- Take **only the accounts Gether named**, in the screenshot's order (place, then the order shown for a tie), at most 3. Their number = the column *Forts Destroyed* (digits only, e.g. `82`; the site writes „82 pevností“).
- Match his words to the rows loosely (`Malkom` = `乂Mālkōm乂`, `Gether` = `GetheR`, `CrazyFox` = `CrazyFox CZE`). **Stop and ask** when a name fits no row or two rows, or a number is unreadable – never guess a number.

## 2. Open the live site in Gether's Chrome
- Claude in Chrome (`mcp__claude-in-chrome__*`; load the tools with one ToolSearch call): open or reuse a tab on `https://kd1035.eu/sien-slavy`.
- He must be signed in as the superadmin – the page shows the tab *Upraviť*. If not, ask him to sign in himself; **never type a password or click through Discord's login for him**.

## 3. Read what is there now (javascript_tool in that tab)
```js
const hall = await (await fetch('/api/hall/', { credentials: 'same-origin' })).json();
const forts = hall.entries.filter((e) => e.category === 'forts');
const { players } = await (await fetch('/api/kvk/reviewers/', { credentials: 'same-origin' })).json();
```
`forts[i]` has `id`, `place`, `name` (shown), `custom_name`, `player`, `photo`, `count`; each of `players` has `id`, `name` (Discord), `ingame_name`.

## 4. Build the new ranking – the same people keep their name and photo
For each picked account, in order:
- **Already in `forts`** (the same person: names equal after removing decoration, case and diacritics, or one contains the other – `CrazyFox` ~ `CrazyFox CZE`): keep how they are shown – `player` and `name` = `custom_name` of that entry – and move their photo: `photo_from: <that entry's id>`.
- **New in the top 3**: a website player whose `ingame_name` matches → `{player: id}` (their Discord avatar shows); otherwise `{name: '<as Gether wrote it>'}`, no photo.
- `count`: the number from the screenshot. `note_sk` / `note_cs` empty (last week's reason would be stale).

Show Gether the table you are about to write (place, name, number, photo kept yes/no) in the same message as the write.

## 5. Write it
```js
const csrf = document.cookie.match(/csrftoken=([^;]+)/)?.[1];
const res = await fetch('/api/hall/forts/', {
  method: 'PUT',
  credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
  body: JSON.stringify({ entries }),   // [{player?, name?, count, photo_from?}, …] place 1 first
});
[res.status, await res.json()];
```
- `PUT /api/hall/<category>/` (29. 10. 2026, `accounts/hall.py` `ranking`) rewrites the whole category at once: photos move with `photo_from`, places after the list empty, photos nobody keeps are deleted.
- **404 / 405** = the server still runs an older version: tell Gether to deploy (`git pull && docker compose up -d --build`) – do not fall back to the per-place PUTs, they would leave the photos on the wrong places.
- **400** = read the errors, fix the entries, try once more; **403** = not signed in as the superadmin.

## 6. Check and report
- Reload `/sien-slavy` and look at the Ničiteľ pevností banner (screenshot): names, numbers, the photos on the right people.
- Report in Slovak in a few lines: the new top 3 with numbers, whose photo moved, who is new without a photo (Gether adds one on *Upraviť*).
- Nothing to commit – the data lives on the server only. No version bump.
