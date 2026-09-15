import { BROWSER_LOCALE, BROWSER_TIMEZONE, desktopUserAgent } from './browser-identity';

/**
 * Headless Chromium announces itself as `HeadlessChrome` on `X11; Linux`, and a
 * site that sniffs that reads it as a bot — which is how this browser came to
 * be handed an app download where the login page should have been.
 */
describe('how the browser presents itself', () => {
  it('says nothing about being headless', () => {
    expect(desktopUserAgent('141.0.7390.54')).not.toMatch(/headless/i);
  });

  it('presents a platform a provider panel is signed into from', () => {
    const ua = desktopUserAgent('141.0.7390.54');
    expect(ua).toContain('Windows NT 10.0; Win64; x64');
    expect(ua).not.toContain('X11');
    expect(ua).not.toContain('Linux');
  });

  // A UA claiming a version the engine is not would be its own oddity — the
  // point is to look ordinary, not to look like something else entirely.
  it('carries the real major version', () => {
    expect(desktopUserAgent('141.0.7390.54')).toContain('Chrome/141.0.0.0');
    expect(desktopUserAgent('130.0.1.2')).toContain('Chrome/130.0.0.0');
  });

  it('falls back to something plausible for an unreadable version', () => {
    expect(desktopUserAgent('')).toMatch(/Chrome\/\d+\.0\.0\.0/);
    expect(desktopUserAgent('not-a-version')).toMatch(/Chrome\/\d+\.0\.0\.0/);
  });

  it('keeps Chrome’s own shape, which is what is being recognised', () => {
    expect(desktopUserAgent('141.0.0.0')).toMatch(
      /^Mozilla\/5\.0 \(.+\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/.+ Safari\/537\.36$/,
    );
  });

  it('visits as a Persian-speaking visitor in Tehran', () => {
    expect(BROWSER_LOCALE).toBe('fa-IR');
    expect(BROWSER_TIMEZONE).toBe('Asia/Tehran');
  });
});
