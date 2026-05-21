import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({
          data: { path: "2026-05-21/uuid-report.docx" },
          error: null,
        }),
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: "https://test.supabase.co/storage/v1/object/sign/chat-files/2026-05-21/uuid-report.docx?token=xyz" },
          error: null,
        }),
      })),
    },
  })),
}));

import { POST } from "@/app/api/hermes-upload/route";

function makeRequest(token: string | null, formData: FormData) {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return new NextRequest("http://localhost/api/hermes-upload", {
    method: "POST",
    body: formData,
    headers,
  });
}

describe("POST /api/hermes-upload", () => {
  it("returns 401 without bearer token", async () => {
    const fd = new FormData();
    fd.append("filename", "x.docx");
    fd.append("file", new Blob(["x"]), "x.docx");
    const res = await POST(makeRequest(null, fd));
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong bearer token", async () => {
    const fd = new FormData();
    fd.append("filename", "x.docx");
    fd.append("file", new Blob(["x"]), "x.docx");
    const res = await POST(makeRequest("wrong-token", fd));
    expect(res.status).toBe(401);
  });

  it("returns 400 when file missing", async () => {
    const fd = new FormData();
    fd.append("filename", "x.docx");
    const res = await POST(makeRequest("test-upload-token", fd));
    expect(res.status).toBe(400);
  });

  it("returns signed URL on successful upload", async () => {
    const fd = new FormData();
    fd.append("filename", "report.docx");
    fd.append("file", new Blob(["content"]), "report.docx");
    const res = await POST(makeRequest("test-upload-token", fd));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toContain("supabase.co");
    expect(body.path).toContain("report.docx");
    expect(body.id).toBeTruthy();
  });
});
