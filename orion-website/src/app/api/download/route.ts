import { NextRequest, NextResponse } from "next/server";
import { existsSync, statSync, readFileSync } from "fs";
import { join } from "path";

// Allowed download files (whitelist for security)
const ALLOWED_FILES: Record<string, string> = {
  "obsidian-installer.zip": "knowledge/obsidian-installer.zip",
  "hyperdown.zip": "knowledge/hyperdown.zip",
  "project-graph.zip": "knowledge/project-graph.zip",
  "rta-llm-setup.zip": "rta/rta-llm-setup.zip",
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const file = searchParams.get("file");

  if (!file || !(file in ALLOWED_FILES)) {
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  }

  const relativePath = ALLOWED_FILES[file];
  const filePath = join(process.cwd(), "public", relativePath);

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const stat = statSync(filePath);

  // Read entire file into buffer — reliable for production deploy
  const buffer = readFileSync(filePath);

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file)}"`,
      "Content-Length": stat.size.toString(),
      "Cache-Control": "public, max-age=86400",
    },
  });
}
