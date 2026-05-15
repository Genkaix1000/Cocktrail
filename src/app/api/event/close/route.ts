import { handleErrors } from "@/server/http";
import { closeEvent } from "@/server/store";

export const dynamic = "force-dynamic";

export async function POST() {
  return handleErrors(async () => {
    const summary = closeEvent();
    return Response.json(summary);
  });
}
