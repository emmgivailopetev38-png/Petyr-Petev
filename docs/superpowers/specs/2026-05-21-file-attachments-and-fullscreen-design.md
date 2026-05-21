# ZOPEXPERT — File Attachments + Fullscreen Chat Design

**Date:** 2026-05-21  
**Status:** Approved

---

## Overview

Add file upload, document processing, and per-chat fullscreen mode to the existing ZOPEXPERT Hermes Chat Dashboard. Users can attach any file type (PDFs with complex tables, Word, Excel, images, audio, video, archives) up to 50 MB. Hermes downloads files via signed Supabase Storage URLs, parses them with its full Python toolset (pdfplumber, python-docx, openpyxl), streams a text response, and optionally generates output files (e.g. `.docx` reports) which it uploads back to ZOPEXPERT via a protected endpoint. Each chat can be expanded to fullscreen for easier reading of long responses. Chat history limit increases from 50 to 200 messages to take advantage of GPT-5.5's large context window.

RAG (vector knowledge base) is explicitly **out of scope** for this iteration — Hermes' native context window is sufficient at current scale.

---

## Architecture

```
┌────────────┐  signed upload URL   ┌──────────────┐   PUT     ┌──────────┐
│  Browser   │ ──────────────────▶ │  ZOPEXPERT   │ ────────▶ │ Supabase │
│ (drag-drop)│                      │ /api/files/  │           │ Storage  │
│            │  confirm + send msg  │  upload-url  │           │chat-files│
└─────┬──────┘ ────────────────────▶│              │           │  bucket  │
      │                              └──────┬───────┘           └────┬─────┘
      │                                     │                        │
      │                                     │ signed download URLs   │
      │                                     │ + user message         │
      │                                     ▼                        │
      │                              ┌──────────────┐                │
      │                              │ Hermes (VPS) │◀───────────────┘
      │                              │              │  download
      │                              │ pdfplumber   │
      │                              │ python-docx  │
      │                              │ openpyxl     │
      │                              │ pandas       │
      │                              └──────┬───────┘
      │                                     │
      │                                     │ upload generated file
      │                                     ▼
      │                              ┌──────────────┐
      │                              │ ZOPEXPERT    │ ──▶ Supabase Storage
      │                              │ /api/hermes- │     (output file)
      │                              │ upload       │
      │                              └──────┬───────┘
      │                                     │
      │ streamed text response              │ public URL in reply
      │ + download chip for output file     │
      └─────────────────────────────────────┘
```

### Flow per message-with-attachments

1. User drags 3 PDFs into Chat 1 panel
2. Browser calls `POST /api/files/upload-url` 3 times (one per file), receives signed Supabase upload URL each
3. Browser PUTs each file directly to Supabase (bypasses Vercel 4.5 MB body limit)
4. Browser calls `POST /api/files/confirm` with the uploaded file paths
5. User types message and clicks Send → `POST /api/hermes/chat` with `{ chatId, message, attachmentIds }`
6. Server-side route:
   - Saves user message (with `attachments` JSONB) to `messages`
   - Generates signed download URLs (1-hour expiry) for each attachment
   - Builds Hermes message with `[Files attached: <url1>, <url2>, <url3>]` prepended and upload-back instructions
   - Loads last 200 messages as context
   - Calls Hermes streaming endpoint
   - Streams text chunks back to client
   - If Hermes' reply contains `https://...supabase.co/...` URLs (generated files), regex-extracts them and attaches as `attachments` to the assistant message
7. UI shows assistant text + download chips for generated files

---

## Database Changes

Migration `002_attachments.sql`:

```sql
-- Add attachments JSONB to messages
alter table messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Storage bucket (run via Supabase dashboard or migration runner)
insert into storage.buckets (id, name, public)
values ('chat-files', 'chat-files', false)
on conflict (id) do nothing;

-- Storage RLS — service role only (signed URLs handle all access)
create policy "service insert" on storage.objects
  for insert with check (bucket_id = 'chat-files');

create policy "service select" on storage.objects
  for select using (bucket_id = 'chat-files');

create policy "service delete" on storage.objects
  for delete using (bucket_id = 'chat-files');
```

### Attachment shape

```typescript
type Attachment = {
  id: string;          // uuid
  filename: string;    // "report-q1.pdf"
  mime: string;        // "application/pdf"
  size: number;        // bytes
  path: string;        // "chat-files/2026-05-21/abc-uuid.pdf"
  kind: "input" | "output";   // user uploaded vs Hermes generated
};
```

`messages.attachments` is an array of `Attachment`.

---

## API Routes

