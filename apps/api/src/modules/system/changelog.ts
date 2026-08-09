import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type ReleaseNotes = {
  version: string;
  date: string | null;
  /** Bullets planos para UI (máx. razonable). */
  highlights: string[];
};

const HIGHLIGHT_CAP = 8;

/**
 * Extrae la sección `## [x.y.z]` (o `## x.y.z`) de un CHANGELOG estilo
 * Keep a Changelog. Solo bullets `- ` / `* `.
 */
export function parseReleaseNotes(markdown: string, version: string): ReleaseNotes | null {
  const escaped = version.replace(/\./g, "\\.");
  const header = new RegExp(
    `^##\\s+\\[?${escaped}\\]?\\s*(?:-\\s*(\\d{4}-\\d{2}-\\d{2}))?\\s*$`,
    "m",
  );
  const match = header.exec(markdown);
  if (!match || match.index == null) return null;

  const date = match[1] ?? null;
  const after = markdown.slice(match.index + match[0].length);
  const nextHeader = after.search(/^##\s+/m);
  const body = nextHeader >= 0 ? after.slice(0, nextHeader) : after;

  const highlights: string[] = [];
  for (const line of body.split("\n")) {
    const bullet = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (!bullet?.[1]) continue;
    highlights.push(bullet[1]);
    if (highlights.length >= HIGHLIGHT_CAP) break;
  }

  if (highlights.length === 0) return null;
  return { version, date, highlights };
}

function changelogCandidates(): string[] {
  const cwd = process.cwd();
  return [
    join(cwd, "CHANGELOG.md"),
    join(cwd, "..", "CHANGELOG.md"),
    join(cwd, "..", "..", "CHANGELOG.md"),
    join(cwd, "apps", "api", "CHANGELOG.md"),
  ];
}

/** Lee CHANGELOG.md del repo si existe; si no, null (UI oculta novedades). */
export function loadReleaseNotes(version: string): ReleaseNotes | null {
  for (const path of changelogCandidates()) {
    if (!existsSync(path)) continue;
    try {
      const md = readFileSync(path, "utf8");
      const notes = parseReleaseNotes(md, version);
      if (notes) return notes;
    } catch {
      /* siguiente candidato */
    }
  }
  return null;
}
