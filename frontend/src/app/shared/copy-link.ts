/** What happened to a link the visitor wanted to copy. */
export type CopyLinkResult = 'copied' | 'shared' | 'failed';

/**
 * Copies `url` to the clipboard; without clipboard access (old browser, page not in a secure context such as a LAN IP)
 * opens the native share sheet instead. 'failed' = neither worked or the visitor closed the share sheet – the caller
 * then shows the URL to copy by hand.
 *
 * Call it straight from a click handler and never after an `await`: both APIs need the click's user activation, and
 * a clipboard rejection caused by a lost activation must not end up in the share sheet.
 */
export function copyLink(url: string, title?: string): Promise<CopyLinkResult> {
  // the clipboard call runs synchronously, while the click still counts as user activation
  let copy: Promise<void>;
  try {
    copy = navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject(new Error('no clipboard'));
  } catch (error) {
    copy = Promise.reject(error);
  }
  return copy.then(
    (): CopyLinkResult => 'copied',
    () => share(url, title),
  );
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
