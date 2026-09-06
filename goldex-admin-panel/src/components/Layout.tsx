import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../auth/auth";
import MobileNav from "./MobileNav";
import { adminNotificationSocket } from "../api/admin-socket";
import { getToken } from "../api/client";
import MarketTicker from "./MarketTicker";
import { usePermissions } from "../lib/permissions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../api/client";
import type { UnreadCount } from "../api/types";
import { fmtNum } from "../lib/format";
import { applyTheme, persistTheme, storedTheme, type Theme } from "../lib/theme";

type NavItem = {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  /**
   * Permission key required to see this entry.
   *
   * Only set where the mapping is unambiguous. An entry without one is always
   * shown: the server enforces a permission on only a few modules so far, so
   * guessing a key here would hide a page the operator can still reach and use.
   * Hiding is a display choice — the server is what actually refuses.
   */
  perm?: string;
};

type NavGroup = {
  label: string;
  icon: string;
  children: NavItem[];
};

const NAV: NavGroup[] = [
  {
    label: "نمای کلی",
    icon: "▦",
    children: [
      { to: "/", label: "داشبورد", icon: "▦", end: true, perm: "dashboard" },
      { to: "/compare", label: "مقایسه تأمین‌کنندگان", icon: "📈" },
      {
        to: "/providers",
        label: "تأمین‌کنندگان",
        icon: "🏭",
        perm: "providers",
      },
      { to: "/market-status", label: "وضعیت بازار استخرها", icon: "🛒" },
      {
        to: "/arbitrage",
        label: "فرصت‌های آربیتراژ",
        icon: "⚡",
        perm: "arbitrage",
      },
    ],
  },
  {
    label: "CRM",
    icon: "📊",
    children: [
      { to: "/crm", label: "داشبورد CRM", icon: "📊" },
      { to: "/crm/users", label: "مشتریان", icon: "👥" },
      { to: "/crm/tickets", label: "تیکت‌ها", icon: "🎫" },
      { to: "/crm/tags", label: "برچسب‌ها", icon: "🏷️" },
      { to: "/crm/segments", label: "بخش‌بندی", icon: "📋" },
      { to: "/inbox", label: "صندوق اعلان‌ها", icon: "🔔" },
      { to: "/notifications", label: "ارسال اعلان", icon: "📣" },
    ],
  },
  {
    label: "مدیریت",
    icon: "👤",
    children: [
      { to: "/users", label: "کاربران", icon: "👤", perm: "users_view" },
      { to: "/kyc", label: "احراز هویت", icon: "🪪", perm: "kyc_view" },
      { to: "/wallets", label: "کیف‌پول‌ها", icon: "👛", perm: "wallets_view" },
      { to: "/warehouse", label: "انبار", icon: "🏭", perm: "warehouse" },
      { to: "/finance", label: "مالی", icon: "💰" },
      {
        to: "/manager-accounts",
        label: "حساب‌های مدیریتی",
        icon: "🗄",
        perm: "accounting",
      },
      { to: "/provider-finance", label: "مالی تأمین‌کنندگان", icon: "🏦" },
      { to: "/cbp", label: "درگاه‌های پرداخت (CBP)", icon: "💳" },
      { to: "/credits", label: "اعتبارات", icon: "💳" },
      { to: "/finance-logs", label: "گزارشات مالی", icon: "📄" },
      { to: "/reports", label: "گزارش‌ها", icon: "📊", perm: "reports" },
      { to: "/accounting", label: "حسابداری", icon: "🧮", perm: "accounting" },
      {
        to: "/accounting/valuation",
        label: "ارزش‌گذاری لحظه‌ای",
        icon: "📈",
        perm: "accounting",
      },
      {
        to: "/accounting/vouchers",
        label: "اسناد حسابداری",
        icon: "🧾",
        perm: "accounting",
      },
      { to: "/deposits", label: "واریزها", icon: "📥" },
      {
        to: "/withdraws",
        label: "برداشت‌ها",
        icon: "📤",
        perm: "withdrawals_view",
      },
      { to: "/p2p", label: "تسویه همتا به همتا", icon: "🤝" },
      {
        to: "/em",
        label: "میز برداشت (EM)",
        icon: "📋",
        perm: "withdrawals_view",
      },
      { to: "/bank-accounts", label: "حساب‌های بانکی شرکت", icon: "🏛" },
      {
        to: "/shahin",
        label: "شاهین — ریل بانکی",
        icon: "🏦",
        perm: "accounting",
      },
      { to: "/ocr", label: "مدیریت OCR", icon: "🔍" },
    ],
  },
  {
    label: "بازار",
    icon: "◈",
    children: [
      { to: "/price", label: "موتور قیمت", icon: "📉", perm: "price_engine" },
      { to: "/symbols", label: "نمادها", icon: "◈" },
      { to: "/pairs", label: "جفت‌ارزها", icon: "⇄" },
      { to: "/mappings", label: "نگاشت تأمین‌کننده", icon: "🔗" },
    ],
  },
  {
    label: "سفارشات",
    icon: "📋",
    children: [
      { to: "/orders", label: "مدیریت سفارش‌ها", icon: "📋" },
      { to: "/order-book", label: "دفتر سفارش", icon: "📊" },
      { to: "/discounts", label: "تخفیف‌ها", icon: "🏷️" },
    ],
  },
  {
    label: "تلگرام",
    icon: "📊",
    children: [{ to: "/telegram-market", label: "بازار طلا", icon: "📊" }],
  },
  {
    label: "سیستم",
    icon: "🎖",
    children: [
      { to: "/user-levels", label: "سطوح کاربری", icon: "🎖" },
      { to: "/admins", label: "مدیران", icon: "👤" },
      {
        to: "/roles",
        label: "نقش‌ها و دسترسی‌ها",
        icon: "🔑",
        perm: "roles_view",
      },
      { to: "/api", label: "مدیریت API", icon: "🔌", perm: "api" },
      // No `perm`: every operator manages their own profile and preferences,
      // and the platform card inside is gated separately.
      { to: "/settings", label: "تنظیمات", icon: "⚙️" },
      { to: "/p2p/settings", label: "تنظیمات همتا به همتا", icon: "⚙️" },
    ],
  },
];

