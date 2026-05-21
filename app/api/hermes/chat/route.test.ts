import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock Supabase service client
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [] }),
    })),
  })),
}));

// Mock OpenAI
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
  it("returns 400 when chatId is missing", async () => {
    const res = await POST(makeRequest({ message: "hello" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/chatId/);
  });

  it("returns 400 when message is missing", async () => {
    const res = await POST(makeRequest({ chatId: "abc-123" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/message/);
  });

  it("streams concatenated text from Hermes", async () => {
    const res = await POST(
      makeRequest({ chatId: "abc-123", message: "hello" })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toBe("Hello world");
  });
});
