import dressesImage from "@assets/glam-me-12_1787653559644.webp";
import coOrdsImage from "@assets/glam-me-5_1787653559643.webp";
import occasionImage from "@assets/glam-me-6_1787653559644.webp";
import accessoriesImage from "@assets/glam-me-4_1787653559643.webp";
import denimImage from "@assets/glam-me-2_1787653559644.webp";
import lunaProductImage from "@assets/glam-me-3_1787655646452.webp";
import milaProductImage from "@assets/glam-me-7_1787655646453.webp";
import ellaProductImage from "@assets/glam-me-1_1787655646453.webp";
import weddingProductImage from "@assets/glam-me-10_1787655658624.webp";
import weekendProductImage from "@assets/glam-me-11_1787655658625.webp";
import dayOutProductImage from "@assets/glam-me-8_1787655658625.webp";
import dateNightProductImage from "@assets/glam-me-9_1787655658625.webp";
import militaryStyleJacketImage from "@assets/military-style-jacket.webp";
import meshFloralSleeveTracksuitImage from "@assets/mesh-floral-sleeve-tracksuit.jpg";
import printedAysemetricTracksuitImage from "@assets/printed-aysemetric-tracksuit.jpg";
import denimTrimRibbedCardiganImage from "@assets/denim-trim-ribbed-cardigan.jpg";
import aysemetricSequinDressImage from "@assets/aysemetric-sequin-dress.jpeg";
import doubledBreastedKnitBeltDressImage from "@assets/doubled-breasted-knit-belt-dress.webp";
import daisyEmbellishedKnitDressImage from "@assets/daisy-embellished-knit-dress.webp";
import goldButtonWaistCoatTrouserSetImage from "@assets/gold-button-waist-coat-trouser-set.jpeg";

export type CatalogVariation = {
  id: number;
  size: string;
  colour: string;
  /** Values for named attributes (including custom attributes). Legacy size/colour remain canonical. */
  attributes?: Record<string, string>;
  sku: string;
  price: string;
  stock: number;
};

export type CatalogProduct = {
  id: number;
  slug: string;
  name: string;
  category: string;
  price: string;
  salePrice?: string;
  stock: number;
  status: "Published" | "Draft";
  type: "Simple" | "Variable";
  description: string;
  longDescription?: string;
  fitAndSize?: string;
  deliveryAndReturns?: string;
  careDetails?: string;
  sku: string;
  image: string;
  position: string;
  galleryImages?: string[];
  /** Ordered attribute keys. Built-ins use size and colour; any other key is a custom attribute name. */
  variationAttributes?: string[];
  variations: CatalogVariation[];
};

export type CatalogCategory = {
  id: number;
  name: string;
  image: string;
  description: string;
  parentId?: number | null;
};

const catalogMediaDatabaseName = "glam-too-catalog-media";
const catalogMediaStoreName = "images";
const catalogMediaReferencePrefix = "glam-too-media:";
const catalogMediaCache = new Map<string, string>();

function isDataImage(value: string) {
  return value.startsWith("data:image/");
}

