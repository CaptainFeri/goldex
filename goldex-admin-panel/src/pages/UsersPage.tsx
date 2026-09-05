import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Stat, Loading, ErrorState, Empty, Badge, Modal } from "../components/ui";
import { fmtNum, fmtDate } from "../lib/format";
import { MARKET_TYPES_ENUM, MARKET_KINDS_ENUM } from "../lib/enums";

const ROLE_LABEL: Record<number, string> = { 0: "مشتری", 1: "ادمین", 2: "کاربر جدید", 3: "شریک" };
function roleBadge(r: number) {
  return <Badge kind={r === 3 ? "gold" : r === 1 ? "red" : "gray"}>{ROLE_LABEL[r] ?? r}</Badge>;
}
function userStatus(u: any) {
  if (u.blockedAt) return <Badge kind="red">مسدود</Badge>;
  if (u.activeUntil && new Date(u.activeUntil) < new Date()) return <Badge kind="gold">منقضی</Badge>;
  return <Badge kind="green">فعال</Badge>;
}

function CreatePartner({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ phone: "", firstName: "", lastName: "", password: "", activeUntil: "" });
  const [marketTypes, setMarketTypes] = useState<string[]>(["formal", "informal"]);
  const [marketKinds, setMarketKinds] = useState<string[]>(["MARKET", "LIMIT", "OFFER"]);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const toggleMarketType = (v: string) => {
    setMarketTypes((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
  };
  const toggleMarketKind = (v: string) => {
    setMarketKinds((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
  };
  const create = useMutation({
    mutationFn: (p: any) => api.post("/admin/users/partners", p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["user-stats"] });
      setForm({ phone: "", firstName: "", lastName: "", password: "", activeUntil: "" });
      setMarketTypes(["formal", "informal"]);
      setMarketKinds(["MARKET", "LIMIT", "OFFER"]);
      onDone();
    },
  });
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^09[0-9]{9}$/.test(form.phone)) return;
    create.mutate({
      phone: form.phone,
      password: form.password,
      firstName: form.firstName || undefined,
      lastName: form.lastName || undefined,
      activeUntil: form.activeUntil ? new Date(form.activeUntil).toISOString() : undefined,
      marketTypes: marketTypes.length > 0 ? marketTypes : undefined,
      marketKinds: marketKinds.length > 0 ? marketKinds : undefined,
    });
  }
  return (
    <Card title="افزودن کاربر شریک (Partner)">
      <form onSubmit={submit} className="toolbar" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ margin: 0, minWidth: 170 }}>
          <label>شماره موبایل</label>
          <input className="input mono" dir="ltr" placeholder="09123456789" value={form.phone} onChange={(e) => set("phone", e.target.value.trim())} />
        </div>
        <div className="field" style={{ margin: 0, minWidth: 130 }}>
          <label>نام</label>
          <input className="input" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0, minWidth: 130 }}>
          <label>نام خانوادگی</label>
          <input className="input" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0, minWidth: 170 }}>
          <label>رمز عبور</label>
          <input className="input mono" dir="ltr" type="password" placeholder="حداقل ۶ کاراکتر" value={form.password} onChange={(e) => set("password", e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0, minWidth: 160 }}>
          <label>فعال تا (اختیاری)</label>
          <input className="input" type="date" value={form.activeUntil} onChange={(e) => set("activeUntil", e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0, minWidth: 240 }}>
          <label>نوع بازار (رسمی / غیررسمی)</label>
          <div className="row" style={{ gap: 12, paddingTop: 4 }}>
            {MARKET_TYPES_ENUM.map((mt) => (
              <label key={mt.value} className="row" style={{ gap: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={marketTypes.includes(mt.value)} onChange={() => toggleMarketType(mt.value)} />
                {mt.label}
              </label>
            ))}
          </div>
        </div>
        <div className="field" style={{ margin: 0, minWidth: 300 }}>
          <label>بازارهای معاملاتی (Market / Limit / Offer)</label>
          <div className="row" style={{ gap: 12, paddingTop: 4 }}>
            {MARKET_KINDS_ENUM.map((mk) => (
              <label key={mk.value} className="row" style={{ gap: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={marketKinds.includes(mk.value)} onChange={() => toggleMarketKind(mk.value)} />
                {mk.label}
              </label>
            ))}
          </div>
        </div>
        <button className="btn primary" disabled={create.isPending}>
          {create.isPending ? <span className="spin" /> : "ایجاد شریک"}
        </button>
      </form>
      {create.isError && <div className="error-text">{apiError(create.error)}</div>}
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        شرکا به بازارهای انتخاب‌شده دسترسی دارند (پیش‌فرض: رسمی و غیررسمی + هر سه بازار معاملاتی).
      </div>
    </Card>
  );
}

function MarketsModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const current = useQuery({
    queryKey: ["user-markets", userId],
    queryFn: async () => {
      const [types, kinds] = await Promise.all([
        api.get(`/admin/users/users/${userId}/market-types`),
        api.get(`/admin/users/users/${userId}/market-kinds`),
      ]);
      return {
        marketTypes: unwrap<string[]>(types.data),
        marketKinds: unwrap<string[]>(kinds.data),
      };
    },
  });
  const [types, setTypes] = useState<string[]>([]);
  const [kinds, setKinds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate once data arrives.
  if (current.data && !hydrated) {
    setTypes(current.data.marketTypes);
    setKinds(current.data.marketKinds);
    setHydrated(true);
  }

  const save = useMutation({
    mutationFn: (p: { marketTypes: string[]; marketKinds: string[] }) =>
      Promise.all([
        api.put(`/admin/users/users/${userId}/market-types`, { marketTypes: p.marketTypes }),
        api.put(`/admin/users/users/${userId}/market-kinds`, { marketKinds: p.marketKinds }),
      ]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-markets", userId] });
      onClose();
    },
  });

  function toggle(list: string[], setList: (v: string[]) => void, v: string) {
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  }

  return (
    <Modal title="دسترسی بازار کاربر" onClose={onClose}>
      {current.isLoading ? (
        <Loading />
      ) : current.isError ? (
        <ErrorState message={apiError(current.error)} />
      ) : (
        <>
          <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
            نوع بازار: کدام بازارها (رسمی / غیررسمی) برای کاربر نمایش داده شود.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            {MARKET_TYPES_ENUM.map((mt) => (
              <label key={mt.value} className="row" style={{ gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={types.includes(mt.value)}
                  onChange={() => toggle(types, setTypes, mt.value)}
                />
                {mt.label}
              </label>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
            بازارهای معاملاتی: کاربر به کدام حالت‌های معاملاتی دسترسی داشته باشد (Market / Limit / Offer).
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            {MARKET_KINDS_ENUM.map((mk) => (
              <label key={mk.value} className="row" style={{ gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={kinds.includes(mk.value)}
                  onChange={() => toggle(kinds, setKinds, mk.value)}
                />
                {mk.label}
              </label>
            ))}
          </div>
          {save.isError && <div className="error-text">{apiError(save.error)}</div>}
          <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
            <button className="btn ghost" onClick={onClose}>
              انصراف
            </button>
            <button
              className="btn primary"
              disabled={save.isPending}
              onClick={() => save.mutate({ marketTypes: types, marketKinds: kinds })}
            >
              {save.isPending ? <span className="spin" /> : "ذخیره"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export default function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [mtUserId, setMtUserId] = useState<string | null>(null);

  const stats = useQuery({
    queryKey: ["user-stats"],
    queryFn: async () => unwrap<any>((await api.get("/admin/users/stats")).data),
    refetchInterval: 20_000,
  });
  const online = useQuery({
    queryKey: ["users-online"],
    queryFn: async () => unwrap<string[]>((await api.get("/admin/users/online")).data),
    refetchInterval: 20_000,
  });
  const list = useQuery({
    queryKey: ["users", search],
    queryFn: async () =>
      unwrap<any>((await api.get("/admin/users/users", { params: { pageSize: 100, page: 1, q: search || undefined } })).data),
  });

  const toggleBlock = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/users/users/${id}/activation`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["user-stats"] });
    },
  });

  const changeRole = useMutation({
    mutationFn: (p: { id: string; role: number }) => api.patch(`/admin/users/users/${p.id}/role`, { role: p.role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["user-stats"] });
    },
  });

  const s = stats.data;
  const onlineSet = new Set(online.data ?? []);
  const users: any[] = list.data?.items ?? [];

  return (
    <>
      <div className="grid grid-4">
        <Stat label="کل کاربران" value={stats.isLoading ? "…" : fmtNum(s?.total)} sub={`${fmtNum(s?.newUsers)} جدید`} />
        <Stat label="کاربران آنلاین" value={fmtNum(s?.online)} sub={<Badge kind="green">زنده</Badge>} />
        <Stat label="فعال / غیرفعال" value={`${fmtNum(s?.active)} / ${fmtNum(s?.inactive)}`} sub={`${fmtNum(s?.blocked)} مسدود، ${fmtNum(s?.expired)} منقضی`} />
        <Stat label="شرکا (Partners)" value={fmtNum(s?.byRole?.partner)} sub={`${fmtNum(s?.byRole?.customer)} مشتری`} />
        <Stat label="احراز هویت تأییدشده" value={fmtNum(s?.verifiedKyc)} />
        <Stat label="احراز در انتظار" value={fmtNum(s?.pendingKyc)} />
        <Stat label="کاربران مسدود" value={fmtNum(s?.blocked)} />
        <Stat label="کاربران جدید (دوره)" value={fmtNum(s?.newUsers)} />
      </div>

      <CreatePartner onDone={() => {}} />

      <Card
        title={`کاربران${list.data ? ` (${list.data.total})` : ""}`}
        action={
          <input className="input" style={{ width: 220 }} placeholder="جستجو (نام/ایمیل)…" value={search} onChange={(e) => setSearch(e.target.value)} />
        }
      >
        {list.isLoading ? (
          <Loading />
        ) : list.isError ? (
          <ErrorState message={apiError(list.error)} />
        ) : users.length === 0 ? (
          <Empty label="کاربری یافت نشد" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>نام</th>
                  <th>موبایل</th>
                  <th>نقش</th>
                  <th>وضعیت</th>
                  <th>آنلاین</th>
                  <th>فعال تا</th>
                  <th>عضویت</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ padding: "2px 6px", textAlign: "center" }}>
                      {(() => {
                        const path = u.profile?.avatarImgPath;
                        const src = path
                          ? path.startsWith("edited-")
                            ? `/uploads/${path}`
                            : `/api/v1/profile/avatar/${path}`
                          : null;
                        return src
                          ? <img src={src} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
                          : <span className="muted" style={{ fontSize: 11 }}>—</span>;
                      })()}
                    </td>
                    <td>{`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || "—"}</td>
                    <td className="mono" dir="ltr" style={{ textAlign: "right" }}>{u.phone ?? "—"}</td>
                    <td>{roleBadge(u.role)}</td>
                    <td>{userStatus(u)}</td>
                    <td>{onlineSet.has(u.id) ? <Badge kind="green">آنلاین</Badge> : <span className="muted">—</span>}</td>
                    <td>{u.activeUntil ? fmtDate(u.activeUntil) : "—"}</td>
                    <td>{fmtDate(u.registeredAt ?? u.createAt)}</td>
                    <td>
                      <div className="row">
                        <button
                          className="btn sm"
                          disabled={toggleBlock.isPending}
                          onClick={() => toggleBlock.mutate(u.id)}
                        >
                          {u.blockedAt ? "رفع مسدودیت" : "مسدود"}
                        </button>
                        <button
                          className="btn sm"
                          onClick={() => setMtUserId(u.id)}
                          title="نوع بازار و بازارهای معاملاتی"
                        >
                          بازارها
                        </button>
                        {u.role !== 1 && (
                          <button
                            className="btn sm"
                            disabled={changeRole.isPending}
                            onClick={() => {
                              const target = u.role === 3 ? 0 : 3;
                              if (window.confirm(`نقش کاربر به «${ROLE_LABEL[target]}» تغییر کند؟`)) {
                                changeRole.mutate({ id: u.id, role: target });
                              }
                            }}
                          >
                            {u.role === 3 ? "تبدیل به مشتری" : "تبدیل به شریک"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {mtUserId && (
        <MarketsModal
          userId={mtUserId}
          onClose={() => setMtUserId(null)}
        />
      )}
    </>
  );
}
