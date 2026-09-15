import { authFailureReason, isAuthFailure } from './auth-failure';

/**
 * The cost of each mistake is asymmetric, and that is what these are about.
 *
 * Missing an expiry leaves a provider down until somebody notices. Calling a
 * network failure an expiry asks the provider for a fresh code on every
 * hiccup, which burns an account's SMS quota and can get it locked. So the
 * rule is narrow on purpose: nothing counts unless the provider said so.
 */
describe('recognising a session the provider no longer accepts', () => {
  const axiosError = (status: number) => ({ isAxiosError: true, response: { status } });

  it('reads a 401 as the session being gone', () => {
    expect(isAuthFailure(axiosError(401))).toBe(true);
  });

  it('reads a 403 the same way', () => {
    // Some providers answer "forbidden" rather than "unauthorized" for a token
    // they have stopped honouring.
    expect(isAuthFailure(axiosError(403))).toBe(true);
  });

  it('accepts a status on the error itself, not only under a response', () => {
    expect(isAuthFailure({ status: 401 })).toBe(true);
  });

  it('does not read a server error as one', () => {
    expect(isAuthFailure(axiosError(500))).toBe(false);
    expect(isAuthFailure(axiosError(502))).toBe(false);
  });

  it('does not read a rate limit as one', () => {
    // 429 means "later", not "log in again", and logging in again would make
    // it worse.
    expect(isAuthFailure(axiosError(429))).toBe(false);
  });

  it('does not read a network failure as one', () => {
    expect(isAuthFailure(new Error('connect ETIMEDOUT'))).toBe(false);
    expect(isAuthFailure({ code: 'ECONNREFUSED' })).toBe(false);
  });

  it('survives whatever it is handed', () => {
    expect(isAuthFailure(undefined)).toBe(false);
    expect(isAuthFailure(null)).toBe(false);
    expect(isAuthFailure('401')).toBe(false);
    expect(isAuthFailure({ response: {} })).toBe(false);
  });

  it('names the call and the status it answered', () => {
    expect(authFailureReason(axiosError(401), 'metadata')).toBe('metadata answered 401');
  });
});
