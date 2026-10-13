import { EVAL_TEXTS } from './texts';

/** every text with its key path – the records (tips, tier notes) are typed loosely, the compiler does not check them */
const texts = (value: unknown, path: string[] = []): [string[], unknown][] =>
  value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, item]) => texts(item, [...path, key]))
    : [[path, value]];

const keys = (value: unknown) => texts(value).map(([path]) => path.join(' › ')).sort();

describe('evaluation texts', () => {
  it('has the same texts in Slovak and Czech, none empty', () => {
    expect(keys(EVAL_TEXTS.cs)).toEqual(keys(EVAL_TEXTS.sk));
    for (const lang of [EVAL_TEXTS.sk, EVAL_TEXTS.cs]) {
      expect(texts(lang).filter(([, text]) => typeof text !== 'string' || !text.trim())).toEqual([]);
    }
  });
});
