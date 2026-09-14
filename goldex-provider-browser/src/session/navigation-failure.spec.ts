import { explainNavigationFailure } from './session.service';

/**
 * Playwright's navigation errors are accurate and unhelpful in equal measure.
 * The admin is looking at a blank canvas; what they need is the next thing to
 * try, not the browser's own vocabulary.
 */
describe('explaining a failed navigation', () => {
  it('explains a URL that serves a file instead of a page', () => {
    const message = explainNavigationFailure('page.goto: Download is starting');
    expect(message).toContain('فایل');
    expect(message).not.toContain('Download is starting');
  });

  // Two opposite mistakes, and the message has to point at the right one: the
  // proxy failing means it should probably be off for this provider…
  it('points at the proxy setting when the tunnel fails', () => {
    expect(explainNavigationFailure('net::ERR_TUNNEL_CONNECTION_FAILED')).toContain(
      'عبور از پروکسی',
    );
  });

  // …while nothing answering at all usually means it should be on.
  it('points at the same setting the other way when nothing answers', () => {
    expect(explainNavigationFailure('net::ERR_CONNECTION_TIMED_OUT')).toContain(
      'عبور از پروکسی',
    );
  });

  it('names a bad hostname as a bad hostname', () => {
    expect(explainNavigationFailure('net::ERR_NAME_NOT_RESOLVED')).toContain('دامنه');
  });

  it('names a certificate problem', () => {
    expect(explainNavigationFailure('net::ERR_CERT_AUTHORITY_INVALID')).toContain('گواهی');
  });

  // Inventing an explanation for an error nobody anticipated would be worse
  // than passing the real one through.
  it('passes an unrecognised error through unchanged', () => {
    expect(explainNavigationFailure('net::ERR_SOMETHING_NEW')).toBe('net::ERR_SOMETHING_NEW');
  });
});
