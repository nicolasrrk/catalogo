/*
 * Contenido visual local. Precio y stock llegan desde Supabase.
 * Las claves aceptan una parte del nombre para poder sumar galerías sin tocar la base.
 */
const PRODUCT_MEDIA = [
  {
    match: "QUENCHER ANTO",
    images: ["assets/quencheranto1.jpg", "assets/quencheranto2.jpg", "assets/quencheranto3.jpg"]
  }
];

const FALLBACK_PRODUCTS = [
  {
    slug: "quencher-anto",
    name: "QUENCHER ANTO",
    category: "Vasos",
    price: 37000,
    stock: 0,
    updated_at: null
  }
];

const CATEGORY_DESCRIPTIONS = {
  Termos: "Construcción resistente y formato cómodo para acompañar el mate, el trabajo o el viaje.",
  Mates: "Una pieza práctica para disfrutar tu ronda de todos los días.",
  Vasos: "Diseñado para llevar tu bebida con comodidad y estilo.",
  Quencher: "Gran capacidad, manija cómoda y formato pensado para mantenerte hidratado.",
  Botellas: "Formato portátil y resistente para el uso diario.",
  Cafeteros: "Una opción práctica para servir y compartir bebidas calientes.",
  Bombillas: "El complemento para completar tu equipo matero.",
  Sartenes: "Utensilio resistente para sumar a tu cocina."
};
