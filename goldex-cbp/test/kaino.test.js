const axios = require("axios");
const crypto = require("crypto");

class WalletService {
  constructor(config) {
    this.apiBaseUrl = config.apiBaseUrl;
    this.securityKey = config.securityKey.replace(/\s+/g, "");
    this.username = config.username;
    this.password = config.password;
    this.tenant = config.tenant;
    this.token = null;
  }

  /**
   * Helper function to format Date to YYYY/MM/DD-HH:MM:SS
   */
  _formatDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");

    return `${yyyy}/${mm}/${dd}-${hh}:${min}:${ss}`;
  }

  /**
   * 1. Authenticates with the IPG service and retrieves the Bearer token.
   */
  async login() {
    try {
      console.log("Logging in to IPG service...");

      const response = await axios.post(`${this.apiBaseUrl}/login`, {
        username: this.username,
        password: this.password,
      });

      this.token =
        response.data.token ||
        response.data.access_token ||
        response.data.result;

      if (!this.token) {
        throw new Error(
          "Login successful but no token was found in the response.",
        );
      }

      console.log("Login successful. Token received.");
      return this.token;
    } catch (error) {
      console.error(
        "Login failed:",
        error.response ? error.response.data : error.message,
      );
      throw error;
    }
  }

  /**
   * 2. Calls the chargeWallet API using the authenticated Bearer token.
   */
  async chargeWallet(requestData) {
    try {
      if (!this.token) {
        await this.login();
      }

      // Format the current date/time if not explicitly provided in requestData
      const formattedDate =
        requestData.localDate || this._formatDate(new Date());

      const payload = {
        identifier: requestData.identifier,
        bankDepositIdentifier: requestData.accountNumber,
        tenant: this.tenant,
        amount: requestData.amount.toString(),
        username: this.username,
        payerMobileNumber: requestData.payerMobileNumber,
        accountNumber: requestData.accountNumber,
        localDate: formattedDate, // <--- Formatted as YYYY/MM/DD-HH:MM:SS
        callBackUrl: requestData.callBackUrl,
        voucherReference: requestData.voucherReference || null,
        autoVerify:
          requestData.autoVerify != null
            ? requestData.autoVerify.toString()
            : null,
        itemText: requestData.itemText || "Wallet Charge",
        description: requestData.description || "",
        securityKey: this.securityKey,
      };

      payload.signText = this._generateSignature(payload);

      const response = await axios.post(
        `${this.apiBaseUrl}/wallet/charge`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
          },
        },
      );

      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.warn("Token expired or invalid. Re-authenticating...");
        this.token = null;
        return this.chargeWallet(requestData);
      }

      console.error(
        "Error charging wallet:",
        error.response ? error.response.data : error.message,
      );
      throw error;
    }
  }

  /**
   * Generates the signature text based on the Java backend logic.
   */
  _generateSignature(payload) {
    const signArray = [
      payload.identifier,
      payload.bankDepositIdentifier,
      payload.tenant,
      payload.amount,
      payload.username,
      payload.payerMobileNumber,
      payload.accountNumber,
      payload.localDate, // Uses the exact YYYY/MM/DD-HH:MM:SS string
      payload.callBackUrl,
      payload.voucherReference,
      payload.autoVerify,
      payload.itemText,
      payload.description,
    ];

    const cleanArray = signArray.map((val) =>
      val === null || val === undefined ? "" : val,
    );
    const rawText = cleanArray.join("#"); // Verify delimiter with backend
    const hash = crypto
      .createHash("sha256")
      .update(rawText, "utf8")
      .digest("hex"); // Verify algorithm with backend

    return hash;
  }
}

// ==========================================
// Example Usage:
// ==========================================

