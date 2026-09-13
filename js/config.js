/* Configuración pública. Nunca agregues aquí una service_role key o una contraseña. */
const STORE_CONFIG = {
  storeName: "GenStore",
  whatsappNumber: "5493624269130",
  genericMessage: "Hola GenStore. Quiero consultar por termos y accesorios disponibles.",
  recommendationMessage: "Hola GenStore. Necesito ayuda para elegir un termo. ¿Me recomiendan una opción?",
  productMessage: "Hola GenStore. Quiero comprar {product} ({price}). ¿Me confirman disponibilidad y entrega?",
  supabaseUrl: "https://oynglftyzyzxghvnkwxb.supabase.co",
  supabasePublishableKey: "sb_publishable_WhLQuZPnJocu5ej3-pnapw_W8ASFml6",
  hiddenProductSlugs: ["bombilla-premium-13e0b8ce"],
  socialLinks: {
    instagram: "",
    facebook: "",
    tiktok: ""
  }
};

function buildWhatsAppLink(message) {
  const number = String(STORE_CONFIG.whatsappNumber || "").replace(/\D/g, "");
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : "#";
}
