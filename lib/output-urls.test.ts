import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        list: vi.fn().mockResolvedValue({
          data: [{
            name: "uuid-report.docx",
            metadata: { size: 1234, mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
          }],
          error: null,
        }),
      })),
    },
  })),
}));

import { extractOutputUrls, urlsToAttachments } from "@/lib/output-urls";

describe("extractOutputUrls", () => {
  it("extracts a single signed Supabase URL", () => {
    const text = "Done. Download here: https://test.supabase.co/storage/v1/object/sign/chat-files/2026-05-21/uuid-report.docx?token=xyz";
    expect(extractOutputUrls(text)).toEqual([
      "https://test.supabase.co/storage/v1/object/sign/chat-files/2026-05-21/uuid-report.docx?token=xyz",
    ]);
  });

  it("extracts multiple URLs", () => {
    const text = "Files: https://x.supabase.co/storage/v1/object/sign/chat-files/a.pdf?t=1 and https://x.supabase.co/storage/v1/object/sign/chat-files/b.xlsx?t=2";
    expect(extractOutputUrls(text)).toHaveLength(2);
  });

  it("returns empty array when no URLs", () => {
    expect(extractOutputUrls("nothing here")).toEqual([]);
  });

  it("does not match non-chat-files buckets", () => {
    expect(extractOutputUrls("https://x.supabase.co/storage/v1/object/sign/other-bucket/foo.pdf?t=1")).toEqual([]);
  });
});

describe("urlsToAttachments", () => {
  it("converts URLs to Attachment objects with output kind", async () => {
    const urls = ["https://test.supabase.co/storage/v1/object/sign/chat-files/2026-05-21/uuid-report.docx?token=xyz"];
    const result = await urlsToAttachments(urls);
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe("uuid-report.docx");
    expect(result[0].kind).toBe("output");
    expect(result[0].size).toBe(1234);
  });
});
