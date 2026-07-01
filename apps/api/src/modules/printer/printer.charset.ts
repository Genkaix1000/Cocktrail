// Mapa mínimo UTF-8 → CP437 para el subset de acentos usado en nombres de tragos en español.
// Confirmado a mano contra la impresora física (NICTOM IT06 / clon POS58): usa la tabla CP437 clásica.
const UTF8_TO_CP437: Record<string, number> = {
  á: 0xa0,
  é: 0x82,
  í: 0xa1,
  ó: 0xa2,
  ú: 0xa3,
  Á: 0xb5,
  É: 0x90,
  Í: 0xd6,
  Ó: 0xe0,
  Ú: 0xe9,
  ñ: 0xa4,
  Ñ: 0xa5,
  "¿": 0xa8,
  "¡": 0xad,
};

export function toCP437(text: string): Buffer {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 128) {
      bytes.push(code);
    } else if (UTF8_TO_CP437[ch] !== undefined) {
      bytes.push(UTF8_TO_CP437[ch]);
    } else {
      bytes.push(0x3f); // '?' de fallback para cualquier char no mapeado
    }
  }
  return Buffer.from(bytes);
}
