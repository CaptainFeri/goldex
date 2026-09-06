/**
 * The permission catalog.
 *
 * These are the panels' own 22 keys, copied verbatim from
 * `ui-parszargar/src/data/rolesMock.js` so the role screens stop hardcoding
 * them and the two sides cannot drift. The list is closed: a new capability is
 * a considered addition here, not something a role can invent, which is what
 * lets `PUT /roles/:id/permissions` reject anything it does not recognise.
 */
export const PERMISSIONS = [
  { key: "dashboard", label: "مشاهده داشبورد" },
  { key: "users_view", label: "مشاهده کاربران" },
  { key: "users_edit", label: "ویرایش کاربران" },
  { key: "kyc_view", label: "مشاهده احراز هویت" },
  { key: "kyc_approve", label: "تأیید / رد احراز هویت" },
  { key: "roles_view", label: "مشاهده نقش‌ها" },
  { key: "roles_manage", label: "مدیریت نقش‌ها" },
  { key: "trades_view", label: "مشاهده معاملات" },
  { key: "trades_manage", label: "مدیریت معاملات" },
  { key: "wallets_view", label: "مشاهده کیف‌پول‌ها" },
  { key: "wallets_ops", label: "عملیات کیف‌پول" },
  { key: "withdrawals_view", label: "مشاهده برداشت‌ها" },
  { key: "withdrawals_approve", label: "تأیید برداشت" },
  { key: "price_engine", label: "موتور قیمت" },
  { key: "arbitrage", label: "ربات آربیتراژ" },
  { key: "accounting", label: "حسابداری" },
  { key: "reports", label: "گزارشات" },
  { key: "providers", label: "پروایدرها" },
  { key: "warehouse", label: "انبار" },
  { key: "settings", label: "تنظیمات سیستم" },
  { key: "api", label: "دسترسی API" },
  { key: "monitoring", label: "مانیتورینگ" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map((p) => p.key);

export const isPermissionKey = (value: string): value is PermissionKey =>
  (PERMISSION_KEYS as string[]).includes(value);

/**
 * The slug of the role that always holds everything.
 *
 * It cannot be edited at all — that is the lock-out guard, and it is also what
 * makes "super admin sees everything" expressible elsewhere in the API.
 */
export const ROOT_ROLE_SLUG = "superAdmin";
