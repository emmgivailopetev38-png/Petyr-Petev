import OpenAI from "openai";

const GRACE_MESSAGE =
  "Извинявам се, имах временен проблем с обработката. Моля, опитай отново или преформулирай въпроса.";
const MIN_VALID_CHARS = 1;
const MAX_RETRIES = 1; // 1 initial + 1 retry = 2 total attempts

export type HermesMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type StreamHermesOptions = {
  messages: HermesMessage[];
  timeoutMs?: number;
  model?: string;
};

export type StreamHermesResult = {
  stream: ReadableStream<Uint8Array>;
  fullText: Promise<string>;
};

let _clientInstance: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_clientInstance) {
    _clientInstance = new OpenAI({
      baseURL: process.env.HERMES_BASE_URL,
      apiKey: process.env.HERMES_API_KEY!,
    });
  }
  return _clientInstance;
}

/** For testing only — replace the singleton with a pre-built instance. */
export function _setClient(client: OpenAI): void {
  _clientInstance = client;
}

async function collectAttempt(
  messages: HermesMessage[],
  model: string,
  timeoutMs: number,
): Promise<string | null> {
  const client = getClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Access chat via prototype so tests can patch OpenAI.prototype.chat
    const chatApi = (Object.getPrototypeOf(client) as typeof client).chat
      ?? client.chat;
    const result = await chatApi.completions.create(
      {
        model,
        stream: true,
        messages,
      },
      { signal: controller.signal },
    );

    let acc = "";
    for await (const chunk of result) {
      const piece = chunk.choices[0]?.delta?.content ?? "";
      if (piece) acc += piece;
    }
    return acc.length >= MIN_VALID_CHARS ? acc : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function streamHermes(
  options: StreamHermesOptions,
): Promise<StreamHermesResult> {
  const timeoutMs = options.timeoutMs ?? 50_000;
  const model = options.model ?? "hermes-agent";

  let resolveFullText!: (s: string) => void;
  const fullText = new Promise<string>((res) => {
    resolveFullText = res;
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text: string | null = null;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        text = await collectAttempt(options.messages, model, timeoutMs);
        if (text) break;
      }

      const finalText = text ?? GRACE_MESSAGE;
      controller.enqueue(encoder.encode(finalText));
      controller.close();
      resolveFullText(finalText);
    },
  });

  return { stream, fullText };
}
