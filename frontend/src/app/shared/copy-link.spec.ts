import { copyLink } from './copy-link';

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
