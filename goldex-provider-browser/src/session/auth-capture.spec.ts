import {
  captureAuth,
  captureFromStorage,
  findSession,
  mightCarryAuth,
} from './auth-capture';

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

  describe("the Zaryar session, as the mock actually answers it", () => {
    /**
     * The exact body `buildVerifyOtp` returns, so the shape this has to read is
     * pinned to the shape that is actually sent rather than to a description of
     * it. Every field the provider hands back has to survive: the engine's
     * Zaryar provider signs its requests with uId, sessionId and shopkeeperId,
     * not with the token alone.
     */
    const mockVerifyOtp = {
      IsSuccess: true,
      Message: 'OK',
      Data: {
        user: {
          token: 'mock-token-shopA',
          uId: 'uid-shopA',
          userId: 'userid-shopA',
          roleType: '0',
          sessionId: 'mock-session-shopA',
          shopkeeperId: 'shopA',
        },
      },
    };

    it('keeps every field of the session', () => {
      const captured = captureAuth(mockVerifyOtp, 'https://panel.example.ir/api/User/VerifyCode');
      expect(captured?.auth).toEqual({
        token: 'mock-token-shopA',
        uId: 'uid-shopA',
        userId: 'userid-shopA',
        roleType: '0',
        sessionId: 'mock-session-shopA',
        shopkeeperId: 'shopA',
      });
    });

    it('drops the envelope around it', () => {
      const captured = captureAuth(mockVerifyOtp, 'u');
      expect(captured?.auth).not.toHaveProperty('IsSuccess');
      expect(captured?.auth).not.toHaveProperty('Message');
      expect(captured?.auth).not.toHaveProperty('Data');
    });

    it('records where it came from', () => {
      const url = 'https://panel.example.ir/api/User/VerifyCode';
      expect(captureAuth(mockVerifyOtp, url)?.sourceUrl).toBe(url);
    });

    // The same session, copied from a different place in the network tab.
    it('reads it just as well without the envelope', () => {
      expect(captureAuth(mockVerifyOtp.Data.user, 'u')?.auth.shopkeeperId).toBe('shopA');
    });
  });

  describe('reading the session out of page storage', () => {
    /**
     * A single-page app commonly answers the login over the network and then
     * keeps what it got in localStorage. From then on the session exists only
     * there, so watching responses alone can watch a perfectly good login go
     * past and catch nothing.
     */
    const session = {
      uId: 'mock-uid-shopA',
      token: 'mock-token-shopA',
      roleType: '0',
      sessionId: 'mock-session-shopA',
      shopkeeperId: 'shopA',
    };

    it('reads a session kept whole under one key', () => {
      const captured = captureFromStorage(
        { 'ng2-webstorage|user': JSON.stringify(session), theme: 'dark' },
        'localStorage',
      );
      expect(captured?.auth).toEqual(session);
      expect(captured?.sourceUrl).toContain('ng2-webstorage|user');
    });

    it('reads one wrapped the way the login response wraps it', () => {
      const captured = captureFromStorage(
        { auth: JSON.stringify({ Data: { user: session } }) },
        'localStorage',
      );
      expect(captured?.auth).toEqual(session);
    });

    it('reads the fields spread one per key', () => {
      const captured = captureFromStorage({ ...session, locale: 'fa' }, 'localStorage');
      expect(captured?.auth).toEqual(session);
      expect(captured?.auth).not.toHaveProperty('locale');
    });

    it('keeps only the fields that belong to a session', () => {
      const captured = captureFromStorage(
        { ...session, redirectUrl: '/dashboard', lastSeen: '2026-01-01' },
        'localStorage',
      );
      expect(Object.keys(captured!.auth).sort()).toEqual(
        ['roleType', 'sessionId', 'shopkeeperId', 'token', 'uId'].sort(),
      );
    });

    describe('what it refuses to call a session', () => {
      // Pages keep CSRF tokens, push tokens and analytics keys in storage.
      // Storing one of those as a provider's credentials would activate a
      // provider that then cannot authenticate — worse than not activating it.
      it('ignores a lone token with nothing of a session around it', () => {
        expect(captureFromStorage({ token: 'csrf-abc123' }, 'localStorage')).toBeNull();
      });

      it('ignores an unrelated token beside unrelated data', () => {
        expect(
          captureFromStorage({ token: 'ga-123', theme: 'dark', locale: 'fa' }, 'localStorage'),
        ).toBeNull();
      });

      it('ignores empty storage', () => {
        expect(captureFromStorage({}, 'localStorage')).toBeNull();
      });

      it('ignores an entry that is not JSON', () => {
        expect(captureFromStorage({ blob: 'not json at all' }, 'localStorage')).toBeNull();
      });

      it('ignores a session whose token is blank', () => {
        expect(
          captureFromStorage({ ...session, token: '   ' }, 'localStorage'),
        ).toBeNull();
      });
    });
  });
});
