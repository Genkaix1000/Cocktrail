import { describe, expect, it } from "vitest";
import { evaluateDrinkSchedule, isWithinScheduleWindow, type Drink } from "@cocktrail/shared";

function drink(partial: Partial<Drink> = {}): Drink {
  return {
    id: 1,
    name: "Promo",
    price: 1000,
    description: "",
    vibe: "",
    flavors: [],
    iconName: "glass-water",
    trending: false,
    available: true,
    categoryId: "tendencias",
    scheduleEnabled: true,
    scheduleFrom: "22:00",
    scheduleUntil: "03:00",
    scheduleHideWhenExpired: false,
    scheduleMoveToCategoryId: "promos-combos",
    scheduleRepeatNextEvent: false,
    scheduleConsumed: false,
    ...partial,
  };
}

describe("isWithinScheduleWindow", () => {
  it("cruza medianoche", () => {
    expect(isWithinScheduleWindow("22:00", "03:00", new Date(2026, 0, 1, 23, 0))).toBe(true);
    expect(isWithinScheduleWindow("22:00", "03:00", new Date(2026, 0, 1, 2, 0))).toBe(true);
    expect(isWithinScheduleWindow("22:00", "03:00", new Date(2026, 0, 1, 12, 0))).toBe(false);
  });
});

describe("evaluateDrinkSchedule", () => {
  it("en ventana: normal en categoría original", () => {
    const s = evaluateDrinkSchedule(drink(), new Date(2026, 0, 1, 23, 0));
    expect(s).toEqual({
      inWindow: true,
      visible: true,
      gray: false,
      effectiveCategoryId: "tendencias",
    });
  });

  it("fuera de ventana: gris + move", () => {
    const s = evaluateDrinkSchedule(drink(), new Date(2026, 0, 1, 12, 0));
    expect(s.gray).toBe(true);
    expect(s.visible).toBe(true);
    expect(s.effectiveCategoryId).toBe("promos-combos");
  });

  it("hide saca de la lista", () => {
    const s = evaluateDrinkSchedule(
      drink({ scheduleHideWhenExpired: true }),
      new Date(2026, 0, 1, 12, 0),
    );
    expect(s.visible).toBe(false);
  });

  it("consumed sin repeat queda vencida aunque esté en horario", () => {
    const s = evaluateDrinkSchedule(
      drink({ scheduleConsumed: true, scheduleRepeatNextEvent: false }),
      new Date(2026, 0, 1, 23, 0),
    );
    expect(s.gray).toBe(true);
  });
});
