import OpenAI from "openai";

const GRACE_MESSAGE =
  "Не успях да формулирам отговор за този въпрос. Hermes сървърът върна " +
  "грешка 'agent_incomplete' (вътрешен бъг при опит за tool-use). " +
  "Опитай да преформулираш по-конкретно — например вместо 'виж файловете' " +
  "опиши какво точно искаш да анализирам, или прикачи файл с ясен въпрос " +
  "за съдържанието му.";
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

/**
 * Verbs / phrases that signal the user is requesting an action. Hermes'
 * underlying agent tries to invoke a tool for these and the OpenAI-compat
 * adapter loses the tool-call (returns 0 tokens with finish_reason=stop)
 * — confirmed via direct probe: `'NoneType' object is not iterable` /
 * `code: agent_incomplete`. When we see one of these we skip the doomed
 * first attempt and go straight to a reformulated meta-question.
 *
 * NOTE: \b in JS regex only respects ASCII word chars, so Cyrillic words
 * need Unicode-aware boundaries via lookarounds + the /u flag.
 */
const ACTION_TRIGGER_BG = new RegExp(
  "(?<![\\p{L}\\p{M}])(?:" +
    [
      // base imperative + optional "-те" plural form
      "виж(?:те|даш|даме|дате)?",
      "провер(?:и|ете|явай|явайте)",
      "потърс(?:и|ете|вай|вайте)",
      "намер(?:и|ете)",
      "направ(?:и|ете|ям|им)",
      "анализира(?:й|йте|м|ме)",
      "прегледа(?:й|йте|м|ме)",
      "отвор(?:и|ете)",
      "прочет(?:и|ете)",
      "качи(?:те)?",
      "свали(?:те)?",
      "изпълн(?:и|ете|и ги|ете ги)",
      "стартира(?:й|йте)",
      "донес(?:и|ете)",
      "вземи(?:те)?",
      "изкара(?:й|йте)",
      "извлеч(?:и|ете)",
      "дай ми",
      "дайте ми",
      "покаж(?:и|ете)",
      "сравн(?:и|ете)",
      "обобщ(?:и|ете)",
      "изпрат(?:и|ете)",
      "публикува(?:й|йте)",
      "монитори(?:рай|райте|нг)",
      "следи(?:те)?",
    ].join("|") +
    ")(?![\\p{L}\\p{M}])",
  "iu",
);

const ACTION_TRIGGER_EN =
  /\b(check|find|search|fetch|download|upload|analy[sz]e|run|execute|read|open|show|list|send|publish|monitor|track|fix|build)\b/iu;

export function hasActionStyle(text: string): boolean {
  return ACTION_TRIGGER_BG.test(text) || ACTION_TRIGGER_EN.test(text);
}

/**
 * Wrap the last user message as a meta-question. Direct command-style
 * messages ('Виж файловете...') make Hermes try a tool call which crashes
 * the agent server (NoneType is not iterable) and returns 0 tokens.
 * Rephrasing as 'the user wrote X; explain what they need / what you would
 * do, without executing' steers it back to text mode. Confirmed working
 * against the live Hermes endpoint.
 */
export function reformulateAsTextOnly(
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

  // Find the latest user message to decide whether to pre-reformulate.
  let lastUserContent = "";
  for (let i = options.messages.length - 1; i >= 0; i--) {
    if (options.messages[i].role === "user") {
      lastUserContent = options.messages[i].content;
      break;
    }
  }
  const isActionStyle = hasActionStyle(lastUserContent);

  let resolveFullText!: (s: string) => void;
  const fullText = new Promise<string>((res) => {
    resolveFullText = res;
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text: string | null = null;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        // Strategy:
        //   - Action-style (command verbs): reformulate from attempt 0 to
        //     avoid the wasted first attempt (Hermes will crash on tool-use).
        //   - Regular messages: try as-is on attempt 0, reformulate on retry.
        const shouldReformulate = isActionStyle || attempt > 0;
        const msgs = shouldReformulate
          ? reformulateAsTextOnly(options.messages)
          : options.messages;
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
