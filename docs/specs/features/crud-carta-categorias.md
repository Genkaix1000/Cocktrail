# Especificación Técnica: Reemplazo de Carta Real y Sistema de Categorías con Jerarquía

## 1. Resumen y Objetivos

Esta especificación define el plan para reemplazar la carta de bebidas existente por la **lista real de 40 productos** del boliche, incorporando un sistema dinámico de **Categorías con Jerarquía Numérica** en el CRUD de `/admin` y optimizando la UX de la pantalla de ventas (`/caja`).

### Requisitos Principales:
1. **Reemplazo total de productos**: Vaciar los datos anteriores de la carta e insertar los 40 productos reales con sus precios actuales.
2. **Gestión de Categorías Dinámicas**: Permitir crear, editar y administrar categorías desde el CRUD (incluyendo "Promos", "Tendencias" y categorías personalizadas creadas por el usuario).
3. **Jerarquía Numérica de Categorías (`sortOrder`)**: Cada categoría tendrá un orden de prioridad (`1` = prioridad máxima arriba de todo, `2`, `3`, etc.).
4. **Remoción del Botón "Agregar"**: En las tarjetas de productos, el toque/click sobre la tarjeta añade directamente el ítem al pedido sin necesidad de un botón explícito secundario.
5. **Criterios de Ordenamiento**: Reemplazar las opciones de ordenamiento por: **Categoría (Jerarquía)**, **Alfabético** y **Precio**, con **Categoría** activado por defecto.
6. **Consigna Abierta de Maquetación**: Documentar como consigna de diseño la evaluación entre separar por secciones/títulos o utilizar filtros tipo chips/tabs.

---

## 2. Carta de Productos Reales (40 Ítems)

| Categoría Sugerida | Producto | Precio |
| :--- | :--- | :--- |
| **Cervezas** | Andes | $5.000 |
| **Cervezas** | Corona | $6.000 |
| **Vodkas** | Vodka con jugo | $7.000 |
| **Vodkas** | Vodka con Speed | $8.000 |
| **Vodkas** | Absolut con Speed | $11.000 |
| **Vodkas** | Absolut con RedBull | $13.000 |
| **Whiskys** | Whisky con coca | $7.000 |
| **Whiskys** | Whisky Red Label (Medida) | $7.000 |
| **Whiskys** | Whisky con Speed | $8.000 |
| **Whiskys** | Whisky Red Label con Speed | $10.000 |
| **Gines** | Gin (Trago Estándar) | $7.000 |
| **Gines** | Sur (Sur Gin) | $8.000 |
| **Gines** | Beefeater | $9.000 |
| **Gines** | Bombay | $12.000 |
| **Gines** | Bulldog | $12.000 |
| **Tequilas & Shots** | Tequila (Shot) | $2.000 |
| **Tequilas & Shots** | Jose Cuervo (Shot) | $5.000 |
| **Tequilas & Shots** | Jagger (Shot) | $5.000 |
| **Jägermeister** | Jagger con pomelo | $10.000 |
| **Jägermeister** | Jagger con Speed | $11.000 |
| **Jägermeister** | Jagger con RedBull | $12.000 |
| **Tragos & Aperitivos** | Fernet | $7.000 |
| **Tragos & Aperitivos** | Cuba Libre | $7.000 |
| **Tragos & Aperitivos** | Campari | $7.000 |
| **Tragos & Aperitivos** | Gancia | $7.000 |
| **Tragos & Aperitivos** | Aperol con jugo | $8.000 |
| **Tragos & Aperitivos** | Aperol con Champagne | $9.000 |
| **Tragos & Aperitivos** | Melón con Speed | $8.000 |
| **Tragos & Aperitivos** | Malibú | $8.000 |
| **Sin Alcohol & Energizantes** | Agua | $3.000 |
| **Sin Alcohol & Energizantes** | Gaseosa | $3.000 |
| **Sin Alcohol & Energizantes** | Speed | $5.000 |
| **Sin Alcohol & Energizantes** | RedBull | $6.000 |
| **Promos & Combos** | Champagne Renacer + 2 Speed | $18.000 |
| **Promos & Combos** | Champagne Chandon o María + 2 Speed | $48.000 |
| **Promos & Combos** | Champagne Liason (1.5 L) + 2 Speed | $70.000 |
| **Promos & Combos** | Champagne Baron B + 2 Speed | $90.000 |
| **Promos & Combos** | Smirnoff + 6 Speed | $60.000 |
| **Promos & Combos** | Fernet + Coca-Cola 2L | $70.000 |
| **Promos & Combos** | Absolut + 6 Speed | $80.000 |

---

## 3. Modelo de Datos y Categorías con Jerarquía (`sortOrder`)

### 3.1 Estructura de Categoría (`DrinkCategory`)
```ts
export interface DrinkCategory {
  id: string;
  name: string;
  sortOrder: number; // 1 = máxima prioridad (arriba de todo)
  isSystem?: boolean;
}
```

### 3.2 Integración en `Drink`
Cada bebida se vincula a su categoría asignada (`category` o `categoryId`).

---

## 4. Cambios en el CRUD (`/admin` -> Carta)

1. **Gestión de Categorías**:
   - Interfaz en la sección de Carta para crear y administrar categorías.
   - Posibilidad de definir y modificar el número de jerarquía (`sortOrder`).
2. **Formulario de Creación/Edición de Bebidas**:
   - Selector dropdown desplegable con las categorías disponibles.
3. **Ordenamiento de Vista**:
   - Criterios disponibles: **Categoría (Jerarquía)**, **Alfabético**, **Precio**.
   - Por defecto: **Categoría** (`sortOrder` ascendente).

---

## 5. Cambios en la Experiencia de Venta (`/caja`)

1. **Eliminación del Botón "Agregar"**:
   - Se retira el botón explícito de las tarjetas. Al presionar directamente sobre cualquier parte del ítem, se añade automáticamente al carrito.
2. **Ordenamiento de Productos**:
   - Los productos se despliegan automáticamente agrupados/ordenados según la jerarquía de su categoría.

---

## 6. Maquetación Visual (caja)

> ✅ **Decisión**: secciones con título por categoría, ordenadas por `sortOrder`.
> Tendencias / Promos son categorías normales (no etiquetas booleanas).
> El editor de categorías en admin es un panel lateral con drag & drop horizontal.
