import { toPng } from "html-to-image";

/** Trigger a browser download for an in-memory blob. */
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
  download(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
}

/** Capture a DOM node as a PNG — used to export dashboards and charts. */
export async function downloadPng(node: HTMLElement | null, filename: string) {
  if (!node) return false;
  const background =
    getComputedStyle(document.body).backgroundColor || "rgb(9, 13, 18)";
  const dataUrl = await toPng(node, {
    backgroundColor: background,
    pixelRatio: 2,
    cacheBust: true,
    filter: (el) => !(el instanceof HTMLElement && el.dataset.exportIgnore === "true"),
  });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
  return true;
}
