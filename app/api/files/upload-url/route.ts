import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { FILE_LIMITS, STORAGE_BUCKET, makeStoragePath } from "@/lib/files";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    chatId?: string;
    filename?: string;
    mime?: string;
    size?: number;
  };

  if (!body.chatId) {
    return NextResponse.json({ error: "chatId is required" }, { status: 400 });
  }
  if (!body.filename) {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }
  if (typeof body.size !== "number" || body.size <= 0) {
    return NextResponse.json({ error: "size is required" }, { status: 400 });
  }
  if (body.size > FILE_LIMITS.maxFileSizeBytes) {
    return NextResponse.json(
      {
        error: "File too large",
        detail: `Max ${FILE_LIMITS.maxFileSizeBytes / 1024 / 1024} MB per file`,
      },
      { status: 413 }
    );
  }

  const path = makeStoragePath(body.filename);
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json(
      { error: "Failed to create upload URL", detail: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    id: crypto.randomUUID(),
    uploadUrl: data.signedUrl,
    token: data.token,
    path: data.path,
  });
}
