import { captureAuth, findSession, mightCarryAuth } from './auth-capture';

/**
 * Recognising a login from outside the page, which is what replaces the script
 * the Android app injected into the provider's own page.
 */
describe('capturing credentials', () => {
  describe('finding the session', () => {
    it('reads a Zaryar login, nested under Data.user', () => {
      const captured = captureAuth(
        {
          IsSuccess: true,
          Data: { user: { token: 'tok-1', uId: 'u-1', sessionId: 's-1', roleType: '0' } },
        },
        'https://api.example.ir/Account/Verify',
      );
      expect(captured?.auth).toMatchObject({ token: 'tok-1', uId: 'u-1', sessionId: 's-1' });
      expect(captured?.sourceUrl).toBe('https://api.example.ir/Account/Verify');
    });

    it('reads a Talaab login, nested under data', () => {
      expect(captureAuth({ success: true, data: { token: 'tok-2' } }, 'u')?.auth.token).toBe(
        'tok-2',
      );
    });

    it('reads a bare session object', () => {
      expect(captureAuth({ token: 'tok-3' }, 'u')?.auth.token).toBe('tok-3');
    });

    it('trims the token', () => {
      expect(captureAuth({ token: '  tok  ' }, 'u')?.auth.token).toBe('tok');
    });
  });

  describe('what is not a login', () => {
    /**
     * A page fetches a great deal of JSON. Treating any of it as credentials
     * would store a CSRF token or an analytics key as the provider's session.
     */
    it('ignores a response with no token', () => {
      expect(captureAuth({ prices: [1, 2, 3] }, 'u')).toBeNull();
    });

    it('ignores an empty token', () => {
      expect(captureAuth({ token: '   ' }, 'u')).toBeNull();
    });

    it('ignores a failed login', () => {
      expect(captureAuth({ IsSuccess: false, Message: 'کد اشتباه است' }, 'u')).toBeNull();
    });

    it('ignores an array', () => {
      expect(captureAuth([{ token: 'x' }], 'u')).toBeNull();
    });

    it('ignores a null body', () => {
      expect(captureAuth(null, 'u')).toBeNull();
      expect(findSession(undefined)).toBeNull();
    });

    // A deep scan for anything named "token" would find this and call it a
    // login; only the nestings these providers actually use are searched.
    it('does not go digging for a token buried somewhere unrelated', () => {
      expect(captureAuth({ config: { analytics: { token: 'ga-123' } } }, 'u')).toBeNull();
    });
  });

  describe('what gets kept', () => {
    it('keeps strings and numbers, drops nested structures', () => {
      const captured = captureAuth(
        { token: 'tok', roleType: 0, menus: [{ id: 1 }], perms: { a: true }, ok: true },
        'u',
      );
      expect(captured?.auth).toEqual({ token: 'tok', roleType: 0 });
    });
  });

  describe('deciding whether to read a body at all', () => {
    // Reading every response would mean buffering images, fonts and bundles to
    // look for a token that is never in them.
    it('only considers json', () => {
      expect(mightCarryAuth('application/json; charset=utf-8', 500)).toBe(true);
      expect(mightCarryAuth('image/png', 500)).toBe(false);
      expect(mightCarryAuth('text/html', 500)).toBe(false);
      expect(mightCarryAuth('', 500)).toBe(false);
    });

    it('skips a json body far too large to be a session', () => {
      expect(mightCarryAuth('application/json', 5_000_000)).toBe(false);
    });

    it('considers a json response whose length was not declared', () => {
      expect(mightCarryAuth('application/json', 0)).toBe(true);
    });
  });
});
