import OpenAI from "openai";

const GRACE_MESSAGE =
  "Не успях да формулирам отговор за този въпрос. Възможна причина: " +
  "Hermes се опита да използва външен инструмент, който не е активен. " +
  "Опитай да преформулираш по-конкретно — например вместо 'виж файловете' опиши " +
  "какво точно искаш да анализирам, или прикачи файл с ясен въпрос за съдържанието му.";
const MIN_VALID_CHARS = 1;
const MAX_RETRIES = 1; // 1 initial + 1 retry = 2 total attempts

/**
 * Hermes' OpenAI-compatible endpoint sometimes returns 0 tokens when the
 * model decides to call a tool (its tool-call output isn't relayed as text).
 * On retry, we prepend an explicit text-only instruction to the last user
 * message so the model is steered toward a plain-text answer.
 */
function reformulateAsTextOnly(
  messages: HermesMessage[],
): HermesMessage[] {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx < 0) return messages;

  const original = messages[lastUserIdx].content;
  // Wrap the original as a meta-question. Direct command-style messages
  // ('Виж файловете...') make Hermes attempt a tool call and return 0
  // tokens. Rephrasing as 'the user wrote X; explain what they need /
  // what you would do, without executing' steers it back to text mode.
  // Confirmed working against the Hermes endpoint.
  const reformulated =
    "Потребителят написа следната заявка:\n\n" +
    `"${original}"\n\n` +
    "Обясни в текст какво би направил или какво ти е необходимо от " +
    "потребителя, за да отговориш качествено. БЕЗ да изпълняваш действия, " +
    "БЕЗ tool calls — само текстов отговор.";

  return [
    ...messages.slice(0, lastUserIdx),
    { role: "user", content: reformulated },
    ...messages.slice(lastUserIdx + 1),
  ];
}

export type HermesMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type StreamHermesOptions = {
  messages: HermesMessage[];
  timeoutMs?: number;
  model?: string;
  /**
   * Called with the final text BEFORE the stream is closed. Use this for
   * side effects that must complete before the serverless function exits
   * (e.g. persisting the assistant message). Errors are swallowed so they
   * don't crash the response.
   */
  onComplete?: (text: string) => Promise<void>;
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
        // On retry, reformulate the last user message to steer Hermes away
        // from tool-use (which returns empty content over OpenAI-compat API).
        const msgs =
          attempt === 0
            ? options.messages
            : reformulateAsTextOnly(options.messages);
        text = await collectAttempt(msgs, model, timeoutMs);
        if (text) break;
      }

      const finalText = text ?? GRACE_MESSAGE;
      controller.enqueue(encoder.encode(finalText));

      // Run side-effects (persistence etc.) INSIDE the stream lifecycle so
      // Vercel keeps the function alive until they complete.
      if (options.onComplete) {
        try {
          await options.onComplete(finalText);
        } catch {
          // swallow — don't break the response
        }
      }

      controller.close();
      resolveFullText(finalText);
    },
  });

  return { stream, fullText };
}
