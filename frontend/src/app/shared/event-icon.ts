import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from '@angular/core';

/** Letters for an event without game art: "Silk Road" → "SR", "Alliance Mobilization" → "AM", "20 GH" → "20". */
export function monogram(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, ' ')
    .split(/[\s–\-:/]+/)
    .filter(Boolean);
  if (!words.length) return '?';
  if (/^\d/.test(words[0])) return words[0].slice(0, 2);
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

/**
 * An event's icon (game art from /static/kingdom/events/) or, without one, a gold monogram in the same round frame.
 * Decorative – the name is always written next to it. Size: the `--size` custom property (40px by default);
 * `bare` drops the frame for small icons inside a calendar bar.
 */
@Component({
  selector: 'app-event-icon',
  template: `
    @if (src(); as src) {
      <img [src]="src" alt="" width="96" height="96" loading="lazy" decoding="async" />
    } @else {
      {{ letters() }}
    }
  `,
  styles: `
    :host {
      --size: 40px;
      display: inline-grid;
      place-items: center;
      flex-shrink: 0;
      width: var(--size);
      height: var(--size);
      border: 1px solid var(--line);
      border-radius: 50%;
      background: var(--field-bg);
      color: var(--gold-300);
      font: 600 calc(var(--size) * 0.34) / 1 var(--font-display);
      letter-spacing: 0.02em;
      user-select: none;
    }

    :host(.is-bare) {
      border: 0;
      background: none;
    }

    img {
      width: 84%;
      height: 84%;
      object-fit: contain;
    }

    :host(.is-bare) img {
      width: 100%;
      height: 100%;
    }
  `,
  host: { 'aria-hidden': 'true', '[class.is-bare]': 'bare()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventIcon {
  /** URL of the game art; null = monogram */
  readonly src = input<string | null>(null);
  readonly name = input('');
  readonly bare = input(false, { transform: booleanAttribute });
  protected readonly letters = computed(() => monogram(this.name()));
}
