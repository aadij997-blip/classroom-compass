import { redirect } from "next/navigation";
import { requireTeacher } from "@/lib/server/context";
import { loadSession } from "@/lib/server/views";

export default async function SessionIndex({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const v = await loadSession(await requireTeacher(), sessionId);
  redirect(`/sessions/${sessionId}/${v.session.state === "teaching" ? "teach" : "collect"}`);
}
