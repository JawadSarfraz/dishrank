/** Minimal RFC 4180 CSV. Fields with a comma, quote, CR or LF are quoted; quotes are doubled. */
export function encodeCsvRow(fields: readonly string[]): string {
  return fields.map((f) => (/[",\r\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f)).join(",");
}

export function encodeCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [header, ...rows].map(encodeCsvRow).join("\n") + "\n";
}

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvError";
  }
}

/**
 * Parses CSV text: quoted fields with doubled quotes and line breaks, CRLF or LF, an optional BOM.
 * Blank lines are skipped. A quote inside an unquoted field is kept as text.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false; // inside a quoted field
  let wasQuoted = false; // the current field started with a quote

  const endField = () => {
    row.push(field);
    field = "";
    wasQuoted = false;
  };
  const endRow = () => {
    endField();
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"' && field === "" && !wasQuoted) {
      quoted = true;
      wasQuoted = true;
    } else if (c === ",") endField();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else field += c;
  }
  if (quoted) throw new CsvError("The file ends inside a quoted field.");
  if (field !== "" || row.length > 0 || wasQuoted) endRow();
  return rows;
}
