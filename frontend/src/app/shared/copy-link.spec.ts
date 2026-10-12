import { TestBed } from '@angular/core/testing';
import { CopyLinkStatus, copyLink, copyText } from './copy-link';

describe('copyLink', () => {
  const url = 'https://kd1035.eu/navody/commanderi/pary-pre-jazdu';

  function stubNavigator(clipboard?: { writeText: (text: string) => Promise<void> }, share?: (data: ShareData) => Promise<void>) {
    vi.stubGlobal('navigator', { ...(clipboard ? { clipboard } : {}), ...(share ? { share } : {}) });
  }

  afterEach(() => vi.unstubAllGlobals());

  it('copies to the clipboard and never opens the share sheet then', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ writeText }, share);

    expect(await copyLink(url, 'Páry pre jazdu')).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(url);
    expect(share).not.toHaveBeenCalled();
  });

  it('calls the clipboard synchronously, before the first await (user activation)', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ writeText });

    void copyLink(url);
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it('opens the share sheet when the clipboard rejects', async () => {
    const calls: string[] = [];
    const writeText = vi.fn(() => {
      calls.push('clipboard');
      return Promise.reject(new DOMException('denied', 'NotAllowedError'));
    });
    const share = vi.fn(() => {
      calls.push('share');
      return Promise.resolve();
    });
    stubNavigator({ writeText }, share);

    expect(await copyLink(url, 'Páry pre jazdu')).toBe('shared');
    expect(calls).toEqual(['clipboard', 'share']);
    expect(share).toHaveBeenCalledWith({ url, title: 'Páry pre jazdu' });
  });

  it('opens the share sheet without a clipboard (not a secure context)', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator(undefined, share);

    expect(await copyLink(url)).toBe('shared');
    expect(share).toHaveBeenCalledWith({ url });
  });

  it('fails when the clipboard throws and there is no share sheet', async () => {
    stubNavigator({
      writeText: () => {
        throw new Error('blocked');
      },
    });
    expect(await copyLink(url)).toBe('failed');
  });

  it('fails without clipboard and share sheet', async () => {
    stubNavigator();
    expect(await copyLink(url)).toBe('failed');
  });

  it('fails when the visitor closes the share sheet', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError'));
    stubNavigator(undefined, share);

    expect(await copyLink(url)).toBe('failed');
    expect(share).toHaveBeenCalledTimes(1);
  });
});

describe('copyText', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('copies to the clipboard synchronously and never opens the share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const share = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText }, share });
    const copied = copyText('**Rally (1)**');
    expect(writeText).toHaveBeenCalledWith('**Rally (1)**');
    expect(await copied).toBe(true);
    expect(share).not.toHaveBeenCalled();
  });

  it('reports a denied or missing clipboard (the caller shows the text to copy by hand)', async () => {
    const share = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) }, share });
    expect(await copyText('x')).toBe(false);
    vi.stubGlobal('navigator', { share });
    expect(await copyText('x')).toBe(false);
    expect(share).not.toHaveBeenCalled();
  });
});

describe('CopyLinkStatus', () => {
  const url = 'https://kd1035.eu/kalendar?event=5&on=2026-10-14';
  const answered = () => new Promise((resolve) => setTimeout(resolve)); // the clipboard's promise chain is done
  let frames: FrameRequestCallback[];
  const nextFrame = () => frames.splice(0).forEach((callback) => callback(0));

  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => vi.unstubAllGlobals());

  it('a second copy clears the confirmation and sets it again on the next frame (announced again)', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const status = TestBed.runInInjectionContext(() => new CopyLinkStatus(() => undefined));
    const seen: boolean[] = [];

    status.copy(url);
    await answered();
    seen.push(status.copied());
    nextFrame();
    seen.push(status.copied());

    // within a second: cleared first, so the status text changes, then set again
    status.copy(url);
    await answered();
    seen.push(status.copied());
    nextFrame();
    seen.push(status.copied());

    expect(seen).toEqual([false, true, false, true]);
    expect(status.manualUrl()).toBe('');
  });

  it('shows the URL to copy by hand when nothing worked, and reset() hides both', async () => {
    vi.stubGlobal('navigator', {});
    const input = document.createElement('input');
    document.body.append(input);
    const status = TestBed.runInInjectionContext(() => new CopyLinkStatus(() => input));
    status.copy(url);
    await new Promise((resolve) => setTimeout(resolve));
    expect(status.manualUrl()).toBe(url);
    expect(status.copied()).toBe(false);
    status.reset();
    expect(status.manualUrl()).toBe('');
    input.remove();
  });
});