### `POST /api/files/upload-url`

**Purpose:** Generate signed Supabase Storage upload URL so browser can PUT the file directly.

**Request body:**
```json
{ "chatId": "uuid", "filename": "report.pdf", "mime": "application/pdf", "size": 1234567 }
```

**Response:**
```json
{
  "id": "uuid",
  "uploadUrl": "https://...supabase.co/storage/v1/object/upload/sign/...",
  "token": "...",
  "path": "chat-files/2026-05-21/{uuid}-report.pdf"
}
```

**Validation:**
- `size <= 50 * 1024 * 1024` (50 MB) → otherwise 413
- `chatId` exists in `chats` → otherwise 400

### `POST /api/files/confirm`

**Purpose:** After browser uploads, register attachments in app state. Returns presigned attachments for the next message.

**Request body:**
```json
{
  "chatId": "uuid",
  "files": [
    { "id": "uuid", "path": "...", "filename": "...", "mime": "...", "size": 123 }
  ]
}
```

**Response:** `{ "attachments": [Attachment, ...] }` — these get attached to the next user message.

### `POST /api/hermes/chat` (modified)

**Request:**
```json
{
  "chatId": "uuid",
  "message": "Analyze these reports",
  "attachments": [Attachment, ...]   // new field, optional
}
```

**Server-side changes:**
1. Persist user message with the `attachments` array
2. For each attachment, generate signed download URL (1 hour expiry) via Supabase storage API
3. Build Hermes context message:
   ```
   [ZOPEXPERT context]
   The user attached files. Download with curl/requests:
   - https://...supabase.co/storage/v1/object/sign/... (PDF, 1.2 MB)
   - https://...supabase.co/storage/v1/object/sign/... (XLSX, 340 KB)
   
   If you generate output files (.docx, .pdf, .xlsx), upload them to:
   POST https://zopexpert.vercel.app/api/hermes-upload
   Headers: Authorization: Bearer <HERMES_UPLOAD_TOKEN>
   Body: multipart/form-data with field 'file' = <binary>, 'filename' = '<name>'
   The response JSON contains the URL — include it in your reply, the UI will turn it into a download chip.
   
   ---
   User message: <original message>
   ```
4. Load last **200** messages (was 50) as context
5. Stream Hermes response
6. After stream ends:
   - Save assistant message with full text
   - Regex-scan response for `https://*.supabase.co/storage/v1/object/...` URLs
   - For each found URL, fetch file metadata from Supabase, build `Attachment` with `kind: "output"`, append to assistant message's `attachments` array

### `POST /api/hermes-upload`

**Purpose:** Allow Hermes to upload generated files back to ZOPEXPERT.

**Headers:** `Authorization: Bearer <HERMES_UPLOAD_TOKEN>` — new env var, shared secret known only to Hermes and ZOPEXPERT.

**Body:** `multipart/form-data`:
- `file`: binary
- `filename`: string

**Response:**
```json
{
  "id": "uuid",
  "path": "chat-files/2026-05-21/{uuid}-{filename}",
  "url": "https://...supabase.co/storage/v1/object/sign/..."   // 24-hour signed URL
}
```

Hermes is instructed to include this URL in its reply so ZOPEXPERT can attach it to the assistant message.

---

## Limits

```typescript
export const FILE_LIMITS = {
  maxFileSizeBytes: 50 * 1024 * 1024,   // 50 MB per file (Supabase free max)
  maxFilesPerMessage: 20,
  maxTotalStorageGb: 1,                  // Supabase free tier
  allowedMimes: ["*/*"],                 // all types
};

export const HISTORY_LIMIT = 200;        // up from 50
```

If `maxTotalStorageGb` is exceeded, upload returns 507 "Insufficient Storage" with a friendly Bulgarian message: *"Хранилището ти е пълно (1 GB). Изтрий стари файлове или upgrade-ни Supabase Pro."*

---

## UI Changes

### Drag-and-drop zone

`<ChatPanel>` listens for `dragenter`/`dragleave`/`drop` events on its root. While dragging:
- Border switches to dashed violet, 2px
- Overlay text appears: *"Пусни файла тук"*
- On drop: files are queued for upload

### Paperclip button

📎 icon button left of textarea. Opens `<input type="file" multiple>`. Same upload flow as drag-drop.

### File chips (pre-send)

Above input, a row of chips for files queued but not yet sent:

```
📄 report.pdf (1.2 MB) ✕    📊 sales.xlsx (340 KB) ✕    3/20
```

