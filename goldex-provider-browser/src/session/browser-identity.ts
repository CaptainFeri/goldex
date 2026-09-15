/**
 * How this browser presents itself to the provider's site.
 *
 * Headless Chromium announces itself as `HeadlessChrome` on `X11; Linux`, and
 * a site that sniffs the user agent reads that as a bot. Iranian provider
 * panels commonly answer such a visitor with their mobile app instead of the
 * page — which is exactly what this browser was getting: a file where the
 * login should have been, on a platform nobody signs in from.
 *
 * Presenting as an ordinary desktop Chrome is not a disguise for its own sake.
 * A person really is driving this browser, by hand, on a page they are entitled
 * to sign in to; the headless flag describes how the window is drawn, not who
 * is using it, and it is the one detail making the site serve something nobody
 * asked for.
 */

/** Chrome's own UA shape, with the platform a provider panel expects. */
export function desktopUserAgent(browserVersion: string): string {
  const major = /^(\d+)/.exec(browserVersion)?.[1] ?? '141';
  return (
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ` +
    `(KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
  );
}

/**
 * The rest of what a visitor to an Iranian gold panel looks like. A site that
 * renders prices and dates will otherwise do it in the wrong calendar and the
 * wrong timezone, which is its own way of not quite working.
 */
export const BROWSER_LOCALE = 'fa-IR';
export const BROWSER_TIMEZONE = 'Asia/Tehran';
