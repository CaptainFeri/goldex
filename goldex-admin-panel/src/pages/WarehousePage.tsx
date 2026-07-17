import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Modal, Loading, ErrorState, Empty, Badge } from "../components/ui";
import { fmtNum, fmtDate } from "../lib/format";
import type { Warehouse, Packet, WarehouseRequest } from "../api/types";

function downloadCSV(data: Record<string, any>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const num = (...v: any[]) => {
  for (const x of v) if (x !== undefined && x !== null) return Number(x) || 0;
  return 0;
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: "gold",
  APPROVED: "green",
  COMPLETED: "green",
  REJECTED: "red",
  CANCELLED: "gray",
  ACTIVE: "green",
  INACTIVE: "gray",
  MAINTENANCE: "gold",
  FULL: "red",
  IN_WAREHOUSE: "green",
  WITHDRAWN: "red",
  RELEASED: "gold",
  ORPHAN: "gray",
};
const badgeKind = (s: string): "green" | "red" | "gold" | "gray" => (STATUS_BADGE[s] ?? "gray") as "green" | "red" | "gold" | "gray";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "در انتظار",
  APPROVED: "تایید شده",
  COMPLETED: "تکمیل شده",
  REJECTED: "رد شده",
  CANCELLED: "لغو شده",
  ACTIVE: "فعال",
  INACTIVE: "غیرفعال",
  MAINTENANCE: "تعمیرات",
  FULL: "پر",
  IN_WAREHOUSE: "در انبار",
  WITHDRAWN: "برداشت شده",
  RELEASED: "آزاد شده",
  ORPHAN: "یتیم",
};
const tStatus = (s: string) => STATUS_LABEL[s] ?? s;

const TABS = [
  { key: "overview", label: "نمای کلی" },
  { key: "warehouses", label: "انبارها" },
  { key: "packets", label: "بسته‌ها" },
  { key: "requests", label: "درخواست‌ها" },
  { key: "pending-withdraw", label: "برداشت در انتظار" },
  { key: "settlement", label: "مواد تسویه" },
];

