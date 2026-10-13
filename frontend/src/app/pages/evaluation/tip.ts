import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input, viewChild } from '@angular/core';
import { Icon } from '../../shared/icon';

let next = 0;

/**
 * A small "i" next to a variable or a column of /vyhodnocovanie with what it does (Slim 13. 10. 2026: "vysvetlivky do
 * toho rozhrania, tooltip na hover" – e.g. whether a higher weight means more impact). A mouse opens it on hover (the
 * bubble can be hovered too), a tap or a click pins it until the next tap anywhere, the keyboard on focus; Esc and a
 * scroll hide it. The bubble is a popover in the top layer, so a scrolled table or a card does not cut it off; its
 * text is the button's description. Window and popover are touched in event handlers only (SSR).
 */
@Component({
  selector: 'app-eval-tip',
  imports: [Icon],
  template: `
    <button
      #button
      type="button"
      class="ev-tip"
      [attr.aria-label]="label()"
      [attr.aria-describedby]="id"
      (pointerenter)="hover($event, true)"
      (pointerleave)="hover($event, false)"
      (focus)="focused()"
      (blur)="close()"
      (click)="toggle()"
    >
      <svg appIcon="info"></svg>
    </button>
    <span
      #bubble
      class="ev-tip__bubble"
      popover="manual"
      role="tooltip"
      [id]="id"
      (pointerenter)="hover($event, true)"
      (pointerleave)="hover($event, false)"
      >{{ text() }}</span
    >
  `,
  styleUrl: './tip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvalTip {
  readonly text = input.required<string>();
  /** what the button is about, for a screen reader ("Vysvetlivka: Váha slotov") */
  readonly label = input.required<string>();
  readonly id = `ev-tip-${++next}`;

  private readonly button = viewChild.required<ElementRef<HTMLButtonElement>>('button');
  private readonly bubble = viewChild.required<ElementRef<HTMLElement>>('bubble');
  /** opened by a tap or a click – stays until the next one (a mouse leaving does not hide it) */
  private pinned = false;
  private leaving: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.close());
  }

  /** a mouse only – a finger fires these too, right before and after its tap */
  protected hover(event: PointerEvent, inside: boolean): void {
    if (event.pointerType !== 'mouse') return;
    clearTimeout(this.leaving);
    if (inside) this.open();
    // a moment to move onto the bubble (WCAG 1.4.13: the bubble can be hovered)
    else if (!this.pinned) this.leaving = setTimeout(() => this.close(), 150);
  }

  /** the keyboard: a tap focuses the button too, but without the focus ring – the click handles that one */
  protected focused(): void {
    if (this.button().nativeElement.matches(':focus-visible')) this.open();
  }

  protected toggle(): void {
    if (this.pinned) {
      this.close();
      return;
    }
    this.open();
    this.pinned = true;
  }

  private isOpen(): boolean {
    const bubble = this.bubble().nativeElement;
    return typeof bubble.hidePopover === 'function' && bubble.matches(':popover-open');
  }

  private open(): void {
    const bubble = this.bubble().nativeElement;
    if (typeof bubble.showPopover !== 'function') return;
    if (!this.isOpen()) {
      bubble.showPopover();
      document.addEventListener('keydown', this.onKey);
      document.addEventListener('pointerdown', this.onPointer, true);
      // a frame later: a scroll the focus itself caused does not hide it at once
      requestAnimationFrame(() => {
        if (this.isOpen()) window.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
      });
    }
    // below the button, or above it when there is no room; always inside the window
    const gap = 8;
    const edge = 12;
    const at = this.button().nativeElement.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = bubble;
    const left = Math.min(Math.max(edge, at.left + at.width / 2 - width / 2), window.innerWidth - width - edge);
    const below = at.bottom + gap;
    const fitsBelow = below + height <= window.innerHeight - edge || at.top - gap - height <= edge;
    const top = fitsBelow ? below : at.top - gap - height;
    bubble.style.left = `${Math.max(edge, left)}px`;
    bubble.style.top = `${top}px`;
  }

  protected close(): void {
    clearTimeout(this.leaving);
    this.pinned = false;
    if (typeof document === 'undefined') return;
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('pointerdown', this.onPointer, true);
    window.removeEventListener('scroll', this.onScroll, { capture: true });
    if (this.isOpen()) this.bubble().nativeElement.hidePopover();
  }

  private readonly onScroll = () => this.close();
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.close();
  };
  /** a tap or a click anywhere else */
  private readonly onPointer = (event: PointerEvent) => {
    const target = event.target as Node | null;
    const inside = !!target && (this.button().nativeElement.contains(target) || this.bubble().nativeElement.contains(target));
    if (!inside) this.close();
  };
}
