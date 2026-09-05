import { randomUUID } from "node:crypto";
import { supabase } from "../../shared/supabase.js";
import { BadRequest, Conflict, NotFound } from "../../shared/errors/http-errors.js";
import { env } from "../../config/env.js";

const BUCKET = "drink-images";
const MAX_BYTES = 2 * 1024 * 1024;

export type DrinkImage = {
  id: string;
  path: string;
  url: string;
  createdAt: string;
  deletable: true;
};

function publicUrl(path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export function parseWebpBase64(raw: string): Buffer {
  const trimmed = raw.trim();
  const m = /^data:image\/webp;base64,(.+)$/i.exec(trimmed);
  const b64 = m ? m[1] : trimmed;
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    throw new BadRequest("Imagen inválida (base64).");
  }
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") {
    throw new BadRequest("Solo se aceptan imágenes WebP.");
  }
  if (buf.length > MAX_BYTES) {
    throw new BadRequest("La imagen supera 2 MB.");
  }
  return buf;
}

export class DrinkImagesService {
  async list(): Promise<DrinkImage[]> {
    const { data, error } = await supabase
      .from("drink_images")
      .select("id, path, url, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[DrinkImagesService] list:", error);
      throw error;
    }

    return (data ?? []).map((row) => ({
      id: row.id as string,
      path: row.path as string,
      url: row.url as string,
      createdAt: row.created_at as string,
      deletable: true as const,
    }));
  }

  async uploadWebpBase64(raw: string): Promise<DrinkImage> {
    const buf = parseWebpBase64(raw);
    const path = `uploads/${randomUUID()}.webp`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buf, {
      contentType: "image/webp",
      upsert: false,
    });
    if (upErr) {
      console.error("[DrinkImagesService] storage upload:", upErr);
      throw upErr;
    }

    const url = publicUrl(path);
    const { data, error } = await supabase
      .from("drink_images")
      .insert({ path, url })
      .select("id, path, url, created_at")
      .single();

    if (error || !data) {
      await supabase.storage.from(BUCKET).remove([path]);
      console.error("[DrinkImagesService] insert:", error);
      throw error ?? new Error("No se pudo registrar la imagen");
    }

    return {
      id: data.id as string,
      path: data.path as string,
      url: data.url as string,
      createdAt: data.created_at as string,
      deletable: true,
    };
  }

  async delete(id: string): Promise<{ ok: true }> {
    const { data: row, error } = await supabase
      .from("drink_images")
      .select("id, path, url")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!row) throw new NotFound("Imagen no encontrada.");

    const { count, error: useErr } = await supabase
      .from("drinks")
      .select("id", { count: "exact", head: true })
      .eq("image", row.url);

    if (useErr) throw useErr;
    if ((count ?? 0) > 0) {
      throw new Conflict("La imagen está en uso por un trago. Sacala del trago antes de borrar.");
    }

    // También paths relativos viejos no aplican acá — solo URLs de storage.
    const { error: delRow } = await supabase.from("drink_images").delete().eq("id", id);
    if (delRow) throw delRow;

    const { error: delObj } = await supabase.storage.from(BUCKET).remove([row.path as string]);
    if (delObj) {
      console.error("[DrinkImagesService] storage remove:", delObj);
    }

    return { ok: true };
  }
}

/** Expuesto por si hace falta armar URL en tests; no usa env local. */
export function drinkImagesBucketPublicBase(): string {
  return `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}`;
}
