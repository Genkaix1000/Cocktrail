import { setTheme } from "@/server/store";
import type { Theme } from "@/types/domain";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const theme = body.theme as Theme;
    
    if (theme !== "normal" && theme !== "bosko") {
      return Response.json({ error: "Invalid theme" }, { status: 400 });
    }

    setTheme(theme);
    return Response.json({ success: true, theme });
  } catch (error) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
}
