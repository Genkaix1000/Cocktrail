import { authenticate, buildSessionCookie } from "@/server/auth";
import { BadRequest } from "@/server/errors";
import { handleErrors } from "@/server/http";
import { asObject, asString } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleErrors(async () => {
    const body = asObject(await request.json(), "body");
    const username = asString(body.username, "username");
    const password = asString(body.password, "password");

    const user = authenticate(username, password);
    if (!user) throw new BadRequest("Credenciales inválidas");

    const res = Response.json({ username: user.username, role: user.role });
    res.headers.append("Set-Cookie", buildSessionCookie(user.role));
    return res;
  });
}
