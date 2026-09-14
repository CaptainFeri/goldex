import { ProviderManageConsumer } from './provider-manage.consumer';
import { MessagePatterns } from '../rabbitmq/rabbitmq.module';

/**
 * Activation is the one command pair whose outcome somebody is waiting for.
 *
 * Every handler on this consumer catches what it calls and logs it, which is
 * right for a refresh or a balance fetch — nothing is listening. For send-otp
 * and verify-otp it meant the admin panel reported success over a rejected
 * code, with the real reason left in this container's log.
 */
describe('provider management commands', () => {
  const build = (provider: any) => {
    const rabbit = {
      reply: jest.fn(() => Promise.resolve()),
      publish: jest.fn(() => Promise.resolve(true)),
    };
    const consumer = new ProviderManageConsumer(
      rabbit as any,
      provider as any,
      {} as any,
      {} as any,
      {} as any,
      { log: jest.fn(), error: jest.fn(), warn: jest.fn() } as any,
    );
    return { consumer, rabbit };
  };

  const command = (pattern: string, data: Record<string, unknown>) => ({
    pattern,
    data,
    timestamp: new Date().toISOString(),
    replyTo: 'amq.gen-reply',
    correlationId: 'corr-1',
  });

  describe('sending a code', () => {
    it('answers the caller when the provider accepted the number', async () => {
      const { consumer, rabbit } = build({
        findByKey: jest.fn().mockResolvedValue({ id: 'p1', key: 'zaryar' }),
        sendOtp: jest.fn().mockResolvedValue({ message: 'OTP sent to 0912' }),
      });

      await (consumer as any).handleSendOtp(
        command(MessagePatterns.PROVIDER_COMMAND_SEND_OTP, { key: 'zaryar', phone: '0912' }),
      );

      expect(rabbit.reply).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ ok: true }),
      );
    });

    it('answers with the failure rather than swallowing it', async () => {
      const { consumer, rabbit } = build({
        findByKey: jest.fn().mockResolvedValue({ id: 'p1', key: 'zaryar' }),
        sendOtp: jest.fn().mockRejectedValue(new Error('no sendOtpUrl configured')),
      });

      await (consumer as any).handleSendOtp(
        command(MessagePatterns.PROVIDER_COMMAND_SEND_OTP, { key: 'zaryar', phone: '0912' }),
      );

      expect(rabbit.reply).toHaveBeenCalledWith(expect.anything(), {
        ok: false,
        error: 'no sendOtpUrl configured',
      });
    });

    it('answers even when the provider key is unknown', async () => {
      const { consumer, rabbit } = build({
        findByKey: jest.fn().mockRejectedValue(new Error('Provider not found')),
      });

      await (consumer as any).handleSendOtp(
        command(MessagePatterns.PROVIDER_COMMAND_SEND_OTP, { key: 'ghost', phone: '0912' }),
      );

      expect(rabbit.reply).toHaveBeenCalledWith(expect.anything(), {
        ok: false,
        error: 'Provider not found',
      });
    });
  });

  describe('verifying a code', () => {
    it('reports the provider as on when it is', async () => {
      const { consumer, rabbit } = build({
        findByKey: jest.fn().mockResolvedValue({ id: 'p1', key: 'zaryar' }),
        verifyOtp: jest.fn().mockResolvedValue({ key: 'zaryar', active: true }),
      });

      await (consumer as any).handleVerifyOtp(
        command(MessagePatterns.PROVIDER_COMMAND_VERIFY_OTP, { key: 'zaryar', otp: '1234' }),
      );

      expect(rabbit.reply).toHaveBeenCalledWith(expect.anything(), {
        ok: true,
        data: { key: 'zaryar', active: true },
      });
    });

    it('passes a wrong code back as the failure it is', async () => {
      const { consumer, rabbit } = build({
        findByKey: jest.fn().mockResolvedValue({ id: 'p1', key: 'zaryar' }),
        verifyOtp: jest.fn().mockRejectedValue(new Error('Verification failed')),
      });

      await (consumer as any).handleVerifyOtp(
        command(MessagePatterns.PROVIDER_COMMAND_VERIFY_OTP, { key: 'zaryar', otp: '0000' }),
      );

      expect(rabbit.reply).toHaveBeenCalledWith(expect.anything(), {
        ok: false,
        error: 'Verification failed',
      });
    });
  });

  describe('announcing a failure', () => {
    // The reply reaches whoever asked. The event is for everything else looking
    // at the provider afterwards, and it says which half of the flow broke.
    it('names the stage that failed', async () => {
      const { consumer, rabbit } = build({
        findByKey: jest.fn().mockResolvedValue({ id: 'p1', key: 'zaryar' }),
        verifyOtp: jest.fn().mockRejectedValue(new Error('Verification failed')),
      });

      await (consumer as any).handleVerifyOtp(
        command(MessagePatterns.PROVIDER_COMMAND_VERIFY_OTP, { key: 'zaryar', otp: '0000' }),
      );

      expect(rabbit.publish).toHaveBeenCalledWith(
        MessagePatterns.PROVIDER_OTP_FAILED,
        { key: 'zaryar', stage: 'verify-otp', error: 'Verification failed' },
        'zaryar',
      );
    });

    it('says nothing when the command succeeded', async () => {
      const { consumer, rabbit } = build({
        findByKey: jest.fn().mockResolvedValue({ id: 'p1', key: 'zaryar' }),
        sendOtp: jest.fn().mockResolvedValue({ message: 'sent' }),
      });

      await (consumer as any).handleSendOtp(
        command(MessagePatterns.PROVIDER_COMMAND_SEND_OTP, { key: 'zaryar', phone: '0912' }),
      );

      expect(rabbit.publish).not.toHaveBeenCalled();
    });
  });
});
