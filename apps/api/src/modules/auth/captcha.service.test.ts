import { describe, it, expect, beforeEach } from "vitest";
import { CaptchaService } from "./captcha.service.js";

describe("CaptchaService (anti-bruteforce)", () => {
  let captchaService: CaptchaService;

  beforeEach(() => {
    captchaService = new CaptchaService();
  });

  it("no requiere captcha antes de 3 intentos fallidos", () => {
    const ip = "10.0.0.1";
    expect(captchaService.getCaptchaInfo(ip).required).toBe(false);
    captchaService.registerFailedAttempt(ip);
    captchaService.registerFailedAttempt(ip);
    expect(captchaService.getCaptchaInfo(ip).required).toBe(false);
  });

  it("requiere captcha a partir del 3er intento fallido y lo valida contra la respuesta generada", () => {
    const ip = "10.0.0.2";
    captchaService.registerFailedAttempt(ip);
    captchaService.registerFailedAttempt(ip);
    const third = captchaService.registerFailedAttempt(ip);
    expect(third.captchaRequired).toBe(true);
    expect(third.captchaQuestion).toMatch(/¿Cuánto es \d+ \+ \d+\?/);

    expect(captchaService.verifyCaptcha(ip, "respuesta-incorrecta-no-numerica")).toBe(false);
  });

  it("clearFailedAttempts resetea el estado (vuelve a no requerir captcha)", () => {
    const ip = "10.0.0.3";
    captchaService.registerFailedAttempt(ip);
    captchaService.registerFailedAttempt(ip);
    captchaService.registerFailedAttempt(ip);
    expect(captchaService.getCaptchaInfo(ip).required).toBe(true);

    captchaService.clearFailedAttempts(ip);
    expect(captchaService.getCaptchaInfo(ip).required).toBe(false);
  });

  it("cada instancia tiene su propio registro (sin estado global compartido entre tests)", () => {
    const other = new CaptchaService();
    captchaService.registerFailedAttempt("10.0.0.4");
    captchaService.registerFailedAttempt("10.0.0.4");
    captchaService.registerFailedAttempt("10.0.0.4");
    expect(captchaService.getCaptchaInfo("10.0.0.4").required).toBe(true);
    expect(other.getCaptchaInfo("10.0.0.4").required).toBe(false);
  });
});