const TITLES: Record<string, string> = {
  "/": "داشبورد",
  "/compare": "مقایسه قیمت تأمین‌کنندگان",
  "/providers": "مدیریت تأمین‌کنندگان",
  "/market-status": "وضعیت بازار استخرهای معاملاتی",
  "/arbitrage": "فرصت‌های آربیتراژ — هشدارها، سود و ربات‌ها",
  "/users": "مدیریت کاربران و شرکا",
  "/kyc": "مدیریت احراز هویت",
  "/wallets": "مدیریت کیف‌پول",
  "/warehouse": "مدیریت انبار — انبارها، بسته‌ها و درخواست‌ها",
  "/finance": "مالی — سفارش‌ها، تراکنش‌ها و دفتر سیستم",
  "/manager-accounts": "حساب‌های مدیریتی — سرمایه ربات‌های آربیتراژ و تأیید شارژ",
  "/provider-finance": "مالی تأمین‌کنندگان — بدهکار/بستانکار و تسویه",
  "/cbp": "درگاه‌های پرداخت — سلامت درگاه‌ها و تراکنش‌های CBP",
  "/symbols": "مدیریت نمادها",
  "/pairs": "مدیریت جفت‌ارزها",
  "/mappings": "نگاشت تأمین‌کننده به جفت‌ارز",
  "/admins": "مدیریت مدیران",
  "/roles": "نقش‌ها و دسترسی‌ها — تعریف نقش و تخصیص دسترسی",
  "/api": "مدیریت API — کلیدها، ترافیک و سلامت",
  "/settings": "تنظیمات — پروفایل، امنیت، اعلان‌ها و پلتفرم",
  "/orders": "مدیریت سفارش‌ها — جستجو، فیلتر و لغو",
  "/order-book": "دفتر سفارش — عمق بازار و آربیتراژ",
  "/discounts": "مدیریت کوپن‌های تخفیف",
  "/credits": "مدیریت اعتبارات کاربران",
  "/finance-logs": "گزارشات مالی — لاگ عملیات مالی",
  "/reports": "گزارش‌ها — تولید، زمان‌بندی و دانلود خروجی",
  "/accounting": "حسابداری — درآمد، هزینه و دفتر سیستم",
  "/accounting/valuation":
    "ارزش‌گذاری لحظه‌ای — سود، هزینه و سود خالص بر مبنای قیمت روز به ارز مرجع",
  "/accounting/vouchers": "اسناد حسابداری — ثبت، تایید و خروجی",
  "/user-levels": "مدیریت سطوح کاربری — تعریف و اختصاص سطوح",
  "/deposits": "مدیریت درخواست‌های واریز",
  "/withdraws": "مدیریت درخواست‌های برداشت",
  "/p2p": "تسویه همتا به همتا — صف تعیین‌تکلیف و پایش",
  "/em": "میز برداشت — درخواست‌ها، فیش‌ها و تعیین‌تکلیف",
  "/p2p/settings":
    "تنظیمات همتا به همتا — مهلت‌ها، اولویت منبع و وزن‌های تطبیق",
  "/bank-accounts": "حساب‌های بانکی شرکت — واریز، برداشت و سقف‌ها",
  "/shahin": "شاهین — صورتحساب، انتقال وجه و بانکداری باز",
  "/ocr": "مدیریت سرویس OCR — وضعیت مدل و آموزش خودکار",
  "/telegram-market": "بازار طلا — قیمت‌های لحظه‌ای از تلگرام",
  "/inbox": "صندوق اعلان‌ها — رویدادهای نیازمند رسیدگی",
  "/notifications": "مدیریت اعلان‌ها — آمار و وضعیت ارسال",
  "/crm": "داشبورد CRM — آمار تیکت‌ها و رضایت مشتریان",
  "/crm/users": "مشتریان — نمای 360 درجه",
  "/crm/tickets": "مدیریت تیکت‌های پشتیبانی",
  "/crm/tags": "برچسب‌های مشتریان",
  "/crm/segments": "بخش‌بندی مشتریان",
};

