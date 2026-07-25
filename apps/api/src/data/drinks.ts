import type { Drink, DrinkCategory } from "@cocktrail/shared";

export const SEED_CATEGORIES: DrinkCategory[] = [
  { id: "tendencias", name: "Tendencias", sortOrder: 1, isSystem: true },
  { id: "cervezas", name: "Cervezas", sortOrder: 2, isSystem: true },
  { id: "vodkas", name: "Vodkas", sortOrder: 3, isSystem: true },
  { id: "whiskys", name: "Whiskys", sortOrder: 4, isSystem: true },
  { id: "gines", name: "Gines", sortOrder: 5, isSystem: true },
  { id: "tequilas-shots", name: "Tequilas & Shots", sortOrder: 6, isSystem: true },
  { id: "jagermeister", name: "Jägermeister", sortOrder: 7, isSystem: true },
  { id: "tragos-aperitivos", name: "Tragos & Aperitivos", sortOrder: 8, isSystem: true },
  { id: "sin-alcohol", name: "Sin Alcohol & Energizantes", sortOrder: 9, isSystem: true },
  { id: "promos-combos", name: "Promos", sortOrder: 10, isSystem: true },
];

type SeedDrink = Omit<Drink, "id"> & { id: number };

function d(
  id: number,
  name: string,
  price: number,
  categoryId: string,
  opts: { iconName?: string; image?: string; promo?: boolean; trending?: boolean; sortOrder?: number } = {},
): SeedDrink {
  return {
    id,
    name,
    price,
    description: "",
    vibe: "",
    flavors: [],
    iconName: opts.iconName ?? "glass-water",
    image: opts.image,
    trending: opts.trending ?? categoryId === "tendencias",
    promo: opts.promo ?? categoryId === "promos-combos",
    available: true,
    categoryId,
    sortOrder: opts.sortOrder ?? 0,
  };
}

