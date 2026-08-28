import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { runChat, saveUpload, type ChatTaskType } from "@/lib/chat/orchestrator";
import { encodeSse, sseResponse } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;

  const form = await req.formData();
  const message = String(form.get("message") || "");
  const typeRaw = String(form.get("type") || "auto") as ChatTaskType;
  const model = String(form.get("model") || "").trim() || undefined;
  const sessionId = String(form.get("sessionId") || "").trim() || undefined;
  const file = form.get("file");

  let upload: { buffer: Buffer; name: string; storedName: string } | null = null;
  if (file && file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json(
        { error: `文件过大，上限 ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB` },
        { status: 400 }
      );
    }
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".docx") && !lower.endsWith(".xlsx")) {
      return Response.json({ error: "仅支持 .docx 或 .xlsx" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const storedName = saveUpload(buffer, file.name);
    upload = { buffer, name: file.name, storedName };
  }

  if (!message.trim() && !upload) {
    return Response.json({ error: "请输入内容或上传附件" }, { status: 400 });
  }

  const type: ChatTaskType =
    typeRaw === "word" || typeRaw === "excel" || typeRaw === "chat" || typeRaw === "auto"
      ? typeRaw
      : "auto";

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of runChat({
          sessionId,
          message,
          type,
          model,
          file: upload,
          signal: req.signal,
        })) {
          controller.enqueue(encoder.encode(encodeSse(ev.event, ev.data)));
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "处理失败";
        controller.enqueue(encoder.encode(encodeSse("error", { message: msg })));
        controller.enqueue(encoder.encode(encodeSse("done", { ok: false })));
      } finally {
        controller.close();
      }
    },
  });

  return sseResponse(stream);
}
