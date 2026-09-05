import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Stat, Badge, Loading, ErrorState, Empty, Modal } from "../components/ui";
import { fmtNum, fmtDate } from "../lib/format";
import { fmtToman, toApiAmount, toFormAmount, unitLabel } from "../lib/money";
import { usePermissions } from "../lib/permissions";
import type { AdminRoleItem, Permission, RoleMember, RoleStats } from "../api/types";

type KpiFilter = "all" | "members" | "fixed" | "empty";

const KPIS: { filter: KpiFilter; key: keyof RoleStats; label: string }[] = [
  { filter: "all", key: "total", label: "کل نقش‌ها" },
  { filter: "members", key: "totalMembers", label: "کل اعضا" },
  { filter: "fixed", key: "fixed", label: "نقش‌های ثابت" },
  { filter: "empty", key: "empty", label: "بدون عضو" },
];

const FILTER_META: Record<KpiFilter, { title: string; empty: string }> = {
  all: { title: "همه نقش‌ها", empty: "نقشی برای نمایش وجود ندارد" },
  members: { title: "نقش‌های دارای عضو", empty: "نقش دارای عضوی یافت نشد" },
  fixed: { title: "نقش‌های ثابت", empty: "نقش ثابتی یافت نشد" },
  empty: { title: "نقش‌های بدون عضو", empty: "نقش بدون عضوی یافت نشد" },
};

/** Server error codes carry the reason; these turn them into something an operator can act on. */
const ERRORS: Record<string, string> = {
  "ROLE.CANNOT_REMOVE_OWN_ROLES_MANAGE":
    "نمی‌توانید دسترسی «مدیریت نقش‌ها» را از نقش خودتان بردارید.",
  "ROLE.LAST_ROLES_MANAGE":
    "دست‌کم یک مدیر فعال باید دسترسی «مدیریت نقش‌ها» را نگه دارد.",
  "ROLE.ROOT_IMMUTABLE": "نقش مدیر ارشد قابل تغییر نیست.",
  "ROLE.FIXED_CANNOT_RENAME": "نام نقش‌های ثابت قابل تغییر نیست.",
  "ROLE.FIXED_CANNOT_DELETE": "نقش‌های ثابت حذف نمی‌شوند.",
  "ROLE.HAS_MEMBERS": "این نقش عضو دارد؛ ابتدا اعضا را به نقش دیگری منتقل کنید.",
};

export function roleError(e: unknown): string {
  const raw = apiError(e);
  for (const [code, message] of Object.entries(ERRORS)) {
    if (raw.includes(code)) return message;
  }
  // The escalation errors name the offending keys after a colon.
  if (raw.includes("ROLE.CANNOT_GRANT_UNHELD")) {
    return `نمی‌توانید دسترسی‌ای بدهید که خودتان ندارید: ${raw.split(":").pop()}`;
  }
  if (raw.includes("ROLE.UNKNOWN_PERMISSION")) {
    return `دسترسی ناشناخته: ${raw.split(":").pop()}`;
  }
  return raw;
}