export default function Layout() {
  const { admin, logout } = useAuth();
  const { permissions, can } = usePermissions();
  const qc = useQueryClient();

  const [theme, setTheme] = useState<Theme>(storedTheme);
  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);
  const loc = useLocation();
  const title = TITLES[loc.pathname] ?? "Goldex";

  // While permissions are still loading, show the unrestricted entries only —
  // rendering the full menu and then removing items reads as a glitch.
  const nav = useMemo(
    () =>
      NAV.map((g) => ({
        ...g,
        children: g.children.filter((c) => !c.perm || can(c.perm)),
      })).filter((g) => g.children.length > 0),
    [permissions],
  );

  const activeGroup =
    nav.find((g) =>
      g.children.some((c) =>
        c.end ? loc.pathname === c.to : loc.pathname.startsWith(c.to),
      ),
    )?.label ?? null;

  // Keyed by label, not index: the list is filtered by permission, so an index
  // refers to a different group before and after those permissions arrive.
  const [open, setOpen] = useState<string[]>(activeGroup ? [activeGroup] : []);

  // The active group is only known once permissions have loaded, which is after
  // the first render — without this the menu comes back with everything closed.
  useEffect(() => {
    if (activeGroup)
      setOpen((prev) =>
        prev.includes(activeGroup) ? prev : [...prev, activeGroup],
      );
  }, [activeGroup]);

  const toggle = (label: string) =>
    setOpen((prev) =>
      prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label],
    );

  /**
   * Unread inbox count for the badge.
   *
   * Previously this was a counter incremented per websocket message, starting
   * from zero on every page load — so it showed "how many arrived while this
   * tab was open", not how many were waiting, and reading them never cleared
   * it. It now comes from the server, and a live message just refetches it.
   */
  const unread = useQuery({
    queryKey: ["inbox-unread"],
    queryFn: async () =>
      unwrap<UnreadCount>(
        (await api.get("/admin/notifications/inbox/unread-count")).data,
      ),
    // A fallback for when the socket is not connected at all.
    refetchInterval: 60_000,
    enabled: !!getToken(),
  });
  const pendingCount = unread.data?.unread ?? 0;

  useEffect(() => {
    if (!getToken()) return;
    return adminNotificationSocket.connect(() => {
      qc.invalidateQueries({ queryKey: ["inbox-unread"] });
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["inbox-stats"] });
    });
  }, [qc]);
  const navSub = (item: NavItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) => "nav-sub" + (isActive ? " active" : "")}
    >
      <span className="ico sm">{item.icon}</span>
      {item.label}
      {item.to === "/inbox" && pendingCount > 0 && (
        <span className="nav-badge">{fmtNum(pendingCount)}</span>
      )}
    </NavLink>
  );

  return (
    <div className="app-shell">
      <MarketTicker />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">G</div>
          <div>
            <div className="brand-name">Goldex</div>
            <div className="brand-sub">پنل مدیریت</div>
          </div>
        </div>

        {nav.map((group) => {
          const expanded = open.includes(group.label);
          const isActive = group.label === activeGroup;
          return (
            <div
              key={group.label}
              className={
                "nav-group" +
                (expanded ? " open" : "") +
                (isActive ? " active" : "")
              }
            >
              <button
                className="nav-group-btn"
                onClick={() => toggle(group.label)}
              >
                <span className="ico">{group.icon}</span>
                <span className="nav-group-label">{group.label}</span>
                <span className="nav-group-arrow">{expanded ? "▲" : "▼"}</span>
              </button>
              {expanded && (
                <div className="nav-submenu">{group.children.map(navSub)}</div>
              )}
            </div>
          );
        })}

        <div className="sidebar-footer">
          <div className="row spread">
            <div>
              <div style={{ fontWeight: 600 }}>
                {admin?.phone ?? admin?.email ?? "مدیر"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                {admin?.role}
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button
                className="btn ghost sm"
                title={theme === "dark" ? "حالت روشن" : "حالت تیره"}
                aria-label={theme === "dark" ? "حالت روشن" : "حالت تیره"}
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? "☀" : "☾"}
              </button>
              <button className="btn ghost sm" onClick={logout}>
                خروج
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <h1>{title}</h1>
            <div className="crumb">Goldex Back Office</div>
          </div>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
