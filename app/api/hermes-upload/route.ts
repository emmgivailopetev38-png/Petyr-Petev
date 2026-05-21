import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { STORAGE_BUCKET, makeStoragePath } from "@/lib/files";

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.HERMES_UPLOAD_TOKEN}`;
  if (!process.env.HERMES_UPLOAD_TOKEN || !constantTimeEqual(auth, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form body" }, { status: 400 });
  }

  const file = form.get("file");
  const filenameRaw = form.get("filename");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (typeof filenameRaw !== "string" || !filenameRaw) {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }

  const path = makeStoragePath(filenameRaw);
  const supabase = createServiceClient();

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: "Upload failed", detail: uploadError.message },
      { status: 500 }
    );
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 24 * 60 * 60);

  if (signError || !signed) {
    return NextResponse.json(
      { error: "Could not sign URL", detail: signError?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    id: crypto.randomUUID(),
    path,
    url: signed.signedUrl,
    filename: filenameRaw,
    size: file.size,
    mime: file.type || "application/octet-stream",
  });
}