- Each chip has an X button to remove that file
- Counter `n/20` shows current count
- During upload, a thin progress bar overlays the chip from left to right (0% → 100%)
- Failed uploads turn red with retry button

### Message bubble with attachments

**User message with attachments:**
```
┌─────────────────────────────────┐
│ 📄 report.pdf  📊 sales.xlsx    │  ← attachment chips (compact)
│                                  │
│ Направи ми обобщение от тези    │  ← text
│                                  │
└─────────────────────────────────┘
```

**Assistant message with generated files:**
```
┌─────────────────────────────────┐
│ Обобщих и двата документа...    │
│ [streaming text]                 │
│                                  │
│ ┌─────────────────────────────┐ │
│ │ 📥 monthly-report.docx       │ │
│ │    (245 KB) [Download]       │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

### Fullscreen mode

**State:** new `fullscreenChatId: string | null` at page level (in `app/page.tsx`).

**Trigger:** `⤢` icon button in panel header (between title and "Изчисти").

**When set:**
- The 5 other panels unmount (not just hidden — actually removed from DOM for performance)
- The selected panel uses `position: fixed; inset: 0; z-index: 50`
- Message bubbles get `max-width: 800px` and center themselves
- Font size for messages becomes 15px (was 13px)
- Header shows `⤡` icon instead of `⤢` to minimize

**Exit:**
- Click `⤡` button
- Press `Esc` key (global keydown listener, only active when fullscreen is set)
- After exit, restore 2×3 grid

**Transition:** 200ms ease-out scale animation (0.95 → 1.0 on enter, reverse on exit).

### Empty state

`<ChatPanel>` empty state changes from:
*"Напишете нещо..."*

to:
*"Напишете нещо или плъзнете файл тук..."*

---

## Hermes-side workflow

ZOPEXPERT does NOT modify Hermes. Instead, every chat call to Hermes that contains attachments prepends a system-like instruction block (inside the user message, since some OpenAI-compatible APIs ignore tail system messages):

```
[ZOPEXPERT context]
You have file tools (terminal, file I/O, Python libraries). 

User attached the following files. Download them with `curl -L -o /tmp/<name> <url>`:

- /tmp/report-q1.pdf  ← https://....supabase.co/storage/v1/object/sign/...
- /tmp/sales.xlsx     ← https://....supabase.co/storage/v1/object/sign/...

Tools you can use:
- pdfplumber (PDFs with tables)
- python-docx (Word)
- openpyxl, pandas (Excel)
- Pillow + tesseract (scanned/image OCR)
- reportlab, weasyprint (PDF generation)
- python-docx (DOCX generation)

If you generate output files for the user to download, upload them to:
  curl -X POST https://zopexpert.vercel.app/api/hermes-upload \
    -H "Authorization: Bearer $HERMES_UPLOAD_TOKEN" \
    -F "file=@/tmp/output.docx" \
    -F "filename=monthly-report-2026-05.docx"

The response JSON contains a "url" field — include that URL verbatim in your reply so the UI can render a download button.

---

User message: <original message text>
```

The Hermes operator (Hermes-agent) sets `HERMES_UPLOAD_TOKEN` env var on the VPS once (same value as in Vercel).

---

## Security

- All signed Supabase URLs expire in **1 hour** for downloads, **15 minutes** for uploads
- `HERMES_UPLOAD_TOKEN` is a 32-char hex string, stored in Vercel + Hermes `.env`, never sent to browser
- The `/api/hermes-upload` endpoint validates the bearer token with constant-time comparison
- Browser can never read other chats' files — RLS on `messages` already enforces this; `attachments` only contains paths, accessed via signed URLs server-side
- File names are sanitized server-side: `<uuid>-<original-name>` to avoid path traversal

---

## Out of Scope (this iteration)

- **RAG / vector knowledge base** — GPT-5.5's context window + 200-message history is sufficient at current scale; revisit if user accumulates hundreds of documents
- **Antivirus scanning** of uploaded files — internal tool, single owner
- **File preview** (PDF viewer, image lightbox) — download is enough
- **Edit/rename files after upload** — re-upload if needed
- **Multi-file zip download** — single files only
- **OCR confidence display** for scanned docs — Hermes decides quality

---

## Migration / Rollout

1. Apply migration `002_attachments.sql` via Supabase SQL Editor
2. Add `HERMES_UPLOAD_TOKEN` env var to Vercel (production + preview + development)
3. Tell Hermes operator: add same `HERMES_UPLOAD_TOKEN` to `/root/.hermes/.env`, restart gateway
4. Deploy to Vercel
5. Verify in production: upload PDF, ask Hermes to summarize, confirm download chip appears for output
