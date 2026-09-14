import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../api/client";

export type PickedUser = {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
};

/** How a user should read once chosen — a name if they have one, else a number. */
export function userLabel(user: PickedUser): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.phone || user.email || user.id;
}

/**
 * Finds a user by name or phone number.
 *
 * A UUID field was the alternative, and nobody knows a customer's UUID —
 * the phone number is what an operator actually has in front of them when
 * someone walks in with gold.
 *
 * Searching starts after three characters and waits for a pause in typing, so
 * one lookup goes out per query rather than one per keystroke.
 */
export default function UserPicker({
  value,
  onChange,
  placeholder = "جست‌وجوی نام یا شماره موبایل…",
  disabled,
}: {
  value: PickedUser | null;
  onChange: (user: PickedUser | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(timer);
  }, [term]);

  // A click anywhere else is a dismissal, not a selection.
  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  const results = useQuery({
    queryKey: ["user-picker", debounced],
    queryFn: async () =>
      unwrap<{ items: PickedUser[]; total: number }>(
        (await api.get("/admin/users/users", { params: { pageSize: 20, page: 1, q: debounced } })).data,
      ),
    // Two characters match most of the customer base and the list is noise.
    enabled: debounced.length >= 3,
  });

  const users = useMemo(() => results.data?.items ?? [], [results.data]);

  if (value) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          border: "1px solid var(--border)",
          borderRadius: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{userLabel(value)}</div>
          {value.phone && (
            <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
              {value.phone}
            </div>
          )}
        </div>
        <button
          className="btn sm ghost"
          disabled={disabled}
          onClick={() => {
            onChange(null);
            setTerm("");
            setDebounced("");
          }}
        >
          تغییر
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        className="form-input"
        value={term}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />

      {open && term.trim().length > 0 && (
        <div
          style={{
            position: "absolute",
            insetInlineStart: 0,
            insetInlineEnd: 0,
            top: "calc(100% + 4px)",
            zIndex: 30,
            background: "var(--surface, #1a1d23)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            maxHeight: 260,
            overflowY: "auto",
            boxShadow: "0 12px 30px rgba(0,0,0,.25)",
          }}
        >
          {term.trim().length < 3 ? (
            <div style={{ padding: 12, fontSize: 11, color: "var(--text-muted)" }}>
              حداقل ۳ نویسه وارد کنید
            </div>
          ) : results.isLoading ? (
            <div style={{ padding: 12, fontSize: 11, color: "var(--text-muted)" }}>در حال جست‌وجو…</div>
          ) : results.isError ? (
            <div style={{ padding: 12, fontSize: 11, color: "var(--red)" }}>جست‌وجو ناموفق بود</div>
          ) : users.length === 0 ? (
            <div style={{ padding: 12, fontSize: 11, color: "var(--text-muted)" }}>کاربری پیدا نشد</div>
          ) : (
            users.map((user) => (
              <button
                key={user.id}
                onClick={() => {
                  onChange(user);
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "right",
                  background: "transparent",
                  border: 0,
                  borderBottom: "1px solid var(--border)",
                  padding: "10px 12px",
                  cursor: "pointer",
                  color: "inherit",
                  font: "inherit",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700 }}>{userLabel(user)}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                  {user.phone || user.email || user.id.slice(0, 8)}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
