import dressesImage from "@assets/glam-me-12_1787653559644.png";
import coOrdsImage from "@assets/glam-me-5_1787653559643.png";
import occasionImage from "@assets/glam-me-6_1787653559644.png";
import accessoriesImage from "@assets/glam-me-4_1787653559643.png";
import denimImage from "@assets/glam-me-2_1787653559644.png";
import lunaProductImage from "@assets/glam-me-3_1787655646452.png";
import milaProductImage from "@assets/glam-me-7_1787655646453.png";
import ellaProductImage from "@assets/glam-me-1_1787655646453.png";
import weddingProductImage from "@assets/glam-me-10_1787655658624.png";
import weekendProductImage from "@assets/glam-me-11_1787655658625.png";
import dayOutProductImage from "@assets/glam-me-8_1787655658625.png";
import dateNightProductImage from "@assets/glam-me-9_1787655658625.png";

export type CatalogVariation = {
  id: number;
  size: string;
  colour: string;
  sku: string;
  price: string;
  stock: number;
};

export type CatalogProduct = {
  id: number;
  name: string;
  category: string;
  price: string;
  stock: number;
  status: "Published" | "Draft";
  type: "Simple" | "Variable";
  description: string;
  sku: string;
  image: string;
  position: string;
  variations: CatalogVariation[];
};

export type CatalogCategory = {
  id: number;
  name: string;
  image: string;
  description: string;
};

function getPriceAmount(value: string | number) {
  const amount = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function formatCatalogPrice(value: string | number) {
  const amount = getPriceAmount(value);
  return amount === null
    ? ""
    : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
}

export function getCatalogPriceInput(value: string | number) {
  const amount = getPriceAmount(value);
  return amount === null ? "" : String(amount);
}

export const catalogCategories: CatalogCategory[] = [
  { id: 1, name: "Dresses", image: dressesImage, description: "From day dates to after dark." },
  { id: 2, name: "Occasion", image: occasionImage, description: "For weddings, parties, and special plans." },
  { id: 3, name: "Co-Ords", image: coOrdsImage, description: "Effortless matching sets made to wear." },
  { id: 4, name: "Denim", image: denimImage, description: "Everyday staples with a fresh season twist." },
  { id: 5, name: "Accessories", image: accessoriesImage, description: "The finishing touch to every look." },
];

export const catalogProducts: CatalogProduct[] = [
  {
    id: 101,
    name: "Luna Ruffle Mini Dress",
    category: "Dresses",
    price: "£49.99",
    stock: 14,
    status: "Published",
    type: "Simple",
    description: "A soft pink ruffle mini dress made for your next lovely plan.",
    sku: "GM-LUNA",
    image: lunaProductImage,
    position: "50% 50%",
    variations: [],
  },
  {
    id: 102,
    name: "Ella Tailored Jumpsuit",
    category: "Co-Ords",
    price: "£59.99",
    stock: 8,
    status: "Published",
    type: "Simple",
    description: "A sharp black tailored jumpsuit for plans that call for confidence.",
    sku: "GM-ELLA",
    image: ellaProductImage,
    position: "50% 50%",
    variations: [],
  },
  {
    id: 103,
    name: "Mila Satin Maxi Dress",
    category: "Occasion",
    price: "£44.99",
    stock: 6,
    status: "Published",
    type: "Simple",
    description: "A softly draped blue satin maxi for evenings worth dressing up for.",
    sku: "GM-MILA",
    image: milaProductImage,
    position: "50% 50%",
    variations: [],
  },
  {
    id: 104,
    name: "Wedding Guest Satin Dress",
    category: "Occasion",
    price: "£89.99",
    stock: 9,
    status: "Published",
    type: "Simple",
    description: "A luminous yellow satin dress for weddings and very special plans.",
    sku: "GM-WEDDING",
    image: weddingProductImage,
    position: "50% 50%",
    variations: [],
  },
  {
    id: 105,
    name: "Weekend Plans Sculpted Top",
    category: "Co-Ords",
    price: "£39.99",
    stock: 11,
    status: "Published",
    type: "Simple",
    description: "A chocolate sculpted top that brings polish to easy weekend looks.",
    sku: "GM-WEEKEND",
    image: weekendProductImage,
    position: "50% 50%",
    variations: [],
  },
  {
    id: 106,
    name: "Day Out Floral Jumpsuit",
    category: "Dresses",
    price: "£69.99",
    stock: 10,
    status: "Published",
    type: "Simple",
    description: "A bright floral one-piece for sunny days and spontaneous plans.",
    sku: "GM-DAYOUT",
    image: dayOutProductImage,
    position: "50% 50%",
    variations: [],
  },
  {
    id: 107,
    name: "Date Night Satin Halter Dress",
    category: "Occasion",
    price: "£79.99",
    stock: 7,
    status: "Published",
    type: "Simple",
    description: "A rich red satin halter dress designed to turn heads after dark.",
    sku: "GM-DATE",
    image: dateNightProductImage,
    position: "50% 50%",
    variations: [],
  },
];