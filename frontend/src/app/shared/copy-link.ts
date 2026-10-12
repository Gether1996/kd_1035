import {
  DestroyRef,
  Injector,
  PendingTasks,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';

/** What happened to a link the visitor wanted to copy. */
export type CopyLinkResult = 'copied' | 'shared' | 'failed';

/**
 * Copies `text` to the clipboard; false = no clipboard access (old browser, page not in a secure context such as a
 * LAN IP, permission denied) – the caller then shows the text in a readonly field to copy by hand.
 *
 * Call it straight from a click handler and never after an `await`: the clipboard needs the click's user activation.
 */
export function copyText(text: string): Promise<boolean> {
  // the clipboard call runs synchronously, while the click still counts as user activation
  let copy: Promise<void>;
  try {
    copy = navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
  } catch (error) {
    copy = Promise.reject(error);
  }
  return copy.then(
    () => true,
    () => false,
  );
}

/**
 * Copies `url` to the clipboard; without clipboard access opens the native share sheet instead. 'failed' = neither
 * worked or the visitor closed the share sheet – the caller then shows the URL to copy by hand.
 *
 * Call it straight from a click handler and never after an `await`: both APIs need the click's user activation, and
 * a clipboard rejection caused by a lost activation must not end up in the share sheet.
 */
export function copyLink(url: string, title?: string): Promise<CopyLinkResult> {
  return copyText(url).then((copied) => (copied ? 'copied' : share(url, title)));
}

async function share(url: string, title?: string): Promise<CopyLinkResult> {
  if (typeof navigator.share !== 'function') return 'failed';
  try {
    await navigator.share(title ? { url, title } : { url });
    return 'shared';
  } catch {
    // AbortError = the visitor closed the share sheet; nothing to report either way
    return 'failed';
  }
}

/**
 * The state behind a "Kopírovať odkaz" button (the guide page, the event dialog, the calendar subscription): the
 * confirmation in its `role="status"` element for 2.5 s, or the URL to copy by hand in a readonly field that gets the
 * focus. Create it as a component field (it needs the injection context); `manual` returns that field's input.
 *
 * The confirmation is cleared first and set again on the next frame, so a second copy within the 2.5 s changes the
 * status text again and a screen reader announces it again.
 */
export class CopyLinkStatus {
  private readonly copiedState = signal(false);
  private readonly manualState = signal('');
  readonly copied = this.copiedState.asReadonly();
  /** the URL to copy by hand when neither the clipboard nor the share sheet worked, '' otherwise */
  readonly manualUrl = this.manualState.asReadonly();

  private readonly injector = inject(Injector);
  private readonly pending = inject(PendingTasks);
  private timer?: ReturnType<typeof setTimeout>;
  private frame?: { id: number; done: () => void };

  constructor(private readonly manual: () => HTMLInputElement | undefined) {
    inject(DestroyRef).onDestroy(() => this.reset());
  }

  /** No `await` before this call: the clipboard needs the click's user activation. */
  copy(url: string, title?: string): void {
    copyLink(url, title).then((result) => this.show(result, url));
  }

  /** hides the confirmation and the manual field (another guide opened in the same page) */
  reset(): void {
    clearTimeout(this.timer);
    if (this.frame) {
      cancelAnimationFrame(this.frame.id);
      this.frame.done();
      this.frame = undefined;
    }
    this.copiedState.set(false);
    this.manualState.set('');
  }

  private show(result: CopyLinkResult, url: string): void {
    this.reset();
    if (result === 'copied') {
      // fixture.whenStable() in the tests waits for the frame
      const done = this.pending.add();
      const id = requestAnimationFrame(() => {
        this.frame = undefined;
        done();
        this.copiedState.set(true);
        this.timer = setTimeout(() => this.copiedState.set(false), 2500);
      });
      this.frame = { id, done };
    } else if (result === 'failed') {
      this.manualState.set(url);
      afterNextRender(
        () => {
          const input = this.manual();
          input?.focus();
          input?.select();
        },
        { injector: this.injector },
      );
    }
  }
}
