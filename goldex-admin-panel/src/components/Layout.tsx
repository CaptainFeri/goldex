import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/auth";
import MobileNav from "./MobileNav";

const NAV = [
  { section: "نمای کلی" },
  { to: "/", label: "داشبورد", icon: "▦", end: true },
  { to: "/compare", label: "مقایسه تأمین‌کنندگان", icon: "📈" },
  { section: "مدیریت" },
  { to: "/users", label: "کاربران", icon: "👥" },
  { to: "/kyc", label: "احراز هویت", icon: "🪪" },
  { to: "/wallets", label: "کیف‌پول‌ها", icon: "👛" },
  { to: "/warehouse", label: "انبار", icon: "🏭" },
  { to: "/finance", label: "مالی", icon: "💰" },
  { to: "/provider-finance", label: "مالی تأمین‌کنندگان", icon: "🏦" },
  { to: "/credits", label: "اعتبارات", icon: "💳" },
  { to: "/finance-logs", label: "گزارشات مالی", icon: "📄" },
  { to: "/deposits", label: "واریزها", icon: "📥" },
  { to: "/withdraws", label: "برداشت‌ها", icon: "📤" },
  { to: "/ocr", label: "مدیریت OCR", icon: "🔍" },
  { section: "بازار" },
  { to: "/symbols", label: "نمادها", icon: "◈" },
  { to: "/pairs", label: "جفت‌ارزها", icon: "⇄" },
  { to: "/mappings", label: "نگاشت تأمین‌کننده", icon: "🔗" },
  { section: "سفارشات" },
  { to: "/orders", label: "مدیریت سفارش‌ها", icon: "📋" },
  { to: "/order-book", label: "دفتر سفارش", icon: "📊" },
  { to: "/discounts", label: "تخفیف‌ها", icon: "🏷️" },
  { section: "تلگرام" },
  { to: "/telegram-market", label: "بازار طلا", icon: "📊" },
  { section: "سیستم" },
  { to: "/user-levels", label: "سطوح کاربری", icon: "🎖" },
  { to: "/admins", label: "مدیران", icon: "👤" },
];

const TITLES: Record<string, string> = {
  "/": "داشبورد",
  "/compare": "مقایسه قیمت تأمین‌کنندگان",
  "/users": "مدیریت کاربران و شرکا",
  "/kyc": "مدیریت احراز هویت",
  "/wallets": "مدیریت کیف‌پول",
  "/warehouse": "مدیریت انبار — انبارها، بسته‌ها و درخواست‌ها",
  "/finance": "مالی — سفارش‌ها، تراکنش‌ها و دفتر سیستم",
  "/provider-finance": "مالی تأمین‌کنندگان — بدهکار/بستانکار و تسویه",
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
  "/ocr": "مدیریت سرویس OCR — وضعیت مدل و آموزش خودکار",
  "/telegram-market": "بازار طلا — قیمت‌های لحظه‌ای از تلگرام",
};

export default function Layout() {
  const { admin, logout } = useAuth();
  const loc = useLocation();
  const title = TITLES[loc.pathname] ?? "Goldex";

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

        {NAV.map((item, i) =>
          "section" in item ? (
            <div className="nav-section" key={`s-${i}`}>
              {item.section}
            </div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to!}
              end={item.end}
              className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
            >
              <span className="ico">{item.icon}</span>
              {item.label}
            </NavLink>
          )
        )}

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
