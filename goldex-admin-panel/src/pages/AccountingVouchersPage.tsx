import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge, Modal } from "../components/ui";
import DateField from "../components/DateField";
import OtpConfirmModal, { otpError } from "../components/OtpConfirmModal";
import { fmtNum, fmtDate } from "../lib/format";
import { fmtBySymbol, toApiAmount, unitLabel } from "../lib/money";
import { downloadExport, stampedName } from "../lib/download";
import type {
  CatalogOption,
  Paginated,
  Voucher,
  VoucherCatalogs,
  VoucherStatus,
} from "../api/types";

const STATUS_KIND: Record<VoucherStatus, "green" | "red" | "gold" | "gray"> = {
  draft: "gray",
  pending: "gold",
  finalized: "green",
  rejected: "red",
};

const STATUS_FILTERS: { value: VoucherStatus | ""; label: string }[] = [
  { value: "", label: "همه وضعیت‌ها" },
  { value: "draft", label: "پیش‌نویس" },
  { value: "pending", label: "در انتظار تایید" },
  { value: "finalized", label: "ثبت نهایی" },
  { value: "rejected", label: "رد شده" },
];

const opt = (list: CatalogOption[] | undefined, value: string) =>
  list?.find((o) => o.value === value)?.label ?? value;

function CreateVoucherModal({
  catalogs,
  onClose,
}: {
  catalogs: VoucherCatalogs;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    movement: catalogs.movements[0]?.value ?? "deposit",
    customerName: "",
    customerType: catalogs.customerTypes[0]?.value ?? "formal",
    category: catalogs.categories[0]?.value ?? "",
    symbolId: catalogs.symbols[0]?.value ?? "",
    amount: "",
    walletType: catalogs.walletTypes[0]?.value ?? "",
    walletSubset: catalogs.walletSubsets[0]?.value ?? "",
    description: "",
    extraDescription: "",
    documentDate: new Date().toISOString().slice(0, 10),
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const symbolSlug = opt(catalogs.symbols, form.symbolId);

  const save = useMutation({
    mutationFn: () =>
      api.post("/admin/accounting/vouchers", {
        ...form,
        extraDescription: form.extraDescription || undefined,
        // Typed in the symbol's display unit, converted back once here.
        amount: String(toApiAmount(form.amount, symbolSlug) ?? ""),
        documentDate: new Date(`${form.documentDate}T00:00:00`).toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vouchers"] });
      onClose();
    },
  });

  return (
    <Modal wide title="سند حسابداری جدید" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="form-grid">
          <div className="field">
            <label>ماهیت حرکت</label>
            <select className="select" value={form.movement} onChange={(e) => set("movement", e.target.value)}>
              {catalogs.movements.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            {/*
              The debit/credit side is decided by the server from this, and is
              not a field on the form — a stated side that disagreed with the
              movement would reconcile to nothing.
            */}
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              بدهکار / بستانکار بر اساس همین انتخاب تعیین می‌شود.
            </div>
          </div>
          <div className="field">
            <label>نام مشتری</label>
            <input className="input" value={form.customerName} onChange={(e) => set("customerName", e.target.value)} required />
          </div>
          <div className="field">
            <label>نوع مشتری</label>
            <select className="select" value={form.customerType} onChange={(e) => set("customerType", e.target.value)}>
              {catalogs.customerTypes.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>دسته</label>
            <select className="select" value={form.category} onChange={(e) => set("category", e.target.value)}>
              {catalogs.categories.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>کیف پول</label>
            <select className="select" value={form.walletType} onChange={(e) => set("walletType", e.target.value)}>
              {catalogs.walletTypes.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>بخش کیف پول</label>
            <select className="select" value={form.walletSubset} onChange={(e) => set("walletSubset", e.target.value)}>
              {catalogs.walletSubsets.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>نماد</label>
            <select className="select" value={form.symbolId} onChange={(e) => set("symbolId", e.target.value)}>
              {catalogs.symbols.map((sy) => (
                <option key={sy.value} value={sy.value}>{sy.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>مبلغ ({unitLabel(symbolSlug)})</label>
            <input
              className="input mono"
              dir="ltr"
              type="number"
              min={0}
              step="0.00000001"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>تاریخ سند</label>
            <DateField value={form.documentDate} onChange={(v) => set("documentDate", v)} />
          </div>
        </div>
        <div className="field">
          <label>شرح</label>
          <input className="input" value={form.description} onChange={(e) => set("description", e.target.value)} required />
        </div>
        <div className="field">
          <label>شرح تکمیلی (اختیاری)</label>
          <input className="input" value={form.extraDescription} onChange={(e) => set("extraDescription", e.target.value)} />
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          سند به‌صورت پیش‌نویس ثبت می‌شود؛ ثبت نهایی توسط کاربر دیگری انجام می‌گیرد.
        </div>
        {save.isError && <div className="error-text">{apiError(save.error)}</div>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button className="btn primary" disabled={save.isPending}>
            {save.isPending ? <span className="spin" /> : "ثبت پیش‌نویس"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ReviewModal({
  voucher,
  action,
  onClose,
}: {
  voucher: Voucher;
  action: "finalize" | "reject";
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const finalizing = action === "finalize";

  // Finalising books the money, so the server requires a second factor bound
  // to this voucher and this note. Rejecting books nothing and stays direct.
  const [confirming, setConfirming] = useState(false);

  const run = useMutation({
    mutationFn: (confirmation?: { challengeId: string; otp: string }) =>
      api.post(`/admin/accounting/vouchers/${voucher.id}/${action}`, {
        note: note || undefined,
        ...(confirmation ?? {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vouchers"] });
      onClose();
    },
  });

  // Exactly what the request will send, so the hash the server recomputes from
  // the body matches the one the code was issued against. `note` is included
  // because the scope hashes it — editing the note after requesting a code
  // correctly invalidates that code.
  const otpPayload = { note: note || undefined };

  if (confirming) {
    return (
      <OtpConfirmModal
        title={`تأیید ثبت نهایی سند ${voucher.voucherCode}`}
        description="این عملیات مبلغ را در دفتر ثبت می‌کند و برگشت‌پذیر نیست."
        scope="accounting.voucher"
        refId={voucher.id}
        fields={["note"]}
        payload={otpPayload}
        confirmLabel="ثبت نهایی"
        pending={run.isPending}
        actionError={run.isError ? run.error : undefined}
        onConfirm={(confirmation) => run.mutate(confirmation)}
        onClose={() => setConfirming(false)}
      />
    );
  }

  return (
    <Modal title={`${finalizing ? "ثبت نهایی" : "رد"} سند ${voucher.voucherCode}`} onClose={onClose}>
      <div className="kv" style={{ marginBottom: 12 }}>
        <span className="k">مشتری</span><span>{voucher.customerName}</span>
        <span className="k">شرح</span><span>{voucher.description}</span>
        <span className="k">ماهیت</span><span>{voucher.sideLabel}</span>
        <span className="k">مبلغ</span>
        <span className="mono">{fmtBySymbol(voucher.amount, voucher.unit, { digits: 0 })}</span>
      </div>
      {finalizing && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          پس از ثبت نهایی، سند قابل تغییر یا برگشت نیست؛ اصلاح با سند جدید انجام می‌شود.
        </div>
      )}
      <div className="field">
        <label>یادداشت (اختیاری)</label>
        <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {run.isError && <div className="error-text">{otpError(run.error)}</div>}
      <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
        <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
        <button
          className="btn primary"
          disabled={run.isPending}
          onClick={() => (finalizing ? setConfirming(true) : run.mutate(undefined))}
        >
          {run.isPending ? <span className="spin" /> : finalizing ? "ادامه و دریافت کد" : "رد سند"}
        </button>
      </div>
    </Modal>
  );
}

export default function AccountingVouchersPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ customer: "", customerType: "", status: "", amountFrom: "", amountTo: "" });
  const [applied, setApplied] = useState<Record<string, unknown>>({});
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [review, setReview] = useState<{ voucher: Voucher; action: "finalize" | "reject" } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const catalogs = useQuery({
    queryKey: ["voucher-catalogs"],
    queryFn: async () => unwrap<VoucherCatalogs>((await api.get("/admin/accounting/catalogs")).data),
  });

  const list = useQuery({
    queryKey: ["vouchers", applied, page],
    queryFn: async () =>
      unwrap<Paginated<Voucher>>(
        (await api.get("/admin/accounting/vouchers", { params: { ...applied, page, pageSize: 20 } })).data,
      ),
  });

  const submit = useMutation({
    mutationFn: (id: string) => api.post(`/admin/accounting/vouchers/${id}/submit`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vouchers"] }),
    onError: (err) => setActionError(apiError(err)),
  });

  async function onExport() {
    setExporting(true);
    setActionError(null);
    try {
      await downloadExport("/admin/accounting/vouchers/export", applied, stampedName("accounting-vouchers"));
    } catch (err) {
      setActionError(apiError(err));
    } finally {
      setExporting(false);
    }
  }

  const rows = list.data?.items ?? [];
  const totalPages = list.data?.totalPages ?? 1;

  return (
    <Card
      title="اسناد حسابداری"
      action={
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm" disabled={exporting} onClick={onExport}>
            {exporting ? <span className="spin" /> : "خروجی اکسل"}
          </button>
          <button
            className="btn primary sm"
            disabled={!catalogs.data}
            onClick={() => setCreating(true)}
          >
            + سند جدید
          </button>
        </div>
      }
    >
      <div className="toolbar" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div className="field" style={{ margin: 0, minWidth: 170 }}>
          <label>نام مشتری</label>
          <input className="input" value={filters.customer} onChange={(e) => setFilters({ ...filters, customer: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0, minWidth: 140 }}>
          <label>نوع مشتری</label>
          <select className="select" value={filters.customerType} onChange={(e) => setFilters({ ...filters, customerType: e.target.value })}>
            <option value="">هردو</option>
            {(catalogs.data?.customerTypes ?? []).map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0, minWidth: 150 }}>
          <label>وضعیت</label>
          <select className="select" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0, minWidth: 130 }}>
          <label>از مبلغ</label>
          <input className="input mono" dir="ltr" value={filters.amountFrom} onChange={(e) => setFilters({ ...filters, amountFrom: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0, minWidth: 130 }}>
          <label>تا مبلغ</label>
          <input className="input mono" dir="ltr" value={filters.amountTo} onChange={(e) => setFilters({ ...filters, amountTo: e.target.value })} />
        </div>
        <button
          className="btn primary"
          onClick={() => {
            setApplied(Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "")));
            setPage(1);
          }}
        >
          اعمال فیلتر
        </button>
      </div>

      {actionError && <div className="error-text" style={{ marginBottom: 8 }}>{actionError}</div>}

      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={apiError(list.error)} />
      ) : rows.length === 0 ? (
        <Empty label="سندی با این فیلتر نیست" />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>شماره سند</th><th>مشتری</th><th>شرح</th><th>نوع مشتری</th>
                  <th>دسته</th><th>ماهیت</th><th>مبلغ</th><th>وضعیت</th>
                  <th>ثبت کننده</th><th>تاریخ سند</th><th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id}>
                    <td className="mono" style={{ fontSize: 12 }}>{v.voucherCode}</td>
                    <td>
                      {v.customerName}
                      {v.extraDescription && (
                        <div className="muted" style={{ fontSize: 11, whiteSpace: "normal" }}>{v.extraDescription}</div>
                      )}
                    </td>
                    <td style={{ whiteSpace: "normal", maxWidth: 240 }}>{v.description}</td>
                    <td>{v.customerType === "formal" ? "رسمی" : "غیر رسمی"}</td>
                    <td>{v.categoryLabel}</td>
                    <td>
                      <Badge kind={v.side === "creditor" ? "green" : "gold"}>{v.sideLabel}</Badge>
                    </td>
                    <td className="mono">{fmtBySymbol(v.amount, v.unit, { digits: 0 })}</td>
                    <td>
                      <Badge kind={STATUS_KIND[v.status]}>{v.statusLabel}</Badge>
                      {v.reviewNote && (
                        <div className="muted" style={{ fontSize: 11, whiteSpace: "normal", maxWidth: 180 }}>{v.reviewNote}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>{v.createdByName ?? "—"}</td>
                    <td style={{ fontSize: 12 }}>{fmtDate(v.documentDate)}</td>
                    <td>
                      <div className="row">
                        {/*
                          A draft is submitted by its author; a pending voucher
                          is booked or refused by someone else. The API enforces
                          both — these buttons only avoid offering the step that
                          is not available yet.
                        */}
                        {v.status === "draft" && (
                          <button className="btn sm" disabled={submit.isPending} onClick={() => submit.mutate(v.id)}>
                            ارسال برای تایید
                          </button>
                        )}
                        {v.status === "pending" && (
                          <>
                            <button className="btn sm" onClick={() => setReview({ voucher: v, action: "finalize" })}>
                              ثبت نهایی
                            </button>
                            <button className="btn sm ghost" onClick={() => setReview({ voucher: v, action: "reject" })}>
                              رد
                            </button>
                          </>
                        )}
                        {(v.status === "finalized" || v.status === "rejected") && (
                          <span className="muted" style={{ fontSize: 12 }}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 12 }}>
              <button className="btn sm ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</button>
              <span className="muted" style={{ fontSize: 12 }}>
                صفحه {fmtNum(page)} از {fmtNum(totalPages)}
              </span>
              <button className="btn sm ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>بعدی</button>
            </div>
          )}
        </>
      )}

      {creating && catalogs.data && (
        <CreateVoucherModal catalogs={catalogs.data} onClose={() => setCreating(false)} />
      )}
      {review && (
        <ReviewModal voucher={review.voucher} action={review.action} onClose={() => setReview(null)} />
      )}
    </Card>
  );
}