function PermissionsModal({
  role,
  catalog,
  mine,
  onClose,
}: {
  role: AdminRoleItem;
  catalog: Permission[];
  mine: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>(role.permissions);

  const save = useMutation({
    mutationFn: async () =>
      unwrap<AdminRoleItem>(
        (await api.put(`/admin/roles/${role.id}/permissions`, { permissions: selected })).data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      qc.invalidateQueries({ queryKey: ["role-stats"] });
      qc.invalidateQueries({ queryKey: ["me-permissions"] });
      onClose();
    },
  });

  const toggle = (key: string) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  return (
    <Modal title={`دسترسی‌های نقش «${role.roleName}»`} onClose={onClose}>
      <div className="muted" style={{ marginBottom: 12, fontSize: 12 }}>
        دسترسی‌هایی که خودتان ندارید غیرفعال هستند — سرور اجازه واگذاری آن‌ها را نمی‌دهد.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
        {catalog.map((p) => {
          const held = mine.includes(p.key);
          return (
            <label
              key={p.key}
              className="row"
              style={{ gap: 8, opacity: held ? 1 : 0.45, cursor: held ? "pointer" : "not-allowed" }}
            >
              <input
                type="checkbox"
                checked={selected.includes(p.key)}
                disabled={!held}
                onChange={() => toggle(p.key)}
              />
              <span>{p.label}</span>
            </label>
          );
        })}
      </div>
      {save.isError && <ErrorState message={roleError(save.error)} />}
      <div className="row spread" style={{ marginTop: 16 }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {fmtNum(selected.length)} از {fmtNum(catalog.length)} دسترسی انتخاب شده
        </span>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost" onClick={onClose}>انصراف</button>
          <button className="btn" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "در حال ذخیره…" : "ذخیره"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CreateRoleModal({ catalog, mine, onClose }: { catalog: Permission[]; mine: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [roleName, setRoleName] = useState("");
  const [maxCredit, setMaxCredit] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const save = useMutation({
    mutationFn: async () =>
      unwrap<AdminRoleItem>(
        (
          await api.post("/admin/roles", {
            roleName,
            permissions: selected,
            // The backend works in rial; the field is entered in toman.
            maxCredit: maxCredit ? toApiAmount(maxCredit, "IRR") : undefined,
          })
        ).data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      qc.invalidateQueries({ queryKey: ["role-stats"] });
      onClose();
    },
  });

  return (
    <Modal title="نقش جدید" onClose={onClose}>
      <div className="form-grid">
        <label>
          <span>نام نقش</span>
          <input className="input" value={roleName} onChange={(e) => setRoleName(e.target.value)} />
        </label>
        <label>
          <span>سقف اعتبار ({unitLabel("IRR")})</span>
          <input
            className="input"
            inputMode="numeric"
            value={maxCredit}
            onChange={(e) => setMaxCredit(e.target.value)}
          />
        </label>
      </div>
      <div style={{ margin: "12px 0 8px", fontWeight: 600 }}>دسترسی‌ها</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
        {catalog.map((p) => {
          const held = mine.includes(p.key);
          return (
            <label key={p.key} className="row" style={{ gap: 8, opacity: held ? 1 : 0.45 }}>
              <input
                type="checkbox"
                checked={selected.includes(p.key)}
                disabled={!held}
                onChange={() =>
                  setSelected((s) => (s.includes(p.key) ? s.filter((k) => k !== p.key) : [...s, p.key]))
                }
              />
              <span>{p.label}</span>
            </label>
          );
        })}
      </div>
      {save.isError && <ErrorState message={roleError(save.error)} />}
      <div className="row" style={{ gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
        <button className="btn ghost" onClick={onClose}>انصراف</button>
        <button className="btn" disabled={!roleName.trim() || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "در حال ایجاد…" : "ایجاد نقش"}
        </button>
      </div>
    </Modal>
  );
}

function MembersModal({ role, onClose }: { role: AdminRoleItem; onClose: () => void }) {
  const members = useQuery({
    queryKey: ["role-members", role.id],
    queryFn: async () => unwrap<RoleMember[]>((await api.get(`/admin/roles/${role.id}/members`)).data),
  });

  return (
    <Modal title={`اعضای نقش «${role.roleName}»`} onClose={onClose}>
      {members.isLoading ? <Loading /> : members.isError ? <ErrorState message={apiError(members.error)} /> :
      !members.data?.length ? <Empty label="این نقش عضوی ندارد" /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>مدیر</th><th>وضعیت</th><th>آخرین ورود</th></tr>
            </thead>
            <tbody>
              {members.data.map((m) => (
                <tr key={m.id}>
                  <td>{m.phone ?? m.email ?? m.id.slice(0, 8)}</td>
                  <td>
                    <Badge kind={m.isSuspended ? "red" : "green"}>{m.isSuspended ? "معلق" : "فعال"}</Badge>
                  </td>
                  <td>{m.lastLoginAt ? fmtDate(m.lastLoginAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

export default function RolesPage() {
  const qc = useQueryClient();
  const { permissions: mine, can } = usePermissions();
  const [filter, setFilter] = useState<KpiFilter>("all");
  const [editing, setEditing] = useState<AdminRoleItem | null>(null);
  const [viewingMembers, setViewingMembers] = useState<AdminRoleItem | null>(null);
  const [deleting, setDeleting] = useState<AdminRoleItem | null>(null);
  const [creating, setCreating] = useState(false);

  const roles = useQuery({
    queryKey: ["roles"],
    queryFn: async () => unwrap<AdminRoleItem[]>((await api.get("/admin/roles")).data),
  });
  const stats = useQuery({
    queryKey: ["role-stats"],
    queryFn: async () => unwrap<RoleStats>((await api.get("/admin/roles/stats")).data),
  });
  const catalog = useQuery({
    queryKey: ["permission-catalog"],
    queryFn: async () => unwrap<Permission[]>((await api.get("/admin/permissions")).data),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/roles/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      qc.invalidateQueries({ queryKey: ["role-stats"] });
      setDeleting(null);
    },
  });

  const filtered = useMemo(() => {
    const list = roles.data ?? [];
    if (filter === "members") return list.filter((r) => r.memberCount > 0);
    if (filter === "fixed") return list.filter((r) => r.isFixed);
    if (filter === "empty") return list.filter((r) => r.memberCount === 0);
    return list;
  }, [roles.data, filter]);

  const meta = FILTER_META[filter];

  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        {KPIS.map((k) => (
          <div
            key={k.filter}
            role="button"
            tabIndex={0}
            onClick={() => setFilter(k.filter)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setFilter(k.filter);
            }}
            style={{
              cursor: "pointer",
              outline: filter === k.filter ? "1px solid var(--gold)" : undefined,
              borderRadius: "var(--radius)",
            }}
          >
            <Stat label={k.label} value={fmtNum(stats.data?.[k.key] ?? 0)} />
          </div>
        ))}
      </div>

      <Card
        title={meta.title}
        action={
          can("roles_manage") && (
            <button className="btn" onClick={() => setCreating(true)}>نقش جدید</button>
          )
        }
      >
        {roles.isLoading ? <Loading /> : roles.isError ? <ErrorState message={apiError(roles.error)} /> :
        !filtered.length ? <Empty label={meta.empty} /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>نقش</th>
                  <th>دسترسی‌ها</th>
                  <th>کیف‌پول‌ها</th>
                  <th>سقف اعتبار</th>
                  <th>اعضا</th>
                  <th>تاریخ ایجاد</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="row" style={{ gap: 6, alignItems: "center" }}>
                        <Badge kind="gold">{r.roleName}</Badge>
                        {r.isFixed && <Badge kind="gray">ثابت</Badge>}
                      </div>
                    </td>
                    <td>{fmtNum(r.permissions.length)}</td>
                    <td>{r.wallets.length ? r.wallets.join("، ") : "—"}</td>
                    <td>{r.maxCredit ? fmtToman(r.maxCredit) : "—"}</td>
                    <td>
                      {r.memberCount > 0 ? (
                        <button className="btn ghost sm" onClick={() => setViewingMembers(r)}>
                          {fmtNum(r.memberCount)}
                        </button>
                      ) : (
                        fmtNum(0)
                      )}
                    </td>
                    <td>{fmtDate(r.createAt)}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        {/* `capabilities` comes from the server, so a disabled
                            button here means the server would refuse it too. */}
                        <button
                          className="btn ghost sm"
                          disabled={!r.capabilities.canEditPermissions}
                          onClick={() => setEditing(r)}
                        >
                          دسترسی‌ها
                        </button>
                        <button
                          className="btn ghost sm"
                          disabled={!r.capabilities.canDelete}
                          onClick={() => setDeleting(r)}
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && catalog.data && (
        <PermissionsModal
          role={editing}
          catalog={catalog.data}
          mine={mine ?? []}
          onClose={() => setEditing(null)}
        />
      )}
      {creating && catalog.data && (
        <CreateRoleModal catalog={catalog.data} mine={mine ?? []} onClose={() => setCreating(false)} />
      )}
      {viewingMembers && <MembersModal role={viewingMembers} onClose={() => setViewingMembers(null)} />}
      {deleting && (
        <Modal title="حذف نقش" onClose={() => setDeleting(null)}>
          <p>نقش «{deleting.roleName}» حذف شود؟ این کار قابل بازگشت نیست.</p>
          {remove.isError && <ErrorState message={roleError(remove.error)} />}
          <div className="row" style={{ gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button className="btn ghost" onClick={() => setDeleting(null)}>انصراف</button>
            <button className="btn danger" disabled={remove.isPending} onClick={() => remove.mutate(deleting.id)}>
              {remove.isPending ? "در حال حذف…" : "حذف"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
