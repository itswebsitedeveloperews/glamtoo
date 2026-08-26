export type CheckoutCatalogProduct = {
  id: string;
  name: string;
  description: string;
  unitAmount: number;
};

export const checkoutCatalog: Record<string, CheckoutCatalogProduct> = {
  "101": { id: "101", name: "Luna Ruffle Mini Dress", description: "A soft pink ruffle mini dress made for your next lovely plan.", unitAmount: 4999 },
  "102": { id: "102", name: "Ella Tailored Jumpsuit", description: "A sharp black tailored jumpsuit for plans that call for confidence.", unitAmount: 5999 },
  "103": { id: "103", name: "Mila Satin Maxi Dress", description: "A softly draped blue satin maxi for evenings worth dressing up for.", unitAmount: 4499 },
  "104": { id: "104", name: "Wedding Guest Satin Dress", description: "A luminous yellow satin dress for weddings and very special plans.", unitAmount: 8999 },
  "105": { id: "105", name: "Weekend Plans Sculpted Top", description: "A chocolate sculpted top that brings polish to easy weekend looks.", unitAmount: 3999 },
  "106": { id: "106", name: "Day Out Floral Jumpsuit", description: "A bright floral one-piece for sunny days and spontaneous plans.", unitAmount: 6999 },
  "107": { id: "107", name: "Date Night Satin Halter Dress", description: "A rich red satin halter dress designed to turn heads after dark.", unitAmount: 7999 },
};