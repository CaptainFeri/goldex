import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge, Modal } from "../components/ui";
import { fmtNum, pairLabel } from "../lib/format";
import type { PairMapping, PricePair, ProviderSnapshotItem } from "../api/types";

function toArray(x: any): any[] {
  if (Array.isArray(x)) return x;
  if (x && Array.isArray(x.data)) return x.data;
  if (x && Array.isArray(x.items)) return x.items;
  return [];
}

function MappingForm({
  initial,
  pairs,
  providers,
  availableItems,
  onClose,
}: {
  initial?: PairMapping;
  pairs: PricePair[];
  providers: string[];
  availableItems: Record<string, ProviderSnapshotItem[]>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const editing = !!initial?.id;
  const [form, setForm] = useState({
    pairId: initial?.pairId ?? "",
    providerKey: initial?.providerKey ?? "",
    providerItemId: initial?.providerItemId?.toString() ?? "",
    useBuyPrice: initial?.useBuyPrice ?? true,
    useSellPrice: initial?.useSellPrice ?? true,
  });

  const save = useMutation({
    mutationFn: (p: any) =>
      editing
        ? api.patch(`/admin/pair-mappings/${initial.id}`, p)
        : api.post("/admin/pair-mappings", p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mappings"] });
      onClose();
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.pairId || !form.providerKey || form.providerItemId === "") return;
    save.mutate({
      pairId: form.pairId,
      providerKey: form.providerKey,
      providerItemId: Number(form.providerItemId),
      useBuyPrice: !!form.useBuyPrice,
      useSellPrice: !!form.useSellPrice,
    });
  }

  const itemsForProvider = availableItems[form.providerKey] ?? [];

  return (
    <Modal title={editing ? "ویرایش نگاشت" : "افزودن نگاشت"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label>جفت‌ارز</label>
          <select className="select" value={form.pairId} onChange={(e) => setForm({ ...form, pairId: e.target.value })} required>
            <option value="">انتخاب کنید…</option>
            {pairs.map((p) => <option key={p.id} value={p.id}>{pairLabel(p)}</option>)}
          </select>
        </div>
        <div className="field">
          <label>تأمین‌کننده</label>
          <select className="select" value={form.providerKey} onChange={(e) => setForm({ ...form, providerKey: e.target.value, providerItemId: "" })} required>
            <option value="">انتخاب کنید…</option>
            {providers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="field">
          <label>شناسه آیتم (از تأمین‌کننده)</label>
          {itemsForProvider.length > 0 ? (
            <select className="select" value={form.providerItemId} onChange={(e) => setForm({ ...form, providerItemId: e.target.value })} required>
              <option value="">انتخاب از آیتم‌های موجود…</option>
              {itemsForProvider.map((it) => (
                <option key={it.itemId} value={it.itemId}>
                  #{it.itemId} — {it.name ?? it.slug ?? "—"} (خرید: {fmtNum(it.buyPrice, 2)} / فروش: {fmtNum(it.sellPrice, 2)})
                </option>
              ))}
              <option value="__custom__">مقدار دلخواه…</option>
            </select>
          ) : null}
          {(itemsForProvider.length === 0 || form.providerItemId === "__custom__") && (
            <input
              className="input mono"
              dir="ltr"
              value={form.providerItemId === "__custom__" ? "" : form.providerItemId}
              onChange={(e) => setForm({ ...form, providerItemId: e.target.value.replace(/\D/g, "") })}
              placeholder="101"
              required
              style={{ marginTop: 6 }}
            />
          )}
        </div>
        <div className="row" style={{ gap: 20, margin: "8px 0 16px" }}>
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={form.useBuyPrice} onChange={(e) => setForm({ ...form, useBuyPrice: e.target.checked })} />
            استفاده از قیمت خرید
          </label>
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={form.useSellPrice} onChange={(e) => setForm({ ...form, useSellPrice: e.target.checked })} />
            استفاده از قیمت فروش
          </label>
        </div>
        {save.isError && <div className="error-text">{apiError(save.error)}</div>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button className="btn primary" disabled={save.isPending}>
            {save.isPending ? <span className="spin" /> : "ذخیره"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DetailsModal({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["mapping-detail", id],
    queryFn: async () => unwrap<PairMapping>((await api.get(`/admin/pair-mappings/${id}`)).data),
  });
  const m = q.data;
  return (
    <Modal title="جزئیات نگاشت" onClose={onClose}>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={apiError(q.error)} />
      ) : m ? (
        <div className="kv">
          <span className="k">شناسه</span>
          <span className="mono" style={{ fontSize: 12 }}>{m.id}</span>
          <span className="k">جفت‌ارز</span>
          <span className="mono" style={{ fontSize: 12 }}>{m.pairId}</span>
          <span className="k">تأمین‌کننده</span>
          <span>{m.providerKey}</span>
          <span className="k">آیتم</span>
          <span className="mono">{m.providerItemId}</span>
          <span className="k">خرید</span>
          <span>{m.useBuyPrice ? <Badge kind="green">✓</Badge> : <Badge kind="gray">—</Badge>}</span>
          <span className="k">فروش</span>
          <span>{m.useSellPrice ? <Badge kind="green">✓</Badge> : <Badge kind="gray">—</Badge>}</span>
        </div>
      ) : null}
    </Modal>
  );
}

export default function MappingsPage() {
  const qc = useQueryClient();
  const [filterProvider, setFilterProvider] = useState("");
  const [filterPair, setFilterPair] = useState("");
  const [form, setForm] = useState<{ open: boolean; initial?: PairMapping }>({ open: false });
  const [detailId, setDetailId] = useState<string | null>(null);

  const pairs = useQuery({
    queryKey: ["pairs"],
    queryFn: async () => unwrap<PricePair[]>((await api.get("/admin/pair")).data),
  });
  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: async () => unwrap<string[]>((await api.get("/admin/monitoring/providers")).data),
  });
  const available = useQuery({
    queryKey: ["provider-available-items"],
    queryFn: async () => {
      const res = unwrap<{ providerKey: string; items: ProviderSnapshotItem[] }[]>(
        (await api.get("/admin/pair-mappings/available-items")).data
      );
      const map: Record<string, ProviderSnapshotItem[]> = {};
      for (const row of res) map[row.providerKey] = row.items ?? [];
      return map;
    },
  });
  const allList = useQuery({
    queryKey: ["mappings"],
    queryFn: async () => unwrap<any>((await api.get("/admin/pair-mappings/all")).data),
  });

  // Provider-specific list
  const providerList = useQuery({
    queryKey: ["mappings-by-provider", filterProvider],
    enabled: !!filterProvider,
    queryFn: async () => unwrap<PairMapping[]>((await api.get(`/admin/pair-mappings/provider/${filterProvider}`)).data),
  });
  // Pair-specific list
  const pairList = useQuery({
    queryKey: ["mappings-by-pair", filterPair],
    enabled: !!filterPair,
    queryFn: async () => unwrap<PairMapping[]>((await api.get(`/admin/pair-mappings/pair/${filterPair}`)).data),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/pair-mappings/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mappings"] });
      qc.invalidateQueries({ queryKey: ["mappings-by-provider", filterProvider] });
      qc.invalidateQueries({ queryKey: ["mappings-by-pair", filterPair] });
    },
  });

  // Pick the active source list based on the filters.
  const rawList = filterProvider
    ? providerList.data
    : filterPair
    ? pairList.data
    : allList.data;
  const mappings: PairMapping[] = toArray(rawList);
  const pairMap = new Map((pairs.data ?? []).map((p) => [p.id, p]));

  return (
    <>
      <Card
        title="افزودن نگاشت تأمین‌کننده"
        action={
          <button className="btn primary sm" onClick={() => setForm({ open: true })}>
            + نگاشت جدید
          </button>
        }
      >
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          هر نگاشت یک جفت‌ارز داخلی را به یک آیتم خاص در یکی از تأمین‌کنندگان وصل می‌کند. با غیرفعال کردن «خرید» یا «فروش» می‌توانید آن سمت خاص را از قیمت‌گذاری مستقیم حذف کنید.
        </div>
        {form.open && (
          <MappingForm
            initial={form.initial}
            pairs={pairs.data ?? []}
            providers={providers.data ?? []}
            availableItems={available.data ?? {}}
            onClose={() => setForm({ open: false })}
          />
        )}
      </Card>

      <Card
        title="نگاشت‌های موجود"
        action={
          <div className="row" style={{ gap: 8 }}>
            <select className="select" value={filterProvider} onChange={(e) => setFilterProvider(e.target.value)} style={{ minWidth: 160 }}>
              <option value="">همه تأمین‌کنندگان</option>
              {providers.data?.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="select" value={filterPair} onChange={(e) => setFilterPair(e.target.value)} style={{ minWidth: 180 }}>
              <option value="">همه جفت‌ارزها</option>
              {pairs.data?.map((p) => <option key={p.id} value={p.id}>{pairLabel(p)}</option>)}
            </select>
            {(filterProvider || filterPair) && (
              <button className="btn sm ghost" onClick={() => { setFilterProvider(""); setFilterPair(""); }}>
                پاک کردن فیلترها
              </button>
            )}
          </div>
        }
      >
        {remove.isError && <div className="error-text">{apiError(remove.error)}</div>}
        {allList.isLoading || providerList.isFetching || pairList.isFetching ? (
          <Loading />
        ) : allList.isError ? (
          <ErrorState message={apiError(allList.error)} />
        ) : mappings.length === 0 ? (
          <Empty />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>جفت‌ارز</th>
                  <th>تأمین‌کننده</th>
                  <th>آیتم</th>
                  <th>خرید</th>
                  <th>فروش</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr key={m.id}>
                    <td>{pairLabel(pairMap.get(m.pairId)) ?? m.pairId?.slice(0, 8)}</td>
                    <td>{m.providerKey}</td>
                    <td className="mono">{m.providerItemId}</td>
                    <td>{m.useBuyPrice ? <Badge kind="green">✓</Badge> : <Badge kind="gray">—</Badge>}</td>
                    <td>{m.useSellPrice ? <Badge kind="green">✓</Badge> : <Badge kind="gray">—</Badge>}</td>
                    <td>
                      <div className="row">
                        <button className="btn sm" onClick={() => setDetailId(m.id)}>جزئیات</button>
                        <button className="btn sm" onClick={() => setForm({ open: true, initial: m })}>ویرایش</button>
                        <button
                          className="btn sm danger"
                          disabled={remove.isPending}
                          onClick={() => window.confirm("حذف نگاشت؟") && remove.mutate(m.id)}
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

      {detailId && <DetailsModal id={detailId} onClose={() => setDetailId(null)} />}
    </>
  );
}
