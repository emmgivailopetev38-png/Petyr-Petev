import mammoth from "mammoth";
import * as XLSX from "xlsx";

const MAX_CHARS_PER_FILE = 50_000;
const MAX_BYTES_FOR_EXTRACTION = 10 * 1024 * 1024; // 10 MB

const TEXT_MIME_PREFIXES = [
  "text/",
  "application/json",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
  "application/javascript",
  "application/typescript",
  "application/x-sh",
];

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "csv", "tsv", "json", "yml", "yaml", "xml",
  "html", "htm", "log", "ini", "conf", "env", "js", "ts",
  "tsx", "jsx", "py", "rb", "go", "rs", "java", "c", "cpp",
  "h", "hpp", "css", "scss", "sass", "sql", "sh", "bash",
  "ps1", "bat", "cmd",
]);

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : "";
}

function isTextLike(mime: string, filename: string): boolean {
  if (TEXT_MIME_PREFIXES.some((p) => mime.startsWith(p))) return true;
  return TEXT_EXTENSIONS.has(getExtension(filename));
}

function truncate(text: string): { text: string; truncated: boolean; originalLength: number } {
  const original = text.length;
  if (original <= MAX_CHARS_PER_FILE) {
    return { text, truncated: false, originalLength: original };
  }
  return {
    text: text.slice(0, MAX_CHARS_PER_FILE),
    truncated: true,
    originalLength: original,
  };
}

export type ExtractResult = {
  ok: boolean;
  text?: string;
  truncated?: boolean;
  originalLength?: number;
  reason?: string;
};

export async function extractText(
  buffer: Buffer,
  mime: string,
  filename: string,
): Promise<ExtractResult> {
  if (buffer.byteLength > MAX_BYTES_FOR_EXTRACTION) {
    return {
      ok: false,
      reason: `File is ${Math.round(buffer.byteLength / 1024 / 1024)} MB. Server-side extraction is limited to 10 MB. The user needs to paste relevant excerpts.`,
    };
  }

  const ext = getExtension(filename);

  // PDF
  if (mime === "application/pdf" || ext === "pdf") {
    try {
      // pdf-parse exports the function differently across builds — use unknown cast
      const pdfMod = (await import("pdf-parse")) as unknown as
        | { default: (b: Buffer) => Promise<{ text: string }> }
        | ((b: Buffer) => Promise<{ text: string }>);
      const pdfParse =
        typeof pdfMod === "function" ? pdfMod : pdfMod.default;
      const result = await pdfParse(buffer);
      const { text, truncated, originalLength } = truncate(result.text || "");
      return { ok: true, text, truncated, originalLength };
    } catch (err) {
      return {
        ok: false,
        reason: `PDF parsing failed: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  }

  // Word (.docx)
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const { text, truncated, originalLength } = truncate(result.value || "");
      return { ok: true, text, truncated, originalLength };
    } catch (err) {
      return {
        ok: false,
        reason: `DOCX parsing failed: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  }

  // Excel (.xlsx, .xls)
  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    ext === "xlsx" ||
    ext === "xls"
  ) {
    try {
      const wb = XLSX.read(buffer, { type: "buffer" });
      const sheetTexts = wb.SheetNames.map((name) => {
        const sheet = wb.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        return `--- Sheet: ${name} ---\n${csv}`;
      });
      const combined = sheetTexts.join("\n\n");
      const { text, truncated, originalLength } = truncate(combined);
      return { ok: true, text, truncated, originalLength };
    } catch (err) {
      return {
        ok: false,
        reason: `Excel parsing failed: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  }

  // Text-like (txt, md, csv, json, code files, etc.)
  if (isTextLike(mime, filename)) {
    try {
      const raw = buffer.toString("utf-8");
      const { text, truncated, originalLength } = truncate(raw);
      return { ok: true, text, truncated, originalLength };
    } catch {
      return { ok: false, reason: "Could not decode as UTF-8 text" };
    }
  }

  // Unsupported (images, audio, video, archives, binaries)
  return {
    ok: false,
    reason: `Server-side extraction is not supported for ${mime || "this file type"}. The user should describe the content or paste it as text.`,
  };
}