/** Carta real (40). Imágenes solo donde ya hay asset en /public. */
export const SEED_DRINKS: SeedDrink[] = [
  d(1, "Andes", 5000, "tendencias", { iconName: "beer", image: "/drinks/andes_origen.webp", sortOrder: 5 }),
  d(2, "Corona", 6000, "tendencias", { iconName: "beer", image: "/drinks/corona.jpg", sortOrder: 4 }),

  d(3, "Vodka con jugo", 7000, "vodkas", { iconName: "zap", image: "/drinks/vodka_jugo.jpg" }),
  d(4, "Vodka con Speed", 8000, "tendencias", { iconName: "zap", image: "/vodka.webp", sortOrder: 1 }),
  d(5, "Absolut con Speed", 11000, "tendencias", { iconName: "zap", image: "/drinks/absolut_speed.webp", sortOrder: 2 }),
  d(6, "Absolut con RedBull", 13000, "vodkas", { iconName: "zap", image: "/drinks/absolut_redbull.jpg" }),

  d(7, "Whisky con coca", 7000, "whiskys", { iconName: "wine", image: "/drinks/whisky_coca.jpg" }),
  d(8, "Whisky Red Label (Medida)", 7000, "whiskys", { iconName: "wine", image: "/drinks/whisky_coca.jpg" }),
  d(9, "Whisky con Speed", 8000, "whiskys", { iconName: "wine", image: "/drinks/whisky_coca.jpg" }),
  d(10, "Whisky Red Label con Speed", 10000, "whiskys", { iconName: "wine", image: "/drinks/whisky_coca.jpg" }),

  d(11, "Gin Fisherman", 7000, "tendencias", { iconName: "martini", image: "/drinks/gin_fisherman.webp", sortOrder: 6 }),
  d(12, "Sur (Sur Gin)", 8000, "gines", { iconName: "martini", image: "/drinks/gin.jpg" }),
  d(13, "Beefeater", 9000, "gines", { iconName: "martini", image: "/drinks/beefeater.jpg" }),
  d(14, "Bombay", 12000, "gines", { iconName: "martini", image: "/drinks/bombay.jpg" }),
  d(15, "Bulldog", 12000, "gines", { iconName: "martini", image: "/drinks/bulldog.jpg" }),

  d(16, "Tequila (Shot)", 2000, "tequilas-shots", { iconName: "cup-soda", image: "/drinks/jose_cuervo.jpg" }),
  d(17, "Jose Cuervo (Shot)", 5000, "tequilas-shots", { iconName: "cup-soda", image: "/drinks/jose_cuervo.jpg" }),
  d(18, "Jagger (Shot)", 5000, "tequilas-shots", { iconName: "cup-soda", image: "/drinks/jagger.jpg" }),

  d(19, "Jagger con pomelo", 10000, "jagermeister", { iconName: "wine", image: "/drinks/jagger.jpg" }),
  d(20, "Jagger con Speed", 11000, "tendencias", { iconName: "wine", image: "/drinks/jagger.jpg", sortOrder: 7 }),
  d(21, "Jagger con RedBull", 12000, "jagermeister", { iconName: "wine", image: "/drinks/jagger.jpg" }),

  d(22, "Fernet", 7000, "tendencias", { image: "/fernacho.webp", sortOrder: 3 }),
  d(23, "Cuba Libre", 7000, "tragos-aperitivos", { image: "/fernacho.webp" }),
  d(24, "Campari", 7000, "tragos-aperitivos", { iconName: "citrus", image: "/drinks/campari.jpg" }),
  d(25, "Gancia", 7000, "tragos-aperitivos", { iconName: "martini", image: "/drinks/gancia.jpg" }),
  d(26, "Aperol con jugo", 8000, "tragos-aperitivos", { iconName: "citrus", image: "/drinks/aperol.jpg" }),
  d(27, "Aperol con Champagne", 9000, "tragos-aperitivos", { iconName: "wine", image: "/drinks/aperol.jpg" }),
  d(28, "Melón con Speed", 8000, "tragos-aperitivos", { iconName: "zap", image: "/vodka.webp" }),
  d(29, "Malibú", 8000, "tragos-aperitivos", { image: "/drinks/malibu.jpg" }),

  d(30, "Agua", 3000, "tendencias", { iconName: "droplet", image: "/drinks/agua_mineral.webp", sortOrder: 9 }),
  d(31, "Gaseosa", 3000, "sin-alcohol", { iconName: "cup-soda", image: "/drinks/whisky_coca.jpg" }),
  d(32, "Speed", 5000, "sin-alcohol", { iconName: "zap", image: "/vodka.webp" }),
  d(33, "RedBull", 6000, "sin-alcohol", { iconName: "zap", image: "/drinks/redbull.jpg" }),

  d(34, "Champagne Renaissance + 2 Speed", 18000, "tendencias", {
    iconName: "wine",
    image: "/drinks/champagne_renaissance_speed.webp",
    sortOrder: 8,
  }),
  d(35, "Champagne Chandon o María + 2 Speed", 48000, "promos-combos", {
    iconName: "wine",
    image: "/drinks/champagne.jpg",
    promo: true,
  }),
  d(36, "Champagne Liason (1.5 L) + 2 Speed", 70000, "promos-combos", {
    iconName: "wine",
    image: "/drinks/champagne.jpg",
    promo: true,
  }),
  d(37, "Champagne Baron B + 2 Speed", 90000, "promos-combos", {
    iconName: "wine",
    image: "/drinks/champagne.jpg",
    promo: true,
  }),
  d(38, "Smirnoff + 6 Speed", 60000, "promos-combos", { iconName: "zap", image: "/vodka.webp", promo: true }),
  d(39, "Fernet + Coca-Cola 2L", 70000, "promos-combos", { image: "/fernacho.webp", promo: true }),
  d(40, "Absolut + 6 Speed", 80000, "promos-combos", { iconName: "zap", image: "/drinks/absolut_redbull.jpg", promo: true }),
];
