function sanitizeText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/[()\\]/g, " ")
    .trim();
}

function buildSimplePdfContent(lines: string[]): string {
  const commands: string[] = [];
  let y = 800;
  for (const line of lines) {
    const text = sanitizeText(line);
    commands.push(`BT /F1 11 Tf 50 ${y} Td (${text}) Tj ET`);
    y -= 16;
    if (y < 70) break;
  }
  return commands.join("\n");
}

export function buildPurchaseOrderPdf(params: {
  title: string;
  lines: string[];
}): Uint8Array {
  const stream = buildSimplePdfContent([params.title, "", ...params.lines]);

  const objects: string[] = [];
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  objects.push("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj");
  objects.push(
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj"
  );
  objects.push(`4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`);
  objects.push("5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj");

  let body = "";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(body.length);
    body += `${obj}\n`;
  }

  const xrefStart = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  const trailer = `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  const pdf = `%PDF-1.4\n${body}${xref}${trailer}`;
  return new TextEncoder().encode(pdf);
}

