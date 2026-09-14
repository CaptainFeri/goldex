import { ProviderEntity } from '../entity/provider.entity';

type ProviderUrlField = 'sendOtpUrl' | 'verifyCodeUrl';

const FIELD_HINT: Record<ProviderUrlField, string> = {
  sendOtpUrl: 'the URL that asks the provider to text an activation code',
  verifyCodeUrl: 'the URL that exchanges that code for a token',
};

/**
 * Reads a provider URL that activation cannot proceed without.
 *
 * The handlers used to fall back to a template literal of the very field they
 * were checking, so a provider with no URL configured produced a request to the
 * literal string `undefined` and failed somewhere deep in axios. An admin
 * reading that error has no way to tell it means "you never filled this field
 * in". Naming the missing field is the whole point.
 */
export function requireProviderUrl(
  provider: ProviderEntity,
  field: ProviderUrlField,
): string {
  const url = provider[field]?.trim();
  if (!url) {
    throw new Error(
      `Provider "${provider.key}" has no ${field} configured — set ${FIELD_HINT[field]} before activating it`,
    );
  }
  return url;
}
