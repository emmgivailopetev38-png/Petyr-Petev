import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        createSignedUploadUrl: vi.fn().mockResolvedValue({
          data: {
            signedUrl: "https://test.supabase.co/storage/v1/upload/signed/abc",
            token: "test-token",
            path: "2026-05-21/uuid-report.pdf",
          },
          error: null,
        }),
      })),
    },
  })),
}));

import { POST } from "@/app/api/files/upload-url/route";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/files/upload-url", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/files/upload-url", () => {
  it("returns 400 when chatId missing", async () => {
    const res = await POST(makeRequest({ filename: "a.pdf", mime: "application/pdf", size: 100 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when filename missing", async () => {
    const res = await POST(makeRequest({ chatId: "c1", mime: "application/pdf", size: 100 }));
    expect(res.status).toBe(400);
  });

  it("returns 413 when file exceeds 50 MB", async () => {
    const res = await POST(makeRequest({
      chatId: "c1",
      filename: "huge.bin",
      mime: "application/octet-stream",
      size: 60 * 1024 * 1024,
    }));
    expect(res.status).toBe(413);
  });

  it("returns signed upload URL on success", async () => {
    const res = await POST(makeRequest({
      chatId: "c1",
      filename: "report.pdf",
      mime: "application/pdf",
      size: 1024,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.uploadUrl).toContain("supabase.co");
    expect(body.token).toBe("test-token");
    expect(body.path).toContain("report.pdf");
    expect(body.id).toBeTruthy();
  });
});
