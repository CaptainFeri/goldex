/** Raw metadata JSON, collapsed behind a <details> disclosure — for support/debugging, not everyday use. */
export function CreditMetadata({ metadata }: { metadata: any }) {
  if (!metadata || Object.keys(metadata).length === 0) return null;

  return (
    <details style={{ fontSize: 12 }}>
      <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>متادیتا</summary>
      <pre style={{ background: "var(--bg)", padding: 8, borderRadius: 4, overflow: "auto", fontSize: 11, direction: "ltr" }}>
        {JSON.stringify(metadata, null, 2)}
      </pre>
    </details>
  );
}
