"use client";

import { useRef, useEffect, useState } from "react";
import { Send, Paperclip, Maximize2, Minimize2 } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { useFileUpload } from "@/hooks/useFileUpload";
import { ChatMessage } from "@/components/ChatMessage";
import { FileChip } from "@/components/FileChip";
import { FILE_LIMITS } from "@/lib/files";
import type { Chat } from "@/lib/types";

type Props = {
  chat: Chat;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
};

export function ChatPanel({ chat, isFullscreen, onToggleFullscreen }: Props) {
  const { messages, isLoading, sendMessage, clearChat } = useChat(chat.id);
  const { files, enqueue, remove, clear, completedAttachments, isUploading } =
    useFileUpload(chat.id);
  const [input, setInput] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (isUploading) return;
    if (!text && completedAttachments.length === 0) return;
    setInput("");
    const attachmentsCopy = [...completedAttachments];
    clear();
    await sendMessage(text, attachmentsCopy);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) setIsDragOver(false);
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) enqueue(dropped);
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) enqueue(Array.from(e.target.files));
    e.target.value = "";
  }

  const containerStyle: React.CSSProperties = isFullscreen
    ? {
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg-deep)",
        border: "none",
        borderRadius: 0,
        overflow: "hidden",
      }
    : {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--color-bg-deep)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        overflow: "hidden",
      };

  const messageContainerStyle: React.CSSProperties = isFullscreen
    ? { maxWidth: 800, margin: "0 auto", width: "100%" }
    : {};

  const messageFontSize = isFullscreen ? 15 : 13;

  return (
    <div
      style={containerStyle}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {isDragOver && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            background: "rgba(124, 58, 237, 0.08)",
            border: "2px dashed var(--color-accent-violet)",
            borderRadius: isFullscreen ? 0 : 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            fontWeight: 600,
            fontSize: 14,
            color: "var(--color-accent-violet)",
          }}
        >
          Пусни файла тук
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 14px",
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: 13,
            color: "var(--color-text-primary)",
          }}
        >
          {chat.title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={onToggleFullscreen}
            title={isFullscreen ? "Минимизирай" : "На цял екран"}
            style={iconBtnStyle}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            onClick={clearChat}
            title="Изчисти историята"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-text-tertiary)",
              cursor: "pointer",
              fontSize: 11,
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            Изчисти
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 14px",
          minHeight: 0,
        }}
      >
        <div style={messageContainerStyle}>
          {messages.length === 0 && !isLoading && (
            <p
              style={{
                color: "var(--color-text-tertiary)",
                fontSize: 12,
                textAlign: "center",
                marginTop: 24,
              }}
            >
              Напишете нещо или плъзнете файл тук...
            </p>
          )}
          <div style={{ fontSize: messageFontSize }}>
            {messages.map((m) => (
              <ChatMessage key={m.id} message={m} />
            ))}
          </div>
          <div ref={bottomRef} />
        </div>
      </div>

      {files.length > 0 && (
        <div
          style={{
            padding: "8px 14px 0",
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            flexShrink: 0,
          }}
        >
          {files.map((f) => (
            <FileChip
              key={f.id}
              filename={f.file.name}
              size={f.file.size}
              progress={f.progress}
              status={f.status}
              errorMessage={f.errorMessage}
              onRemove={() => remove(f.id)}
            />
          ))}
          <span
            style={{
              fontSize: 11,
              color: "var(--color-text-tertiary)",
              alignSelf: "center",
              marginLeft: 4,
            }}
          >
            {files.length}/{FILE_LIMITS.maxFilesPerMessage}
          </span>
        </div>
      )}

      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid var(--color-border)",
          display: "flex",
          gap: 8,
          flexShrink: 0,
          alignItems: "flex-end",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={onPickFiles}
          style={{ display: "none" }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Прикрепи файл"
          disabled={files.length >= FILE_LIMITS.maxFilesPerMessage}
          style={{
            ...iconBtnStyle,
            opacity:
              files.length >= FILE_LIMITS.maxFilesPerMessage ? 0.4 : 0.8,
          }}
        >
          <Paperclip size={15} />
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Съобщение... (Enter за изпращане)"
          rows={1}
          style={{
            flex: 1,
            background: "var(--color-input)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            color: "var(--color-text-primary)",
            fontSize: 13,
            padding: "8px 12px",
            resize: "none",
            outline: "none",
            maxHeight: 80,
            overflowY: "auto",
          }}
        />
        <button
          onClick={handleSend}
          disabled={
            isLoading ||
            isUploading ||
            (!input.trim() && completedAttachments.length === 0)
          }
          style={{
            background: "var(--color-accent-violet)",
            border: "none",
            borderRadius: 8,
            color: "#fff",
            padding: "8px 12px",
            cursor:
              isLoading || isUploading ? "not-allowed" : "pointer",
            opacity:
              isLoading ||
              isUploading ||
              (!input.trim() && completedAttachments.length === 0)
                ? 0.45
                : 1,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--color-text-secondary)",
  cursor: "pointer",
  padding: 4,
  borderRadius: 4,
  display: "flex",
  alignItems: "center",
};
