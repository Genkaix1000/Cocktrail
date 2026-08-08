/**
 * Única fuente de verdad de "¿la noche activa es de prueba?".
 *
 * Guarda el **id** de la noche de prueba y no un booleano: si el contexto quedara pegado
 * (un cierre que falla, un bug), una noche nueva jamás matchea contra ese id y las escrituras
 * van a Supabase como corresponde. Un booleano pegado, en cambio, mandaría una noche real
 * entera a la memoria del proceso y se perdería toda la facturación.
 */
export class TestNightContext {
  private activeTestNightId: string | null = null;

  set(id: string): void {
    this.activeTestNightId = id;
  }

  clear(): void {
    this.activeTestNightId = null;
  }

  getActiveId(): string | null {
    return this.activeTestNightId;
  }

  /**
   * Con `id`: ¿ese id es el de la noche de prueba activa? (lo que usan los decoradores).
   * Sin `id`: ¿hay alguna noche de prueba activa? (lo que usan los call-sites que no
   * tienen la noche a mano, como el `logAction` de orders.controller).
   */
  isTestNight(id?: string | null): boolean {
    if (this.activeTestNightId === null) return false;
    if (id === undefined || id === null) return true;
    return this.activeTestNightId === id;
  }
}
