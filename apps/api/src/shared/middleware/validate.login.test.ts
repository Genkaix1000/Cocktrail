import { describe, expect, it } from "vitest";
import { LoginSchema } from "./validate.js";

describe("LoginSchema", () => {
  it("acepta login sin token Turnstile (dev/local)", () => {
    const parsed = LoginSchema.parse({ username: "admin", password: "secreto" });
    expect(parsed.cfTurnstileToken).toBeUndefined();
  });

  it("conserva cfTurnstileToken (validate() no lo strippea)", () => {
    const parsed = LoginSchema.parse({
      username: "admin",
      password: "secreto",
      cfTurnstileToken: "0.token",
    });
    expect(parsed.cfTurnstileToken).toBe("0.token");
  });
});
