/**
 * The provider form's two edges: what an existing provider becomes when the
 * form opens, and what the form becomes when it is submitted.
 *
 * Both used to be inline in `ProvidersPage`, and both were quietly wrong. The
 * form carried `sendOtpUrl` and `verifyCodeUrl` in its state but rendered no
 * inputs for them, so a provider created from the panel always reached the
 * engine without the two URLs that OTP activation is made of; and opening an
 * existing provider for edit reset both to empty rather than showing what was
 * stored. Pulling them out here is what makes either testable.
 */

export interface ProviderFormFields {
  key: string;
  category: string;
  baseUrl: string;
  apiBaseUrl: string;
  persianName: string;
  webPanelUrl: string;
  phone: string;
  priceUnit: string;
  sendOtpUrl: string;
  verifyCodeUrl: string;
}

export interface ProviderFormSource {
  key?: string;
  category?: string;
  baseUrl?: string;
  apiBaseUrl?: string;
  persianName?: string;
  webPanelUrl?: string;
  phone?: string;
  priceUnit?: string;
  sendOtpUrl?: string;
  verifyCodeUrl?: string;
}

export const emptyProviderForm: ProviderFormFields = {
  key: "",
  category: "zaryar",
  baseUrl: "",
  apiBaseUrl: "",
  persianName: "",
  webPanelUrl: "",
  phone: "",
  priceUnit: "TOMAN",
  sendOtpUrl: "",
  verifyCodeUrl: "",
};

/** Fills the form from a provider, so an edit starts at what is stored. */
export function providerFormInitial(provider?: ProviderFormSource): ProviderFormFields {
  if (!provider) return { ...emptyProviderForm };
  return {
    key: provider.key ?? "",
    category: provider.category ?? "zaryar",
    baseUrl: provider.baseUrl ?? "",
    apiBaseUrl: provider.apiBaseUrl ?? "",
    persianName: provider.persianName ?? "",
    webPanelUrl: provider.webPanelUrl ?? "",
    phone: provider.phone ?? "",
    priceUnit: provider.priceUnit ?? "TOMAN",
    sendOtpUrl: provider.sendOtpUrl ?? "",
    verifyCodeUrl: provider.verifyCodeUrl ?? "",
  };
}

/**
 * The request body. Optional fields left blank are omitted rather than sent as
 * `""`, so a PATCH that does not touch them leaves the stored value alone.
 */
export function providerFormPayload(form: ProviderFormFields): Record<string, unknown> {
  const optional = (value: string) => value.trim() || undefined;
  return {
    key: form.key.trim(),
    category: form.category,
    baseUrl: form.baseUrl.trim(),
    apiBaseUrl: optional(form.apiBaseUrl),
    persianName: optional(form.persianName),
    webPanelUrl: optional(form.webPanelUrl),
    phone: form.phone.trim(),
    priceUnit: form.priceUnit,
    sendOtpUrl: optional(form.sendOtpUrl),
    verifyCodeUrl: optional(form.verifyCodeUrl),
  };
}

/** The form cannot be submitted without the fields the engine has no default for. */
export function providerFormIsComplete(form: ProviderFormFields): boolean {
  return !!(form.key.trim() && form.category && form.baseUrl.trim());
}
