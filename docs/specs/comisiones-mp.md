# Comisiones de Mercado Pago — registrar el neto real de cada cobro

**Estado**: `draft` · **Fecha**: 2026-07-24

## Problema / Por qué

Cuando un cliente paga $101 con Posnet o QR, a la cuenta de MP del dueño **no entran $101**:
MP descuenta su comisión, que además **varía según el medio** (QR, Point débito, Point crédito),
el plazo de acreditación y promos vigentes. Hoy el sistema registra solo el bruto, así que el
"Facturado" de la noche **no es la plata que le entró al dueño** — para saber eso tiene que ir
a mirar la app de MP cobro por cobro.

**Para qué rol**: el dueño (`admin`) — es información de rentabilidad y conciliación bancaria.
La cajera no cambia nada de su flujo.

**Dato clave que define el enfoque**: MP informa la comisión **real** de cada pago en su API
(`fee_details` / `net_received_amount`). No hay que configurar ni mantener porcentajes: se
registra lo que MP dice de cada cobro concreto.

## Objetivo

1. **Cada cobro MP (Posnet y QR) guarda, además del bruto, la comisión real y el neto
   acreditado** que informa MP para ese pago puntual. Sin tasas hardcodeadas ni configurables.
2. **El bruto sigue siendo el precio de la venta**: es lo que pagó el cliente, lo que dice el
   ticket impreso y lo que cuadra con el arqueo. La comisión es un dato *adicional* del cobro,
   nunca un reemplazo del total.
3. **El cierre de noche y `/admin` muestran los tres números**: Facturado (bruto), Comisiones MP,
   y Neto (lo que efectivamente se acredita). El efectivo participa con comisión $0.
4. **Los cobros ya hechos se completan retroactivamente** (backfill) usando el `payment_id`
   que ya quedó registrado en cada cobro — incluye los de la prueba del boliche del 25-07.

## Historias de usuario

- Como **dueño** quiero ver al cerrar la noche cuánto facturé, cuánto se llevó MP y cuánto me
  entra de verdad, para saber la rentabilidad real sin revisar la app de MP.
- Como **dueño** quiero ver las comisiones discriminadas por medio (Posnet débito/crédito, QR),
  para decidir qué medio conviene incentivar.
- Como **dueño** quiero que los cobros de noches anteriores también tengan su comisión real,
  para que el histórico sea comparable.
- Como **cajera** quiero que nada de esto cambie mi flujo de cobro: cobro el precio de lista
  y listo.

## Criterios de aceptación

- [ ] **Dado** un cobro Posnet aprobado, **cuando** la venta se registra, **entonces** el sistema
  persiste la comisión y el neto que MP informa para ese pago (verificable contra la app de MP,
  centavo a centavo).
- [ ] **Dado** un cobro QR aprobado, **entonces** ídem — cada medio con su comisión real (no se
  asume que QR y Posnet descuentan lo mismo).
- [ ] **Dado** cualquier venta MP registrada, **entonces** su total sigue siendo el bruto: el
  ticket impreso, el arqueo de la noche y la conciliación contra Cloud no cambian de números.
- [ ] **Dado** el cierre de la noche, **entonces** el resumen muestra Facturado / Comisiones MP /
  Neto, con el efectivo sumando comisión $0, y la suma cierra: Neto = Facturado − Comisiones.
- [ ] **Dado** que MP no informa la comisión en el momento del registro (demora o falla de la
  consulta), **entonces** la venta se registra igual con la comisión marcada como *pendiente* y
  se completa después — **nunca** bloquea ni demora un cobro (coherente con local-first/D1).
- [ ] **Dado** el conjunto de cobros MP históricos con `payment_id`, **cuando** se ejecuta el
  backfill, **entonces** cada uno queda con su comisión/neto reales; correrlo de nuevo no
  duplica ni pisa datos ya completos (idempotente).
- [ ] **Dado** el cierre de una noche, **entonces** las comisiones/netos suben a Cloud junto con
  el resto de los datos MP y vuelven en el restore (misma garantía que el PR 5).

## Fuera de alcance

- **Cambiar precios o trasladar la comisión al cliente** (recargos por medio de pago): no.
- **Cálculo impositivo propio** (IIBB, retenciones, percepciones): solo se registra lo que MP
  informe en el pago; ningún cálculo tributario del lado del sistema.
- **Comisiones de medios no-MP**: efectivo no tiene; otros medios no existen hoy.
- **Facturación electrónica / AFIP**: otra feature, otro día.
- **Cobros online de la Fase 7** (Checkout Pro/Bricks): cuando exista ese flujo, esta misma
  estructura debería servirle, pero no se diseña acá.

## Preguntas abiertas

1. **¿Qué incluye exactamente `net_received_amount` en cuentas argentinas?** Verificar contra
   un pago real si el neto de MP ya descuenta retenciones impositivas (IIBB/Ganancias) además
   de la comisión, y decidir si se muestran desglosadas (`fee_details` trae los ítems) o un
   solo número "se llevó MP".
2. **Granularidad en `/admin`**: ¿comisión visible por venta individual, o solo los agregados
   de la noche/historial? (El dato se guarda por cobro igual; la pregunta es solo de UI.)
3. **¿El export PDF del historial suma las columnas Comisiones/Neto?**
4. **Backfill**: ¿botón en `/admin` (una vez) o script de mantenimiento? ¿Se corre también
   automáticamente para completar los *pendientes* del criterio 5?
5. **Migración de cuenta MP** (post-prueba): los `payment_id` viejos pertenecen a la cuenta de
   Manuel — tras migrar al dueño, ¿el backfill de esos cobros puede consultarlos? (El token
   nuevo no ve pagos de otra cuenta; probablemente el backfill deba correrse ANTES de migrar.)

---

> **Timing acordado (2026-07-24)**: se implementa **después** de la prueba del boliche del 25-07
> — no se toca el camino del cobro a horas de esa prueba. No se pierde nada: los `payment_id`
> de la prueba quedan registrados y el backfill los completa retroactivamente.
