import { redirect } from "next/navigation";

export default function ExcelRedirectPage() {
  redirect("/chat?type=excel");
}
