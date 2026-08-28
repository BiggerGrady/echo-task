import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-sm text-ink-soft/60">加载…</div>}>
      <LoginClient />
    </Suspense>
  );
}
