import { KVK_ONLINE, KvkSignup } from '../../core/kvk-api';
import type { Dict } from '../../core/i18n/sk';

/**
 * The survey of a KvK sign-up as text (Gether 20. 10. 2026): "do 100 € (≈ 2 500 Kč)" and "Večery, Noci" in the order of
 * the form – on the player's card and in the reviewers' list. Empty strings for a sign-up from before the survey.
 */
export function surveyText(signup: Pick<KvkSignup, 'budget' | 'online'>, t: Dict['kvk']['survey']) {
  return {
    budget: signup.budget ? `${t.budgets[signup.budget]} (${t.czk[signup.budget]})` : '',
    online: KVK_ONLINE.filter((key) => signup.online?.includes(key))
      .map((key) => t.onlines[key])
      .join(', '),
  };
}
