import { describe, it, expect, vi } from "vitest";

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn(),
      },
    };
    constructor(_opts: unknown) {}
  },
}));

import OpenAI from "openai";
import { streamHermes } from "@/lib/hermes-client";

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

function asyncGenOf(chunks: string[]) {
  return (async function* () {
    for (const c of chunks) {
      yield { choices: [{ delta: { content: c } }] };
    }
  })();
}

describe("streamHermes", () => {
  it("streams chunks from a successful Hermes call", async () => {
    const create = vi.fn().mockResolvedValue(asyncGenOf(["Здра", "вей", "!"]));
    (OpenAI as unknown as { prototype: { chat: { completions: { create: typeof create } } } }).prototype.chat = {
      completions: { create },
    };

    const { stream, fullText } = await streamHermes({
      messages: [{ role: "user", content: "hi" }],
      timeoutMs: 5000,
    });
    const text = await readAll(stream);
    expect(text).toBe("Здравей!");
    expect(await fullText).toBe("Здравей!");
  });

  it("retries once when first attempt returns empty stream", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(asyncGenOf([]))
      .mockResolvedValueOnce(asyncGenOf(["Втори опит"]));
    (OpenAI as unknown as { prototype: { chat: { completions: { create: typeof create } } } }).prototype.chat = {
      completions: { create },
    };

    const { stream } = await streamHermes({
      messages: [{ role: "user", content: "hi" }],
      timeoutMs: 5000,
    });
    const text = await readAll(stream);
    expect(text).toBe("Втори опит");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("reformulates the last user message on retry to steer away from tool-use", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(asyncGenOf([]))
      .mockResolvedValueOnce(asyncGenOf(["ok"]));
    (OpenAI as unknown as { prototype: { chat: { completions: { create: typeof create } } } }).prototype.chat = {
      completions: { create },
    };

    const { stream } = await streamHermes({
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "Виж файловете" },
      ],
      timeoutMs: 5000,
    });
    await readAll(stream);

    // First call: unmodified
    const firstCall = create.mock.calls[0][0];
    expect(firstCall.messages[1].content).toBe("Виж файловете");

    // Second call (retry): reformulated as a meta-question that wraps
    // the original text so Hermes returns a plain-text answer instead of
    // attempting a tool call.
    const secondCall = create.mock.calls[1][0];
    expect(secondCall.messages[1].content).toContain("Потребителят написа");
    expect(secondCall.messages[1].content).toContain("Виж файловете");
    expect(secondCall.messages[1].content).toContain("БЕЗ tool calls");
    // System message stays intact at index 0
    expect(secondCall.messages[0].content).toBe("sys");
  });

  it("returns grace message after both attempts produce empty content", async () => {
    const create = vi.fn().mockResolvedValue(asyncGenOf([]));
    (OpenAI as unknown as { prototype: { chat: { completions: { create: typeof create } } } }).prototype.chat = {
      completions: { create },
    };

    const { stream } = await streamHermes({
      messages: [{ role: "user", content: "hi" }],
      timeoutMs: 5000,
    });
    const text = await readAll(stream);
    expect(text).toContain("преформулираш");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("returns grace message when create throws on both attempts", async () => {
    const create = vi.fn().mockRejectedValue(new Error("hermes down"));
    (OpenAI as unknown as { prototype: { chat: { completions: { create: typeof create } } } }).prototype.chat = {
      completions: { create },
    };

    const { stream } = await streamHermes({
      messages: [{ role: "user", content: "hi" }],
      timeoutMs: 5000,
    });
    const text = await readAll(stream);
    expect(text).toContain("преформулираш");
    expect(create).toHaveBeenCalledTimes(2);
  });
});
