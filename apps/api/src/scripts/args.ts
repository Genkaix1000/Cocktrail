export type Target = "local" | "cloud";

export type ParsedArgs = {
  target: Target;
  yes: boolean;
};

export function parseArgs(argv: string[], cloudBlockMsg = "la operación en producción siempre pide confirmación tipeada."): ParsedArgs {
  const targetArg = argv.find((a) => a.startsWith("--target="));
  const target = targetArg?.slice("--target=".length);

  if (target !== "local" && target !== "cloud") {
    throw new Error('Falta o es inválido --target. Uso: --target=local o --target=cloud (obligatorio, sin default).');
  }

  const yes = argv.includes("--yes");
  if (yes && target === "cloud") {
    throw new Error(`--yes no está permitido con --target=cloud: ${cloudBlockMsg}`);
  }

  return { target, yes };
}
