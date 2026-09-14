import {
  emptyProviderForm,
  providerFormInitial,
  providerFormIsComplete,
  providerFormPayload,
} from "./provider-form";

describe("provider form", () => {
  const filled = {
    ...emptyProviderForm,
    key: " zaryar ",
    baseUrl: " https://pnlapi.example.ir/signalr ",
    sendOtpUrl: " https://example.ir/api/send ",
    verifyCodeUrl: " https://example.ir/api/verify ",
    webPanelUrl: " https://panel.example.ir ",
    phone: " 09120000000 ",
  };

  describe("submitting", () => {
    /**
     * The activation URLs are the whole point of the form for a provider that
     * has to be activated. They lived in the form's state but had no inputs, so
     * they were always sent as undefined — the engine then had nothing to POST
     * the phone number to.
     */
    it("sends the activation urls", () => {
      const body = providerFormPayload(filled);
      expect(body.sendOtpUrl).toBe("https://example.ir/api/send");
      expect(body.verifyCodeUrl).toBe("https://example.ir/api/verify");
    });

    it("sends the web panel url", () => {
      expect(providerFormPayload(filled).webPanelUrl).toBe("https://panel.example.ir");
    });

    it("trims every value it sends", () => {
      const body = providerFormPayload(filled);
      expect(body.key).toBe("zaryar");
      expect(body.baseUrl).toBe("https://pnlapi.example.ir/signalr");
      expect(body.phone).toBe("09120000000");
    });

    it("omits a blank optional field instead of clearing the stored one", () => {
      const body = providerFormPayload({ ...emptyProviderForm, key: "k", baseUrl: "b" });
      expect(body.sendOtpUrl).toBeUndefined();
      expect(body.verifyCodeUrl).toBeUndefined();
      expect(body.webPanelUrl).toBeUndefined();
      expect(body.apiBaseUrl).toBeUndefined();
    });

    it("treats whitespace as blank", () => {
      expect(providerFormPayload({ ...emptyProviderForm, sendOtpUrl: "   " }).sendOtpUrl).toBeUndefined();
    });
  });

  describe("opening an existing provider", () => {
    // Editing used to reset both URLs to empty, so the admin could not see what
    // was configured — and a re-save looked like it had wiped them.
    it("shows the activation urls that are stored", () => {
      const form = providerFormInitial({
        key: "talaab",
        sendOtpUrl: "https://t.example.ir/send",
        verifyCodeUrl: "https://t.example.ir/verify",
      });
      expect(form.sendOtpUrl).toBe("https://t.example.ir/send");
      expect(form.verifyCodeUrl).toBe("https://t.example.ir/verify");
    });

    it("round-trips a provider unchanged through the form", () => {
      const provider = {
        key: "zaryar",
        category: "zaryar",
        baseUrl: "https://pnlapi.example.ir/signalr",
        apiBaseUrl: "https://pnlapi.example.ir",
        persianName: "زریار",
        webPanelUrl: "https://panel.example.ir",
        phone: "09120000000",
        priceUnit: "IRR",
        sendOtpUrl: "https://example.ir/api/send",
        verifyCodeUrl: "https://example.ir/api/verify",
      };
      expect(providerFormPayload(providerFormInitial(provider))).toEqual(provider);
    });

    it("falls back to the defaults for a new provider", () => {
      const form = providerFormInitial();
      expect(form).toEqual(emptyProviderForm);
      expect(form.category).toBe("zaryar");
      expect(form.priceUnit).toBe("TOMAN");
    });
  });

  describe("completeness", () => {
    it("needs a key, a category and a base url", () => {
      expect(providerFormIsComplete(filled)).toBe(true);
      expect(providerFormIsComplete({ ...filled, key: "  " })).toBe(false);
      expect(providerFormIsComplete({ ...filled, baseUrl: "" })).toBe(false);
      expect(providerFormIsComplete({ ...filled, category: "" })).toBe(false);
    });

    it("does not require the activation urls — they can be filled in later", () => {
      expect(
        providerFormIsComplete({ ...filled, sendOtpUrl: "", verifyCodeUrl: "" }),
      ).toBe(true);
    });
  });
});
