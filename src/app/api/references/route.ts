import { NextRequest, NextResponse } from "next/server";
import { createReference, listReferences, type ReferenceScope } from "@/lib/references";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get("scope") as ReferenceScope | null;
  return NextResponse.json({ items: listReferences(scope ?? undefined) });
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const title = String(form.get("title") || "");
    const description = String(form.get("description") || "");
    const scope = String(form.get("scope") || "global") as ReferenceScope;
    const content = String(form.get("content") || "");
    const file = form.get("file");

    if (!title.trim()) {
      return NextResponse.json({ error: "标题必填" }, { status: 400 });
    }

    let fileBuffer: Buffer | null = null;
    let filename: string | null = null;
    if (file && file instanceof File) {
      fileBuffer = Buffer.from(await file.arrayBuffer());
      filename = file.name;
    }

    const item = createReference({
      title,
      description,
      scope,
      content,
      filename,
      fileBuffer,
    });
    return NextResponse.json(item);
  }

  const body = await req.json();
  const item = createReference({
    title: body.title,
    description: body.description,
    scope: body.scope || "global",
    content: body.content || "",
  });
  return NextResponse.json(item);
}
