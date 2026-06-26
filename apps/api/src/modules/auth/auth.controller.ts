import { Router } from "express";
import {
  authenticate,
  buildSessionCookie,
  buildClearCookie,
  COOKIE_NAME,
  verifySession,
  verifyCaptcha,
  getCaptchaInfo,
  registerFailedAttempt,
  clearFailedAttempts,
} from "./auth.service.js";
import { validate, LoginSchema } from "../../shared/middleware/validate.js";
import { loginLimiter } from "../../shared/middleware/rate-limit.js";
import type { UsersRepository } from "../users/users.repository.js";

export function createAuthController(usersRepo: UsersRepository): Router {
  const router = Router();

  // POST /api/auth/login
  router.post("/login", loginLimiter, validate(LoginSchema), async (req, res, next) => {
    try {
      const { username, password, captchaAnswer } = req.body;
      const ip = req.ip || "unknown";

      // 1. Verify captcha if failure count >= 3
      const captchaInfo = getCaptchaInfo(ip);
      if (captchaInfo.required) {
        const captchaValid = verifyCaptcha(ip, captchaAnswer);
        if (!captchaValid) {
          // Increment or refresh captcha on failure
          registerFailedAttempt(ip);
          const newCaptcha = getCaptchaInfo(ip);
          res.status(400).json({
            error: "Captcha incorrecto o requerido.",
            captchaRequired: true,
            captchaQuestion: newCaptcha.question,
          });
          return;
        }
      }

      // 2. Perform authentication
      const user = await authenticate(username, password, usersRepo);
      if (!user) {
        // Register failed attempt
        const failedInfo = registerFailedAttempt(ip);
        res.status(400).json({
          error: "Credenciales inválidas",
          captchaRequired: failedInfo.captchaRequired,
          captchaQuestion: failedInfo.captchaQuestion,
        });
        return;
      }

      // Success: clear failed attempts registry
      clearFailedAttempts(ip);

      res.setHeader("Set-Cookie", buildSessionCookie(user.username, user.role));
      res.json({ username: user.username, role: user.role });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/auth/logout
  router.post("/logout", (_req, res) => {
    res.setHeader("Set-Cookie", buildClearCookie());
    res.json({ ok: true });
  });

  // GET /api/auth/me
  router.get("/me", async (req, res) => {
    const raw = req.cookies?.[COOKIE_NAME];
    const session = verifySession(raw);
    if (!session) {
      res.json(null);
      return;
    }

    // Determine permissions
    let permissions = {
      closeNight: false,
      modifyCarta: false,
      manageUsers: false,
      monitoreo: false,
      metricas: false,
      historial: false,
      general: false,
      carta: false,
      pagos: false,
      staff: false,
      cancelarTickets: false,
    };

    if (session.role === "admin") {
      permissions = {
        closeNight: true,
        modifyCarta: true,
        manageUsers: true,
        monitoreo: true,
        metricas: true,
        historial: true,
        general: true,
        carta: true,
        pagos: true,
        staff: true,
        cancelarTickets: true,
      };
    } else {
      const dbUser = await usersRepo.findByUsername(session.username);
      if (dbUser) {
        permissions = { ...permissions, ...dbUser.permissions };
      } else if (session.role === "caja") {
        permissions.closeNight = false;
        permissions.metricas = false;
        permissions.historial = true;
      } else if (session.role === "barman") {
        permissions.cancelarTickets = true;
      }
    }

    res.json({
      role: session.role,
      username: session.username,
      permissions,
    });
  });

  return router;
}
