"use client";

import { useRef, useEffect, useState } from "react";
import { Send, Paperclip, Maximize2, Minimize2 } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { useFileUpload } from "@/hooks/useFileUpload";
import { ChatMessage } from "@/components/ChatMessage";
import { FileChip } from "@/components/FileChip";
import { PlaybookMenu } from "@/components/PlaybookMenu";
import { MonitorMenu } from "@/components/MonitorMenu";
import { PlaybookRunBanner } from "@/components/PlaybookRunBanner";
import { FILE_LIMITS } from "@/lib/files";
import type { Chat } from "@/lib/types";

type Props = {
  chat: Chat;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
};

export function ChatPanel({ chat, isFullscreen, onToggleFullscreen }: Props) {
  const { messages, isLoading, sendMessage, clearChat, reloadMessages } = useChat(chat.id);
  const { files, enqueue, remove, clear, completedAttachments, isUploading } =
    useFileUpload(chat.id);
  const [input, setInput] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeRun, setActiveRun] = useState<{
    runId: string;
    totalSteps: number;
    playbookName: string;
  } | null>(null);
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
        background: "var(--color-paper-cream)",
        border: "none",
        borderRadius: 0,
        overflow: "hidden",
      }
    : {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--color-paper-cream)",
        border: "1px solid var(--color-rule-soft)",
        borderTop: "3px solid var(--color-burgundy-deep)",
        borderRadius: 4,
        overflow: "hidden",
        boxShadow:
          "0 1px 2px rgba(31, 27, 22, 0.04), 0 8px 24px -12px rgba(31, 27, 22, 0.06)",
        position: "relative",
      };

  // In fullscreen, no max-width — text spans the full viewport with
  // only the panel's outer padding as a gutter. ChatMessage handles its
  // own bubble width inside.
  const messageContainerStyle: React.CSSProperties = isFullscreen
    ? { width: "100%" }
    : {};

  const inputRowStyle: React.CSSProperties = { width: "100%" };

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
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 15,
            color: "var(--color-ink-near-black)",
            display: "flex",
            alignItems: "baseline",
            gap: 7,
            letterSpacing: "0.005em",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {chat.icon && (
            <span
              style={{
                fontSize: 16,
                opacity: 0.92,
                filter: "saturate(1.15)",
              }}
            >
              {chat.icon}
            </span>
          )}
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {chat.title}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--color-ink-faint)",
              letterSpacing: "0.12em",
              marginLeft: 2,
              flexShrink: 0,
            }}
          >
            №{chat.slot}
          </span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {chat.vertical && (
            <PlaybookMenu
              chatId={chat.id}
              workspaceId={chat.id}
              onRunStarted={(runId, totalSteps, playbookName) =>
                setActiveRun({ runId, totalSteps, playbookName })
              }
            />
          )}
          <MonitorMenu chatId={chat.id} vertical={chat.vertical} />
          <button
            onClick={onToggleFullscreen}
            title={isFullscreen ? "Минимизирай" : "На цял екран"}
            style={{
              ...iconBtnStyle,
              padding: isFullscreen ? "6px 10px" : 4,
              gap: 6,
              fontSize: 12,
              color: "var(--color-ink-muted)",
              border: isFullscreen
                ? "1px solid var(--color-rule-soft)"
                : "none",
              borderRadius: 6,
            }}
          >
            {isFullscreen ? (
              <>
                <Minimize2 size={14} />
                <span>Минимизирай</span>
              </>
            ) : (
              <Maximize2 size={13} />
            )}
          </button>
          <button
            onClick={clearChat}
            title="Изчисти историята"
            style={{
              background: "transparent",
              border: isFullscreen
                ? "1px solid var(--color-rule-soft)"
                : "none",
              color: "var(--color-ink-muted)",
              cursor: "pointer",
              fontSize: isFullscreen ? 12 : 11,
              padding: isFullscreen ? "6px 10px" : "2px 6px",
              borderRadius: 6,
            }}
          >
            Изчисти историята
          </button>
        </div>
      </div>

      {activeRun && (
        <div style={{ padding: "8px 14px 0", flexShrink: 0 }}>
          <PlaybookRunBanner
            runId={activeRun.runId}
            totalSteps={activeRun.totalSteps}
            playbookName={activeRun.playbookName}
            onComplete={() => {
              reloadMessages();
            }}
          />
        </div>
      )}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: isFullscreen ? "20px 40px" : "12px 14px",
          minHeight: 0,
        }}
      >
        <div style={messageContainerStyle}>
          {messages.length === 0 && !isLoading && (
            <div
              style={{
                textAlign: "center",
                marginTop: 32,
                padding: "0 28px",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 14,
                  color: "var(--color-ink-muted)",
                  fontStyle: "italic",
                  lineHeight: 1.7,
                  letterSpacing: "0.01em",
                }}
              >
                {chat.welcome_message ??
                  "Напишете нещо или плъзнете файл тук..."}
              </div>
              <div
                style={{
                  width: 32,
                  height: 1,
                  background: "var(--color-gold-warm)",
                  margin: "16px auto 0",
                  opacity: 0.6,
                }}
              />
            </div>
          )}
          <div style={{ fontSize: messageFontSize }}>
            {messages.map((m) => (
              <ChatMessage key={m.id} message={m} isFullscreen={isFullscreen} />
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
          flexShrink: 0,
        }}
      >
        <div
          style={{
            ...inputRowStyle,
            display: "flex",
            gap: 8,
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
            <Paperclip size={isFullscreen ? 17 : 15} />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              chat.vertical
                ? `Питай за ${chat.title.toLowerCase()}... (Enter за изпращане)`
                : "Съобщение... (Enter за изпращане)"
            }
            rows={isFullscreen ? 2 : 1}
            style={{
              flex: 1,
              background: "var(--color-input)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              color: "var(--color-text-primary)",
              fontSize: isFullscreen ? 15 : 13,
              padding: isFullscreen ? "10px 14px" : "8px 12px",
              resize: "none",
              outline: "none",
              maxHeight: isFullscreen ? 160 : 80,
              overflowY: "auto",
              lineHeight: 1.5,
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
              padding: isFullscreen ? "10px 16px" : "8px 12px",
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
              gap: 8,
              fontSize: isFullscreen ? 14 : 13,
              fontWeight: 500,
            }}
          >
            <Send size={isFullscreen ? 17 : 15} />
            {isFullscreen && <span>Изпрати</span>}
          </button>
        </div>
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
