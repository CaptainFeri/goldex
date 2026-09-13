import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchSignedFile } from "./download";

/**
 * The guard in front of signed-URL downloads.
 *
 * Reports used to be saved by pointing an anchor at the signed URL, so when the
 * artefact behind it was missing the 404's JSON body was written to disk as the
 * `.xlsx` — the export looked corrupt rather than failed. Every case here is a
 * response that is not the file, and must raise instead of being handed on.
 */
describe("fetchSignedFile", () => {
  const respond = (init: { status?: number; body?: string; type?: string }) => {
    const { status = 200, body = "", type = "application/octet-stream" } = init;
    const blob = new Blob([body], { type });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: status >= 200 && status < 300,
        status,
        blob: async () => blob,
        text: async () => body,
      })),
    );
  };

  afterEach(() => vi.unstubAllGlobals());

  it("returns the bytes when the file is served", async () => {
    respond({ body: "PKspreadsheet" });
    const blob = await fetchSignedFile("/api/v1/files/signed/tok.sig");
    expect(await blob.text()).toContain("spreadsheet");
  });

  it("raises the server's own message when the artefact is gone", async () => {
    respond({ status: 404, body: JSON.stringify({ message: "REPORT.NOT_FOUND" }) });
    await expect(fetchSignedFile("/x")).rejects.toThrow("REPORT.NOT_FOUND");
  });

  it("raises with the status when the failure body is not the API envelope", async () => {
    respond({ status: 502, body: "<html>Bad Gateway</html>" });
    await expect(fetchSignedFile("/x")).rejects.toThrow("502");
  });

  it("refuses a JSON body served with 200, which is never the file", async () => {
    respond({
      status: 200,
      body: JSON.stringify({ message: "SIGNED_URL.EXPIRED" }),
      type: "application/json",
    });
    await expect(fetchSignedFile("/x")).rejects.toThrow("SIGNED_URL.EXPIRED");
  });

  it("refuses an empty body rather than saving a zero-byte file", async () => {
    respond({ status: 200, body: "" });
    await expect(fetchSignedFile("/x")).rejects.toThrow(Error);
  });
});