function mediaReference(productId: number) {
  const mediaId = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${catalogMediaReferencePrefix}${productId}:${mediaId}`;
}

function openCatalogMediaDatabase(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.reject(new Error("Browser image storage is unavailable."));
  }
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(catalogMediaDatabaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(catalogMediaStoreName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Browser image storage is unavailable."));
    request.onblocked = () => reject(new Error("Browser image storage is busy."));
  });
}

function dataImageToBlob(value: string) {
  const [header, encoded] = value.split(",", 2);
  const mimeType = header.match(/^data:([^;]+);base64$/)?.[1];
  if (!mimeType || !encoded) throw new Error("The uploaded image could not be stored.");
  const binary = window.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function catalogMediaStorageError() {
  return new Error(
    "Product media could not be saved in this browser. Your product details are still open. Free some browser storage or use smaller images, then try again.",
  );
}

export function isCatalogMediaReference(value: string) {
  return value.startsWith(catalogMediaReferencePrefix);
}

export function isCatalogStorageObject(value: string) {
  return value.startsWith("/objects/");
}

export async function persistCatalogProductMedia(product: CatalogProduct): Promise<CatalogProduct> {
  const image = product.image.trim();
  const galleryImages = (product.galleryImages ?? []).map((galleryImage) => galleryImage.trim()).filter(Boolean);
  const storedImage = isDataImage(image) ? mediaReference(product.id) : image;
  const storedGalleryImages = galleryImages.map((galleryImage) =>
    isDataImage(galleryImage) ? mediaReference(product.id) : galleryImage,
  );
  const mediaToStore: Array<{ value: string; reference: string }> = [];
  if (isDataImage(image)) mediaToStore.push({ value: image, reference: storedImage });
  galleryImages.forEach((galleryImage, index) => {
    if (isDataImage(galleryImage)) {
      mediaToStore.push({ value: galleryImage, reference: storedGalleryImages[index] });
    }
  });
  if (mediaToStore.length === 0) return product;

  let database: IDBDatabase | undefined;
  try {
    database = await openCatalogMediaDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database!.transaction(catalogMediaStoreName, "readwrite");
      const store = transaction.objectStore(catalogMediaStoreName);
      mediaToStore.forEach(({ value, reference }) => {
        store.put(dataImageToBlob(value), reference);
        catalogMediaCache.set(reference, value);
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("The image could not be stored."));
      transaction.onabort = () => reject(transaction.error ?? new Error("The image could not be stored."));
    });
    database.close();
  } catch {
    database?.close();
    throw catalogMediaStorageError();
  }

  return {
    ...product,
    image: storedImage,
    galleryImages: storedGalleryImages,
  };
}

export async function hydrateCatalogProductMedia(products: Array<Pick<CatalogProduct, "image" | "galleryImages">>) {
  const references = [...new Set(products.flatMap((product) => [
    product.image,
    ...(product.galleryImages ?? []),
  ]).filter(isCatalogMediaReference))];
  if (references.length === 0) return;

  let database: IDBDatabase | undefined;
  try {
    database = await openCatalogMediaDatabase();
    const storedMedia = await Promise.all(references.map((reference) => new Promise<{ reference: string; blob: Blob | undefined }>((resolve, reject) => {
      const transaction = database!.transaction(catalogMediaStoreName, "readonly");
      const request = transaction.objectStore(catalogMediaStoreName).get(reference);
      request.onsuccess = () => resolve({ reference, blob: request.result as Blob | undefined });
      request.onerror = () => reject(request.error);
    })));
    storedMedia.forEach(({ reference, blob }) => {
      if (blob) catalogMediaCache.set(reference, URL.createObjectURL(blob));
    });
    database.close();
  } catch {
    database?.close();
  }
}

export function getCatalogMediaSource(value: string) {
  if (isCatalogStorageObject(value)) return `/api/storage${value}`;
  return catalogMediaCache.get(value) ?? (isCatalogMediaReference(value) ? "" : value);
}

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

export function createProductSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getCatalogProductImages(product: Pick<CatalogProduct, "image" | "galleryImages">) {
  const primaryImage = typeof product.image === "string" ? getCatalogMediaSource(product.image.trim()) : "";
  const galleryImages = Array.isArray(product.galleryImages)
    ? product.galleryImages
      .filter((image): image is string => typeof image === "string" && image.trim().length > 0)
      .map((image) => getCatalogMediaSource(image.trim()))
    : [];
  const supportingImages = [...new Set(galleryImages)].filter((image) => image !== primaryImage);
  return primaryImage ? [primaryImage, ...supportingImages] : supportingImages;
}

export const catalogCategories: CatalogCategory[] = [
  { id: 1, name: "New In", image: dressesImage, description: "The latest arrivals at Glam Too Boutique.", parentId: null },
  { id: 2, name: "Clothes", image: coOrdsImage, description: "Outfits for every plan.", parentId: null },
  { id: 3, name: "Handbags", image: accessoriesImage, description: "Stunning handbags for every occasion.", parentId: null },
  { id: 4, name: "Purses", image: accessoriesImage, description: "Chic purses and everyday essentials.", parentId: null },
  { id: 5, name: "Jewellery", image: occasionImage, description: "Finishing touches for every look.", parentId: null },
  { id: 201, name: "Dresses", image: dressesImage, description: "From day dates to after dark.", parentId: 2 },
  { id: 202, name: "Tops", image: coOrdsImage, description: "Polished tops for effortless styling.", parentId: 2 },
  { id: 203, name: "Trousers", image: denimImage, description: "Everyday and occasion-ready trousers.", parentId: 2 },
  { id: 204, name: "Co-ords", image: coOrdsImage, description: "Effortless matching sets made to wear.", parentId: 2 },
  { id: 205, name: "Jumpsuits", image: occasionImage, description: "One-piece outfits made to stand out.", parentId: 2 },
  { id: 206, name: "Coats", image: militaryStyleJacketImage, description: "Polished layers for cooler days.", parentId: 2 },
  { id: 501, name: "Necklace", image: accessoriesImage, description: "Necklaces to complete your look.", parentId: 5 },
  { id: 502, name: "Earrings", image: accessoriesImage, description: "Statement and everyday earrings.", parentId: 5 },
  { id: 503, name: "Bracelet", image: accessoriesImage, description: "Chic bracelets for every style.", parentId: 5 },
  { id: 504, name: "Watches", image: accessoriesImage, description: "Stylish watches for every day.", parentId: 5 },
];

export const catalogProducts: CatalogProduct[] = [
  {
    id: 101,
    slug: "luna-ruffle-mini-dress",
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
    slug: "ella-tailored-jumpsuit",
    name: "Ella Tailored Jumpsuit",
    category: "Jumpsuits",
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
    slug: "mila-satin-maxi-dress",
    name: "Mila Satin Maxi Dress",
    category: "Dresses",
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
    slug: "wedding-guest-satin-dress",
    name: "Wedding Guest Satin Dress",
    category: "Dresses",
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
    slug: "weekend-plans-sculpted-top",
    name: "Weekend Plans Sculpted Top",
    category: "Tops",
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
    slug: "day-out-floral-jumpsuit",
    name: "Day Out Floral Jumpsuit",
    category: "Jumpsuits",
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
    slug: "date-night-satin-halter-dress",
    name: "Date Night Satin Halter Dress",
    category: "Dresses",
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
  {
    id: 108,
    slug: "military-style-jacket",
    name: "Military Style Jacket",
    category: "Coats",
    price: "£35.99",
    stock: 4,
    status: "Published",
    type: "Variable",
    description: "White Military Style Jacket",
    longDescription: "A knit jacket featuring a classic military-inspired design with button detailing and a front zip fastening. Pair it with jeans, trousers or a skirt for an effortlessly polished style, ideal for casual days or dressing up.",
    sku: "GM-MILITARY",
    image: militaryStyleJacketImage,
    position: "50% 50%",
    variationAttributes: ["size"],
    variations: [
      { id: 1081, size: "S/M", colour: "", sku: "GM-MILITARY-SM", price: "£35.99", stock: 2 },
      { id: 1082, size: "M/L", colour: "", sku: "GM-MILITARY-ML", price: "£35.99", stock: 2 },
    ],
  },
  {
    id: 109,
    slug: "mesh-floral-sleeve-tracksuit",
    name: "Mesh Floral Sleeve Tracksuit",
    category: "Co-ords",
    price: "£39.99",
    stock: 3,
    status: "Published",
    type: "Simple",
    description: "Mesh Floral Sleeve Tracksuit",
    sku: "GM-MESH-FLORAL",
    image: meshFloralSleeveTracksuitImage,
    position: "50% 50%",
    variations: [],
  },
  {
    id: 110,
    slug: "printed-aysemetric-tracksuit",
    name: "Printed Aysemetric Tracksuit",
    category: "Co-ords",
    price: "£29.99",
    stock: 3,
    status: "Published",
    type: "Simple",
    description: "Printed Aysemetric Tracksuit",
    sku: "GM-PRINTED-AYSEMETRIC",
    image: printedAysemetricTracksuitImage,
    position: "50% 50%",
    variations: [],
  },
  {
    id: 111,
    slug: "denim-trim-ribbed-cardigan",
    name: "Denim Trim Ribbed Cardigan",
    category: "Tops",
    price: "£19.99",
    stock: 4,
    status: "Published",
    type: "Simple",
    description: "Denim Trim Ribbed Cardigan",
    sku: "GM-DENIM-TRIM-CARDIGAN",
    image: denimTrimRibbedCardiganImage,
    position: "50% 50%",
    variations: [],
  },
  {
    id: 112,
    slug: "aysemetric-sequin-dress",
    name: "Aysemetric Sequin Dress",
    category: "Dresses",
    price: "£29.99",
    stock: 4,
    status: "Published",
    type: "Variable",
    description: "Black Asymmetric Satin And Sequin Dress",
    longDescription: "A glamorous satin and sequin asymmetric dress featuring a sleek, figure-flattering silhouette. The luxurious satin fabric creates an elegant, fluid drape, while shimmering sequin detailing adds a touch of sparkle and sophistication.",
    sku: "GM-AYSEMETRIC-SEQUIN",
    image: aysemetricSequinDressImage,
    position: "50% 50%",
    variationAttributes: ["size"],
    variations: [
      { id: 1121, size: "S/M", colour: "", sku: "GM-AYSEMETRIC-SEQUIN-SM", price: "£29.99", stock: 2 },
      { id: 1122, size: "M/L", colour: "", sku: "GM-AYSEMETRIC-SEQUIN-ML", price: "£29.99", stock: 2 },
    ],
  },
  {
    id: 113,
    slug: "doubled-breasted-knit-belt-dress",
    name: "Doubled Breasted Knit Belt Dress",
    category: "Dresses",
    price: "£34.99",
    stock: 4,
    status: "Published",
    type: "Simple",
    description: "Black Double Breasted Belt Long Dress",
    longDescription: "Double Breasted Knit Long Dress, a timeless piece blending structure, elegance, and comfort. Crafted from premium stretch knit fabric, this dress features a double-breasted button design, notched lapel collar, and waist-defining belt for a sophisticated, tailored silhouette.",
    sku: "GM-DOUBLED-BREASTED-KNIT",
    image: doubledBreastedKnitBeltDressImage,
    position: "50% 50%",
    variations: [],
  },
  {
    id: 114,
    slug: "daisy-embellished-knit-dress",
    name: "Daisy Embellished Knit Dress",
    category: "Dresses",
    price: "£34.99",
    stock: 4,
    status: "Published",
    type: "Simple",
    description: "Black Daisy Embellished Knit Dress",
    longDescription: "Add a touch of charm to your knitwear collection with this daisy embellished midi knit dress. It features delicate daisy trims at the neckline and cuffs, button-through front detail, and a pleated skirt for a flattering finish.",
    sku: "GM-DAISY-EMBELLISHED-KNIT",
    image: daisyEmbellishedKnitDressImage,
    position: "50% 50%",
    variations: [],
  },
  {
    id: 115,
    slug: "gold-button-waist-coat-and-trouser-set",
    name: "Gold Button Waist Coat And Trouser Set",
    category: "Co-ords",
    price: "£39.99",
    stock: 3,
    status: "Published",
    type: "Simple",
    description: "Black Sleeveless Belted Waistcoat And Wide Leg Trousers",
    longDescription: "Elevate your everyday wardrobe with this effortlessly chic two-piece co-ord set, designed for comfort without compromising style. Crafted in rich black, this matching set features a relaxed sleeveless top with a waisted belt. The coordinating wide-leg trousers sit comfortably with an elasticated waistband and adjustable drawstring, offering an easy, laid-back fit.",
    sku: "GM-GOLD-BUTTON-WAISTCOAT-SET",
    image: goldButtonWaistCoatTrouserSetImage,
    position: "50% 50%",
    variations: [],
  },
];