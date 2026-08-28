import { Suspense } from "react";
import ChatClient from "./ChatClient";

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="text-sm text-ink-soft/60">加载对话…</div>}>
      <ChatClient />
    </Suspense>
  );
}
