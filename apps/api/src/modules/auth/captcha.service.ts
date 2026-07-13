type CaptchaRecord = {
  failedAttempts: number;
  captchaQuestion?: string;
  captchaAnswer?: string;
};

/**
 * Registro de intentos fallidos de login por IP y captcha matemático simple
 * tras 3 fallos. Instanciado una vez en app.ts (no singleton de módulo) para
 * que cada test parta de un registro limpio.
 */
export class CaptchaService {
  private registry = new Map<string, CaptchaRecord>();

  getCaptchaInfo(ip: string): { required: boolean; question?: string } {
    const record = this.registry.get(ip);
    if (record && record.failedAttempts >= 3) {
      if (!record.captchaQuestion) {
        this.generateCaptchaFor(ip);
      }
      const updated = this.registry.get(ip)!;
      return { required: true, question: updated.captchaQuestion };
    }
    return { required: false };
  }

  registerFailedAttempt(ip: string): { captchaRequired: boolean; captchaQuestion?: string } {
    const record = this.registry.get(ip) || { failedAttempts: 0 };
    const newAttempts = record.failedAttempts + 1;

    this.registry.set(ip, {
      ...record,
      failedAttempts: newAttempts,
    });

    if (newAttempts >= 3) {
      const question = this.generateCaptchaFor(ip);
      return { captchaRequired: true, captchaQuestion: question };
    }

    return { captchaRequired: false };
  }

  clearFailedAttempts(ip: string): void {
    this.registry.delete(ip);
  }

  verifyCaptcha(ip: string, answer: string | undefined): boolean {
    const record = this.registry.get(ip);
    if (!record || record.failedAttempts < 3) return true; // Captcha not required yet
    if (!answer) return false;
    return record.captchaAnswer === answer.trim();
  }

  private generateCaptchaFor(ip: string): string {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    const question = `¿Cuánto es ${num1} + ${num2}?`;
    const answer = String(num1 + num2);

    const record = this.registry.get(ip) || { failedAttempts: 0 };
    this.registry.set(ip, {
      ...record,
      captchaQuestion: question,
      captchaAnswer: answer,
    });

    return question;
  }
}
