import { redirect } from "next/navigation";

export default function WordRedirectPage() {
  redirect("/chat?type=word");
}
