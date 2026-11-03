// Signed in as the temporary test player (SESSION from `manage.py test_session --marches`; run.sh --player makes and
// deletes it): the player pages open, show the player and lay out on every phone. Read-only – nothing is saved.
import { SESSION, expect, open, scrollThrough, test } from './fixtures';
import { measure } from './layout';

test.skip(!SESSION, 'needs SESSION (run.sh --player)');

const PLAYER_PAGES = ['/ucet', '/pripomienky', '/marche', '/marche?tab=hraci', '/kvk', '/cz/ucet', '/cz/marche'];

for (const path of PLAYER_PAGES) {
  test(`${path} for a signed-in player @player`, async ({ page }) => {
    await open(page, path);
    await scrollThrough(page);
    // the header shows the player instead of the sign-in button
    await expect(page.locator('app-header .account__avatar, #mobile-menu .drawer__user').first()).toBeAttached();
    await expect(page.getByRole('link', { name: /Prihlásiť cez Discord|Přihlásit přes Discord/ })).toHaveCount(0);

    const report = await measure(page);
    expect.soft(report.sideways, `page scrolls sideways; sticking out: ${report.sticking.join(' | ')}`).toBeLessThanOrEqual(0);
    expect.soft(report.misaligned, 'parts of a row off its centre line').toEqual([]);
    expect.soft(report.clipped, 'cut-off text').toEqual([]);
    expect.soft(report.stretched, 'stretched images').toEqual([]);
  });
}

test('the account shows the player and the in-game name field @player', async ({ page }) => {
  await open(page, '/ucet');
  await expect(page.locator('#account-name')).not.toBeEmpty();
  await expect(page.locator('#ingame-name')).toBeVisible();
  await expect(page.locator('#ingame-name')).toBeEditable();
});

test('the march overview lists the sample marches @player', async ({ page }) => {
  await open(page, '/marche');
  await expect(page.locator('.segmented.tabs button[aria-pressed="true"]')).toBeVisible();
  await expect(page.getByText('Arthur Pendragon').first()).toBeVisible();
});

// Unsaved equipment is not thrown away without asking (Esc, a second Esc, the tab closing). Nothing is saved.
for (const path of ['/marche', '/kvk']) {
  test(`${path}: the build editor asks before dropping unsaved changes @player @journey`, async ({ page }) => {
    await open(page, path);
    const opener = page.locator('.march__build').first();
    await opener.click();
    const dialog = page.locator('dialog.be[open]');
    const question = dialog.locator('.be__discard [role="alert"]');
    await expect(dialog.locator('.be__item').first()).toBeVisible();
    // untouched: Esc closes at once
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    await opener.click();
    const item = dialog.locator('.be__item[aria-pressed="false"]').first();
    const name = (await item.textContent())?.trim() ?? '';
    await item.click();
    const picked = dialog.locator('.be__item[aria-pressed="true"]', { hasText: name });
    await expect(picked).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(question).toBeVisible();
    // a second Esc without a click between (Chrome may close without a cancel): still open, still asking
    await page.keyboard.press('Escape');
    await expect(question).toBeVisible();
    await expect(picked).toBeVisible();

    await dialog.getByRole('button', { name: 'Pokračovať v úprave' }).click();
    await expect(question).toHaveCount(0);
    await expect(picked).toBeVisible();
    // the tab asks before it closes
    const leave = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const prompt = await leave;
    expect(prompt.type()).toBe('beforeunload');
    await prompt.dismiss();

    await dialog.locator('.be__actions > .pill-btn--quiet').click();
    await dialog.getByRole('button', { name: 'Zahodiť zmeny' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
}
