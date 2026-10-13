import type { Page } from '@playwright/test';

/**
 * Rows whose parts must share one vertical centre line (a number, an icon and an arrow in one card). On a phone a title
 * wraps and anything pinned to its first line drifts above the rest – the specialty tags in the guide lists did.
 */
export const ALIGNED: { row: string; parts: string[] }[] = [
  // guide lists: number, specialty tag, arrow
  { row: 'a.row', parts: ['.row__index', '.row__specialty', '.row__arrow'] },
  // calendar on a phone: event icon, text, arrow
  { row: '.agenda__list button.row', parts: ['.row__icon', '.row__body', '.row__arrow'] },
];

export type LayoutReport = {
  /** How many px the page scrolls sideways, and the elements sticking out of the viewport. */
  sideways: number;
  sticking: string[];
  /** Rows from ALIGNED whose parts are off the shared centre line. */
  misaligned: string[];
  /** Headings, buttons and links whose text is cut off (no ellipsis on purpose). */
  clipped: string[];
  /** Images drawn with another aspect ratio than the file has (Safari stretches images in grid/flex). */
  stretched: string[];
  /** Tap targets under 24 × 24 px (WCAG 2.5.8) on touch screens. */
  small: string[];
  /** Visible text under 11 px (the uppercase labels are 11 px on purpose). */
  tiny: string[];
  /** Words split over two lines because their box is too narrow ("Albuquerqu / e"). */
  brokenWords: string[];
};

/** Measures the page in the browser. Elements in a closed menu, dialog or `inert` part are ignored. */
export function measure(page: Page, aligned = ALIGNED): Promise<LayoutReport> {
  return page.evaluate((aligned) => {
    const vw = document.documentElement.clientWidth;
    const name = (el: Element) => {
      const id = el.id ? `#${el.id}` : '';
      const cls = [...el.classList].slice(0, 2).map((c) => `.${c}`).join('');
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
    };
    const shown = (el: Element) => {
      // .sr-only: text for screen readers, visually hidden on purpose
      if (el.closest('[inert], [aria-hidden="true"], dialog:not([open]), .sr-only')) return false;
      const box = el.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) return false;
      const style = getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
    };
    // a box can stick out of the viewport and still be fine when an ancestor clips it (carousel, marquee)
    const clippedByAncestor = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p);
        if (/(hidden|clip|auto|scroll)/.test(o.overflowX + o.overflow)) return true;
      }
      return false;
    };
    const all = [...document.querySelectorAll('body *')].filter(shown);

    const sideways = document.documentElement.scrollWidth - innerWidth;
    const sticking = all
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return (box.right > vw + 1 || box.left < -1) && !clippedByAncestor(el);
      })
      // the outermost culprit is enough
      .filter((el, _, list) => !list.some((other) => other !== el && other.contains(el)))
      .map((el) => `${name(el)} (${Math.round(el.getBoundingClientRect().left)}…${Math.round(el.getBoundingClientRect().right)} px)`);

    const misaligned: string[] = [];
    for (const { row, parts } of aligned) {
      for (const el of document.querySelectorAll(row)) {
        if (!shown(el)) continue;
        const centres = parts
          .map((sel) => el.querySelector(sel))
          .filter((part): part is Element => !!part && shown(part))
          .map((part) => {
            const box = part.getBoundingClientRect();
            return { sel: (part.getAttribute('class') ?? '').split(' ')[0], y: box.top + box.height / 2 };
          });
        if (centres.length < 2) continue;
        const ys = centres.map((c) => c.y);
        if (Math.max(...ys) - Math.min(...ys) > 2) {
          misaligned.push(`${name(el)}: ${centres.map((c) => `${c.sel} ${c.y.toFixed(1)}`).join(', ')}`);
        }
      }
    }

    const clipped = all
      .filter((el) => el.matches('h1, h2, h3, h4, button, .btn, .pill-btn, .tab, nav a, label, th'))
      .filter((el) => {
        const s = getComputedStyle(el);
        if (s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none') return false;
        const hides = /(hidden|clip)/.test(s.overflowX + s.overflow);
        return hides && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2);
      })
      .map(name);

    const stretched = [...document.images]
      .filter((img) => shown(img) && img.complete && img.naturalWidth > 0)
      .filter((img) => {
        const s = getComputedStyle(img);
        if (s.objectFit !== 'fill') return false;
        const box = img.getBoundingClientRect();
        const drawn = box.width / box.height;
        const file = img.naturalWidth / img.naturalHeight;
        return Math.abs(drawn - file) / file > 0.04;
      })
      .map((img) => `${name(img)} ${img.getAttribute('src')}`);

    const touch = matchMedia('(pointer: coarse)').matches;
    const small = !touch
      ? []
      : all
          .filter((el) => el.matches('a[href], button, input:not([type="hidden"]), select, summary, [role="button"]'))
          // a link inside a sentence is exempt (WCAG 2.5.8 "inline")
          .filter((el) => getComputedStyle(el).display !== 'inline')
          .filter((el) => {
            const box = el.getBoundingClientRect();
            // checkboxes and radios hidden under a styled label count by their label
            const label = el.matches('input') ? el.closest('label') : null;
            const target = label ? label.getBoundingClientRect() : box;
            return target.width < 24 || target.height < 24;
          })
          .map((el) => {
            const box = el.getBoundingClientRect();
            return `${name(el)} ${Math.round(box.width)}×${Math.round(box.height)}`;
          });

    const tiny = all
      .filter((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()))
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 11)
      .filter((el) => !el.closest('.sr-only'))
      .map((el) => `${name(el)} ${getComputedStyle(el).fontSize}`);

    // a word whose letters sit on two lines – exact, from the line boxes of the word itself (no font measuring); only
    // where CSS allows breaking inside a word: overflow-wrap, word-break or hyphenation
    const brokenWords: string[] = [];
    const range = document.createRange();
    for (const el of all) {
      const s = getComputedStyle(el);
      if (!/break-word|anywhere/.test(s.overflowWrap) && s.wordBreak !== 'break-all' && s.hyphens !== 'auto') continue;
      for (const node of el.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        for (const match of node.textContent!.matchAll(/\S{2,}/g)) {
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
          if (tops.size > 1) brokenWords.push(`${name(el)}: "${match[0]}"`);
        }
      }
    }

    return { sideways, sticking, misaligned, clipped, stretched, small, tiny, brokenWords };
  }, aligned);
}
