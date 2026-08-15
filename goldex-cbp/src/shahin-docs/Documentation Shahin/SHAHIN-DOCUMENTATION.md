# مستندات سرویس شاهین (Shahin)

این مستندات نحوهٔ استفاده از سرویس شاهین در سیستم پارسزرگر و همچنین جزئیات فنی برای استفاده در پروژه‌های دیگر شرکت را شرح می‌دهد.

---

## فهرست

1. [معماری کلی](#معماری-کلی)
2. [استفاده از طریق بک‌اند اصلی (توصیه‌شده)](#استفاده-از-طریق-بکاند-اصلی)
3. [احراز هویت و امنیت](#احراز-هویت-و-امنیت)
4. [اندپوینت‌های API](#اندپوینتهای-api)
5. [نمونه درخواست و پاسخ](#نمونه-درخواست-و-پاسخ)
6. [جریان انتقال وجه (با OTP)](#جریان-انتقال-وجه)
7. [پیکربندی محیط](#پیکربندی-محیط)
8. [استفاده در پروژهٔ دیگر (میکروسرویس شاهین)](#استفاده-در-پروژه-دیگر)

---

## معماری کلی

```
┌─────────────┐      JWT       ┌──────────────────┐   X-API-Key   ┌─────────────────┐   OAuth+OBH    ┌──────────────┐
│  فرانت‌اند   │ ────────────►  │  بک‌اند اصلی      │ ─────────────► │ میکروسرویس شاهین │ ──────────────► │  API بانک     │
│  / اپ موبایل │                │  (NestJS)        │               │  (micro-shahin)  │                │  (Shahin/OBH) │
└─────────────┘                └──────────────────┘               └─────────────────┘                └──────────────┘
```

- **بک‌اند اصلی**: درخواست‌های کاربران (با JWT) را می‌پذیرد، لاگ و OTP و مدیریت حساب‌ها را انجام می‌دهد، سپس درخواست را به میکروسرویس شاهین فوروارد می‌کند.
- **میکروسرویس شاهین**: فقط با `X-API-Key` از بک‌اند قابل دسترسی است؛ OAuth و امضای OBH را مدیریت کرده و با API بانک (شاهین) صحبت می‌کند.

**توصیه:** اپلیکیشن‌ها و همکاران باید **همیشه از بک‌اند اصلی** (`/api/shahin/...`) استفاده کنند و مستقیماً به میکروسرویس شاهین درخواست نزنند (به‌خاطر امنیت، لاگ، OTP و یکپارچگی).

---

## استفاده از طریق بک‌اند اصلی

همهٔ سرویس‌های شاهین از طریق بک‌اند اصلی در دسترس هستند. آدرس پایه (مثال):

- **Base URL بک‌اند:** `https://api.parszargar.com` (یا آدرس سرور شما)
- **پیشوند اندپوینت‌های شاهین:** `POST/GET /api/shahin/...`

### احراز هویت درخواست‌ها

همهٔ اندپوینت‌های زیر (به‌جز لاگین) نیاز به **JWT** دارند:

- هدر: `Authorization: Bearer <access_token>`
- توکن از اندپوینت لاگین: `POST /auth/login` با `{ "mobile": "+98...", "password": "..." }`

---

## اندپوینت‌های API

### ۱. موجودی حساب (Account Balance)

**درخواست:** `POST /api/shahin/account/balance`

| فیلد           | نوع   | اجباری | توضیح                    |
|----------------|--------|--------|---------------------------|
| `bank`         | string | خیر*   | کد بانک (مثلاً BSI, BKV)  |
| `nationalCode` | string | بله    | کد ملی صاحب حساب          |
| `sourceAccount`| string | بله    | شماره حساب (یا `accountNumber`) |

\* در صورت ندادن `bank`، مقدار پیش‌فرض از تنظیمات سرور (`SHAHIN_BANK_CODE`) استفاده می‌شود.  
بک‌اند می‌تواند `accountNumber` را به `sourceAccount` و تاریخ میلادی را به شمسی تبدیل کند.

**نمونه بدنه (Body):**
```json
{
  "bank": "BKV",
  "nationalCode": "1234567890",
  "sourceAccount": "1092152517"
}
```

---

### ۲. گردش حساب (Account Statement)

**درخواست:** `POST /api/shahin/account/statement`

| فیلد            | نوع   | اجباری | توضیح                          |
|-----------------|--------|--------|---------------------------------|
| `bank`          | string | خیر*   | کد بانک                         |
| `nationalCode`  | string | بله    | کد ملی                          |
| `sourceAccount` | string | بله    | شماره حساب                      |
| `fromDate`      | string | خیر   | از تاریخ (YYYY-MM-DD یا YYYYMMDD شمسی) |
| `toDate`        | string | خیر   | تا تاریخ (همین فرمت)            |

**نمونه بدنه:**
```json
{
  "bank": "BKV",
  "nationalCode": "1234567890",
  "sourceAccount": "1092152517",
  "fromDate": "2025-01-01",
  "toDate": "2025-02-15"
}
```

---

### ۳. انتقال وجه (Transfer)

برای انتقال تک‌حساب، دو مرحله داریم: **درخواست OTP** و سپس **اجرای انتقال با OTP**.

#### مرحله ۱: درخواست کد OTP

**درخواست:** `POST /api/shahin/request-transfer`

بدنه می‌تواند همان دادهٔ انتقال باشد (برای ذخیره/لاگ). پاسخ شامل تأیید ارسال OTP است.

**نمونه بدنه (اختیاری، برای هماهنگی با مرحلهٔ بعد):**
```json
{
  "destinationAccountNumber": "1234567890",
  "amount": 100000,
  "sourceAccount": "1092152517"
}
```

#### مرحله ۲: اجرای انتقال (با OTP)

**درخواست:** `POST /api/shahin/transfer`

| فیلد                       | نوع    | اجباری | توضیح                    |
|----------------------------|--------|--------|---------------------------|
| `bank`                     | string | بله    | کد بانک                   |
| `nationalCode`             | string | بله    | کد ملی                    |
| `sourceAccount`            | string | بله    | شماره حساب مبدأ           |
| `destinationAccountNumber` | string | بله    | شماره حساب مقصد           |
| `destinationBank`          | string | بله    | کد بانک مقصد              |
| `amount`                   | number | بله    | مبلغ (ریال)               |
| `transferType`              | string | بله    | نوع انتقال                |
| `withdrawDescription`      | string | خیر   | شرح برداشت                 |
| `depositDescription`       | string | خیر   | شرح واریز                  |
| `otpcode`                  | string | بله    | کد OTP ارسال‌شده به موبایل کاربر |

**نمونه بدنه:**
```json
{
  "bank": "BKV",
  "nationalCode": "1234567890",
  "sourceAccount": "1092152517",
  "destinationAccountNumber": "9876543210",
  "destinationBank": "BKV",
  "amount": 500000,
  "transferType": "normal",
  "withdrawDescription": "پرداخت فاکتور",
  "otpcode": "123456"
}
```

---

### ۴. انتقال دسته‌ای (Batch Transfer)

همانند انتقال ساده: ابتدا در صورت نیاز `request-transfer` برای OTP، سپس:

**درخواست:** `POST /api/shahin/batch-transfer`

| فیلد            | نوع   | اجباری | توضیح              |
|-----------------|--------|--------|---------------------|
| `bank`          | string | بله    | کد بانک             |
| `nationalCode`  | string | بله    | کد ملی              |
| `sourceAccount`| string | بله    | حساب مبدأ           |
| `destination`   | array  | بله    | آرایهٔ مقصدها       |
| `oneWithdraw`   | boolean| خیر   | یک برداشت برای همه  |
| `otpcode`       | string | بله    | کد OTP              |

هر عنصر `destination`:

| فیلد                       | نوع    | اجباری |
|----------------------------|--------|--------|
| `destinationAccountNumber` | string | بله    |
| `amount`                   | number | بله    |
| `babat`                    | string | خیر   |
| `transferType`             | string | خیر   |
| `description`              | string | خیر   |

**نمونه بدنه:**
```json
{
  "bank": "BKV",
  "nationalCode": "1234567890",
  "sourceAccount": "1092152517",
  "oneWithdraw": true,
  "otpcode": "123456",
  "destination": [
    {
      "destinationAccountNumber": "1111111111",
      "amount": 100000
    },
    {
      "destinationAccountNumber": "2222222222",
      "amount": 200000
    }
  ]
}
```

---

### ۵. مدیریت حساب‌های ذخیره‌شده و لاگ (اختیاری)

- `GET /api/shahin/accounts` — لیست حساب‌های ذخیره‌شده (با صفحه‌بندی و فیلتر)
- `GET /api/shahin/accounts/:id` — جزئیات یک حساب
- `GET /api/shahin/accounts/:id/entries` — گردش/لاگ مربوط به یک حساب
- `GET /api/shahin/entries` — لیست کل لاگ‌های شاهین (با فیلتر type, status, accountId, userId)
- `GET /api/shahin/entries/:id` — جزئیات یک لاگ
- `POST /api/shahin/accounts` — ایجاد حساب (ادمین؛ با `RolesGuard`)

---

## نمونه درخواست و پاسخ

### پاسخ موفق (موجودی)

```json
{
  "transactionState": "SUCCESS",
  "respObject": {
    "availableBalance": 15000000,
    "effectiveBalance": 15000000,
    "accountNumber": "1092152517"
  },
  "statusCode": 200
}
```

### پاسخ خطا (مثلاً از سمت بانک)

```json
{
  "transactionState": "CORE_FAILED",
  "respObject": {
    "errorCode": "ERR_XXX",
    "message": "شرح خطا"
  },
  "statusCode": 424
}
```

بک‌اند پاسخ بدنِ API شاهین را عیناً برمی‌گرداند؛ فقط در صورت خطای اتصال یا timeout، خود بک‌اند خطای ۵۰۲/۵۰۴ برمی‌گرداند.

---

## جریان انتقال وجه

1. کاربر در اپ/وب درخواست انتقال می‌دهد.
2. اپ به `POST /api/shahin/request-transfer` درخواست می‌زند (با JWT).
3. بک‌اند OTP تولید کرده و با SMS به موبایل کاربر (ادمین) می‌فرستد و پاسخ «OTP ارسال شد» برمی‌گرداند.
4. کاربر کد OTP را وارد می‌کند.
5. اپ همان دادهٔ انتقال + `otpcode` را به `POST /api/shahin/transfer` (یا `batch-transfer`) می‌فرستد.
6. بک‌اند OTP را چک می‌کند؛ در صورت معتبر بودن، درخواست را با `X-API-Key` به میکروسرویس شاهین فوروارد می‌کند.
7. میکروسرویس شاهین با OAuth و امضای OBH درخواست را به API بانک می‌زند و پاسخ را به بک‌اند و سپس به اپ برمی‌گرداند.

---

## پیکربندی محیط

### بک‌اند اصلی (`.env`)

| متغیر | توضیح |
|--------|--------|
| `SHAHIN_SERVICE_URL` | آدرس میکروسرویس شاهین (مثلاً `https://9eb6cj.parszargar.com`) |
| `SHAHIN_SERVICE_API_KEY` | کلید API؛ باید با `API_KEY` میکروسرویس یکی باشد |
| `SHAHIN_REQUEST_TIMEOUT` | تایم‌اوت درخواست (میلی‌ثانیه)، مثلاً 60000 |
| `SHAHIN_BANK_CODE` | کد بانک پیش‌فرض (مثلاً BKV) |
| `SHAHIN_COMPANY_NATIONAL_CODE` | کد ملی پیش‌فرض (در صورت ندادن در بدنه) |

### میکروسرویس شاهین (فقط برای راه‌اندازی سرویس)

| متغیر | توضیح |
|--------|--------|
| `API_KEY` | کلید مشترک با بک‌اند (`SHAHIN_SERVICE_API_KEY`) |
| `SHAHIN_BASE_URL` | آدرس پایه API بانک |
| `SHAHIN_PORT_SERVICE` | پورت سرویس بانک |
| `SHAHIN_VERSION` | نسخه API (مثلاً v0.3) |
| `SHAHIN_CLIENT_ID` / `SHAHIN_CLIENT_SECRET` | برای امضای OBH |
| `SHAHIN_USERNAME` / `SHAHIN_PASSWORD` | برای OAuth توکن |

جزئیات بیشتر در [SECURITY_SETUP.md](../micro-shahin/SECURITY_SETUP.md) و بخش «استفاده در پروژهٔ دیگر» همین سند.

---

## استفاده در پروژهٔ دیگر (میکروسرویس شاهین)

اگر در **پروژهٔ دیگری در شرکت** بخواهید از همان قابلیت‌های بانک (موجودی، گردش، انتقال، batch) استفاده کنید، دو راه دارید:

### گزینه ۱ (توصیه‌شده): استفاده از بک‌اند اصلی

- در آن پروژه فقط به **بک‌اند پارسزرگر** درخواست بزنید: `POST /api/shahin/...` با JWT.
- نیازی به دسترسی مستقیم به میکروسرویس شاهین یا تنظیم OAuth/OBH در آن پروژه نیست.
- برای انتقال و batch حتماً جریان OTP (request-transfer → transfer/batch-transfer با otpcode) را رعایت کنید.

### گزینه ۲: استفاده مستقیم از میکروسرویس شاهین

فقط در صورتی که آن پروژه **خودش** به‌عنوان سرویس داخلی معتبر شناخته شود و کلید API مشترک با میکروسرویس داشته باشد:

- **Base URL میکروسرویس:** مثلاً `https://9eb6cj.parszargar.com` (با پیشوند `api`: درخواست به `/api/shahin/...`)
- **احراز هویت:** هدر `X-API-Key: <API_KEY>` (همان مقداری که در میکروسرویس تنظیم شده).
- **اندپوینت‌ها (همه POST):**
  - `/api/shahin/account/balance`
  - `/api/shahin/account/statement`
  - `/api/shahin/transfer`
  - `/api/shahin/batch-transfer`
- **فرمت بدنه:** مطابق جدول‌های بالا (بدون `otpcode`؛ OTP فقط در بک‌اند اصلی چک می‌شود).

در این حالت آن پروژه مسئول امنیت، لاگ و در صورت نیاز OTP خودش است.

---

### جزئیات داخلی میکروسرویس شاهین (برای توسعه/ادغام)

- **زبان و فریمورک:** NestJS (TypeScript).
- **ورودی‌ها:** از طریق `ShahinController` با همان DTOهای account، transfer، batch-transfer.
- **احراز هویت با بانک:**
  - **OAuth:** سرویس `AuthService` با `SHAHIN_USERNAME` و `SHAHIN_PASSWORD` به اندپوینت توکن بانک (`/v0.3/obh/oauth/token`) درخواست می‌زند و توکن را کش می‌کند.
  - **امضای OBH:** برای هر درخواست به API بانک، سرویس `ObhSignatureService` با `SHAHIN_CLIENT_ID` و `SHAHIN_CLIENT_SECRET` امضای هدرهای `X-Obh-timestamp`, `X-Obh-uuid`, `X-Obh-signature` را تولید می‌کند.
- **ارسال به بانک:** هر اندپوینت به مسیر مشخص API بانک مپ می‌شود:
  - موجودی: `POST /obh/api/aisp/get-account-balance`
  - گردش: `POST /obh/api/aisp/get-account-statement`
  - انتقال: `POST /obh/api/pisp/transfer`
  - batch: `POST /obh/api/pisp/batch-transfer`
- **پاسخ:** پاسخ خام بانک از طریق میکروسرویس و در صورت استفاده از بک‌اند، از طریق بک‌اند به کلاینت برمی‌گردد.

اگر در پروژهٔ دیگر می‌خواهید سرویس مشابهی (مثلاً با زبان دیگر) بنویسید، باید همین مراحل OAuth + امضای OBH را مطابق مستندات بانک پیاده کنید؛ نمونهٔ امضا در `ObhSignatureService` و نمونهٔ درخواست در `ShahinService.makeSignedRequest` موجود است.

---

## فایل Postman

مجموعهٔ درخواست‌های Postman برای **بک‌اند اصلی** (شامل لاگین و تمام اندپوینت‌های شاهین) در فایل زیر قرار دارد:

- **`docs/Shahin-Parszargar-Backend.postman_collection.json`**

پس از ایمپورت در Postman:

1. متغیر `baseUrl` را به آدرس بک‌اند (مثلاً `https://api.parszargar.com`) تنظیم کنید.
2. یک بار `Auth > Login` را اجرا کنید و در صورت پشتیبانی کلکشن، توکن را در متغیر ذخیره کنید تا بقیهٔ درخواست‌ها با `Authorization: Bearer {{token}}` کار کنند.
3. برای انتقال و batch ابتدا `request-transfer` و سپس با کد OTP دریافتی، `transfer` یا `batch-transfer` را بزنید.

---

در صورت نیاز به جزئیات بیشتر روی یک اندپوینت یا جریان خاص، می‌توان همان بخش را در این سند گسترش داد یا به کد کنترلر/سرویس در بک‌اند و میکروسرویس اشاره کرد.
