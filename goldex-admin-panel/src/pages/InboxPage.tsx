import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Stat, Badge, Loading, ErrorState, Empty } from "../components/ui";
import { fmtNum, fmtDate } from "../lib/format";
import { fmtToman } from "../lib/money";
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  SEVERITY_KINDS,
  SEVERITY_LABELS,
  inboxAmount,
  inboxLink,
} from "../lib/inbox";
import type { InboxCategory, InboxItem, InboxSeverity, InboxStats, Paginated } from "../api/types";

const CATEGORIES: (InboxCategory | "")[] = ["", "withdrawal", "deposit", "kyc", "arbitrage", "user", "system"];
const SEVERITIES: (InboxSeverity | "")[] = ["", "urgent", "warning", "info"];

function Row({ item, onRead }: { item: InboxItem; onRead: (id: string) => void }) {
  const link = inboxLink(item);
  const amount = inboxAmount(item);

  return (
    <div
      className="settings-row"
      style={{ alignItems: "flex-start", opacity: item.isRead ? 0.6 : 1, gap: 12 }}
    >
      <div className="row" style={{ gap: 10, alignItems: "flex-start", flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 18, lineHeight: 1.2 }}>{CATEGORY_ICONS[item.category]}</span>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {/* Unread is carried by weight and a dot, not colour alone. */}
            {!item.isRead && (
              <span aria-label="خوانده‌نشده" title="خوانده‌نشده"
                style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--gold)" }} />
            )}
            <span style={{ fontWeight: item.isRead ? 500 : 700 }}>{item.title}</span>
            <Badge kind={SEVERITY_KINDS[item.severity]}>{SEVERITY_LABELS[item.severity]}</Badge>
            <Badge kind="gray">{CATEGORY_LABELS[item.category]}</Badge>
          </div>
          <div className="settings-row-desc" style={{ whiteSpace: "normal" }}>
            {item.body}
            {/* The amount comes from metadata in rial and is formatted here —
                it is deliberately not part of the body text. */}
            {amount && <> — {fmtToman(amount)}</>}
          </div>
          <div className="settings-row-desc">{fmtDate(item.createAt)}</div>
        </div>
      </div>
      <div className="row" style={{ gap: 6, flexShrink: 0 }}>
        {link && <Link className="btn ghost sm" to={link}>مشاهده</Link>}
        {!item.isRead && (
          <button className="btn ghost sm" onClick={() => onRead(item.id)}>خواندم</button>
        )}
      </div>
    </div>
  );
}

export default function InboxPage() {
  const qc = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(true);
  const [category, setCategory] = useState<InboxCategory | "">("");
  const [severity, setSeverity] = useState<InboxSeverity | "">("");
  const [page, setPage] = useState(1);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inbox"] });
    qc.invalidateQueries({ queryKey: ["inbox-stats"] });
    qc.invalidateQueries({ queryKey: ["inbox-unread"] });
  };

  const stats = useQuery({
    queryKey: ["inbox-stats"],
    queryFn: async () => unwrap<InboxStats>((await api.get("/admin/notifications/inbox/stats")).data),
  });

  const list = useQuery({
    queryKey: ["inbox", unreadOnly, category, severity, page],
    queryFn: async () =>
      unwrap<Paginated<InboxItem>>(
        (await api.get("/admin/notifications/inbox", {
          params: {
            unreadOnly,
            page,
            pageSize: 20,
            category: category || undefined,
            severity: severity || undefined,
          },
        })).data,
      ),
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => api.patch(`/admin/notifications/inbox/${id}/read`),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: async () => api.patch("/admin/notifications/inbox/read-all"),
    onSuccess: invalidate,
  });

  const filter = <T extends string>(
    value: T,
    set: (v: T) => void,
    options: T[],
    labels: Record<string, string>,
    allLabel: string,
  ) => (
    <select
      className="select"
      // Constrained, or the selects stretch and push the filter row onto
      // three lines inside the card header.
      style={{ width: 150 }}
      value={value}
      onChange={(e) => {
        set(e.target.value as T);
        // A filter change with a stale page number shows an empty list on a
        // result set that is smaller than the page you were on.
        setPage(1);
      }}
    >
      {options.map((o) => (
        <option key={o} value={o}>{o === "" ? allLabel : labels[o]}</option>
      ))}
    </select>
  );

  const totalPages = list.data?.totalPages ?? 0;

  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="خوانده‌نشده" value={fmtNum(stats.data?.unread ?? 0)} />
        <Stat label="فوری" value={fmtNum(stats.data?.urgent ?? 0)} />
        <Stat label="امروز" value={fmtNum(stats.data?.today ?? 0)} />
        <Stat
          label="اتصال زنده"
          value={stats.data ? (stats.data.realtimeEnabled ? "برقرار" : "غیرفعال") : "…"}
          sub={
            stats.data?.realtimeEnabled ? (
              <span className="muted">{fmtNum(stats.data.connectedAdmins)} مدیر متصل</span>
            ) : (
              // Say it plainly rather than let a silent list imply live updates.
              <span className="muted">به‌روزرسانی با تازه‌سازی صفحه</span>
            )
          }
        />
      </div>

      <Card
        title="صندوق اعلان‌ها"
        action={
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <label className="row" style={{ gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => {
                  setUnreadOnly(e.target.checked);
                  setPage(1);
                }}
              />
              فقط خوانده‌نشده
            </label>
            {filter(category, setCategory, CATEGORIES, CATEGORY_LABELS, "همه دسته‌ها")}
            {filter(severity, setSeverity, SEVERITIES, SEVERITY_LABELS, "همه اولویت‌ها")}
            <button
              className="btn ghost"
              disabled={markAll.isPending || !stats.data?.unread}
              onClick={() => markAll.mutate()}
            >
              {markAll.isPending ? "…" : "خواندن همه"}
            </button>
          </div>
        }
      >
        {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={apiError(list.error)} /> :
        !list.data?.items.length ? (
          <Empty label={unreadOnly ? "اعلان خوانده‌نشده‌ای ندارید" : "اعلانی برای نمایش نیست"} />
        ) : (
          <>
            {list.data.items.map((i) => (
              <Row key={i.id} item={i} onRead={(id) => markRead.mutate(id)} />
            ))}
            {totalPages > 1 && (
              <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: 16 }}>
                <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  قبلی
                </button>
                <span className="muted" style={{ fontSize: 13 }}>
                  صفحه {fmtNum(page)} از {fmtNum(totalPages)}
                </span>
                <button
                  className="btn ghost sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  بعدی
                </button>
              </div>
            )}
          </>
        )}
        {markRead.isError && <ErrorState message={apiError(markRead.error)} />}
        {markAll.isError && <ErrorState message={apiError(markAll.error)} />}
      </Card>
    </>
  );
}
