/**
 * Report export — renders a self-contained printable document and opens the
 * browser print dialog, which lets the user save the report as a PDF.
 */
export type ReportSection = { heading: string; body?: string; items?: string[] };

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

export function exportReportPdf({
  title,
  subtitle,
  sections,
}: {
  title: string;
  subtitle?: string;
  sections: ReportSection[];
}) {
  const body = sections
    .filter((s) => s.body || s.items?.length)
    .map(
      (s) => `
      <section>
        <h2>${escapeHtml(s.heading)}</h2>
        ${s.body ? `<p>${escapeHtml(s.body)}</p>` : ""}
        ${
          s.items?.length
            ? `<ul>${s.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
            : ""
        }
      </section>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, sans-serif; color: #111827; margin: 40px; line-height: 1.55; }
  header { border-bottom: 3px solid #0f9d76; padding-bottom: 14px; margin-bottom: 26px; }
  .brand { color: #0f9d76; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; font-size: 11px; }
  h1 { font-size: 24px; margin: 6px 0 4px; }
  .sub { color: #6b7280; font-size: 13px; margin: 0; }
  section { break-inside: avoid; margin-bottom: 20px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #0f9d76; margin: 0 0 6px; }
  p { margin: 0 0 8px; font-size: 13px; }
  ul { margin: 0; padding-left: 18px; font-size: 13px; }
  li { margin-bottom: 4px; }
  footer { margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 10px; color: #6b7280; font-size: 11px; }
</style></head>
<body>
  <header>
    <p class="brand">SaleemJournal · Powered by Saleem AI</p>
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<p class="sub">${escapeHtml(subtitle)}</p>` : ""}
  </header>
  ${body}
  <footer>
    Generated ${new Date().toLocaleString()} from your own journal data. Educational review only —
    no market predictions, signals or profit guarantees.
  </footer>
  <script>window.onload = () => { window.print(); };<\/script>
</body></html>`;

  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}
