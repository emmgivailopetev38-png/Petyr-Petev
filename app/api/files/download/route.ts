import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { STORAGE_BUCKET } from "@/lib/files";

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(path);

  if (error || !data) {
    return NextResponse.json(
      { error: "File not found", detail: error?.message },
      { status: 404 }
    );
  }

  const filename = path.split("/").pop() ?? "download";
  return new Response(data, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename.replace(/^[a-f0-9-]+-/, "")}"`,
      "Content-Type": data.type || "application/octet-stream",
    },
  });
}
