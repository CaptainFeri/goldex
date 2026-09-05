import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiError } from "../api/client";
import { p2pApi } from "../api/p2p";
import { Card, Loading, ErrorState } from "../components/ui";
import type { P2pSettings } from "../api/types";
import { rialToToman, tomanToRial } from "../lib/money";

const WEIGHT_LABELS: Record<keyof P2pSettings["matchingWeights"], string> = {
  amountFit: "تناسب مبلغ",
  partsFit: "تناسب تعداد مراحل",
  constraints: "رعایت شرایط",
  age: "سن درخواست",
  priority: "اولویت منبع",
  risk: "ریسک کاربر",
};

export default function P2pSettingsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<P2pSettings | null>(null);
  const [saved, setSaved] = useState(false);

  const settings = useQuery({ queryKey: ["p2p-settings"], queryFn: p2pApi.getSettings });

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (body: Partial<P2pSettings>) => p2pApi.updateSettings(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["p2p-settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (settings.isLoading) return <Card title="تنظیمات همتا به همتا"><Loading /></Card>;
  if (settings.isError) return <Card title="تنظیمات همتا به همتا"><ErrorState message={apiError(settings.error)} /></Card>;
  if (!form) return null;

  const set = <K extends keyof P2pSettings>(k: K, v: P2pSettings[K]) =>
    setForm((p) => (p ? { ...p, [k]: v } : p));

  const weightTotal = Object.values(form.matchingWeights).reduce((a, b) => a + Number(b || 0), 0);

  return (
    <Card
      title="تنظیمات همتا به همتا (ریالی)"
      action={
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {saved && <span style={{ fontSize: 12, color: "#5cb87a" }}>ذخیره شد</span>}
          <button className="btn sm" disabled={save.isPending} onClick={() => save.mutate(form)}>
            {save.isPending ? <><span className="spin" /> در حال ذخیره…</> : "ذخیره تنظیمات"}
          </button>
        </div>
      }
    >
      {save.isError && <div style={{ marginBottom: 12 }}><ErrorState message={apiError(save.error)} /></div>}

      <h4 style={{ marginTop: 0 }}>مهلت‌ها</h4>
      <div className="form-grid">
        <div className="field">
          <label>مهلت کل تسویه (دقیقه)</label>
          <input className="input" type="number" min="1" value={form.settlementTimeoutMinutes}
            onChange={(e) => set("settlementTimeoutMinutes", Number(e.target.value))} />
        </div>
        <div className="field">
          <label>مهلت پاسخ برداشت‌کننده (دقیقه)</label>
          <input className="input" type="number" min="1" value={form.withdrawerResponseTimeoutMinutes}
            onChange={(e) => set("withdrawerResponseTimeoutMinutes", Number(e.target.value))} />
          <small style={{ color: "var(--text-muted)" }}>
            پس از این مهلت، پرونده خودکار به صف تعیین‌تکلیف می‌رود و هرگز خودکار تسویه نمی‌شود.
          </small>
        </div>
        <div className="field">
          <label>مدت اعتبار رزرو (دقیقه)</label>
          <input className="input" type="number" min="1" value={form.reservationTtlMinutes}
            onChange={(e) => set("reservationTtlMinutes", Number(e.target.value))} />
        </div>
        <div className="field">
          <label>مهلت انقضای درخواست برداشت (ساعت)</label>
          <input className="input" type="number" min="1" value={form.requestExpiryHours}
            onChange={(e) => set("requestExpiryHours", Number(e.target.value))} />
        </div>
      </div>

      <h4>اولویت منبع</h4>
      <div className="form-grid">
        <div className="field">
          <label>برای واریز</label>
          <select className="select" value={form.sourcePriority.deposit}
            onChange={(e) => set("sourcePriority", { ...form.sourcePriority, deposit: e.target.value as any })}>
            <option value="CUSTOMER_FIRST">اول مشتری</option>
            <option value="ADMIN_FIRST">اول حساب مدیر</option>
          </select>
        </div>
        <div className="field">
          <label>برای برداشت</label>
          <select className="select" value={form.sourcePriority.withdrawal}
            onChange={(e) => set("sourcePriority", { ...form.sourcePriority, withdrawal: e.target.value as any })}>
            <option value="CUSTOMER_FIRST">اول مشتری</option>
            <option value="ADMIN_FIRST">اول حساب مدیر</option>
          </select>
        </div>
        <div className="field">
          <label>حداکثر تلاش مجدد تطبیق</label>
          <input className="input" type="number" min="0" value={form.matchingMaxRetry}
            onChange={(e) => set("matchingMaxRetry", Number(e.target.value))} />
        </div>
      </div>

      <h4>وزن‌های امتیازدهی تطبیق</h4>
      <div className="form-grid">
        {(Object.keys(WEIGHT_LABELS) as (keyof P2pSettings["matchingWeights"])[]).map((k) => (
          <div className="field" key={k}>
            <label>{WEIGHT_LABELS[k]}</label>
            <input className="input" type="number" min="0" value={form.matchingWeights[k]}
              onChange={(e) => set("matchingWeights", { ...form.matchingWeights, [k]: Number(e.target.value) })} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: weightTotal === 100 ? "var(--text-muted)" : "#e0b341", marginTop: 4 }}>
        مجموع وزن‌ها: {weightTotal.toLocaleString("fa-IR")}
        {weightTotal !== 100 && " — معمولاً مجموع ۱۰۰ در نظر گرفته می‌شود"}
      </div>

      <h4>تعیین‌تکلیف و کنترل‌ها</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label className="row" style={{ gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={form.escalation.notifyAdminOnReject}
            onChange={(e) => set("escalation", { ...form.escalation, notifyAdminOnReject: e.target.checked })} />
          <span>اعلان به ادمین هنگام رد توسط برداشت‌کننده</span>
        </label>
        <label className="row" style={{ gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={form.escalation.notifyAdminOnNoResponse}
            onChange={(e) => set("escalation", { ...form.escalation, notifyAdminOnNoResponse: e.target.checked })} />
          <span>اعلان به ادمین هنگام عدم پاسخ برداشت‌کننده</span>
        </label>
        <label className="row" style={{ gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={form.escalation.requireAdminResolution}
            onChange={(e) => set("escalation", { ...form.escalation, requireAdminResolution: e.target.checked })} />
          <span>تصمیم ادمین برای بستن پرونده الزامی باشد</span>
        </label>
        <label className="row" style={{ gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={form.allowOverUnderSplit}
            onChange={(e) => set("allowOverUnderSplit", e.target.checked)} />
          <span>اجازه تطبیق با مبلغ کمتر/بیشتر از باقی‌مانده بخش</span>
        </label>
      </div>

      <div className="form-grid" style={{ marginTop: 12 }}>
        <div className="field">
          <label>آستانه تأیید دو نفره (تومان)</label>
          <input className="input" type="number" min="0"
            value={rialToToman(form.twoPersonApprovalThreshold) ?? ""}
            onChange={(e) => set("twoPersonApprovalThreshold", tomanToRial(e.target.value) ?? 0)} />
          <small style={{ color: "var(--text-muted)" }}>
            تسویه بالاتر از این مبلغ نیاز به تأیید ادمین دوم دارد.
          </small>
        </div>
      </div>
    </Card>
  );
}
