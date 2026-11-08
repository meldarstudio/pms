export const phoneNumber = "+51992755015";
export const propertyTimeZone = "America/Lima";
export const whatsappUrl = `https://wa.me/${phoneNumber.replace(/\D/g, "")}`;
export const mapsUrl = "https://maps.app.goo.gl/VRMLhAwTrUtkv7tD9";
export const address = "Av. Víctor Larco Herrera N°138, Churín";
export const email = "hotelmanantialchurinperu@gmail.com";
export const taxId = "20552108028";
export const legalName = "Hotel Manantial de Churin E.I.R.L.";
export const latitude = -10.80932228934143;
export const longitude = -76.87778522463007;

export function getWhatsAppLink(text: string) {
  return `${whatsappUrl}?text=${encodeURIComponent(text)}`;
}
