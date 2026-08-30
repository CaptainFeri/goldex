import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth";

const PRIMARY_NAV: { to: string; label: string; icon: string; end?: boolean }[] = [
  { to: "/", label: "داشبورد", icon: "▦", end: true },
  { to: "/users", label: "کاربران", icon: "👥" },
  { to: "/wallets", label: "کیف‌پول‌ها", icon: "👛" },
  { to: "/finance", label: "مالی", icon: "💰" },
];

const SECONDARY_NAV: { to: string; label: string; icon: string; end?: boolean }[] = [
  { to: "/compare", label: "مقایسه تأمین‌کنندگان", icon: "📈" },
  { to: "/crm", label: "داشبورد CRM", icon: "📊" },
  { to: "/crm/users", label: "مشتریان", icon: "👥" },
  { to: "/crm/tickets", label: "تیکت‌ها", icon: "🎫" },
  { to: "/crm/tags", label: "برچسب‌ها", icon: "🏷️" },
  { to: "/crm/segments", label: "بخش‌بندی", icon: "📋" },
  { to: "/notifications", label: "اعلان‌ها", icon: "🔔" },
  { to: "/kyc", label: "احراز هویت", icon: "🪪" },
  { to: "/warehouse", label: "انبار", icon: "🏭" },
  { to: "/provider-finance", label: "مالی تأمین‌کنندگان", icon: "🏦" },
  { to: "/cbp", label: "درگاه‌های پرداخت", icon: "💳" },
  { to: "/symbols", label: "نمادها", icon: "◈" },
  { to: "/pairs", label: "جفت‌ارزها", icon: "⇄" },
  { to: "/mappings", label: "نگاشت تأمین‌کننده", icon: "🔗" },
  { to: "/orders", label: "مدیریت سفارش‌ها", icon: "📋" },
  { to: "/order-book", label: "دفتر سفارش", icon: "📊" },
  { to: "/admins", label: "مدیران", icon: "👤" },
  { to: "/telegram-market", label: "بازار طلا", icon: "📊" },
];

export default function MobileNav() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <nav className="mobile-nav">
        {PRIMARY_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              "mn-item" + (isActive ? " active" : "")
            }
          >
            <span className="mn-ico">{item.icon}</span>
            <span className="mn-label">{item.label}</span>
          </NavLink>
        ))}
        <button className="mn-item" onClick={() => setMenuOpen(true)}>
          <span className="mn-ico">⋯</span>
          <span className="mn-label">بیشتر</span>
        </button>
      </nav>

      {menuOpen && (
        <div className="mn-overlay" onClick={() => setMenuOpen(false)} />
      )}

      <div className={`mn-menu ${menuOpen ? "open" : ""}`}>
        <div className="mn-menu-header">
          <span>
            {admin?.phone ?? admin?.email ?? "مدیر"}
          </span>
          <button className="mn-menu-close" onClick={() => setMenuOpen(false)}>
            ✕
          </button>
        </div>

        <div className="mn-menu-items">
          {[...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                "mn-menu-item" + (isActive ? " active" : "")
              }
              onClick={() => setMenuOpen(false)}
            >
              <span className="mn-ico">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>

        <div className="mn-menu-footer">
          <button
            className="mn-menu-logout"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            خروج
          </button>
        </div>
      </div>
    </>
  );
}
