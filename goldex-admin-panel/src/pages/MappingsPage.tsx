import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge } from "../components/ui";
import { pairLabel } from "../lib/format";
import type { PairMapping, PricePair } from "../api/types";

function toArray(x: any): any[] {
  if (Array.isArray(x)) return x;
  if (x && Array.isArray(x.data)) return x.data;
  if (x && Array.isArray(x.items)) return x.items;
  return [];
}

export default function MappingsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ pairId: "", providerKey: "", providerItemId: "" });

  const pairs = useQuery({
    queryKey: ["pairs"],
    queryFn: async () => unwrap<PricePair[]>((await api.get("/admin/pair")).data),
  });
  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: async () => unwrap<string[]>((await api.get("/admin/monitoring/providers")).data),
  });
  const list = useQuery({
    queryKey: ["mappings"],
    queryFn: async () => unwrap<any>((await api.get("/admin/pair-mappings/all")).data),
  });

  const create = useMutation({
    mutationFn: (p: any) => api.post("/admin/pair-mappings", p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mappings"] });
      setForm({ pairId: "", providerKey: "", providerItemId: "" });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/pair-mappings/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mappings"] }),
  });

  const mappings = toArray(list.data) as PairMapping[];
  const pairMap = new Map((pairs.data ?? []).map((p) => [p.id, p]));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.pairId || !form.providerKey || form.providerItemId === "") return;
    create.mutate({
      pairId: form.pairId,
      providerKey: form.providerKey,
      providerItemId: Number(form.providerItemId),
      useBuyPrice: true,
      useSellPrice: true,
    });
  }

  return (
    <>
      <Card title="افزودن نگاشت تأمین‌کننده">
        <form onSubmit={submit} className="toolbar" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ margin: 0, minWidth: 200 }}>
            <label>جفت‌ارز</label>
            <select
              className="select"
              value={form.pairId}
              onChange={(e) => setForm({ ...form, pairId: e.target.value })}
            >
              <option value="">انتخاب کنید…</option>
              {pairs.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {pairLabel(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0, minWidth: 180 }}>
            <label>تأمین‌کننده</label>
            <select
              className="select"
              value={form.providerKey}
              onChange={(e) => setForm({ ...form, providerKey: e.target.value })}
            >
              <option value="">انتخاب کنید…</option>
              {providers.data?.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0, minWidth: 130 }}>
            <label>شناسه آیتم</label>
            <input
              className="input mono"
              dir="ltr"
              value={form.providerItemId}
              onChange={(e) => setForm({ ...form, providerItemId: e.target.value.replace(/\D/g, "") })}
              placeholder="101"
            />
          </div>
          <button className="btn primary" disabled={create.isPending}>
            {create.isPending ? <span className="spin" /> : "افزودن"}
          </button>
        </form>
        {create.isError && <div className="error-text">{apiError(create.error)}</div>}
      </Card>

      <Card title="نگاشت‌های موجود" action={list.isFetching ? <span className="spin" /> : null}>
        {remove.isError && <div className="error-text">{apiError(remove.error)}</div>}
        {list.isLoading ? (
          <Loading />
        ) : list.isError ? (
          <ErrorState message={apiError(list.error)} />
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
                    <td>{pairLabel(pairMap.get(m.pairId))}</td>
                    <td>{m.providerKey}</td>
                    <td className="mono">{m.providerItemId}</td>
                    <td>{m.useBuyPrice ? <Badge kind="green">✓</Badge> : <Badge kind="gray">—</Badge>}</td>
                    <td>{m.useSellPrice ? <Badge kind="green">✓</Badge> : <Badge kind="gray">—</Badge>}</td>
                    <td>
                      <button
                        className="btn sm danger"
                        disabled={remove.isPending}
                        onClick={() => window.confirm("حذف نگاشت؟") && remove.mutate(m.id)}
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
