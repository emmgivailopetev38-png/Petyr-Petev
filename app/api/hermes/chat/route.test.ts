import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const insertCalls: Array<{
  chat_id: string;
  role: string;
  content: string;
  attachments?: unknown;
}> = [];

let mockChatRow: { system_prompt: string | null } = { system_prompt: null };

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "chats") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockChatRow, error: null }),
        };
      }
      // messages
      return {
        insert: vi.fn((row: { chat_id: string; role: string; content: string; attachments?: unknown }) => {
          insertCalls.push(row);
          return Promise.resolve({ error: null });
        }),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [] }),
      };
    }),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: "https://test.supabase.co/storage/v1/object/sign/chat-files/abc.pdf?token=xyz" },
          error: null,
        }),
        list: vi.fn().mockResolvedValue({ data: [{ metadata: { size: 100, mimetype: "application/pdf" } }] }),
        download: vi.fn().mockResolvedValue({
          data: new Blob(["test file content"], { type: "text/plain" }),
          error: null,
        }),
      })),
    },
  })),
}));

const sentMessages: Array<Array<{ role: string; content: string }>> = [];

vi.mock("@/lib/hermes-client", () => ({
  streamHermes: vi.fn(async (opts: { messages: Array<{ role: string; content: string }> }) => {
    sentMessages.push(opts.messages);
    const text = "Hello world";
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    });
    return { stream, fullText: Promise.resolve(text) };
  }),
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
  beforeEach(() => {
    insertCalls.length = 0;
    sentMessages.length = 0;
    mockChatRow = { system_prompt: null };
  });

  it("returns 400 when chatId missing", async () => {
    const res = await POST(makeRequest({ message: "hi" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when message missing", async () => {
    const res = await POST(makeRequest({ chatId: "c1" }));
    expect(res.status).toBe(400);
  });

  it("streams text from Hermes when no attachments", async () => {
    const res = await POST(makeRequest({ chatId: "c1", message: "hi" }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("Hello world");
  });

  it("prepends workspace system_prompt when present", async () => {
    mockChatRow = { system_prompt: "Ти си експерт по храни." };
    const res = await POST(makeRequest({ chatId: "c1", message: "hi" }));
    expect(res.status).toBe(200);
    await res.text();
    const sent = sentMessages[0];
    expect(sent[0]).toEqual({ role: "system", content: "Ти си експерт по храни." });
    expect(sent[sent.length - 1].role).toBe("user");
  });

  it("does not prepend system message when workspace has no prompt", async () => {
    mockChatRow = { system_prompt: null };
    const res = await POST(makeRequest({ chatId: "c1", message: "hi" }));
    expect(res.status).toBe(200);
    await res.text();
    const sent = sentMessages[0];
    expect(sent.some((m) => m.role === "system")).toBe(false);
  });

  it("accepts attachments and persists them on user message", async () => {
    const attachments = [
      {
        id: "a1",
        filename: "report.pdf",
        mime: "application/pdf",
        size: 100,
        path: "2026-05-21/abc-report.pdf",
        kind: "input",
      },
    ];
    const res = await POST(makeRequest({ chatId: "c1", message: "analyze", attachments }));
    expect(res.status).toBe(200);
    await res.text();
    const userInsert = insertCalls.find((c) => c.role === "user");
    expect(userInsert?.attachments).toEqual(attachments);
  });
});
