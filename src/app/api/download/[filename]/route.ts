import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { OUTPUTS_DIR } from "@/lib/paths";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ filename: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { filename } = await ctx.params;
  const safe = path.basename(filename);
  const filePath = path.join(OUTPUTS_DIR, safe);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
  const data = fs.readFileSync(filePath);
  const ext = path.extname(safe).toLowerCase();
  const type =
    ext === ".xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  return new NextResponse(data, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(safe)}"`,
    },
  });
}
