"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";

export function useChat(chatId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load message history from Supabase on mount
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .limit(50)
      .then(({ data }) => {
        if (data) setMessages(data as Message[]);
      });
  }, [chatId]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isLoading || !content.trim()) return;
      setIsLoading(true);

      // Optimistically add user bubble
      const userMsg: Message = {
        id: crypto.randomUUID(),
        chat_id: chatId,
        role: "user",
        content: content.trim(),
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // Add empty assistant bubble for streaming
      const streamingId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: streamingId,
          chat_id: chatId,
          role: "assistant",
          content: "",
          created_at: new Date().toISOString(),
        },
      ]);

      try {
        const response = await fetch("/api/hermes/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, message: content.trim() }),
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
      } catch {
        // Remove failed streaming bubble; user bubble stays visible
        setMessages((prev) => prev.filter((m) => m.id !== streamingId));
      } finally {
        setIsLoading(false);
      }
    },
    [chatId, isLoading]
  );

  const clearChat = useCallback(async () => {
    await fetch(`/api/hermes/messages?chatId=${chatId}`, {
      method: "DELETE",
    });
    setMessages([]);
  }, [chatId]);

  return { messages, isLoading, sendMessage, clearChat };
}
