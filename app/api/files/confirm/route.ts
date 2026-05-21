import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { STORAGE_BUCKET } from "@/lib/files";
import type { Attachment } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    chatId?: string;
    files?: Array<{
      id: string;
      path: string;
      filename: string;
      mime: string;
      size: number;
    }>;
  };

  if (!body.chatId) {
    return NextResponse.json({ error: "chatId is required" }, { status: 400 });
  }
  if (!Array.isArray(body.files) || body.files.length === 0) {
    return NextResponse.json({ error: "files is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Verify each file exists in storage
  const attachments: Attachment[] = [];
  for (const f of body.files) {
    const { data } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(f.path.split("/").slice(0, -1).join("/"), {
        search: f.path.split("/").pop(),
      });
    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: `File not found in storage: ${f.filename}` },
        { status: 404 }
      );
    }
    attachments.push({
      id: f.id,
      filename: f.filename,
      mime: f.mime,
      size: f.size,
      path: f.path,
      kind: "input",
    });
  }

  return NextResponse.json({ attachments });
}
