import { loadReleaseNotes, type ReleaseNotes } from "./changelog.js";

/**
 * Versión de producto (semver). Override con APP_VERSION / APP_CHANNEL en env
 * si un deploy necesita etiquetar distinto sin tocar código.
 *
 * Canal `beta` = build pública temprana; `stable` cuando cerremos la beta.
 */
export type AppVersionInfo = {
  version: string;
  channel: string;
  /** Etiqueta corta para UI, ej. "0.1.0-beta". */
  label: string;
  environment: "production" | "development" | "test" | string;
  deploy: {
    provider: "koyeb" | "render" | "local" | "unknown";
    service: string | null;
    commit: string | null;
    /** Primeros 7 del commit, o null. */
    commitShort: string | null;
    branch: string | null;
    externalUrl: string | null;
  };
  runtime: {
    node: string;
    serverStartedAt: number;
    uptimeSec: number;
  };
  migrations: {
    state: string;
    pendingCount: number;
    lastApplied: string | null;
  };
  /** Novedades de esta versión (desde CHANGELOG.md). */
  releaseNotes: ReleaseNotes | null;
};

function shortSha(sha: string | null | undefined): string | null {
  if (!sha) return null;
  return sha.length > 7 ? sha.slice(0, 7) : sha;
}

function detectProvider(): AppVersionInfo["deploy"]["provider"] {
  if (process.env.KOYEB_SERVICE_ID || process.env.KOYEB_APP_NAME) return "koyeb";
  if (process.env.RENDER === "true" || process.env.RENDER_SERVICE_ID) return "render";
  if (process.env.NODE_ENV === "development") return "local";
  return "unknown";
}

export function buildAppVersionInfo(input: {
  serverStartedAt: number;
  migrations: { state: string; pending: string[]; appliedNow: string[] };
}): AppVersionInfo {
  const version = process.env.APP_VERSION?.trim() || "0.1.1";
  const channel = process.env.APP_CHANNEL?.trim() || "beta";
  const commit =
    process.env.KOYEB_GIT_SHA?.trim() ||
    process.env.RENDER_GIT_COMMIT?.trim() ||
    process.env.GIT_COMMIT?.trim() ||
    process.env.COMMIT_SHA?.trim() ||
    null;
  const branch =
    process.env.KOYEB_GIT_BRANCH?.trim() ||
    process.env.RENDER_GIT_BRANCH?.trim() ||
    process.env.GIT_BRANCH?.trim() ||
    null;
  const applied = input.migrations.appliedNow;
  const koyebUrl = process.env.KOYEB_PUBLIC_DOMAIN?.trim();

  return {
    version,
    channel,
    label: `${version}-${channel}`,
    environment: process.env.NODE_ENV || "development",
    deploy: {
      provider: detectProvider(),
      service:
        process.env.KOYEB_SERVICE_NAME?.trim() ||
        process.env.RENDER_SERVICE_NAME?.trim() ||
        null,
      commit,
      commitShort: shortSha(commit),
      branch,
      externalUrl:
        (koyebUrl ? `https://${koyebUrl}` : null) ||
        process.env.RENDER_EXTERNAL_URL?.trim() ||
        process.env.FRONTEND_URL?.trim() ||
        null,
    },
    runtime: {
      node: process.version,
      serverStartedAt: input.serverStartedAt,
      uptimeSec: Math.max(0, Math.floor((Date.now() - input.serverStartedAt) / 1000)),
    },
    migrations: {
      state: input.migrations.state,
      pendingCount: input.migrations.pending.length,
      lastApplied: applied.length > 0 ? applied[applied.length - 1]! : null,
    },
    releaseNotes: loadReleaseNotes(version),
  };
}
