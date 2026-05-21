import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const insertCalls: Array<{ chat_id: string; role: string; content: string; attachments?: unknown }> = [];

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn((row: { chat_id: string; role: string; content: string; attachments?: unknown }) => {
        insertCalls.push(row);
        return Promise.resolve({ error: null });
      }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [] }),
    })),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: "https://test.supabase.co/storage/v1/object/sign/chat-files/abc.pdf?token=xyz" },
          error: null,
        }),
        list: vi.fn().mockResolvedValue({ data: [{ metadata: { size: 100, mimetype: "application/pdf" } }] }),
      })),
    },
  })),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue(
          (async function* () {
            yield { choices: [{ delta: { content: "Hello" } }] };
            yield { choices: [{ delta: { content: " world" } }] };
          })()
        ),
      },
    };
    constructor(_opts: unknown) {}
  },
}));

import { POST } from "@/app/api/hermes/chat/route";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/hermes/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/hermes/chat", () => {
  it("returns 400 when chatId missing", async () => {
    const res = await POST(makeRequest({ message: "hi" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when message missing", async () => {
    const res = await POST(makeRequest({ chatId: "c1" }));
    expect(res.status).toBe(400);
  });

  it("streams text from Hermes when no attachments", async () => {
    insertCalls.length = 0;
    const res = await POST(makeRequest({ chatId: "c1", message: "hi" }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("Hello world");
  });

  it("accepts attachments and persists them on user message", async () => {
    insertCalls.length = 0;
    const attachments = [
      { id: "a1", filename: "report.pdf", mime: "application/pdf", size: 100, path: "2026-05-21/abc-report.pdf", kind: "input" },
    ];
    const res = await POST(makeRequest({ chatId: "c1", message: "analyze", attachments }));
    expect(res.status).toBe(200);
    await res.text();
    const userInsert = insertCalls.find((c) => c.role === "user");
    expect(userInsert?.attachments).toEqual(attachments);
  });
});
