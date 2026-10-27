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
