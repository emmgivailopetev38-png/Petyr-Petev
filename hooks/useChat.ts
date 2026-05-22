"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message, Attachment } from "@/lib/types";

export function useChat(chatId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (data) {
          setMessages(
            (data as Array<Message & { attachments?: Attachment[] | null }>).map((m) => ({
              ...m,
              attachments: m.attachments ?? [],
            }))
          );
        }
      });
  }, [chatId]);

  const sendMessage = useCallback(
    async (content: string, attachments: Attachment[] = []) => {
      if (isLoading) return;
      if (!content.trim() && attachments.length === 0) return;
      setIsLoading(true);

      const userMsg: Message = {
        id: crypto.randomUUID(),
        chat_id: chatId,
        role: "user",
        content: content.trim(),
        created_at: new Date().toISOString(),
        attachments,
      };
      setMessages((prev) => [...prev, userMsg]);

      const streamingId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: streamingId,
          chat_id: chatId,
          role: "assistant",
          content: "",
          created_at: new Date().toISOString(),
          attachments: [],
        },
      ]);

      try {
        const response = await fetch("/api/hermes/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            message: content.trim(),
            attachments,
          }),
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          accumulated += text;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingId ? { ...m, content: accumulated } : m
            )
          );
        }

        // Reload the just-saved assistant message to pull any output attachments
        const supabase = createClient();
        const { data } = await supabase
          .from("messages")
          .select("*")
          .eq("chat_id", chatId)
          .order("created_at", { ascending: false })
          .limit(1);
        if (data && data.length > 0) {
          const saved = data[0] as Message & { attachments?: Attachment[] | null };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingId
                ? { ...m, attachments: saved.attachments ?? [] }
                : m
            )
          );
        }
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== streamingId));
      } finally {
        setIsLoading(false);
      }
    },
    [chatId, isLoading]
  );

  const clearChat = useCallback(async () => {
    await fetch(`/api/hermes/messages?chatId=${chatId}`, { method: "DELETE" });
    setMessages([]);
  }, [chatId]);

  return { messages, isLoading, sendMessage, clearChat };
}
