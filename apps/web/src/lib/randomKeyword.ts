/**
 * Palabras clave sugeridas para abrir una noche — temática boliche/fiesta,
 * en mayúsculas porque se imprimen tal cual en los tickets físicos.
 */
export const NIGHT_KEYWORDS = [
  "MEDIANOCHE",
  "TEQUILA",
  "NEON",
  "ANTRO",
  "FIESTA",
  "BOLICHE",
  "DESVELO",
  "RESACA",
  "TRAGO",
  "AFTER",
  "PISTA",
  "BARRA",
  "PENUMBRA",
  "ESTROBO",
  "CADENCIA",
  "NOCTURNO",
  "VERTIGO",
  "ECLIPSE",
  "TERCIOPELO",
  "SIRENA",
];

/**
 * Devuelve una palabra al azar de la lista curada. Si se pasa `exclude`,
 * evita devolver esa misma palabra (útil para que tocar "generar" dos
 * veces seguidas casi nunca dé el mismo resultado).
 */
export function getRandomKeyword(exclude?: string): string {
  const options = exclude ? NIGHT_KEYWORDS.filter((word) => word !== exclude) : NIGHT_KEYWORDS;
  const pool = options.length > 0 ? options : NIGHT_KEYWORDS;
  return pool[Math.floor(Math.random() * pool.length)]!;
}
