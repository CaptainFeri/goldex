import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../auth/auth";
import MobileNav from "./MobileNav";
import { adminNotificationSocket } from "../api/admin-socket";
import { getToken } from "../api/client";

type NavGroup = {
  label: string;
  icon: string;
  children: { to: string; label: string; icon: string; end?: boolean }[];
};

const NAV: NavGroup[] = [
  {
    label: "نمای کلی",
    icon: "▦",
    children: [
      { to: "/", label: "داشبورد", icon: "▦", end: true },
      { to: "/compare", label: "مقایسه تأمین‌کنندگان", icon: "📈" },
      { to: "/providers", label: "تأمین‌کنندگان", icon: "🏭" },
      { to: "/market-status", label: "وضعیت بازار استخرها", icon: "🛒" },
      { to: "/arbitrage", label: "فرصت‌های آربیتراژ", icon: "⚡" },
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
      { to: "/notifications", label: "اعلان‌ها", icon: "🔔" },
    ],
  },
  {
    label: "مدیریت",
    icon: "👤",
    children: [
      { to: "/users", label: "کاربران", icon: "👤" },
      { to: "/kyc", label: "احراز هویت", icon: "🪪" },
      { to: "/wallets", label: "کیف‌پول‌ها", icon: "👛" },
      { to: "/warehouse", label: "انبار", icon: "🏭" },
      { to: "/finance", label: "مالی", icon: "💰" },
      { to: "/accounting", label: "حسابداری", icon: "🧮" },
      { to: "/provider-finance", label: "مالی تأمین‌کنندگان", icon: "🏦" },
      { to: "/cbp", label: "درگاه‌های پرداخت (CBP)", icon: "💳" },
      { to: "/credits", label: "اعتبارات", icon: "💳" },
      { to: "/finance-logs", label: "گزارشات مالی", icon: "📄" },
      { to: "/deposits", label: "واریزها", icon: "📥" },
      { to: "/withdraws", label: "برداشت‌ها", icon: "📤" },
      { to: "/p2p", label: "تسویه همتا به همتا", icon: "🤝" },
      { to: "/bank-accounts", label: "حساب‌های بانکی شرکت", icon: "🏛" },
      { to: "/ocr", label: "مدیریت OCR", icon: "🔍" },
    ],
  },
  {
    label: "بازار",
    icon: "◈",
    children: [
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
      { to: "/p2p/settings", label: "تنظیمات همتا به همتا", icon: "⚙️" },
    ],
  },
];

const TITLES: Record<string, string> = {
  "/": "داشبورد",
  "/compare": "مقایسه قیمت تأمین‌کنندگان",
  "/providers": "مدیریت تأمین‌کنندگان",
  "/market-status": "وضعیت بازار استخرهای معاملاتی",
  "/arbitrage": "فرصت‌های آربیتراژ — هشدارها و سود",
  "/users": "مدیریت کاربران و شرکا",
  "/kyc": "مدیریت احراز هویت",
  "/wallets": "مدیریت کیف‌پول",
  "/warehouse": "مدیریت انبار — انبارها، بسته‌ها و درخواست‌ها",
  "/finance": "مالی — سفارش‌ها، تراکنش‌ها و دفتر سیستم",
  "/accounting": "حسابداری — سود، هزینه و سود خالص بر مبنای قیمت لحظه‌ای",
  "/provider-finance": "مالی تأمین‌کنندگان — بدهکار/بستانکار و تسویه",
  "/cbp": "درگاه‌های پرداخت — سلامت درگاه‌ها و تراکنش‌های CBP",
  "/symbols": "مدیریت نمادها",
  "/pairs": "مدیریت جفت‌ارزها",
  "/mappings": "نگاشت تأمین‌کننده به جفت‌ارز",
  "/admins": "مدیریت مدیران",
  "/orders": "مدیریت سفارش‌ها — جستجو، فیلتر و لغو",
  "/order-book": "دفتر سفارش — عمق بازار و آربیتراژ",
  "/discounts": "مدیریت کوپن‌های تخفیف",
  "/credits": "مدیریت اعتبارات کاربران",
  "/finance-logs": "گزارشات مالی — لاگ عملیات مالی",
  "/user-levels": "مدیریت سطوح کاربری — تعریف و اختصاص سطوح",
  "/deposits": "مدیریت درخواست‌های واریز",
  "/withdraws": "مدیریت درخواست‌های برداشت",
  "/p2p": "تسویه همتا به همتا — صف تعیین‌تکلیف و پایش",
  "/p2p/settings": "تنظیمات همتا به همتا — مهلت‌ها، اولویت منبع و وزن‌های تطبیق",
  "/bank-accounts": "حساب‌های بانکی شرکت — واریز، برداشت و سقف‌ها",
  "/ocr": "مدیریت سرویس OCR — وضعیت مدل و آموزش خودکار",
  "/telegram-market": "بازار طلا — قیمت‌های لحظه‌ای از تلگرام",
  "/notifications": "مدیریت اعلان‌ها — آمار و وضعیت ارسال",
  "/crm": "داشبورد CRM — آمار تیکت‌ها و رضایت مشتریان",
  "/crm/users": "مشتریان — نمای 360 درجه",
  "/crm/tickets": "مدیریت تیکت‌های پشتیبانی",
  "/crm/tags": "برچسب‌های مشتریان",
  "/crm/segments": "بخش‌بندی مشتریان",
};

export default function Layout() {
  const { admin, logout } = useAuth();
  const loc = useLocation();
  const title = TITLES[loc.pathname] ?? "Goldex";

  const activeGroup = NAV.findIndex((g) =>
    g.children.some((c) =>
      c.end ? loc.pathname === c.to : loc.pathname.startsWith(c.to)
    )
  );
  const [open, setOpen] = useState<number[]>([activeGroup].filter((i) => i >= 0));

  const toggle = (i: number) =>
    setOpen((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    );

  // Real-time pending-item badge on the deposits/withdraws nav links.
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    if (!getToken()) return;
    const cleanup = adminNotificationSocket.connect(() => {
      setPendingCount((c) => c + 1);
    });
    return cleanup;
  }, []);
  const navSub = (item: { to: string; label: string; icon: string; end?: boolean }) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) => "nav-sub" + (isActive ? " active" : "")}
    >
      <span className="ico sm">{item.icon}</span>
      {item.label}
      {(item.to === "/deposits" || item.to === "/withdraws") && pendingCount > 0 && (
        <span className="nav-badge">{pendingCount}</span>
      )}
    </NavLink>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">G</div>
          <div>
            <div className="brand-name">Goldex</div>
            <div className="brand-sub">پنل مدیریت</div>
          </div>
        </div>

        {NAV.map((group, i) => {
          const expanded = open.includes(i);
          const isActive = i === activeGroup;
          return (
            <div key={group.label} className={"nav-group" + (expanded ? " open" : "") + (isActive ? " active" : "")}>
              <button className="nav-group-btn" onClick={() => toggle(i)}>
                <span className="ico">{group.icon}</span>
                <span className="nav-group-label">{group.label}</span>
                <span className="nav-group-arrow">{expanded ? "▲" : "▼"}</span>
              </button>
              {expanded && (
                <div className="nav-submenu">
                  {group.children.map(navSub)}
                </div>
              )}
            </div>
          );
        })}

        <div className="sidebar-footer">
          <div className="row spread">
            <div>
              <div style={{ fontWeight: 600 }}>{admin?.phone ?? admin?.email ?? "مدیر"}</div>
              <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{admin?.role}</div>
            </div>
            <button className="btn ghost sm" onClick={logout}>
              خروج
            </button>
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
