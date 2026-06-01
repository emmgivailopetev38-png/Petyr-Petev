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
import { streamHermes, hasActionStyle, reformulateAsTextOnly } from "@/lib/hermes-client";

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

function setCreate(create: ReturnType<typeof vi.fn>) {
  (OpenAI as unknown as {
    prototype: { chat: { completions: { create: typeof create } } };
  }).prototype.chat = { completions: { create } };
}

describe("hasActionStyle", () => {
  it("detects Bulgarian command verbs", () => {
    expect(hasActionStyle("Виж файловете")).toBe(true);
    expect(hasActionStyle("провери дали отговаря на ЗОП")).toBe(true);
    expect(hasActionStyle("намери последните решения на КЗК")).toBe(true);
    expect(hasActionStyle("анализирай съдържанието")).toBe(true);
    expect(hasActionStyle("Свали отчета")).toBe(true);
    expect(hasActionStyle("Дай ми обобщение")).toBe(true);
  });

  it("detects English command verbs", () => {
    expect(hasActionStyle("check the file")).toBe(true);
    expect(hasActionStyle("Find the latest tender")).toBe(true);
    expect(hasActionStyle("Download the spec")).toBe(true);
  });

  it("returns false for descriptive/question prompts", () => {
    expect(hasActionStyle("Здравей")).toBe(false);
    expect(hasActionStyle("Какво е ЗОП?")).toBe(false);
    expect(hasActionStyle("Обясни ми как се пише ЕЕДОП")).toBe(false);
    expect(hasActionStyle("Кога е срокът за обжалване?")).toBe(false);
  });
});

describe("reformulateAsTextOnly", () => {
  it("wraps the last user message as a meta-question", () => {
    const out = reformulateAsTextOnly([
      { role: "system", content: "sys" },
      { role: "user", content: "Виж файловете" },
    ]);
    expect(out[0].content).toBe("sys");
    expect(out[1].content).toContain("Потребителят написа");
    expect(out[1].content).toContain("Виж файловете");
    expect(out[1].content).toContain("БЕЗ tool calls");
  });

  it("only touches the LAST user message", () => {
    const out = reformulateAsTextOnly([
      { role: "user", content: "first" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "Виж" },
    ]);
    expect(out[0].content).toBe("first");
    expect(out[2].content).toContain("Потребителят написа");
  });
});

describe("streamHermes", () => {
  it("streams chunks from a successful Hermes call (non-action message)", async () => {
    const create = vi.fn().mockResolvedValue(asyncGenOf(["Здра", "вей", "!"]));
    setCreate(create);

    const { stream, fullText } = await streamHermes({
      messages: [{ role: "user", content: "hi" }],
      timeoutMs: 5000,
    });
    const text = await readAll(stream);
    expect(text).toBe("Здравей!");
    expect(await fullText).toBe("Здравей!");
    // Non-action message: first attempt sends original content unchanged
    expect(create.mock.calls[0][0].messages[0].content).toBe("hi");
  });

  it("retries once when first attempt returns empty stream (non-action)", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(asyncGenOf([]))
      .mockResolvedValueOnce(asyncGenOf(["Втори опит"]));
    setCreate(create);

    const { stream } = await streamHermes({
      messages: [{ role: "user", content: "Какво е ЗОП?" }],
      timeoutMs: 5000,
    });
    const text = await readAll(stream);
    expect(text).toBe("Втори опит");
    expect(create).toHaveBeenCalledTimes(2);
    // First call: original
    expect(create.mock.calls[0][0].messages[0].content).toBe("Какво е ЗОП?");
    // Second call (retry): reformulated
    expect(create.mock.calls[1][0].messages[0].content).toContain(
      "Потребителят написа",
    );
  });

  it("pre-reformulates from attempt 0 for action-style messages", async () => {
    const create = vi.fn().mockResolvedValue(asyncGenOf(["ok"]));
    setCreate(create);

    const { stream } = await streamHermes({
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "Виж файловете и направи отчет" },
      ],
      timeoutMs: 5000,
    });
    await readAll(stream);

    // Only 1 call needed because pre-reformulated attempt 0 succeeded
    expect(create).toHaveBeenCalledTimes(1);
    const firstCall = create.mock.calls[0][0];
    // System message intact
    expect(firstCall.messages[0].content).toBe("sys");
    // User message ALREADY reformulated on first attempt
    expect(firstCall.messages[1].content).toContain("Потребителят написа");
    expect(firstCall.messages[1].content).toContain("Виж файловете и направи отчет");
    expect(firstCall.messages[1].content).toContain("БЕЗ tool calls");
  });

  it("returns grace message after both attempts produce empty content", async () => {
    const create = vi.fn().mockResolvedValue(asyncGenOf([]));
    setCreate(create);

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
    setCreate(create);

    const { stream } = await streamHermes({
      messages: [{ role: "user", content: "hi" }],
      timeoutMs: 5000,
    });
    const text = await readAll(stream);
    expect(text).toContain("преформулираш");
    expect(create).toHaveBeenCalledTimes(2);
  });
});