function PacketPictureUpload({ packetId, onClose }: { packetId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);

  const upload = useMutation({
    mutationFn: (formData: FormData) =>
      api.post(`/admin/warehouse/packets/${packetId}/picture`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-packets"] });
      onClose();
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.append("picture", file);
    upload.mutate(fd);
  }

  return (
    <Modal title="آپلود تصویر بسته" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label>انتخاب تصویر</label>
          <input className="input" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        </div>
        {upload.isError && <div className="error-text">{apiError(upload.error)}</div>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button className="btn primary" disabled={!file || upload.isPending}>
            {upload.isPending ? <span className="spin" /> : "آپلود"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PacketDetailsModal({ packetId, onClose }: { packetId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-packet-detail", packetId],
    queryFn: async () => unwrap<Packet>((await api.get(`/admin/warehouse/packets/${packetId}`)).data),
  });
  const [showPicUpload, setShowPicUpload] = useState(false);

  const removePacket = useMutation({
    mutationFn: () => api.delete(`/admin/warehouse/packets/${packetId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-packets"] });
      qc.invalidateQueries({ queryKey: ["admin-orphan-packets"] });
      onClose();
    },
  });

  const p = q.data;
  return (
    <Modal title={`جزئیات بسته ${p?.idSecure ?? packetId?.slice(0, 8)}`} onClose={onClose} wide>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={apiError(q.error)} />
      ) : p ? (
        <>
          {p.picture && (
            <div style={{ marginBottom: 16, textAlign: "center" }}>
              <img src={p.picture} alt="تصویر بسته" style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8, border: "1px solid var(--border)" }} />
            </div>
          )}
          <div className="kv">
            <span className="k">شناسه</span>
            <span className="mono" style={{ fontSize: 12 }}>{p.id}</span>
            <span className="k">شناسه امن</span>
            <span className="mono">{p.idSecure}</span>
            <span className="k">وزن خالص</span>
            <span className="mono">{fmtNum(p.pureWeight, 6)}g</span>
            <span className="k">وضعیت</span>
            <span><Badge kind={badgeKind(p.status)}>{tStatus(p.status)}</Badge></span>
            <span className="k">انبار</span>
            <span>{p.warehouse?.name ?? "—"}</span>
            <span className="k">ANG</span>
            <span>{p.ang ?? "—"}</span>
            <span className="k">عیار</span>
            <span>{p.ayar ?? "—"}</span>
            <span className="k">موقعیت</span>
            <span>{p.warehouseIndexPosition ?? "—"}</span>
            <span className="k">سریال</span>
            <span className="mono">{p.batchNumber || "—"}</span>
            <span className="k">یتیم</span>
            <span>{p.isOrphan ? <Badge kind="gold">بله</Badge> : <Badge kind="gray">خیر</Badge>}</span>
            <span className="k">QR</span>
            <span className="mono" style={{ fontSize: 11 }}>{p.qrCode || "—"}</span>
            <span className="k">ایجاد</span>
            <span>{fmtDate(p.createAt)}</span>
          </div>
          <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button className="btn sm" onClick={() => setShowPicUpload(true)}>آپلود تصویر</button>
            <button className="btn sm danger" disabled={removePacket.isPending}
              onClick={() => { if (confirm("این بسته حذف شود؟")) removePacket.mutate(); }}>
              حذف بسته
            </button>
          </div>
          {showPicUpload && <PacketPictureUpload packetId={packetId} onClose={() => setShowPicUpload(false)} />}
        </>
      ) : null}
    </Modal>
  );
}

function RequestDetailsModal({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["admin-request-detail", requestId],
    queryFn: async () => unwrap<WarehouseRequest>((await api.get(`/admin/warehouse/requests/${requestId}`)).data),
  });
  const r = q.data;
  return (
    <Modal title={`جزئیات درخواست ${requestId?.slice(0, 8)}`} onClose={onClose} wide>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={apiError(q.error)} />
      ) : r ? (
        <div className="kv">
          <span className="k">شناسه</span>
          <span className="mono" style={{ fontSize: 12 }}>{r.id}</span>
          <span className="k">نوع</span>
          <span><Badge kind={r.type === "INPUT" ? "green" : "gold"}>{r.type === "INPUT" ? "واریز" : "برداشت"}</Badge></span>
          <span className="k">کاربر</span>
          <span>{r.user ? `${r.user.firstName ?? ""} ${r.user.lastName ?? ""}`.trim() || r.userId?.slice(0, 8) : r.userId?.slice(0, 8) ?? "—"}</span>
          <span className="k">وزن</span>
          <span className="mono">{fmtNum(r.weight, 6)}g</span>
          <span className="k">وضعیت</span>
          <span><Badge kind={badgeKind(r.status)}>{tStatus(r.status)}</Badge></span>
          <span className="k">انبار</span>
          <span>{r.warehouse?.name || "—"}</span>
          <span className="k">بسته</span>
          <span className="mono" style={{ fontSize: 12 }}>{r.packet?.idSecure ?? r.packetId?.slice(0, 8) ?? "—"}</span>
          <span className="k">ادمین</span>
          <span>{r.admin?.phone ?? r.admin?.email ?? r.adminId?.slice(0, 8) ?? "—"}</span>
          <span className="k">تاریخ تحویل</span>
          <span>{r.deliveryDate ? fmtDate(r.deliveryDate) : "—"}</span>
          <span className="k">زمان تحویل</span>
          <span>{r.deliveryTime || "—"}</span>
          <span className="k">مکان تحویل</span>
          <span>{r.deliveryLocation || "—"}</span>
          <span className="k">یادداشت</span>
          <span>{r.notes || "—"}</span>
          <span className="k">متادیتا</span>
          <span className="mono" style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>{r.metadata ? JSON.stringify(r.metadata, null, 2) : "—"}</span>
          <span className="k">پردازش شده</span>
          <span>{fmtDate(r.processedAt)}</span>
          <span className="k">ایجاد</span>
          <span>{fmtDate(r.createAt)}</span>
        </div>
      ) : null}
    </Modal>
  );
}

function AssignPacketModal({ request, onClose }: { request: WarehouseRequest; onClose: () => void }) {
  const qc = useQueryClient();
  const [packetId, setPacketId] = useState("");

  const orphanPacketsQ = useQuery({
    queryKey: ["admin-orphan-packets-for-assign"],
    queryFn: async () => {
      const res = unwrap<{ packets: Packet[] }>((await api.get("/admin/warehouse/packets?limit=100")).data);
      return (res.packets || []).filter((p: Packet) => p.isOrphan && p.status === "ORPHAN");
    },
  });
  const orphanPackets: Packet[] = orphanPacketsQ.data ?? [];

  const assign = useMutation({
    mutationFn: () => api.post(`/admin/warehouse/requests/${request.id}/assign-packet/${packetId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-pending-withdraw"] });
      qc.invalidateQueries({ queryKey: ["admin-packets"] });
      onClose();
    },
  });

  return (
    <Modal title="اختصاص بسته یتیم به درخواست برداشت" onClose={onClose}>
      <div className="kv" style={{ marginBottom: 12 }}>
        <span className="k">درخواست</span>
        <span className="mono" style={{ fontSize: 12 }}>{request.id?.slice(0, 8)}…</span>
        <span className="k">وزن درخواست</span>
        <span>{fmtNum(request.weight, 6)}g</span>
      </div>
      <div className="field">
        <label>بسته یتیم</label>
        {orphanPacketsQ.isLoading ? (
          <Loading />
        ) : orphanPackets.length === 0 ? (
          <div className="error-text">بسته یتیمی برای تخصیص موجود نیست</div>
        ) : (
          <select className="select" value={packetId} onChange={(e) => setPacketId(e.target.value)} required>
            <option value="">انتخاب بسته…</option>
            {orphanPackets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.idSecure} — {fmtNum(p.pureWeight, 6)}g @ {p.warehouse?.name || "—"}
              </option>
            ))}
          </select>
        )}
      </div>
      {assign.isError && <div className="error-text">{apiError(assign.error)}</div>}
      <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="btn ghost" type="button" onClick={onClose}>انصراف</button>
        <button className="btn primary" disabled={!packetId || assign.isPending} onClick={() => assign.mutate()}>
          {assign.isPending ? <span className="spin" /> : "اختصاص"}
        </button>
      </div>
    </Modal>
  );
}

// ---- Sub-components ----

const DAY_OPTIONS = [
  { en: "saturday", fa: "شنبه" },
  { en: "sunday", fa: "یکشنبه" },
  { en: "monday", fa: "دوشنبه" },
  { en: "tuesday", fa: "سه‌شنبه" },
  { en: "wednesday", fa: "چهارشنبه" },
  { en: "thursday", fa: "پنجشنبه" },
  { en: "friday", fa: "جمعه" },
];

function WarehouseForm({
  initial,
  onClose,
}: {
  initial?: Partial<Warehouse>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [capacityTotal, setCapacityTotal] = useState(String(initial?.capacityTotal ?? ""));
  const [timeLimit, setTimeLimit] = useState(initial?.timeLimit ?? "");
  const [schedule, setSchedule] = useState<Record<string, { start: string; end: string }>>(
    initial?.deliverySchedule ?? {}
  );
  const isEdit = !!initial?.id;

  const save = useMutation({
    mutationFn: (body: any) =>
      isEdit ? api.put(`/admin/warehouse/${initial.id}`, body) : api.post("/admin/warehouse/create", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-warehouses"] });
      onClose();
    },
  });

  const toggleDay = (dayEn: string, checked: boolean) => {
    setSchedule((prev) => {
      const next = { ...prev };
      if (checked) next[dayEn] = { start: "09:00", end: "18:00" };
      else delete next[dayEn];
      return next;
    });
  };

  const updateDayTime = (dayEn: string, field: "start" | "end", value: string) => {
    setSchedule((prev) => {
      const day = prev[dayEn];
      if (!day) return prev;
      return { ...prev, [dayEn]: { ...day, [field]: value } };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({
      name,
      description: desc,
      location,
      capacityTotal: Number(capacityTotal),
      timeLimit: timeLimit || undefined,
      deliverySchedule: Object.keys(schedule).length > 0 ? schedule : undefined,
    });
  };

  return (
    <Modal title={isEdit ? "ویرایش انبار" : "انبار جدید"} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 420 }}>
        {save.isError && <div className="error-text">{apiError(save.error)}</div>}
        <div className="field">
          <label>نام</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label>توضیحات</label>
          <textarea className="input" value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} />
        </div>
        <div className="field">
          <label>موقعیت</label>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div className="field">
          <label>ظرفیت کل (گرم)</label>
          <input className="input" type="number" step="0.00000001" value={capacityTotal}
            onChange={(e) => setCapacityTotal(e.target.value)} required />
        </div>
        <div className="field">
          <label>محدودیت زمانی</label>
          <input className="input" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} placeholder="مثال: 48 ساعت" />
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <label style={{ fontWeight: 600, display: "block", marginBottom: 8 }}>زمان‌بندی تحویل</label>
          {DAY_OPTIONS.map((day) => {
            const enabled = !!schedule[day.en];
            return (
              <div key={day.en} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 90 }}>
                  <input type="checkbox" checked={enabled} onChange={(e) => toggleDay(day.en, e.target.checked)} />
                  {day.fa}
                </label>
                {enabled && (
                  <>
                    <input type="time" className="input" style={{ width: 100 }}
                      value={schedule[day.en].start}
                      onChange={(e) => updateDayTime(day.en, "start", e.target.value)} />
                    <span>تا</span>
                    <input type="time" className="input" style={{ width: 100 }}
                      value={schedule[day.en].end}
                      onChange={(e) => updateDayTime(day.en, "end", e.target.value)} />
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button className="btn ghost" type="button" onClick={onClose}>انصراف</button>
          <button className="btn primary" disabled={save.isPending}>{save.isPending ? "در حال ذخیره…" : "ذخیره"}</button>
        </div>
      </form>
    </Modal>
  );
}

function PacketForm({
  warehouseId,
  onClose,
}: {
  warehouseId?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [wh, setWh] = useState(warehouseId ?? "");
  const [weight, setWeight] = useState("");
  const [idSecure, setIdSecure] = useState("");
  const [ang, setAng] = useState("");
  const [ayar, setAyar] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [isOrphan, setIsOrphan] = useState(false);

  const warehousesQ = useQuery({
    queryKey: ["admin-warehouses"],
    queryFn: async () => unwrap<{ warehouses: Warehouse[] }>((await api.get("/admin/warehouse/all")).data),
  });
  const whList: Warehouse[] = warehousesQ.data?.warehouses ?? [];

  const save = useMutation({
    mutationFn: (body: any) => api.post("/admin/warehouse/packets", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-packets"] });
      qc.invalidateQueries({ queryKey: ["admin-orphan-packets"] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({
      warehouseId: wh,
      pureWeight: Number(weight),
      idSecure: idSecure || `ADM-${Date.now()}`,
      ang: ang ? Number(ang) : undefined,
      ayar: ayar ? Number(ayar) : undefined,
      batchNumber: batchNumber || undefined,
      isOrphan,
    });
  };

  return (
    <Modal title="ایجاد بسته" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 360 }}>
        {save.isError && <div className="error-text">{apiError(save.error)}</div>}
        <div className="field">
          <label>انبار</label>
          <select className="input" value={wh} onChange={(e) => setWh(e.target.value)} required>
            <option value="">انتخاب…</option>
            {whList.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>وزن (گرم)</label>
          <input className="input" type="number" step="0.00000001" value={weight} onChange={(e) => setWeight(e.target.value)} required />
        </div>
        <div className="field">
          <label>شناسه امن</label>
          <input className="input" value={idSecure} onChange={(e) => setIdSecure(e.target.value)} placeholder="خودکار اگر خالی" />
        </div>
        <div className="field">
          <label>ANG (خلوص)</label>
          <input className="input" type="number" step="0.0001" value={ang} onChange={(e) => setAng(e.target.value)} />
        </div>
        <div className="field">
          <label>عیار</label>
          <input className="input" type="number" step="0.0001" value={ayar} onChange={(e) => setAyar(e.target.value)} />
        </div>
        <div className="field">
          <label>شماره سریال</label>
          <input className="input" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={isOrphan} onChange={(e) => setIsOrphan(e.target.checked)} />
          <span>یتیم (اختصاص خودکار به قدیمی‌ترین برداشت در انتظار)</span>
        </label>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button className="btn ghost" type="button" onClick={onClose}>انصراف</button>
          <button className="btn primary" disabled={save.isPending}>{save.isPending ? "در حال ذخیره…" : "ایجاد"}</button>
        </div>
      </form>
    </Modal>
  );
}

function ConfirmMaterialModal({
  request,
  onClose,
}: {
  request: WarehouseRequest;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [ang, setAng] = useState("");
  const [ayar, setAyar] = useState("");
  const [position, setPosition] = useState("");
  const [pictureFile, setPictureFile] = useState<File | null>(null);

  const confirm = useMutation({
    mutationFn: (formData: FormData) =>
      api.put(`/admin/warehouse/requests/${request.id}/confirm-material`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-requests"] });
      qc.invalidateQueries({ queryKey: ["warehouse-overview"] });
      qc.invalidateQueries({ queryKey: ["admin-packets"] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    if (ang) fd.append("ang", String(Number(ang)));
    if (ayar) fd.append("ayar", String(Number(ayar)));
    if (position) fd.append("warehouseIndexPosition", position);
    if (pictureFile) fd.append("picture", pictureFile);
    confirm.mutate(fd);
  };

  return (
    <Modal title="تایید مواد واریزی" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 360 }}>
        {confirm.isError && <div className="error-text">{apiError(confirm.error)}</div>}
        <div className="kv" style={{ marginBottom: 4 }}>
          <span className="k">درخواست</span>
          <span>{request.id?.slice(0, 8)}…</span>
          <span className="k">وزن</span>
          <span>{fmtNum(request.weight, 6)}g</span>
        </div>
        <div className="field">
          <label>ANG (خلوص)</label>
          <input className="input" type="number" step="0.0001" value={ang} onChange={(e) => setAng(e.target.value)} />
        </div>
        <div className="field">
          <label>عیار</label>
          <input className="input" type="number" step="0.0001" value={ayar} onChange={(e) => setAyar(e.target.value)} />
        </div>
        <div className="field">
          <label>موقعیت در انبار</label>
          <input className="input" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="مثال: A1-B2" />
        </div>
        <div className="field">
          <label>تصویر</label>
          <input className="input" type="file" accept="image/*" onChange={(e) => setPictureFile(e.target.files?.[0] ?? null)} />
        </div>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button className="btn ghost" type="button" onClick={onClose}>انصراف</button>
          <button className="btn primary" disabled={confirm.isPending}>{confirm.isPending ? "در حال تایید…" : "تایید مواد"}</button>
        </div>
      </form>
    </Modal>
  );
}

function RequestProcessModal({
  request,
  onClose,
}: {
  request: WarehouseRequest;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");

  const process = useMutation({
    mutationFn: (body: any) => api.put(`/admin/warehouse/requests/${request.id}/process`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-requests"] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    process.mutate({
      status,
      notes: notes || undefined,
      deliveryDate: deliveryDate || undefined,
      deliveryTime: deliveryTime || undefined,
      deliveryLocation: deliveryLocation || undefined,
    });
  };

  const isOutput = request.type === "OUTPUT";

  return (
    <Modal title={`پردازش درخواست ${request.type === "INPUT" ? "واریز" : "برداشت"}`} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 360 }}>
        {process.isError && <div className="error-text">{apiError(process.error)}</div>}
        <div className="kv" style={{ marginBottom: 4 }}>
          <span className="k">درخواست</span>
          <span>{request.id?.slice(0, 8)}… ({request.type === "INPUT" ? "واریز" : "برداشت"})</span>
          <span className="k">وزن</span>
          <span>{fmtNum(request.weight, 6)}g</span>
        </div>
        <div className="field">
          <label>اقدام</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} required>
            <option value="">انتخاب…</option>
            <option value="APPROVED">تایید</option>
            <option value="REJECTED">رد</option>
            {isOutput && <option value="COMPLETED">تکمیل (برداشت شده)</option>}
            {!isOutput && <option value="COMPLETED">تکمیل (واریز شده)</option>}
          </select>
        </div>
        <div className="field">
          <label>یادداشت</label>
          <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        {(status === "APPROVED" && isOutput) || status === "COMPLETED" ? (
          <>
            <div className="field">
              <label>تاریخ تحویل</label>
              <input className="input" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </div>
            <div className="field">
              <label>زمان تحویل</label>
              <input className="input" type="time" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} />
            </div>
            <div className="field">
              <label>مکان تحویل</label>
              <input className="input" value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)} />
            </div>
          </>
        ) : null}
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button className="btn ghost" type="button" onClick={onClose}>انصراف</button>
          <button className="btn primary" disabled={process.isPending}>{process.isPending ? "در حال پردازش…" : "ثبت"}</button>
        </div>
      </form>
    </Modal>
  );
}

function ApproveWithdrawModal({
  request,
  onClose,
}: {
  request: WarehouseRequest;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selectedPacketId, setSelectedPacketId] = useState("");

  const userId = request.userId || request.user?.id || "";
  const warehouseId = request.warehouseId || request.warehouse?.id || "";

  const userPacketsQ = useQuery({
    queryKey: ["admin-user-packets", userId, warehouseId],
    queryFn: async (): Promise<Packet[]> => {
      const params = warehouseId ? `?warehouseId=${warehouseId}` : "";
      return unwrap<Packet[]>((await api.get(`/admin/warehouse/users/${userId}/packets${params}`)).data);
    },
    enabled: !!userId,
  });

  const userPackets: Packet[] = userPacketsQ.data ?? [];
  const selectedPacket = userPackets.find((p) => p.id === selectedPacketId);
  const remainingWeight = selectedPacket ? Math.max(0, selectedPacket.pureWeight - request.weight) : 0;

  const approve = useMutation({
    mutationFn: () =>
      api.post(`/admin/warehouse/requests/${request.id}/approve-withdraw`, { packetId: selectedPacketId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-pending-withdraw"] });
      qc.invalidateQueries({ queryKey: ["admin-packets"] });
      qc.invalidateQueries({ queryKey: ["warehouse-overview"] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    approve.mutate();
  };

  const userName = request.user
    ? `${request.user.firstName ?? ""} ${request.user.lastName ?? ""}`.trim() || request.userId?.slice(0, 8)
    : request.userId?.slice(0, 8);

  return (
    <Modal title="تایید برداشت با تفکیک بسته" onClose={onClose} wide>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 400 }}>
        {approve.isError && <div className="error-text">{apiError(approve.error)}</div>}

        <div className="kv" style={{ marginBottom: 4 }}>
          <span className="k">درخواست</span>
          <span>{request.id?.slice(0, 8)}…</span>
          <span className="k">کاربر</span>
          <span>{userName}</span>
          <span className="k">وزن درخواست</span>
          <span>{fmtNum(request.weight, 6)}g</span>
        </div>

        <div className="field">
          <label>انتخاب بسته کاربر جهت تفکیک</label>
          {userPacketsQ.isLoading ? (
            <div>در حال بارگذاری بسته‌های کاربر…</div>
          ) : userPackets.length === 0 ? (
            <div style={{ color: "var(--red)" }}>
              کاربر بسته‌ای در انبار ندارد. ابتدا برای کاربر بسته ایجاد کنید یا از بسته‌های یتیم استفاده کنید.
            </div>
          ) : (
            <select
              className="input"
              value={selectedPacketId}
              onChange={(e) => setSelectedPacketId(e.target.value)}
              required
            >
              <option value="">انتخاب بسته…</option>
              {userPackets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.idSecure} — وزن: {fmtNum(p.pureWeight, 6)}g
                  {p.warehouse ? ` @ ${p.warehouse.name}` : ""}
                  {p.warehouseIndexPosition ? ` [${p.warehouseIndexPosition}]` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedPacket && (
          <div
            className="alert"
            style={{
              backgroundColor: "var(--gold-bg)",
              border: "1px solid var(--gold)",
              padding: 12,
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <strong>پیش‌نمایش تفکیک:</strong>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>بسته اصلی: {fmtNum(selectedPacket.pureWeight, 6)}g</span>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span style={{ color: "var(--red)" }}>برداشت: −{fmtNum(request.weight, 6)}g</span>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span style={{ color: "var(--green)" }}>
                  باقی‌مانده برای کاربر: {fmtNum(remainingWeight, 6)}g
                  {remainingWeight > 0 ? " (بسته جدید ایجاد می‌شود)" : " (کل وزن برداشت می‌شود)"}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button className="btn ghost" type="button" onClick={onClose}>
            انصراف
          </button>
          <button className="btn primary" type="submit" disabled={!selectedPacketId || approve.isPending}>
            {approve.isPending ? "در حال تایید…" : "تایید و تفکیک بسته"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SettlementReleaseForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [warehouseId, setWarehouseId] = useState("");
  const [providerKey, setProviderKey] = useState("");
  const [pureWeight, setPureWeight] = useState("");

  const release = useMutation({
    mutationFn: (body: any) => api.post("/admin/warehouse/settlement-material/release", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-packets"] });
      qc.invalidateQueries({ queryKey: ["settlement-balance"] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    release.mutate({ warehouseId, providerKey, pureWeight: Number(pureWeight) });
  };

  return (
    <Modal title="انتشار مواد تسویه" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 360 }}>
        {release.isError && <div className="error-text">{apiError(release.error)}</div>}
        <div className="field">
          <label>انبار</label>
          <input className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} placeholder="شناسه انبار" required />
        </div>
        <div className="field">
          <label>کلید تامین‌کننده</label>
          <input className="input" value={providerKey} onChange={(e) => setProviderKey(e.target.value)} placeholder="مثال: mock-zaryar-a" required />
        </div>
        <div className="field">
          <label>وزن (گرم)</label>
          <input className="input" type="number" step="0.00000001" value={pureWeight}
            onChange={(e) => setPureWeight(e.target.value)} required />
        </div>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button className="btn ghost" type="button" onClick={onClose}>انصراف</button>
          <button className="btn primary" disabled={release.isPending}>{release.isPending ? "در حال انتشار…" : "انتشار"}</button>
        </div>
      </form>
    </Modal>
  );
}

function WarehouseDetailsModal({ warehouseId, onClose }: { warehouseId: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["admin-warehouse-detail", warehouseId],
    queryFn: async () => unwrap<Warehouse>((await api.get(`/admin/warehouse/${warehouseId}`)).data),
  });
  const w = q.data;
  return (
    <Modal title={`جزئیات انبار — ${w?.name ?? warehouseId?.slice(0, 8)}`} onClose={onClose} wide>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={apiError(q.error)} />
      ) : w ? (
        <div className="kv">
          <span className="k">شناسه</span>
          <span className="mono" style={{ fontSize: 12 }}>{w.id}</span>
          <span className="k">نام</span>
          <span>{w.name}</span>
          <span className="k">توضیحات</span>
          <span>{w.description || "—"}</span>
          <span className="k">موقعیت</span>
          <span>{w.location || "—"}</span>
          <span className="k">ظرفیت کل</span>
          <span className="mono">{fmtNum(w.capacityTotal, 4)}g</span>
          <span className="k">مصرف شده</span>
          <span className="mono" style={{ color: "var(--red)" }}>{fmtNum(w.capacityUsed, 4)}g</span>
          <span className="k">باقی‌مانده</span>
          <span className="mono" style={{ color: "var(--green)" }}>{fmtNum(w.capacityRemaining, 4)}g</span>
          <span className="k">وضعیت</span>
          <span><Badge kind={badgeKind(w.status)}>{tStatus(w.status)}</Badge></span>
          <span className="k">محدودیت زمانی</span>
          <span>{w.timeLimit || "—"}</span>
          {w.deliveryDates && w.deliveryDates.length > 0 && (
            <>
              <span className="k">تاریخ‌های تحویل</span>
              <span>{w.deliveryDates.join(", ")}</span>
            </>
          )}
          {w.deliverySchedule && Object.keys(w.deliverySchedule).length > 0 && (
            <>
              <span className="k">زمان‌بندی تحویل</span>
              <span>
                {Object.entries(w.deliverySchedule).map(([day, times]: [string, any]) => (
                  <div key={day}>{day}: {times.start} - {times.end}</div>
                ))}
              </span>
            </>
          )}
          <span className="k">بسته‌ها</span>
          <span className="mono">{fmtNum(w.packets?.length ?? 0)}</span>
          <span className="k">ایجاد</span>
          <span>{fmtDate(w.createAt)}</span>
        </div>
      ) : null}
    </Modal>
  );
}

// ---- Main Page ----
export default function WarehousePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");

  // Form modals
  const [showWarehouseForm, setShowWarehouseForm] = useState(false);
  const [editWarehouse, setEditWarehouse] = useState<Warehouse | null>(null);
  const [showPacketForm, setShowPacketForm] = useState(false);
  const [processReq, setProcessReq] = useState<WarehouseRequest | null>(null);
  const [confirmMaterialReq, setConfirmMaterialReq] = useState<WarehouseRequest | null>(null);
  const [showSettlementForm, setShowSettlementForm] = useState(false);
  const [approveWithdrawReq, setApproveWithdrawReq] = useState<WarehouseRequest | null>(null);
  const [packetDetailId, setPacketDetailId] = useState<string | null>(null);
  const [requestDetailId, setRequestDetailId] = useState<string | null>(null);
  const [warehouseDetailId, setWarehouseDetailId] = useState<string | null>(null);
  const [assignPacketReq, setAssignPacketReq] = useState<WarehouseRequest | null>(null);

  // Queries
  const overview = useQuery({
    queryKey: ["warehouse-overview"],
    queryFn: async () => unwrap<any>((await api.get("/admin/warehouse/overview")).data),
    refetchInterval: 15000,
  });

  const warehousesQ = useQuery({
    queryKey: ["admin-warehouses"],
    queryFn: async () => unwrap<{ warehouses: Warehouse[] }>((await api.get("/admin/warehouse/all")).data),
  });

  const packetsQ = useQuery({
    queryKey: ["admin-packets"],
    queryFn: async () => unwrap<{ packets: Packet[] }>((await api.get("/admin/warehouse/packets?limit=100")).data),
  });

  const requestsQ = useQuery({
    queryKey: ["admin-requests"],
    queryFn: async () => unwrap<{ requests: WarehouseRequest[] }>((await api.get("/admin/warehouse/requests?limit=100")).data),
  });

  const settlementBal = useQuery({
    queryKey: ["settlement-balance"],
    queryFn: async () => unwrap<any>((await api.get("/admin/warehouse/settlement-material/balance")).data),
  });

  const pendingWithdrawQ = useQuery({
    queryKey: ["admin-pending-withdraw"],
    queryFn: async (): Promise<WarehouseRequest[]> => {
      return unwrap<WarehouseRequest[]>((await api.get("/admin/warehouse/requests/pending-withdraw")).data);
    },
    refetchInterval: 10000,
  });

  const orphanPacketsQ = useQuery({
    queryKey: ["admin-orphan-packets"],
    queryFn: async (): Promise<Packet[]> => {
      const res = unwrap<{ packets: Packet[] }>((await api.get("/admin/warehouse/packets?limit=100")).data);
      return (res.packets || []).filter((p: Packet) => p.isOrphan && p.status === "ORPHAN");
    },
    refetchInterval: 15000,
  });

  const todayStats = useQuery({
    queryKey: ["warehouse-today-stats"],
    queryFn: async () =>
      unwrap<{
        todayPacketsToDeliver: number;
        todayPacketsToDeliverWeight: number;
        todayWithdrawRequests: number;
        todayWithdrawWeight: number;
      }>((await api.get("/admin/warehouse/today-stats")).data),
    refetchInterval: 30000,
  });

  const todayExport = useQuery({
    queryKey: ["warehouse-today-export"],
    queryFn: async () =>
      unwrap<{ deliveries: Record<string, any>[]; withdraws: Record<string, any>[] }>(
        (await api.get("/admin/warehouse/today-export")).data
      ),
    enabled: false,
  });

  // Mutations
  const confirmMaterial = useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: FormData }) =>
      api.put(`/admin/warehouse/requests/${id}/confirm-material`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-requests"] });
      qc.invalidateQueries({ queryKey: ["warehouse-overview"] });
      qc.invalidateQueries({ queryKey: ["admin-packets"] });
      setConfirmMaterialReq(null);
    },
  });

  const deleteWarehouse = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/warehouse/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-warehouses"] }),
  });

  const updatePacketStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/admin/warehouse/packets/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-packets"] });
      qc.invalidateQueries({ queryKey: ["admin-orphan-packets"] });
      qc.invalidateQueries({ queryKey: ["warehouse-overview"] });
    },
  });

  const whList: Warehouse[] = warehousesQ.data?.warehouses ?? [];
  const pktList: Packet[] = packetsQ.data?.packets ?? [];
  const reqList: WarehouseRequest[] = requestsQ.data?.requests ?? [];

  return (
    <Card
      title={
        <div className="toolbar">
          {TABS.map((t) => (
            <button key={t.key} className={"btn sm " + (tab === t.key ? "primary" : "ghost")} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      }
      action={
        <div className="row" style={{ gap: 8 }}>
          {tab === "warehouses" && (
            <button className="btn primary sm" onClick={() => { setEditWarehouse(null); setShowWarehouseForm(true); }}>
              + انبار جدید
            </button>
          )}
          {tab === "packets" && (
            <button className="btn primary sm" onClick={() => setShowPacketForm(true)}>
              + بسته جدید
            </button>
          )}
          {tab === "settlement" && (
            <button className="btn primary sm" onClick={() => setShowSettlementForm(true)}>
              + انتشار مواد
            </button>
          )}
        </div>
      }
    >

      {/* Overview Tab */}
      {tab === "overview" && (
        <>
          {overview.isLoading ? <Loading /> : overview.isError ? <ErrorState message={apiError(overview.error)} /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
                <div className="stat-card">
                  <div className="stat-label">انبارها</div>
                  <div className="stat-value">{overview.data?.warehouses?.total ?? 0}</div>
                  <div className="stat-sub">فعال: {overview.data?.warehouses?.active ?? 0} | پر: {overview.data?.warehouses?.full ?? 0}</div>
                  <div className="stat-sub">ظرفیت: {fmtNum(overview.data?.warehouses?.usedCapacity, 2)} / {fmtNum(overview.data?.warehouses?.totalCapacity, 2)}g</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">بسته‌ها</div>
                  <div className="stat-value">{overview.data?.packets?.total ?? 0}</div>
                  <div className="stat-sub">در انبار: {overview.data?.packets?.inWarehouse ?? 0} | در انتظار: {overview.data?.packets?.pending ?? 0}</div>
                  <div className="stat-sub">برداشت شده: {overview.data?.packets?.withdrawn ?? 0} | یتیم: {overview.data?.packets?.orphan ?? 0}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">درخواست‌ها</div>
                  <div className="stat-value">{overview.data?.requests?.total ?? 0}</div>
                  <div className="stat-sub">در انتظار: {overview.data?.requests?.pending ?? 0} | تایید شده: {overview.data?.requests?.approved ?? 0}</div>
                  <div className="stat-sub">تکمیل شده: {overview.data?.requests?.completed ?? 0} | رد شده: {overview.data?.requests?.rejected ?? 0}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">درخواست‌های واریز</div>
                  <div className="stat-value">{overview.data?.depositRequests?.total ?? 0}</div>
                  <div className="stat-sub">در انتظار: {overview.data?.depositRequests?.pending ?? 0}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">درخواست‌های برداشت</div>
                  <div className="stat-value">{overview.data?.withdrawRequests?.total ?? 0}</div>
                  <div className="stat-sub">در انتظار: {overview.data?.withdrawRequests?.pending ?? 0}</div>
                </div>
              </div>

              <Card title="آمار امروز" action={
                <button className="btn sm" onClick={async () => {
                  const res = await todayExport.refetch();
                  if (res.data) {
                    downloadCSV(res.data.deliveries, `deliveries-${new Date().toISOString().slice(0, 10)}.csv`);
                    downloadCSV(res.data.withdraws, `withdraws-${new Date().toISOString().slice(0, 10)}.csv`);
                  }
                }}>خروجی Excel</button>
              }>
                {todayStats.isLoading ? <Loading /> : todayStats.isError ? <ErrorState message={apiError(todayStats.error)} /> : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                    <div className="stat-card">
                      <div className="stat-label">بسته‌های قابل تحویل امروز</div>
                      <div className="stat-value">{todayStats.data?.todayPacketsToDeliver ?? 0}</div>
                      <div className="stat-sub">{fmtNum(todayStats.data?.todayPacketsToDeliverWeight ?? 0, 4)}g وزن کل</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">درخواست‌های برداشت امروز</div>
                      <div className="stat-value">{todayStats.data?.todayWithdrawRequests ?? 0}</div>
                      <div className="stat-sub">{fmtNum(todayStats.data?.todayWithdrawWeight ?? 0, 4)}g وزن کل</div>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}

      {/* Warehouses Tab */}
      {tab === "warehouses" && (
        <>
          {warehousesQ.isLoading ? <Loading /> : warehousesQ.isError ? <ErrorState message={apiError(warehousesQ.error)} /> : whList.length === 0 ? <Empty /> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>نام</th><th>موقعیت</th><th>ظرفیت</th><th>مصرف شده</th><th>باقی‌مانده</th><th>وضعیت</th><th>عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {whList.map((w) => (
                    <tr key={w.id}>
                      <td>{w.name}</td>
                      <td>{w.location || "—"}</td>
                      <td className="mono">{fmtNum(w.capacityTotal, 4)}g</td>
                      <td className="mono">{fmtNum(w.capacityUsed, 4)}g</td>
                      <td className="mono">{fmtNum(w.capacityRemaining, 4)}g</td>
                      <td><Badge kind={badgeKind(w.status)}>{tStatus(w.status)}</Badge></td>
                      <td>
                        <div className="row" style={{ gap: 4 }}>
                          <button className="btn sm" onClick={() => setWarehouseDetailId(w.id)}>جزئیات</button>
                          <button className="btn sm" onClick={() => { setEditWarehouse(w); setShowWarehouseForm(true); }}>ویرایش</button>
                          <button className="btn sm danger" disabled={deleteWarehouse.isPending}
                            onClick={() => { if (confirm("این انبار حذف شود؟")) deleteWarehouse.mutate(w.id); }}>حذف</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {showWarehouseForm && <WarehouseForm initial={editWarehouse ?? undefined} onClose={() => { setShowWarehouseForm(false); setEditWarehouse(null); }} />}
        </>
      )}

      {/* Packets Tab */}
      {tab === "packets" && (
        <>
          {packetsQ.isLoading ? <Loading /> : packetsQ.isError ? <ErrorState message={apiError(packetsQ.error)} /> : pktList.length === 0 ? <Empty /> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>شناسه امن</th><th>انبار</th><th>وزن</th><th>وضعیت</th><th>کاربر</th><th>آنالیز</th><th>عیار</th><th>سریال</th><th>عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {pktList.map((p) => (
                    <tr key={p.id}>
                      <td className="mono" style={{ fontSize: 12 }}>{p.idSecure}</td>
                      <td>{p.warehouse?.name || "—"}</td>
                      <td className="mono">{fmtNum(p.pureWeight, 6)}g</td>
                      <td><Badge kind={badgeKind(p.status)}>{tStatus(p.status)}</Badge></td>
                      <td>{p.user ? `${p.user.firstName ?? ""} ${p.user.lastName ?? ""}`.trim() || p.userId?.slice(0, 8) : p.isOrphan ? "(یتیم)" : "—"}</td>
                      <td>{p.ang ?? "—"}</td>
                      <td>{p.ayar ?? "—"}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{p.batchNumber || "—"}</td>
                      <td>
                        <div className="row" style={{ gap: 4 }}>
                        <button className="btn sm" onClick={() => setPacketDetailId(p.id)}>جزئیات</button>
                        <select
                          className="input"
                          style={{ fontSize: 11, padding: "4px 6px", width: 110 }}
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) updatePacketStatus.mutate({ id: p.id, status: e.target.value });
                          }}
                        >
                          <option value="">تغییر وضعیت</option>
                          <option value="PENDING">در انتظار</option>
                          <option value="IN_WAREHOUSE">در انبار</option>
                          <option value="RELEASED">آزاد شده</option>
                          <option value="WITHDRAWN">برداشت شده</option>
                          <option value="ORPHAN">یتیم</option>
                        </select>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {showPacketForm && <PacketForm onClose={() => setShowPacketForm(false)} />}
        </>
      )}

      {/* Requests Tab */}
      {tab === "requests" && (
        <>
          {requestsQ.isLoading ? <Loading /> : requestsQ.isError ? <ErrorState message={apiError(requestsQ.error)} /> : reqList.length === 0 ? <Empty /> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>شناسه</th><th>نوع</th><th>کاربر</th><th>وزن</th><th>وضعیت</th><th>انبار</th><th>تحویل</th><th>عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {reqList.map((r) => (
                    <tr key={r.id}>
                      <td className="mono" style={{ fontSize: 12 }}>{r.id?.slice(0, 8)}</td>
                      <td><Badge kind={r.type === "INPUT" ? "green" : "gold"}>{r.type === "INPUT" ? "واریز" : "برداشت"}</Badge></td>
                      <td>{r.user ? `${r.user.firstName ?? ""} ${r.user.lastName ?? ""}`.trim() || r.userId?.slice(0, 8) : r.userId?.slice(0, 8)}</td>
                      <td className="mono">{fmtNum(r.weight, 6)}g</td>
                      <td><Badge kind={badgeKind(r.status)}>{tStatus(r.status)}</Badge></td>
                      <td>{r.warehouse?.name || "—"}</td>
                      <td style={{ fontSize: 12 }}>{r.deliveryDate ? fmtDate(r.deliveryDate) : r.deliveryTime || "—"}</td>
                      <td>
                        <div className="row" style={{ gap: 4 }}>
                          <button className="btn sm" onClick={() => setRequestDetailId(r.id)}>جزئیات</button>
                          {r.status === "PENDING" && (
                            <button className="btn sm" onClick={() => setProcessReq(r)}>پردازش</button>
                          )}
                          {r.status === "APPROVED" && r.type === "INPUT" && (
                            <>
                              <button className="btn sm" onClick={() => setConfirmMaterialReq(r)}>
                                تایید مواد
                              </button>
                              <button className="btn sm danger" onClick={() => setProcessReq(r)}>رد</button>
                            </>
                          )}
                          {r.status === "APPROVED" && r.type === "OUTPUT" && (
                            <button className="btn sm" onClick={() => setProcessReq(r)}>تکمیل</button>
                          )}
                          {r.status !== "PENDING" && r.status !== "APPROVED" && (
                            <span style={{ color: "var(--text-faint)", fontSize: 12 }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {processReq && <RequestProcessModal request={processReq} onClose={() => setProcessReq(null)} />}
          {confirmMaterialReq && <ConfirmMaterialModal request={confirmMaterialReq} onClose={() => setConfirmMaterialReq(null)} />}
        </>
      )}

      {/* Pending Withdraw Tab */}
      {tab === "pending-withdraw" && (
        <>
          {pendingWithdrawQ.isLoading ? <Loading /> : pendingWithdrawQ.isError ? <ErrorState message={apiError(pendingWithdrawQ.error)} /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {(!pendingWithdrawQ.data || pendingWithdrawQ.data.length === 0) ? (
                <Empty label="هیچ درخواست برداشت در انتظار تایید وجود ندارد." />
              ) : (
                <>
                  <div className="alert" style={{ backgroundColor: "var(--gold-bg)", border: "1px solid var(--gold)", padding: 12, borderRadius: 8 }}>
                    <strong>{pendingWithdrawQ.data.length}</strong> درخواست برداشت در انتظار تایید. از بسته‌های کاربر برای تفکیک استفاده کنید.
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>شناسه</th><th>کاربر</th><th>وزن</th><th>یادداشت</th><th>ایجاد</th><th>عملیات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingWithdrawQ.data.map((r: WarehouseRequest) => (
                          <tr key={r.id}>
                            <td className="mono" style={{ fontSize: 12 }}>{r.id?.slice(0, 8)}</td>
                            <td>{r.user ? `${r.user.firstName ?? ""} ${r.user.lastName ?? ""}`.trim() || r.userId?.slice(0, 8) : r.userId?.slice(0, 8)}</td>
                            <td className="mono">{fmtNum(r.weight, 6)}g</td>
                            <td style={{ fontSize: 12, maxWidth: 200, whiteSpace: "normal" }}>{r.notes || "—"}</td>
                            <td style={{ fontSize: 12 }}>{r.createAt ? fmtDate(r.createAt) : "—"}</td>
                            <td>
                              <div className="row" style={{ gap: 4 }}>
                                <button className="btn sm primary" onClick={() => setApproveWithdrawReq(r)}>
                                  تایید و تفکیک
                                </button>
                                <button className="btn sm" onClick={() => setAssignPacketReq(r)}>
                                  اختصاص بسته یتیم
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
          {approveWithdrawReq && <ApproveWithdrawModal request={approveWithdrawReq} onClose={() => setApproveWithdrawReq(null)} />}
        </>
      )}

      {/* Settlement Material Tab */}
      {tab === "settlement" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {settlementBal.isLoading ? <Loading /> : settlementBal.isError ? <ErrorState message={apiError(settlementBal.error)} /> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
              <div className="stat-card">
                <div className="stat-label">کل دریافت شده</div>
                <div className="stat-value" style={{ color: "var(--green)" }}>{fmtNum(settlementBal.data?.totalReceived, 6)}g</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">کل پرداخت شده</div>
                <div className="stat-value" style={{ color: "var(--red)" }}>{fmtNum(settlementBal.data?.totalPaid, 6)}g</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">خالص مانده</div>
                <div className="stat-value">{fmtNum(settlementBal.data?.netBalance, 6)}g</div>
              </div>
            </div>
          )}

          {settlementBal.data?.providers?.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>تامین‌کننده</th><th>دریافت</th><th>پرداخت</th><th>خالص</th></tr>
                </thead>
                <tbody>
                  {settlementBal.data.providers.map((p: any) => (
                    <tr key={p.providerKey}>
                      <td>{p.providerKey}</td>
                      <td className="mono" style={{ color: "var(--green)" }}>{fmtNum(p.received, 6)}g</td>
                      <td className="mono" style={{ color: "var(--red)" }}>{fmtNum(p.paid, 6)}g</td>
                      <td className="mono">{fmtNum(p.netBalance, 6)}g</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showSettlementForm && <SettlementReleaseForm onClose={() => setShowSettlementForm(false)} />}

      {packetDetailId && <PacketDetailsModal packetId={packetDetailId} onClose={() => setPacketDetailId(null)} />}
      {requestDetailId && <RequestDetailsModal requestId={requestDetailId} onClose={() => setRequestDetailId(null)} />}
      {warehouseDetailId && <WarehouseDetailsModal warehouseId={warehouseDetailId} onClose={() => setWarehouseDetailId(null)} />}
      {assignPacketReq && <AssignPacketModal request={assignPacketReq} onClose={() => setAssignPacketReq(null)} />}
        </div>
      )}
    </Card>
  );
}
