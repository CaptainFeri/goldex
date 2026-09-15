import { LoginDeviceService, hashToken } from './login-device.service';
import { DeviceAuthGuard } from './device-auth.guard';
import { ProviderLoginDeviceEntity } from '../entity/provider-login-device.entity';

/**
 * The credential a handset carries instead of an admin session.
 *
 * What is being tested here is mostly what the credential refuses to do. It
 * exists because a phone left on a desk for weeks is the worst place to keep a
 * token that opens the whole platform — so the properties that matter are that
 * the secret cannot be read back, that revoking it takes effect, and that
 * nothing but a valid one gets in.
 */
describe('a device credential', () => {
  const build = () => {
    const rows: ProviderLoginDeviceEntity[] = [];
    const repo = {
      create: jest.fn((data: any) => ({ ...data }) as ProviderLoginDeviceEntity),
      save: jest.fn((row: any) => {
        const existing = rows.find((r) => r.id && r.id === row.id);
        if (existing) {
          Object.assign(existing, row);
          return Promise.resolve(existing);
        }
        const saved = { ...row, id: row.id ?? `dev-${rows.length + 1}`, createAt: new Date() };
        rows.push(saved);
        return Promise.resolve(saved);
      }),
      find: jest.fn(() => Promise.resolve([...rows])),
      findOne: jest.fn(({ where }: any) =>
        Promise.resolve(
          rows.find((r) => {
            if (where.id !== undefined) return r.id === where.id;
            // IsNull() for revokedAt is an object, not a value; treating any
            // non-string as "must be unrevoked" is enough for these.
            const wantsUnrevoked = where.revokedAt !== undefined;
            return (
              r.tokenHash === where.tokenHash && (!wantsUnrevoked || !r.revokedAt)
            );
          }) ?? null,
        ),
      ),
      update: jest.fn((where: any, patch: any) => {
        const row = rows.find((r) => r.id === where.id);
        if (row) Object.assign(row, patch);
        return Promise.resolve({ affected: 1 });
      }),
    };
    return { service: new LoginDeviceService(repo as any), rows, repo };
  };

  describe('enrolling one', () => {
    it('hands back a secret that is recognisable as ours', async () => {
      const { service } = build();
      const { token } = await service.enroll('گوشی میز اپراتور');
      expect(token).toMatch(/^gxd_/);
      // 32 bytes as base64url, so long enough that guessing is not a threat
      // the system has to defend against with rate limits.
      expect(token.length).toBeGreaterThan(40);
    });

    it('gives every device a different one', async () => {
      const { service } = build();
      const a = await service.enroll('one');
      const b = await service.enroll('two');
      expect(a.token).not.toBe(b.token);
    });

    /**
     * The property the whole design rests on: a database dump is not a set of
     * keys to the platform.
     */
    it('never stores the secret itself', async () => {
      const { service, rows } = build();
      const { token } = await service.enroll('desk');
      expect(rows[0].tokenHash).not.toContain(token);
      expect(rows[0].tokenHash).toBe(hashToken(token));
      expect(JSON.stringify(rows[0])).not.toContain(token.slice(4));
    });

    it('records who enrolled it', async () => {
      const { service, rows } = build();
      await service.enroll('desk', 'admin-1');
      expect(rows[0].createdByAdminId).toBe('admin-1');
    });
  });

  describe('recognising one', () => {
    it('admits the device the token belongs to', async () => {
      const { service } = build();
      const { device, token } = await service.enroll('desk');
      await expect(service.authenticate(token)).resolves.toMatchObject({ id: device.id });
    });

    it('refuses a token nobody was issued', async () => {
      const { service } = build();
      await service.enroll('desk');
      await expect(service.authenticate('gxd_not-a-real-token')).resolves.toBeNull();
    });

    it('refuses anything that is not one of ours', async () => {
      const { service } = build();
      await expect(service.authenticate(undefined)).resolves.toBeNull();
      await expect(service.authenticate('')).resolves.toBeNull();
      // An admin JWT is exactly the thing this credential replaces; presenting
      // one here must not work.
      await expect(service.authenticate('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.x.y')).resolves.toBeNull();
    });

    it('refuses a revoked device', async () => {
      const { service } = build();
      const { device, token } = await service.enroll('desk');
      await service.revoke(device.id);
      await expect(service.authenticate(token)).resolves.toBeNull();
    });

    it('records when it was last seen', async () => {
      const { service, rows } = build();
      const { token } = await service.enroll('desk');
      await service.authenticate(token);
      expect(rows[0].lastSeenAt).toBeInstanceOf(Date);
    });

    // A handset polling every thirty seconds would otherwise write to the row
    // constantly to record something nobody needs to the second.
    it('does not write on every single request', async () => {
      const { service, token, repo } = await (async () => {
        const b = build();
        const { token } = await b.service.enroll('desk');
        return { ...b, token };
      })();

      await service.authenticate(token);
      const writes = repo.update.mock.calls.length;
      await service.authenticate(token);
      await service.authenticate(token);
      expect(repo.update.mock.calls.length).toBe(writes);
    });
  });

  describe('revoking one', () => {
    it('keeps the record of the device', async () => {
      const { service, rows } = build();
      const { device } = await service.enroll('desk');
      await service.revoke(device.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].revokedAt).toBeInstanceOf(Date);
    });

    it('is not undone by revoking twice', async () => {
      const { service } = build();
      const { device } = await service.enroll('desk');
      const first = await service.revoke(device.id);
      const second = await service.revoke(device.id);
      expect(second.revokedAt).toEqual(first.revokedAt);
    });

    it('refuses a device that does not exist', async () => {
      const { service } = build();
      await expect(service.revoke('nope')).rejects.toThrow(/No such device/);
    });
  });

  describe('the guard in front of the device routes', () => {
    const context = (authorization?: string) =>
      ({
        switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
      }) as any;

    it('lets a valid credential through and says which device it is', async () => {
      const { service } = build();
      const { device, token } = await service.enroll('desk');
      const guard = new DeviceAuthGuard(service);

      const ctx = context(`Bearer ${token}`);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(ctx.switchToHttp().getRequest().headers.authorization).toContain(token);
      // The device is attached to the request the controller will read.
      const request: any = { headers: { authorization: `Bearer ${token}` } };
      await guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as any);
      expect(request.device.id).toBe(device.id);
    });

    /**
     * One message for all of them. Which of "absent", "malformed", "unknown"
     * and "revoked" it was is not something an unauthenticated caller should be
     * able to work out.
     */
    it('turns every kind of bad credential away the same way', async () => {
      const { service } = build();
      const { device, token } = await service.enroll('desk');
      const guard = new DeviceAuthGuard(service);

      await expect(guard.canActivate(context(undefined))).rejects.toThrow(/not valid/);
      await expect(guard.canActivate(context('Bearer nonsense'))).rejects.toThrow(/not valid/);
      await expect(guard.canActivate(context(token))).rejects.toThrow(/not valid/); // no scheme

      await service.revoke(device.id);
      await expect(guard.canActivate(context(`Bearer ${token}`))).rejects.toThrow(/not valid/);
    });
  });
});
