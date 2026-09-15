import { readPusherFrame } from './pusher-frames';

/**
 * The shop that was open, subscribed, and silent.
 *
 * Afrogh held a socket and a stored item list for hours without a single
 * price reaching Redis. Nothing in the log contradicted that, because the
 * provider announced the subscription before the server had answered it and
 * discarded every frame it did not recognise.
 */
describe('Pusher frame reader', () => {
  const frame = (event: string, data: unknown, channel?: string) =>
    readPusherFrame(JSON.stringify({ event, channel, data: JSON.stringify(data) }));

  it('reads the socket id out of the handshake', () => {
    const result = frame('pusher:connection_established', { socket_id: '123.456' });
    expect(result).toEqual({ kind: 'connection_established', socketId: '123.456' });
  });

  it('separates a confirmed subscription from a requested one', () => {
    const result = readPusherFrame(
      JSON.stringify({ event: 'pusher_internal:subscription_succeeded', channel: 'afrogh' }),
    );
    expect(result).toEqual({ kind: 'subscription_succeeded', channel: 'afrogh' });
  });

  it('reports a refused subscription, and whether the session was the reason', () => {
    const refused = frame('pusher_internal:subscription_error', { status: 403 }, 'afrogh');
    expect(refused).toMatchObject({
      kind: 'subscription_error',
      channel: 'afrogh',
      authRejected: true,
    });
    const other = frame('pusher_internal:subscription_error', { status: 500 }, 'afrogh');
    expect(other).toMatchObject({ authRejected: false });
  });

  it('treats an unauthorised connection as a dead credential and a quota error as not', () => {
    expect(
      frame('pusher:error', { code: 4009, message: 'Connection not authorized' }),
    ).toMatchObject({
      kind: 'error',
      authRejected: true,
    });
    expect(frame('pusher:error', { code: 4004, message: 'Over quota' })).toMatchObject({
      authRejected: false,
    });
  });

  it('pulls the vendor list out of a pricing push', () => {
    const result = frame('new-panel', {
      message: {
        type: 'all_systems_pricing_updated',
        data: { pricing: [{ currencies: [{ id: 3, buy_price: '1', sell_price: '2' }] }] },
      },
    });
    expect(result).toMatchObject({ kind: 'pricing' });
    expect(result.kind === 'pricing' && result.pricing[0].currencies[0].id).toBe(3);
  });

  it('names an unrecognised event rather than dropping it', () => {
    expect(frame('some-other-event', { message: { type: 'whatever' } })).toEqual({
      kind: 'other',
      event: 'some-other-event',
    });
  });

  it('survives a frame that is not JSON', () => {
    expect(readPusherFrame('<html>502</html>').kind).toBe('unreadable');
  });

  it('reads a payload that arrived as an object rather than a string', () => {
    const result = readPusherFrame(
      JSON.stringify({
        event: 'new-panel',
        data: { message: { type: 'all_systems_pricing_updated', data: { pricing: [] } } },
      }),
    );
    expect(result.kind).toBe('pricing');
  });

  it('notes what the home snapshot carries, since prices may be in it', () => {
    const result = frame('app', { message: { type: 'home_data', data: { molten: [], coin: [] } } });
    expect(result).toEqual({ kind: 'home_data', fields: ['molten', 'coin'] });
  });
});