const walletService = new WalletService({
  apiBaseUrl: "https://inopay.done.ir",
  username: "2000004855092",
  password: "Rr123456@",
  tenant: "DONE",
  securityKey: `MIIEogIBAAKCAQEAuOU89guC025nEdET9FONmD1F5J1cPa0ceAJew1oY5RvMviVB5xwN0qr0I95IQVaGM4+oMCiFBk76jCcGgHej+lFLzwkG4Wop8zOmDm0Lh6MPZym16z8LwepPaBxBrA3xS82t10DNZjQCuzalDAIQ10FUD9IjapgJAvwJHiX+PFA3oySB0E0zrPHg/tGHWcvf1eCaMStpymdLld6XUAqSwO8Lc2XqWzAwjBI/xX+YtR39mXNU2OONAUB1uT1tqyna10cI2Jy843+bnnohWZvAwlxqP8kop2pqP/mKgyJpBZfA6cYQ2G54GI2TtzHwy03nZl5CrVZbW046xflLxGgVJQIDAQABAoIBACr7R1+fL2t9N8KhivT6U2k3nT7XAfFog7y2OFdLY4wnGUJ+oMJb+C6oBRctfjiKJ6pm099WHA5qX74i+FT2+wyex3O6knnmVxgtQoYJ/WsrkdIWlS65uj76/DikkPOxTg2kI6xtaRJANv5UZqvS8x1HF4aSAB+wdi/WbTwv8tkMGykmRImw5Ge7lbyvd6yCXlnH4sd3p0ecHh0EqAmTpCVmcyzUmc+lYU/nq0E8Ic3gRZnrX1EbjHymm9USRq+BlLwHI16z68WWt7th8cEnlH2U7FcFV0/FXLEk5DKLxziuznFEV6WpxCtnL8TLxPdms72kZUeXMgJINHivytw06EUCgYEA8I8T7O7ZL4vkfT60DbKEo+7x/OSL8MF4FEHduGmGMxUXQzKZpmssBaLyh5D30Pg+Er6LZNnxkgGi/8ExXG/trKyxvvgX8PmGWP1ROvtg+4iskLq8GMc9/8eFZQOKtfajg9NY3ENQSiJPH07niYyQZfRszvOV9BvvlASYLz7LzQMCgYEAxMN8NnI5YyzutyzDN9FrpjtH/8uD2ivHLaFady+Vbw//fu9jnqew8OaFCpxaKIZ7EnUg0CU1eEO8CO/cr46Ku3S9H28swWc8IelelaBC6MMH84hIWw1hUnMvNpA2KNe0Nyvr+Mdv6gXZLXsAJyu5b9RO3REA87MB2avqvS3q2LcCgYB1J2kv0Z7KLhoH+PqdVRyN7ffCDtgsVzyQuQcvIY0u4Y2jt0fnKXiWAiaVaT+XcN5iKJQgeJfSYKOuZLsSZpxcpPonpBGc1Rjdy/i8feJcfdJ05cxnUNlb8SKA8HmkZsp5j/tNwiafBBh+ieHvNhq43JIFM9IKwXQrJRWspKuCWwKBgH8IEj54ejJcRPX/sT1tOAnHRhGQC90j3GDKRkSidOCSPIpv9Snt659rxEL4dICrafOdqQSYsS+m01QVv62b4ldp49vSg9uNUdY2+3iwUeJCX/TLbKNUPRvk/3tDmaO+tzvTYHJqGAfHpNHnEk83vG3FbPDuVGYBkNU+V7uxVGh7AoGAJJmhxfqbJ8tefvmV+wXXqSqvGTPi/j+x8dWbB59WBvt3ax+nWLjGAtXcJ1kHd1kDGjdw+FxxV3GCMLjYx6sE7yjpRcCHPtkToBAoyvVo0zXAIsZ9p+wf7oJPW83OAbHD3Yido2bCFIIeGKyQCAwVI1ccU4ePzjCmc8c6RBAjBKI=`,
});

async function executePayment() {
  const chargeRequest = {
    identifier: "UNIQUE_TXN_ID_12345",
    amount: 100000,
    payerMobileNumber: "09106299465",
    accountNumber: "2000004855092",
    callBackUrl: "https://yourwebsite.com/payment/callback",
    description: "شارژ کیف پول کاربر",
    autoVerify: true,
    // voucherReference: "VOUCHER_001",
    // localDate is optional here; if omitted, it uses the current time formatted as YYYY/MM/DD-HH:MM:SS
  };

  try {
    const result = await walletService.chargeWallet(chargeRequest);
    console.log("Wallet charged successfully:", result);
  } catch (error) {
    console.error("Payment flow failed:", error);
  }
}

executePayment();
