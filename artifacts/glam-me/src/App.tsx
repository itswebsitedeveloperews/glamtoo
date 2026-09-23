import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import fashionImage from '@assets/glam-me-20260814-final-v2_1787646629461.webp';
import logoImage from '@assets/glam_me_logo_1787652435373.svg';
import heroImage from '@assets/glam-me-home-banner_1787651354578.webp';
import aboutHeroImage from '@assets/about_banner_1789035643721.webp';
import aboutStudioImage from '@assets/glam-me-5_1787653559643.webp';
import aboutStoryImage from '@assets/glam-me-12_1787653559644.webp';
import { catalogCategories, catalogProducts, createProductSlug, formatCatalogPrice, getCatalogMediaSource, getCatalogProductImages, hydrateCatalogProductMedia, type CatalogCategory, type CatalogProduct } from '@/data/catalog';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useSignIn, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ChevronDown, ZoomIn, Clock, CreditCard, Headphones, HelpCircle, LayoutDashboard, LogOut, Mail, MapPin, MessageSquare, Phone, RefreshCcw, Ruler, Search, ShoppingBag, Sparkles, Truck, UserRound, X, type LucideIcon } from 'lucide-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useSearch } from 'wouter';
import { useSubmitContactEnquiry } from '@workspace/api-client-react';
import NotFound from '@/pages/not-found';
import AdminDashboard from '@/pages/admin-dashboard';
import { hasRichTextContent, sanitizeRichTextHtml } from '@/utils/rich-text';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#e23d6f',
    colorForeground: '#171615',
    colorMutedForeground: '#716a67',
    colorDanger: '#b42342',
    colorBackground: '#fffdfb',
    colorInput: '#f5f1ed',
    colorInputForeground: '#171615',
    colorNeutral: '#d8d0ca',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '0px',
  },
  elements: {
    rootBox: { width: '100%', display: 'flex', justifyContent: 'center' },
    cardBox: { width: '440px', maxWidth: '100%', overflow: 'hidden', background: '#fffdfb', border: '1px solid #d8d0ca', borderRadius: '0px', boxShadow: '12px 12px 0 rgba(23, 22, 21, .08)' },
    card: { border: '0', background: 'transparent', borderRadius: '0px', boxShadow: 'none' },
    footer: { border: '0', background: 'transparent', borderRadius: '0px', boxShadow: 'none' },
    headerTitle: { color: '#171615' },
    headerSubtitle: { color: '#716a67' },
    formFieldLabel: { color: '#171615' },
    footerActionLink: { color: '#e23d6f' },
    footerActionText: { color: '#716a67' },
    dividerText: { color: '#716a67' },
    formButtonPrimary: { background: '#e23d6f', borderRadius: '0px' },
    formFieldInput: { background: '#f5f1ed', color: '#171615', borderRadius: '0px' },
    socialButtonsBlockButton: { borderRadius: '0px' },
    socialButtonsBlockButtonText: { color: '#171615' },
    dividerLine: { background: '#d8d0ca' },
    logoImage: { height: 'auto', width: '142px' },
  },
};

const adminProductsStorageKey = 'glam-me-admin-products-v4';
const adminCategoriesStorageKey = 'glam-me-admin-categories-v2';
const cartStorageKey = 'glam-me-cart-v1';
const pendingCouponPaymentStorageKey = 'glam-me-pending-coupon-payment-v1';
const checkoutPreferencesStorageKey = 'glam-me-checkout-preferences-v1';
const inventoryStorageKey = 'glam-me-live-inventory-v1';
const wishlistStorageKey = 'glam-me-wishlist-v1';
const standardDeliveryAmount = 3.95;
const expressDeliveryAmount = 6.95;
const freeStandardDeliveryThreshold = 75;
let sharedCatalog: { products: CatalogProduct[]; categories: CatalogCategory[] } | null = null;

type CartItem = {
  productId: number;
  size: string;
  colour?: string;
  variationId?: number;
  options?: Record<string, string>;
  quantity: number;
};

type CustomerOrder = {
  id: string;
  placedAt: string | null;
  status: string;
  paymentStatus?: string;
  paymentResolution?: "none" | "refund_pending" | "refund_processing" | "refunded" | "manual_resolution";
  paymentResolutionReason?: "inventory_reallocated" | "coupon_reallocated" | "inventory_and_coupon_reallocated" | null;
  paymentResolvedAt?: string | null;
  total: number;
  currency: string;
  email: string;
  couponCode?: string | null;
  discountAmount?: number;
  subtotal?: number;
  deliveryAmount?: number;
  vatAmount?: number;
  delivery: {
    method: string;
    name: string;
    address: {
      line1: string;
      line2: string;
      city: string;
      postcode: string;
      country: string;
    };
  };
  items: Array<{
    name: string;
    productId: string | null;
    variationId?: string | null;
    quantity: number;
    total: number;
  }>;
};

type AccountSection = "dashboard" | "orders" | "addresses" | "payment-methods" | "account-details";

type CustomerProfile = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  country: string;
};

type SavedPaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

type AppliedCoupon = {
  coupon: {
    code: string;
    discountType: "percentage" | "fixed";
    discountValue: number;
  };
  discountAmount: number;
  total: number;
  vatAmount: number;
  deliveryAmount: number;
};

type CheckoutPreferences = {
  delivery?: string;
  couponCode?: string;
};

type WishlistContextValue = {
  productIds: number[];
  count: number;
  isLoading: boolean;
  error: string;
  notice: string;
  isSaved: (productId: number) => boolean;
  isPending: (productId: number) => boolean;
  toggleProduct: (productId: number, productName: string) => Promise<void>;
  removeProduct: (productId: number, productName: string) => Promise<void>;
  moveProductToCart: (productId: number, productName: string, addToCart: () => boolean) => Promise<void>;
};

const emptyCustomerProfile: CustomerProfile = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postcode: "",
  country: "GB",
};

type StripeCardElement = {
  mount: (target: HTMLElement) => void;
  destroy: () => void;
  on: (event: 'change', listener: (event: { error?: { message?: string } }) => void) => void;
};

type StripeJs = {
  elements: () => { create: (type: 'card', options?: Record<string, unknown>) => StripeCardElement };
  confirmCardPayment: (
    clientSecret: string,
    data: {
      payment_method: string | {
        card: StripeCardElement;
        billing_details: {
          name: string;
          email: string;
          phone?: string;
          address: { line1: string; line2?: string; city: string; postal_code: string; country: string };
        };
      };
      return_url: string;
    },
  ) => Promise<{ error?: { message?: string }; paymentIntent?: { id: string; status: string } }>;
  confirmCardSetup: (
    clientSecret: string,
    data: {
      payment_method: {
        card: StripeCardElement;
        billing_details: {
          name: string;
          email: string;
          phone?: string;
          address?: { line1?: string; line2?: string; city?: string; postal_code?: string; country?: string };
        };
      };
    },
  ) => Promise<{ error?: { message?: string }; setupIntent?: { id: string; status: string } }>;
};

declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeJs;
  }
}

function loadStripeJs() {
  if (window.Stripe) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById('glam-too-stripe-js') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Stripe card fields could not be loaded.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = 'glam-too-stripe-js';
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Stripe card fields could not be loaded.'));
    document.head.appendChild(script);
  });
}

function getCartItems(): CartItem[] {
  try {
    const stored = window.localStorage.getItem(cartStorageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as Array<Partial<CartItem>>;
    return Array.isArray(parsed)
      ? parsed
        .filter((item) => item && typeof item.productId === 'number' && typeof item.size === 'string' && typeof item.quantity === 'number' && item.quantity > 0)
        .map((item) => ({
          productId: item.productId as number,
          size: item.size as string,
          colour: typeof item.colour === 'string' ? item.colour : undefined,
          variationId: typeof item.variationId === 'number' ? item.variationId : undefined,
          options: item.options && typeof item.options === 'object'
            ? Object.fromEntries(Object.entries(item.options).filter(([, value]) => typeof value === 'string'))
            : undefined,
          quantity: item.quantity as number,
        }))
      : [];
  } catch {
    return [];
  }
}

function restoreCartItems(items: CartItem[]) {
  try {
    window.localStorage.setItem(cartStorageKey, JSON.stringify(items));
    window.dispatchEvent(new Event('glam-cart-updated'));
    return true;
  } catch {
    return false;
  }
}

function clearCart() {
  window.localStorage.removeItem(cartStorageKey);
  saveCheckoutPreferences({ couponCode: undefined });
  window.dispatchEvent(new Event('glam-cart-updated'));
}

function getCheckoutPreferences(): CheckoutPreferences {
  try {
    const stored = window.localStorage.getItem(checkoutPreferencesStorageKey);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as Partial<CheckoutPreferences>;
    return {
      delivery: typeof parsed.delivery === "string" && parsed.delivery.trim() ? parsed.delivery.trim() : undefined,
      couponCode: typeof parsed.couponCode === "string" && parsed.couponCode.trim() ? parsed.couponCode.trim().toUpperCase() : undefined,
    };
  } catch {
    return {};
  }
}

function saveCheckoutPreferences(updates: Partial<CheckoutPreferences>) {
  try {
    const next = { ...getCheckoutPreferences(), ...updates };
    if (!next.couponCode) delete next.couponCode;
    window.localStorage.setItem(checkoutPreferencesStorageKey, JSON.stringify(next));
  } catch {
    // Checkout remains usable if browser storage is unavailable.
  }
}

function getCartQueryItem(): CartItem | null {
  const params = new URLSearchParams(window.location.search);
  const productId = Number(params.get('product'));
  const size = params.get('size');
  const variationId = Number(params.get('variation'));
  const colour = params.get('colour');
  const quantity = Number(params.get('quantity'));
  const optionsParam = params.get('options');
  let options: Record<string, string> | undefined;
  try {
    const parsedOptions = optionsParam ? JSON.parse(optionsParam) : null;
    if (parsedOptions && typeof parsedOptions === 'object' && !Array.isArray(parsedOptions)) {
      options = Object.fromEntries(Object.entries(parsedOptions).filter(([, value]) => typeof value === 'string')) as Record<string, string>;
    }
  } catch {
    options = undefined;
  }
  return Number.isInteger(productId) && productId > 0 && size
    ? {
        productId,
        size,
        colour: colour || undefined,
        variationId: Number.isInteger(variationId) && variationId > 0 ? variationId : undefined,
        options,
        quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 1,
      }
    : null;
}

function getCartCount() {
  const items = getCartItems();
  const queryItem = getCartQueryItem();
  const hasQueryItem = queryItem && items.some((item) =>
    item.productId === queryItem.productId
    && item.size === queryItem.size
    && item.colour === queryItem.colour
    && item.variationId === queryItem.variationId
    && JSON.stringify(item.options ?? {}) === JSON.stringify(queryItem.options ?? {}),
  );
  return items.reduce((total, item) => total + item.quantity, 0) + (queryItem && !hasQueryItem ? 1 : 0);
}

function parsePounds(value: string) {
  const amount = Number.parseFloat(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(amount) ? amount : 0;
}

function formatPounds(value: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
}

function calculateCheckoutDeliveryAmount(delivery: "standard" | "express", subtotal: number) {
  if (delivery === "express") return expressDeliveryAmount;
  return Math.round(subtotal * 100) >= freeStandardDeliveryThreshold * 100 ? 0 : standardDeliveryAmount;
}

type ShippingMethod = { id: string; name: string; description: string; price: number; freeOver: number | null; enabled: boolean };
type DeliveryInformationRow = { id: string; option: string; information: string; cost: number; sortOrder: number };
type SizeGuideRow = { id: string; size: string; ukSize: string; bust: string; waist: string; hips: string; sortOrder: number };

function addProductToCart(product: CatalogProduct, selection: Omit<CartItem, 'productId' | 'quantity'> = { size: 'One size' }, quantity = 1) {
  const size = selection.size || 'One size';
  const requestedQuantity = Math.max(1, Math.floor(quantity));
  const availableStock = selection.variationId
    ? product.variations.find((variation) => variation.id === selection.variationId)?.stock ?? 0
    : product.stock;
  const items = getCartItems();
  const optionSignature = (options?: Record<string, string>) => JSON.stringify(Object.entries(options ?? {}).sort(([a], [b]) => a.localeCompare(b)));
  const existingIndex = items.findIndex((item) =>
    item.productId === product.id
    && item.size === size
    && item.colour === selection.colour
    && item.variationId === selection.variationId
    && optionSignature(item.options) === optionSignature(selection.options)
  );
  const nextItems = [...items];
  if (existingIndex >= 0) {
    nextItems[existingIndex] = {
      ...nextItems[existingIndex],
      quantity: Math.min(availableStock, nextItems[existingIndex].quantity + requestedQuantity),
    };
  } else {
    nextItems.push({
      productId: product.id,
      size,
      colour: selection.colour,
      variationId: selection.variationId,
      options: selection.options,
      quantity: Math.min(availableStock, requestedQuantity),
    });
  }
  try {
    window.localStorage.setItem(cartStorageKey, JSON.stringify(nextItems));
    window.dispatchEvent(new Event('glam-cart-updated'));
    return true;
  } catch {
    return false;
  }
}

function getStoredInventory() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(inventoryStorageKey) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, stock]) => Number.isInteger(stock) && Number(stock) >= 0),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

function applyLiveInventory(products: CatalogProduct[]) {
  const inventory = getStoredInventory();
  return products.map((product) => {
    if (product.type === 'Variable') {
      return {
        ...product,
        variations: product.variations.map((variation) => {
          const stock = inventory[`${product.id}:${variation.id}`];
          return typeof stock === 'number' ? { ...variation, stock } : variation;
        }),
      };
    }
    const stock = inventory[String(product.id)];
    return typeof stock === 'number' ? { ...product, stock } : product;
  });
}

function useLiveInventory() {
  const [, setInventoryVersion] = useState(0);

  useEffect(() => {
    let active = true;
    fetch('/api/inventory')
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load inventory');
        return response.json() as Promise<{ inventory?: Record<string, unknown> }>;
      })
      .then(({ inventory }) => {
        if (!active || !inventory) return;
        const validInventory = Object.fromEntries(
          Object.entries(inventory).filter(([, stock]) => Number.isInteger(stock) && Number(stock) >= 0),
        );
        window.localStorage.setItem(inventoryStorageKey, JSON.stringify(validInventory));
        setInventoryVersion((version) => version + 1);
      })
      .catch(() => {
        // The server rechecks stock before payment even if availability cannot be refreshed here.
      });
    return () => {
      active = false;
    };
  }, []);
}

function getStorefrontProducts(): CatalogProduct[] {
  if (sharedCatalog) {
    return applyLiveInventory(normalizeStorefrontProducts(sharedCatalog.products));
  }
  try {
    const stored = window.localStorage.getItem(adminProductsStorageKey);
    if (!stored) return applyLiveInventory(catalogProducts);
    const products = JSON.parse(stored) as Array<Partial<CatalogProduct>>;
    if (!Array.isArray(products)) return applyLiveInventory(catalogProducts);
    return applyLiveInventory(normalizeStorefrontProducts(products));
  } catch {
    return applyLiveInventory(catalogProducts);
  }
}

function normalizeStorefrontProducts(products: Array<Partial<CatalogProduct>>): CatalogProduct[] {
  return products
    .filter((product) => String(product.status ?? "").toLowerCase() === "published")
    .map((product, index) => {
      const matchingCatalogProduct = catalogProducts.find((candidate) =>
        candidate.id === Number(product.id) || candidate.name.toLowerCase() === String(product.name ?? "").toLowerCase(),
      );
      const matchingCategory = (sharedCatalog?.categories ?? catalogCategories).find((category) =>
        slugify(category.name) === slugify(String(product.category ?? "")),
      );
      const productId = Number(product.id);
      const savedPrimaryImage = typeof product.image === "string" ? product.image : "";
      const primaryImageSource = matchingCatalogProduct && savedPrimaryImage.startsWith("/assets/")
        ? matchingCatalogProduct.image
        : savedPrimaryImage || matchingCatalogProduct?.image || matchingCategory?.image || fashionImage;
      const primaryImage = getCatalogMediaSource(primaryImageSource)
        || matchingCatalogProduct?.image
        || matchingCategory?.image
        || fashionImage;
      return {
        ...matchingCatalogProduct,
        ...product,
        id: Number.isInteger(productId) && productId > 0 ? productId : matchingCatalogProduct?.id ?? index + 1,
        slug: createProductSlug(String(product.slug || product.name || matchingCatalogProduct?.slug || matchingCatalogProduct?.name || `product-${index + 1}`)),
        name: product.name || matchingCatalogProduct?.name || "Glam Too piece",
        category: product.category || matchingCatalogProduct?.category || "",
        eyebrow: typeof product.eyebrow === "string" ? product.eyebrow : matchingCatalogProduct?.eyebrow,
        price: formatCatalogPrice(product.price || matchingCatalogProduct?.price || ""),
        description: typeof product.description === "string" ? product.description : matchingCatalogProduct?.description ?? "",
        longDescription: typeof product.longDescription === "string" ? product.longDescription : matchingCatalogProduct?.longDescription,
        fitAndSize: typeof product.fitAndSize === "string" ? product.fitAndSize : matchingCatalogProduct?.fitAndSize,
        deliveryAndReturns: typeof product.deliveryAndReturns === "string" ? product.deliveryAndReturns : matchingCatalogProduct?.deliveryAndReturns,
        careDetails: typeof product.careDetails === "string" ? product.careDetails : matchingCatalogProduct?.careDetails,
        image: primaryImage,
        position: product.position || matchingCatalogProduct?.position || "50% 50%",
        galleryImages: getCatalogProductImages({ image: primaryImage, galleryImages: product.galleryImages }),
        variations: (product.variations ?? matchingCatalogProduct?.variations ?? []).map((variation) => ({
          ...variation,
          price: formatCatalogPrice(variation.price),
        })),
      } as CatalogProduct;
    })
    .sort((first, second) => second.id - first.id);
}
function getStoredCatalogMediaRecords(): Array<Pick<CatalogProduct, "image" | "galleryImages">> {
  try {
    const stored = window.localStorage.getItem(adminProductsStorageKey);
    if (!stored) return [];
    const products = JSON.parse(stored) as Array<Partial<CatalogProduct>>;
    if (!Array.isArray(products)) return [];
    return products.map((product) => ({
      image: typeof product.image === "string" ? product.image : "",
      galleryImages: Array.isArray(product.galleryImages)
        ? product.galleryImages.filter((image): image is string => typeof image === "string")
        : [],
    }));
  } catch {
    return [];
  }
}
function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function getStorefrontCategories(): CatalogCategory[] {
  if (sharedCatalog) return sharedCatalog.categories.map((category) => ({
    ...category,
    image: getCatalogMediaSource(category.image),
  }));
  try {
    const stored = window.localStorage.getItem(adminCategoriesStorageKey);
    if (!stored) return catalogCategories;
    const categories = JSON.parse(stored) as Array<Partial<CatalogCategory>>;
    if (!Array.isArray(categories)) return catalogCategories;
    return categories
      .filter((category) => typeof category?.name === 'string' && category.name.trim())
      .map((category, index) => ({
        id: typeof category.id === 'number' ? category.id : index + 1,
        name: category.name!.trim(),
        image: typeof category.image === 'string' ? category.image : '',
        description: typeof category.description === 'string' ? category.description : '',
        parentId: typeof category.parentId === 'number' ? category.parentId : null,
      }));
  } catch {
    return catalogCategories;
  }
}

function uniqueWishlistIds(productIds: number[]) {
  return [...new Set(productIds.filter((productId) => Number.isInteger(productId) && productId > 0))];
}

function getGuestWishlistProductIds() {
  try {
    const stored = window.localStorage.getItem(wishlistStorageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? uniqueWishlistIds(parsed.filter((productId): productId is number => typeof productId === "number")) : [];
  } catch {
    return [];
  }
}

function saveGuestWishlistProductIds(productIds: number[]) {
  window.localStorage.setItem(wishlistStorageKey, JSON.stringify(uniqueWishlistIds(productIds)));
  window.dispatchEvent(new Event("glam-wishlist-updated"));
}

async function requestWishlist(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const result = await response.json().catch(() => ({})) as { productIds?: unknown; error?: string };
  if (!response.ok) throw new Error(result.error || "Your wishlist could not be updated right now.");
  return result;
}

function parseWishlistResponseProductIds(value: unknown) {
  return Array.isArray(value)
    ? uniqueWishlistIds(value.filter((productId): productId is number => typeof productId === "number"))
    : [];
}

const WishlistContext = createContext<WishlistContextValue | null>(null);
const CatalogMediaContext = createContext(0);

function WishlistProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [productIds, setProductIds] = useState<number[]>([]);
  const [pendingIds, setPendingIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const productIdsRef = useRef(productIds);
  const pendingIdsRef = useRef(pendingIds);
  const mutationQueueRef = useRef(Promise.resolve());
  const validProductIds = productIds.filter((productId) => getStorefrontProducts().some((product) => product.id === productId));
  productIdsRef.current = productIds;
  pendingIdsRef.current = pendingIds;

  useEffect(() => {
    if (!isLoaded) return;
    let active = true;
    const guestIds = getGuestWishlistProductIds();
    setError("");
    if (!isSignedIn) {
      productIdsRef.current = guestIds;
      setProductIds(guestIds);
      setIsLoading(false);
      return () => {
        active = false;
      };
    }

    setIsLoading(true);
    void (async () => {
      try {
        const remote = await requestWishlist("/api/account/wishlist");
        let nextIds = parseWishlistResponseProductIds(remote.productIds);
        if (guestIds.length > 0) {
          const merged = await requestWishlist("/api/account/wishlist/merge", {
            method: "POST",
            body: JSON.stringify({ productIds: guestIds }),
          });
          nextIds = parseWishlistResponseProductIds(merged.productIds);
          saveGuestWishlistProductIds([]);
        }
        if (active) {
          productIdsRef.current = nextIds;
          setProductIds(nextIds);
        }
      } catch (caught) {
        if (active) {
          productIdsRef.current = guestIds;
          setProductIds(guestIds);
          setError(caught instanceof Error ? caught.message : "Your wishlist could not be loaded right now.");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn]);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2800);
  }

  function setPending(productId: number, pending: boolean) {
    const nextPendingIds = pending
      ? pendingIdsRef.current.includes(productId) ? pendingIdsRef.current : [...pendingIdsRef.current, productId]
      : pendingIdsRef.current.filter((id) => id !== productId);
    pendingIdsRef.current = nextPendingIds;
    setPendingIds(nextPendingIds);
  }

  function replaceProductIds(nextProductIds: number[]) {
    productIdsRef.current = nextProductIds;
    setProductIds(nextProductIds);
  }

  function enqueueWishlistMutation(mutation: () => Promise<void>) {
    const queuedMutation = mutationQueueRef.current.then(mutation, mutation);
    mutationQueueRef.current = queuedMutation.catch(() => undefined);
    return queuedMutation;
  }

  async function toggleProduct(productId: number, productName: string) {
    if (!isLoaded || pendingIdsRef.current.includes(productId)) return;
    setPending(productId, true);
    return enqueueWishlistMutation(async () => {
      const previousIds = productIdsRef.current;
      const saved = previousIds.includes(productId);
      const nextIds = saved ? previousIds.filter((id) => id !== productId) : [productId, ...previousIds];
      replaceProductIds(nextIds);
      setError("");
      try {
        if (isSignedIn) {
          const response = await requestWishlist(saved ? `/api/account/wishlist/${productId}` : "/api/account/wishlist", {
            method: saved ? "DELETE" : "POST",
            ...(saved ? {} : { body: JSON.stringify({ productId }) }),
          });
          if (Array.isArray(response.productIds)) replaceProductIds(parseWishlistResponseProductIds(response.productIds));
        } else {
          saveGuestWishlistProductIds(nextIds);
        }
        showNotice(saved ? `${productName} removed from your wishlist.` : `${productName} saved to your wishlist.`);
      } catch (caught) {
        replaceProductIds(previousIds);
        setError(caught instanceof Error ? caught.message : "Your wishlist could not be updated right now.");
      } finally {
        setPending(productId, false);
      }
    });
  }

  async function removeProduct(productId: number, productName: string) {
    if (productIdsRef.current.includes(productId)) await toggleProduct(productId, productName);
  }

  async function moveProductToCart(productId: number, productName: string, addToCart: () => boolean) {
    if (!isLoaded || pendingIdsRef.current.includes(productId) || !productIdsRef.current.includes(productId)) return;
    setPending(productId, true);
    return enqueueWishlistMutation(async () => {
      const previousIds = productIdsRef.current;
      if (!previousIds.includes(productId)) {
        setPending(productId, false);
        return;
      }
      const previousCartItems = getCartItems();
      const nextIds = previousIds.filter((id) => id !== productId);
      replaceProductIds(nextIds);
      setError("");
      try {
        if (!addToCart()) throw new Error("This product could not be added to your bag. Please check your browser storage and try again.");
        if (isSignedIn) {
          const response = await requestWishlist(`/api/account/wishlist/${productId}/move-to-cart`, { method: "POST" });
          if (Array.isArray(response.productIds)) replaceProductIds(parseWishlistResponseProductIds(response.productIds));
        } else {
          saveGuestWishlistProductIds(nextIds);
        }
        showNotice(`${productName} added to your bag.`);
      } catch (caught) {
        restoreCartItems(previousCartItems);
        replaceProductIds(previousIds);
        setError(caught instanceof Error ? caught.message : "This product could not be moved to your bag right now.");
      } finally {
        setPending(productId, false);
      }
    });
  }

  const value: WishlistContextValue = {
    productIds,
    count: validProductIds.length,
    isLoading,
    error,
    notice,
    isSaved: (productId) => productIds.includes(productId),
    isPending: (productId) => pendingIds.includes(productId),
    toggleProduct,
    removeProduct,
    moveProductToCart,
  };

  return (
    <WishlistContext.Provider value={value}>
      {children}
      {notice && <div className="wishlist-notice" role="status" aria-live="polite">{notice}</div>}
      {error && window.location.pathname !== "/wishlist" && <div className="wishlist-notice wishlist-notice-error" role="alert">{error}</div>}
    </WishlistContext.Provider>
  );
}

function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) throw new Error("Wishlist controls must be rendered inside WishlistProvider.");
  return context;
}

function WishlistButton({ product, detail = false }: { product: CatalogProduct; detail?: boolean }) {
  const { isLoading, isSaved, isPending, toggleProduct } = useWishlist();
  const saved = isSaved(product.id);
  return (
    <button
      className={`wishlist-button${detail ? " wishlist-button-detail" : ""}${saved ? " is-saved" : ""}`}
      type="button"
      aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
      aria-pressed={saved}
      disabled={isLoading || isPending(product.id)}
      onClick={() => void toggleProduct(product.id, product.name)}
      data-testid={`button-wishlist-${product.id}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.7c0 5.1-8.8 10.2-8.8 10.2S3.2 13.8 3.2 8.7A4.6 4.6 0 0 1 12 6a4.6 4.6 0 0 1 8.8 2.7Z" /></svg>
      <span className="sr-only">{saved ? "Saved" : "Save"}</span>
    </button>
  );
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartCount, setCartCount] = useState(getCartCount);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(window.location.search).get("search") ?? "");
  const { count: wishlistCount } = useWishlist();
  const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
  const navLinkProps = (path: string) => currentPath === path
    ? { className: "is-active", "aria-current": "page" as const }
    : {};

  useEffect(() => {
    const updateCartCount = () => setCartCount(getCartCount());
    window.addEventListener('glam-cart-updated', updateCartCount);
    return () => window.removeEventListener('glam-cart-updated', updateCartCount);
  }, []);

  return (
    <header className="site-header" data-testid="site-header">
      <div className="header-inner">
        <button
          className="menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          data-testid="button-menu-toggle"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="menu-toggle-icon" aria-hidden="true"><span></span><span></span><span></span></span>
        </button>
        {searchOpen ? (
          <form
            className="header-inline-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              const query = searchQuery.trim();
              setSearchOpen(false);
              window.location.assign(`${basePath}/shop${query ? `?search=${encodeURIComponent(query)}` : ""}`);
            }}
          >
            <button type="submit" aria-label="Submit search" data-testid="button-header-search-submit">
              <span className="tool-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="img"><circle cx="10.8" cy="10.8" r="6.2" /><path d="m16 16 4.3 4.3" /></svg>
              </span>
            </button>
            <label className="sr-only" htmlFor="header-search-input">Search the shop</label>
            <input
              id="header-search-input"
              name="search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearchOpen(false);
              }}
              placeholder="Search products..."
              autoFocus
              data-testid="input-header-search"
            />
          </form>
        ) : (
          <button
            className="tool-label search-link"
            type="button"
            aria-expanded={false}
            data-testid="button-search"
            onClick={() => setSearchOpen(true)}
          >
            <span className="tool-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img"><circle cx="10.8" cy="10.8" r="6.2" /><path d="m16 16 4.3 4.3" /></svg>
            </span>
            <span>Search</span>
          </button>
        )}
        <a href="/" data-testid="link-home-logo"><img className="logo" src={logoImage} alt="Glam Too" /></a>
        <div className="header-tools">
          <a href="/account" className="tool-label icon-link" aria-label="Account" data-testid="link-account">
            <span className="tool-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img"><circle cx="12" cy="8" r="3.2" /><path d="M5.8 20c.6-3.3 2.7-5.1 6.2-5.1s5.6 1.8 6.2 5.1" /></svg>
            </span>
          </a>
          <a href="/wishlist" className="tool-label icon-link wishlist-link" aria-label={`Wishlist, ${wishlistCount} saved product${wishlistCount === 1 ? '' : 's'}`} data-testid="link-wishlist">
            <span className="tool-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img"><path d="M20.8 8.7c0 5.1-8.8 10.2-8.8 10.2S3.2 13.8 3.2 8.7A4.6 4.6 0 0 1 12 6a4.6 4.6 0 0 1 8.8 2.7Z" /></svg>
              {wishlistCount > 0 && <span className="wishlist-count">{wishlistCount}</span>}
            </span>
          </a>
          <a href="/cart" className="tool-label icon-link bag-link" aria-label={`Shopping bag, ${cartCount} item${cartCount === 1 ? '' : 's'}`} data-testid="link-cart">
            <span className="tool-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img"><path d="M5.5 8.5h13l-1 11h-11z" /><path d="M9 9V6.8a3 3 0 0 1 6 0V9" /></svg>
              {cartCount > 0 && <span className="bag-count">{cartCount}</span>}
            </span>
          </a>
        </div>
      </div>
      {menuOpen && <button className="nav-overlay" type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
      <nav id="primary-navigation" className={menuOpen ? 'nav nav-open' : 'nav'} aria-label="Primary navigation">
        <div className="mobile-nav-head">
          <img src={logoImage} alt="Glam Too" />
          <button className="mobile-nav-close" type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}>×</button>
        </div>
        <a href="/category/new-in" {...navLinkProps("/category/new-in")} data-testid="link-nav-new-in" onClick={() => setMenuOpen(false)}>New In</a>
        <a href="/category/clothes" {...navLinkProps("/category/clothes")} data-testid="link-nav-clothes" onClick={() => setMenuOpen(false)}>Clothes</a>
        <a href="/category/handbags" {...navLinkProps("/category/handbags")} data-testid="link-nav-handbags" onClick={() => setMenuOpen(false)}>Handbags</a>
        <a href="/category/purses" {...navLinkProps("/category/purses")} data-testid="link-nav-purses" onClick={() => setMenuOpen(false)}>Purses</a>
        <a href="/category/jewellery" {...navLinkProps("/category/jewellery")} data-testid="link-nav-jewellery" onClick={() => setMenuOpen(false)}>Jewellery</a>
        <a href="/shop" data-testid="link-nav-sale" onClick={() => setMenuOpen(false)}>Sale</a>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <>
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <img className="footer-logo" src={logoImage} alt="Glam Too" />
              <p className="footer-intro">Outfits that make every moment yours. Expressive pieces for the beautifully busy life.</p>
              <div className="footer-socials" aria-label="Social links">
                <a href="#" aria-label="Linktr.ee" data-testid="link-footer-linktree">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M10.5 1h3v9h-3zM1 8.5h22v3H1zM4.2 3.3l2.1-2.1 13.5 13.5-2.1 2.1zM17.7 1.2l2.1 2.1L6.3 16.8l-2.1-2.1zM10.5 13.5h3V23h-3z" fill="currentColor" stroke="none"></path>
                  </svg>
                </a>
                <a href="#" aria-label="Instagram" data-testid="link-footer-instagram">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"></rect><circle cx="12" cy="12" r="3.5"></circle><circle cx="17.3" cy="6.8" r=".8" fill="currentColor" stroke="none"></circle></svg>
                </a>
                <a href="#" aria-label="TikTok" data-testid="link-footer-tiktok">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4v10.2a3.7 3.7 0 1 1-3-3.6"></path><path d="M14 4c.5 2.5 2 4 4.5 4.3"></path></svg>
                </a>
                <a href="#" aria-label="Facebook" data-testid="link-footer-facebook">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 20v-7h2.4l.4-3H14V8.2c0-.9.3-1.5 1.6-1.5H17V4.1c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 4v2H8.5v3h2.4v7"></path></svg>
                </a>
                <a href="#" aria-label="YouTube" data-testid="link-footer-youtube">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="3"></rect><path d="m10 9 5 3-5 3Z"></path></svg>
                </a>
                <a href="#" aria-label="WhatsApp" data-testid="link-footer-whatsapp">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.7a8 8 0 0 1-11.8 7L4 20l1.3-4.1A8 8 0 1 1 20 11.7Z"></path><path d="M9 8.2c.3 2.7 2.1 4.6 4.8 5.6l1.3-1.3c.2-.2.4-.2.7-.1l2 .9"></path></svg>
                </a>
              </div>
            </div>
            <div><h4>Shop</h4><ul><li><a href="/category/new-in" data-testid="link-footer-new-in">New In</a></li><li><a href="/category/clothes" data-testid="link-footer-clothes">Clothes</a></li><li><a href="/category/handbags" data-testid="link-footer-handbags">Handbags</a></li><li><a href="/category/purses" data-testid="link-footer-purses">Purses</a></li><li><a href="/category/jewellery" data-testid="link-footer-jewellery">Jewellery</a></li><li><a href="/shop" data-testid="link-footer-sale">Sale</a></li></ul></div>
            <div><h4>Help</h4><ul><li><a href="/returns" data-testid="link-footer-delivery">Returns</a></li><li><a href="/faq" data-testid="link-footer-size-guide">Size Guide</a></li><li><a href="/faq" data-testid="link-footer-faq">FAQ</a></li><li><a href="/contact" data-testid="link-footer-contact">Contact Us</a></li></ul></div>
            <div><h4>About</h4><ul><li><a href="/about" data-testid="link-footer-about">About</a></li><li><a href="/about" data-testid="link-footer-style-journal">Style Journal</a></li></ul></div>
            <div className="footer-knowledge"><h4>Stay in the know</h4><p>Sign up for new arrivals<br />and exclusive offers.</p><form className="footer-newsletter-form" action="/" method="get"><label className="sr-only" htmlFor="footer-newsletter-email">Email address</label><input id="footer-newsletter-email" name="email" type="email" placeholder="Enter your email" required data-testid="input-footer-newsletter-email" /><button type="submit" aria-label="Sign me up" data-testid="button-footer-newsletter-submit">→</button></form></div>
          </div>
          <div className="footer-bottom"><span>© 2026 Glam Too. All rights reserved. <span aria-hidden="true">|</span> <a href="https://webdesignessex.io/" target="_blank" rel="noreferrer" data-testid="link-footer-web-design-essex">Web Design Essex</a></span><div className="footer-legal-links"><a href="/privacy" data-testid="link-footer-privacy">Privacy Policy</a><span aria-hidden="true">|</span><a href="/terms" data-testid="link-footer-terms">Terms &amp; Conditions</a></div></div>
        </div>
      </footer>
    </>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <><Header /><main className="page">{children}</main><Footer /></>;
}

function NotFoundRoute() {
  return <Shell><NotFound /></Shell>;
}

function ProductCard({ product, featured = false, showShopNow = false }: { product: CatalogProduct; featured?: boolean; showShopNow?: boolean }) {
  return (
    <article className="product-card" data-testid={`card-product-${product.id}`}>
      <div className="product-image">
        <a className="product-card-image-link" href={`/product/${product.slug}`} data-testid={`link-product-${product.id}`} aria-label={`View ${product.name}`}>
          {product.type === 'Simple' && product.stock <= 0 ? <span className="badge">Out of stock</span> : featured && <span className="badge">Just in</span>}
          <img src={product.image} alt={product.name} />
        </a>
        <WishlistButton product={product} />
      </div>
      <a className="product-info product-info-link" href={`/product/${product.slug}`} aria-label={`View ${product.name}`}>
        <div><div className="product-name">{product.name}</div><div className="product-meta">{product.category}</div></div>
        <div className="price">{product.price}</div>
        {showShopNow && <span className="product-shop-now">Shop now</span>}
      </a>
    </article>
  );
}

function Home() {
  useLiveInventory();
  const products = getStorefrontProducts();
  const categories = getStorefrontCategories();
  const featuredCategories = categories.filter((category) => category.parentId == null);
  const momentPlans = [
    { name: "Day Out", copy: "Bright looks for sunny plans." },
    { name: "Date Night", copy: "Turn heads from six to midnight." },
    { name: "Weddings", copy: "Guest-ready looks for the loved-up days." },
    { name: "Weekend Plans", copy: "Effortless pieces for off-duty hours." },
  ];
  return (
    <Shell>
      <section className="hero" aria-label="The new occasion edit">
        <img className="hero-image" src={heroImage} alt="Woman in a pink dress beside a vintage pink car on a sunny street" />
        <div className="hero-copy">
          <h1>It&apos;s your moment</h1>
          <p>Standout outfits for every plan on your calendar.</p>
          <a className="button button-pink" href="/shop" data-testid="link-hero-shop">Shop New In</a>
        </div>
      </section>
      {featuredCategories.length > 0 && (
        <section className="collection-collage container" aria-labelledby="collection-heading">
          <h2 id="collection-heading" className="sr-only">Shop the collection</h2>
          {featuredCategories.map((category) => (
            <a className="collection-tile" key={category.id} href={`/category/${slugify(category.name)}`} aria-label={`Shop ${category.name}`}>
              {category.image && <img src={category.image} alt="" />}
              <div>
                <h3>{category.name}</h3>
                {category.description && <p>{category.description}</p>}
                <span className="collection-tile-cta">Shop {category.name} <span aria-hidden="true">→</span></span>
              </div>
            </a>
          ))}
        </section>
      )}
      <section className="products-section container home-obsessions" aria-labelledby="obsessions-heading">
        <div className="home-obsessions-heading">
          <div className="eyebrow">The Glam Edit</div>
          <h2 id="obsessions-heading">Our Current Obsessions</h2>
        </div>
        <div className="product-grid">{products.slice(0, 3).map((product) => <ProductCard key={product.id} product={product} showShopNow />)}</div>
      </section>
      <section className="moments" aria-labelledby="moments-heading">
        <div className="container">
          <div className="moments-heading"><div className="eyebrow">Shop by moment</div><h2 id="moments-heading">Outfits for Every Plan</h2></div>
          <div className="moment-grid">
            {momentPlans.map((moment, index) => {
              const product = products[index + 3] ?? products[index] ?? products[0];
              if (!product) return null;
              return <article className="moment-card" key={moment.name} data-testid={`card-moment-${index}`}>
                <a className="moment-card-link" href={`/product/${product.slug}`} data-testid={`link-moment-${index}`}>
                  <img src={product.image} alt={`${product.name}, ${moment.name} fashion edit`} style={{ objectPosition: product.position }} />
                  <div className="moment-copy"><h3>{moment.name}</h3><p>{moment.copy}</p><span className="moment-shop-link">Shop now <span aria-hidden="true">→</span></span></div>
                </a>
                <WishlistButton product={product} />
              </article>;
            })}
          </div>
        </div>
      </section>
    </Shell>
  );
}

function PageHero({ eyebrow, title, copy }: { eyebrow: string; title: string; copy?: string }) {
  return <section className="page-hero"><div className="container"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{copy && <p>{copy}</p>}</div></section>;
}

const productSortOptions = [
  { value: "new", label: "New in" },
  { value: "bestsellers", label: "Bestsellers" },
  { value: "price-asc", label: "Price: low to high" },
];

function ProductSortControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="product-sort-control">
      <span>Sort by</span>
      <select value={value || "new"} onChange={(event) => onChange(event.target.value)} aria-label="Sort products">
        {productSortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function sortProducts(products: CatalogProduct[], sort: string, salesByProduct: Record<string, number>) {
  const sorted = [...products];
  if (sort === "price-asc") sorted.sort((a, b) => parsePounds(a.price) - parsePounds(b.price));
  if (sort === "bestsellers") {
    sorted.sort((a, b) =>
      (salesByProduct[String(b.id)] ?? 0) - (salesByProduct[String(a.id)] ?? 0)
      || a.name.localeCompare(b.name),
    );
  }
  return sorted;
}

function Shop() {
  useLiveInventory();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [salesByProduct, setSalesByProduct] = useState<Record<string, number>>({});
  useEffect(() => {
    let active = true;
    fetch("/api/stripe/product-sales")
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load product sales");
        return response.json() as Promise<{ sales?: Record<string, number> }>;
      })
      .then(({ sales }) => {
        if (active && sales) setSalesByProduct(sales);
      })
      .catch(() => {
        // Keep the catalogue usable without pretending inventory is a sales ranking.
      });
    return () => {
      active = false;
    };
  }, []);
  const products = getStorefrontProducts();
  const searchParams = new URLSearchParams(search);
  const searchQuery = searchParams.get("search")?.trim() ?? "";
  const categoryFilter = searchParams.get("category")?.trim().toLowerCase() ?? "";
  const sortFilter = searchParams.get("sort")?.trim().toLowerCase() ?? "";
  const requestedPage = Number(searchParams.get("page"));
  const productCategories = new Map<string, string>();
  products.forEach((product) => {
    const label = product.category.trim();
    const value = slugify(label);
    if (label && value && !productCategories.has(value)) productCategories.set(value, label);
  });
  const categoryOptions = [
    { value: "", label: "All pieces", matches: [] as string[] },
    ...Array.from(productCategories, ([value, label]) => ({ value, label, matches: [value] }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
  const selectedCategory = categoryOptions.find((option) => option.value === categoryFilter) ?? categoryOptions[0];
  const activeSort = productSortOptions.find((option) => option.value === sortFilter) ?? productSortOptions[0];
  const normalizedQuery = searchQuery.toLowerCase();
  const buildShopUrl = (nextCategory = selectedCategory.value, nextSort = activeSort?.value ?? "", nextPage = 1) => {
    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (nextCategory) params.set("category", nextCategory);
    if (nextSort) params.set("sort", nextSort);
    if (nextPage > 1) params.set("page", String(nextPage));
    const query = params.toString();
    return `${basePath}/shop${query ? `?${query}` : ""}`;
  };
  const visibleProducts = sortProducts(products.filter((product) => {
    const matchesSearch = !normalizedQuery || [product.name, product.category, product.slug].some((value) => value.toLowerCase().includes(normalizedQuery));
    const matchesCategory = !selectedCategory.value || selectedCategory.matches.includes(slugify(product.category));
    return matchesSearch && matchesCategory;
  }), activeSort.value, salesByProduct);
  const toolbarDescription = searchQuery
    ? `Search results for “${searchQuery}”`
    : selectedCategory.value
      ? `${selectedCategory.label} pieces`
      : "Showing all";
  const toolbarSort = activeSort ? ` · ${activeSort.label}` : "";
  const productsPerPage = 12;
  const totalPages = Math.max(1, Math.ceil(visibleProducts.length / productsPerPage));
  const currentPage = Number.isInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, totalPages)
    : 1;
  const pageStart = (currentPage - 1) * productsPerPage;
  const paginatedProducts = visibleProducts.slice(pageStart, pageStart + productsPerPage);
  return (
    <Shell>
      <PageHero eyebrow="The shop" title="Pieces with presence." copy="A considered wardrobe of colour, texture and easy confidence. Find something for the plan you have, and the one you haven't made yet." />
      <div className="container shop-layout">
        <aside className="filter">
          <h3>Browse</h3>
          {categoryOptions.map((option) => (
            <a
              key={option.value || "all"}
              href={buildShopUrl(option.value, activeSort?.value)}
              onClick={(event) => {
                event.preventDefault();
                navigate(buildShopUrl(option.value, activeSort?.value));
              }}
              className={selectedCategory.value === option.value ? "is-active" : ""}
              aria-current={selectedCategory.value === option.value ? "page" : undefined}
              data-testid={`filter-category-${option.value || "all"}`}
            >
              {option.label}
            </a>
          ))}
        </aside>
        <section className="shop-main">
          <div className="shop-toolbar">
            <div><span>{visibleProducts.length} {visibleProducts.length === 1 ? "piece" : "pieces"}</span><span>{toolbarDescription}{toolbarSort}</span></div>
            <ProductSortControl value={activeSort.value} onChange={(value) => navigate(buildShopUrl(selectedCategory.value, value))} />
          </div>
          {visibleProducts.length > 0 ? (
            <>
              <div className="product-grid">{paginatedProducts.map((product, index) => <ProductCard key={product.id} product={product} featured={currentPage === 1 && index < 2} />)}</div>
              {totalPages > 1 && (
                <nav className="shop-pagination" aria-label="Shop pages">
                  <a
                    className={currentPage === 1 ? "is-disabled" : ""}
                    href={buildShopUrl(selectedCategory.value, activeSort.value, Math.max(1, currentPage - 1))}
                    onClick={(event) => {
                      event.preventDefault();
                      if (currentPage > 1) navigate(buildShopUrl(selectedCategory.value, activeSort.value, currentPage - 1));
                    }}
                    aria-disabled={currentPage === 1}
                    tabIndex={currentPage === 1 ? -1 : undefined}
                  >
                    Previous
                  </a>
                  <div>
                    {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                      <a
                        key={page}
                        href={buildShopUrl(selectedCategory.value, activeSort.value, page)}
                        onClick={(event) => {
                          event.preventDefault();
                          navigate(buildShopUrl(selectedCategory.value, activeSort.value, page));
                        }}
                        className={page === currentPage ? "is-active" : ""}
                        aria-current={page === currentPage ? "page" : undefined}
                      >
                        {page}
                      </a>
                    ))}
                  </div>
                  <a
                    className={currentPage === totalPages ? "is-disabled" : ""}
                    href={buildShopUrl(selectedCategory.value, activeSort.value, Math.min(totalPages, currentPage + 1))}
                    onClick={(event) => {
                      event.preventDefault();
                      if (currentPage < totalPages) navigate(buildShopUrl(selectedCategory.value, activeSort.value, currentPage + 1));
                    }}
                    aria-disabled={currentPage === totalPages}
                    tabIndex={currentPage === totalPages ? -1 : undefined}
                  >
                    Next
                  </a>
                </nav>
              )}
            </>
          ) : (
            <div className="shop-empty-state">
              <h2>No pieces found.</h2>
              <p>Try changing your search or browse filters.</p>
              <a className="button" href={`${basePath}/shop`}>View all pieces</a>
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}

function CategoryCard({ category }: { category: CatalogCategory }) {
  const categorySlug = slugify(category.name);
  return (
    <a className="category-directory-card" href={`/category/${categorySlug}`} data-testid={`link-category-${categorySlug}`}>
      <div className="category-directory-image">
        {category.image ? <img src={category.image} alt={`${category.name} collection`} /> : <span>No image yet</span>}
      </div>
      <div className="category-directory-copy">
        <div>
          <div className="eyebrow">Collection</div>
          <h2>{category.name}</h2>
          <p>{category.description || "Explore the latest pieces from this collection."}</p>
        </div>
        <span className="category-directory-link">Explore collection <span aria-hidden="true">→</span></span>
      </div>
    </a>
  );
}

function CategoryIndex() {
  const categories = getStorefrontCategories();
  return (
    <Shell>
      <PageHero eyebrow="The collections" title="Find your moment." copy="Explore every Glam Too collection, from effortless everyday layers to the pieces made for an entrance." />
      <section className="container category-directory" aria-labelledby="category-directory-heading">
        <div className="section-heading">
          <div><div className="eyebrow">Every collection</div><h2 id="category-directory-heading">Shop by category</h2></div>
          <span className="category-count">{categories.length} collections</span>
        </div>
        <div className="category-directory-grid">
          {categories.map((category) => <CategoryCard key={category.id} category={category} />)}
        </div>
      </section>
    </Shell>
  );
}

function CategoryDetail({ params }: { params: { slug: string } }) {
  useLiveInventory();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [salesByProduct, setSalesByProduct] = useState<Record<string, number>>({});
  useEffect(() => {
    let active = true;
    fetch("/api/stripe/product-sales")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Unable to load product sales")))
      .then(({ sales }: { sales?: Record<string, number> }) => {
        if (active && sales) setSalesByProduct(sales);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  const categories = getStorefrontCategories();
  const category = categories.find((item) => slugify(item.name) === params.slug);
  if (!category) return <NotFoundRoute />;
  const childCategoryNames = categories
    .filter((item) => item.parentId === category.id)
    .map((item) => slugify(item.name));
  const matchingCategorySlugs = new Set([params.slug, ...childCategoryNames]);
  const sortFilter = new URLSearchParams(search).get("sort")?.trim().toLowerCase() ?? "new";
  const activeSort = productSortOptions.some((option) => option.value === sortFilter) ? sortFilter : "new";
  const products = sortProducts(
    getStorefrontProducts().filter((product) => matchingCategorySlugs.has(slugify(product.category))),
    activeSort,
    salesByProduct,
  );
  const updateSort = (value: string) => {
    const query = new URLSearchParams(search);
    query.set("sort", value);
    navigate(`${basePath}/category/${params.slug}?${query.toString()}`);
  };

  return (
    <Shell>
      <section className="category-banner" aria-labelledby="category-banner-heading">
        <div className="container category-banner-inner">
          <div className="category-banner-media">
            {category.image ? <img src={category.image} alt={`${category.name} collection campaign`} /> : <div className="category-banner-empty">Glam Too collection</div>}
          </div>
          <div className="category-banner-copy">
            <div className="eyebrow">The {category.name.toLowerCase()} edit</div>
            <h1 id="category-banner-heading">{category.name}</h1>
            <p>{category.description || `Pieces selected for every ${category.name.toLowerCase()} moment.`}</p>
            <a className="button button-pink" href="#category-products">Shop the edit</a>
          </div>
        </div>
      </section>
      <section className="container category-products" id="category-products" aria-labelledby="category-products-heading">
        <div className="section-heading">
          <div><div className="eyebrow">The edit</div><h2 id="category-products-heading">{category.name} pieces</h2></div>
          <div className="category-products-actions">
            <span className="category-count">{products.length} {products.length === 1 ? "piece" : "pieces"}</span>
            <ProductSortControl value={activeSort} onChange={updateSort} />
          </div>
        </div>
        {products.length > 0 ? (
          <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div>
        ) : (
          <div className="category-empty"><h3>More pieces are on their way.</h3><p>Explore the full shop while we add to this collection.</p><a className="button" href="/shop">View all pieces</a></div>
        )}
      </section>
    </Shell>
  );
}

function Product() {
  return <Shell><div className="container product-detail"><div className="product-detail-layout"><div className="product-gallery"><div className="gallery-image"><img src={fashionImage} alt="Luna ruffle mini dress in blush pink, full editorial view" /></div><div className="gallery-image"><img src={fashionImage} alt="Luna ruffle mini dress detail" /></div><div className="gallery-image"><img src={fashionImage} alt="Luna ruffle mini dress styled for occasionwear" /></div></div><div className="detail-copy"><div className="eyebrow">The occasion edit · Just in</div><h1>Luna Ruffle Mini Dress</h1><div className="detail-price">£89.99</div><p>A little romance, a lot of movement. Luna is cut in soft recycled satin with a gathered neckline, floaty ruffles and a hem made for dancing.</p><form className="detail-form" action="/cart" method="get"><div className="field"><label htmlFor="dress-size">Select size</label><select id="dress-size" name="size" defaultValue="" required data-testid="select-product-size"><option value="" disabled>Choose a size</option><option>UK 6</option><option>UK 8</option><option>UK 10</option><option>UK 12</option><option>UK 14</option></select></div><div className="field"><label>Colour · Blush</label><div className="swatches" aria-label="Available colours"><span className="swatch swatch-pink" title="Blush"></span><span className="swatch swatch-black" title="Black"></span><span className="swatch swatch-blue" title="Sky"></span></div></div><button className="button" type="submit" data-testid="button-add-to-bag">Add to bag · £89.99</button></form><div className="detail-notes"><details open><summary>Fit &amp; details</summary><p>True to size with a relaxed, floaty fit. Adjustable straps and invisible side zip. Dress length: 82cm.</p></details><details><summary>Delivery &amp; returns</summary><p>Free standard delivery over £75. Return unworn pieces within 28 days.</p></details></div></div></div></div></Shell>;
}

function ProductDetail({ params }: { params: { slug: string } }) { 
  useLiveInventory();
  const product = getStorefrontProducts().find((item) => item.slug === params.slug || String(item.id) === params.slug);
  const galleryImages = getCatalogProductImages(product ?? { image: "" });
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
  const [galleryTransitionDirection, setGalleryTransitionDirection] = useState<1 | -1>(1);
  const [galleryZoomOpen, setGalleryZoomOpen] = useState(false);
  const galleryTouchStartX = useRef<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [variationMessage, setVariationMessage] = useState('');
  const [openProductInformation, setOpenProductInformation] = useState<string | null>(null);
  const [deliveryInformation, setDeliveryInformation] = useState<DeliveryInformationRow[]>([]);
  const [returnInformation, setReturnInformation] = useState("");
  const [sizeGuide, setSizeGuide] = useState<SizeGuideRow[]>([]);

  useEffect(() => {
    setActiveGalleryIndex(0);
    setGalleryTransitionDirection(1);
    setGalleryZoomOpen(false);
    setQuantity(1);
  }, [product?.id, params.slug]);

  useEffect(() => {
    let active = true;
    fetch("/api/delivery-information")
      .then(async (response) => {
        const payload = await response.json() as { deliveryInformation?: DeliveryInformationRow[] };
        if (!response.ok) throw new Error("Delivery information could not be loaded.");
        if (active) setDeliveryInformation(payload.deliveryInformation ?? []);
      })
      .catch(() => {
        if (active) setDeliveryInformation([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/size-guide")
      .then(async (response) => {
        const payload = await response.json() as { sizeGuide?: SizeGuideRow[] };
        if (!response.ok) throw new Error("Size guide could not be loaded.");
        if (active) setSizeGuide(payload.sizeGuide ?? []);
      })
      .catch(() => {
        if (active) setSizeGuide([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/return-information")
      .then(async (response) => {
        const payload = await response.json() as { content?: string };
        if (!response.ok) throw new Error("Return information could not be loaded.");
        if (active) setReturnInformation(payload.content ?? "");
      })
      .catch(() => {
        if (active) setReturnInformation("");
      });
    return () => {
      active = false;
    };
  }, []);

  const productVariations = product?.type === 'Variable' ? product.variations : [];
  const availableVariations = productVariations.filter((variation) => variation.stock > 0);
  const variationAttributes = product?.variationAttributes ?? [
    ...(productVariations.some((variation) => variation.size) ? ['size'] : []),
    ...(productVariations.some((variation) => variation.colour) ? ['colour'] : []),
  ];

  const optionValue = (variation: typeof productVariations[number], attribute: string) =>
    attribute === 'size' ? variation.size : attribute === 'colour' ? variation.colour : variation.attributes?.[attribute] ?? '';

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});

  const hasCompatibleVariation = (options: Record<string, string>) =>
    availableVariations.some((variation) =>
      variationAttributes.every((attribute) => !options[attribute] || optionValue(variation, attribute) === options[attribute]),
    );

  const hasAllRequiredSelections = variationAttributes.every((attribute) => Boolean(selectedOptions[attribute]));

  const selectedVariation = product?.type === 'Variable'
    ? !hasAllRequiredSelections
      ? undefined
      : availableVariations.find((variation) =>
      variationAttributes.every((attribute) => optionValue(variation, attribute) === selectedOptions[attribute]),
    )
    : undefined;

  const displayedPrice = selectedVariation?.price ?? product?.price ?? '';
  const availableQuantity = product?.type === 'Variable' ? selectedVariation?.stock ?? 0 : product?.stock ?? 0;
  
  const productInformation = [
    { title: 'Description', content: product?.longDescription },
    { title: 'Fit & Size', content: product?.fitAndSize },
    { title: 'Returns', content: returnInformation },
    { title: 'Care Details', content: product?.careDetails },
  ].filter((section): section is { title: string; content: string } => Boolean(section.content && hasRichTextContent(section.content)));
  const sizeGuideRowSpans = sizeGuide.map((row, index) => {
    const normalizedSize = row.size.trim().toLowerCase();
    if (index > 0 && sizeGuide[index - 1].size.trim().toLowerCase() === normalizedSize) return 0;
    let count = 1;
    while (index + count < sizeGuide.length && sizeGuide[index + count].size.trim().toLowerCase() === normalizedSize) count += 1;
    return count;
  });

  if (!product) return <NotFoundRoute />;
  const selectedProduct = product;
  const isSoldOut = product.type === 'Simple' ? product.stock <= 0 : availableVariations.length === 0;
  const displayedGalleryIndex = Math.min(activeGalleryIndex, Math.max(galleryImages.length - 1, 0));
  const relatedProducts = getStorefrontProducts()
    .filter((candidate) => candidate.id !== product.id)
    .sort((first, second) => {
      const firstIsSameCategory = slugify(first.category) === slugify(product.category);
      const secondIsSameCategory = slugify(second.category) === slugify(product.category);
      return Number(secondIsSameCategory) - Number(firstIsSameCategory);
    })
    .slice(0, 4);

  function changeGallery(direction: number) {
    if (galleryImages.length < 2) return;
    setGalleryTransitionDirection(direction >= 0 ? 1 : -1);
    setActiveGalleryIndex((current) => (current + direction + galleryImages.length) % galleryImages.length);
  }

  function selectGalleryImage(index: number) {
    setGalleryTransitionDirection(index >= displayedGalleryIndex ? 1 : -1);
    setActiveGalleryIndex(index);
  }

  function handleAddToCart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedProduct.type === 'Variable' && !selectedVariation) {
      setVariationMessage('Choose an available option before adding this product to your bag.');
      return;
    }
    const selection = selectedVariation
      ? { size: selectedVariation.size || 'One size', colour: selectedVariation.colour || undefined, options: selectedVariation.attributes, variationId: selectedVariation.id }
      : { size: 'One size' };
    const wasSaved = addProductToCart(selectedProduct, selection, quantity);
    const fallbackParams = new URLSearchParams({
      product: String(selectedProduct.id),
      size: selection.size,
    });
    if (selection.colour) fallbackParams.set('colour', selection.colour);
    if (selection.variationId) fallbackParams.set('variation', String(selection.variationId));
    if (selection.options && Object.keys(selection.options).length > 0) fallbackParams.set('options', JSON.stringify(selection.options));
    fallbackParams.set('quantity', String(quantity));
    window.location.href = wasSaved ? '/cart' : `/cart?${fallbackParams.toString()}`;
  }

  return (
    <Shell>
      <div className="container product-detail">
        <div className="product-detail-layout">
          <div className="product-gallery">
            {galleryImages.length > 1 && (
              <div className="gallery-thumbnails-col">
                <div className="gallery-thumbnails" aria-label="Choose product image">
                  {galleryImages.map((image, index) => (
                    <button
                      className={`gallery-thumbnail ${index === displayedGalleryIndex ? "is-active" : ""}`}
                      type="button"
                      key={`${image}-${index}`}
                      onClick={() => selectGalleryImage(index)}
                      aria-label={`View ${product.name} image ${index + 1}`}
                      aria-current={index === displayedGalleryIndex ? "true" : undefined}
                    >
                      <img src={image} alt="" style={{ objectPosition: product.position }} />
                    </button>
                  ))}
                </div>
                <button className="gallery-thumbnails-more" onClick={() => changeGallery(1)} aria-label="View next product image"><ChevronDown /></button>
              </div>
            )}
            <div
              className="gallery-viewer"
              role="group"
              aria-roledescription="carousel"
              tabIndex={galleryImages.length > 1 ? 0 : -1}
              aria-label={`${product.name} product gallery`}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  changeGallery(-1);
                }
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  changeGallery(1);
                }
              }}
              onTouchStart={(event) => {
                galleryTouchStartX.current = event.touches[0]?.clientX ?? null;
              }}
              onTouchEnd={(event) => {
                const startX = galleryTouchStartX.current;
                galleryTouchStartX.current = null;
                const endX = event.changedTouches[0]?.clientX;
                if (startX === null || endX === undefined || Math.abs(endX - startX) < 40) return;
                changeGallery(endX < startX ? 1 : -1);
              }}
            >
              <WishlistButton product={product} detail />
              <button className="gallery-viewer-zoom" type="button" onClick={() => setGalleryZoomOpen(true)} aria-label="Open larger product image"><ZoomIn size={18} /></button>
              <div className="gallery-image">
                <img
                  key={galleryImages[displayedGalleryIndex] || product.image}
                  className={galleryTransitionDirection > 0 ? "gallery-slide-next" : "gallery-slide-prev"}
                  src={galleryImages[displayedGalleryIndex] || product.image}
                  alt={`${product.name} view ${displayedGalleryIndex + 1}`}
                  style={{ objectPosition: "center top" }}
                />
              </div>
              <span className="sr-only" aria-live="polite" aria-atomic="true">
                Image {displayedGalleryIndex + 1} of {galleryImages.length}
              </span>
              
              <div className="gallery-viewer-pagination">
                <button className="gallery-pagination-control" type="button" onClick={() => changeGallery(-1)} aria-label="View previous product image">&lsaquo;</button>
                <span className="gallery-pagination-status">{displayedGalleryIndex + 1} / {galleryImages.length}</span>
                <button className="gallery-pagination-control" type="button" onClick={() => changeGallery(1)} aria-label="View next product image">&rsaquo;</button>
              </div>
            </div>
            {galleryZoomOpen && createPortal(
              <div
                className="gallery-lightbox"
                role="dialog"
                aria-modal="true"
                aria-label={`${product.name} enlarged image`}
                tabIndex={0}
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    changeGallery(-1);
                  }
                  if (event.key === "ArrowRight") {
                    event.preventDefault();
                    changeGallery(1);
                  }
                  if (event.key === "Escape") setGalleryZoomOpen(false);
                }}
                onClick={() => setGalleryZoomOpen(false)}
              >
                <button className="gallery-lightbox-close" type="button" onClick={() => setGalleryZoomOpen(false)} aria-label="Close enlarged image"><X aria-hidden="true" /></button>
                {galleryImages.length > 1 && (
                  <>
                    <button className="gallery-lightbox-arrow gallery-lightbox-arrow-prev" type="button" onClick={(event) => { event.stopPropagation(); changeGallery(-1); }} aria-label="View previous product image">&lsaquo;</button>
                    <button className="gallery-lightbox-arrow gallery-lightbox-arrow-next" type="button" onClick={(event) => { event.stopPropagation(); changeGallery(1); }} aria-label="View next product image">&rsaquo;</button>
                  </>
                )}
                <img src={galleryImages[displayedGalleryIndex] || product.image} alt={`${product.name} enlarged view ${displayedGalleryIndex + 1}`} style={{ objectPosition: product.position }} onClick={(event) => event.stopPropagation()} />
              </div>,
              document.body,
            )}
          </div>
          <div className="detail-copy">
            <div className="detail-intro">
              <div className="detail-header-row">
                <span className="eyebrow">{product.eyebrow?.trim() || product.category}</span>
              </div>
              <h1>{product.name}</h1>
              <div className="detail-price">{displayedPrice}</div>
              <p className="detail-description">{product.description}</p>
            </div>
            
            <form className="detail-form" onSubmit={handleAddToCart}>
              <input type="hidden" name="product" value={product.id} />
                <div className={`detail-purchase-controls${product.type !== 'Variable' ? ' detail-purchase-controls-simple' : ''}`}>
                  {product.type === 'Variable' && (
                    <div className="detail-variation-fields">
                   {variationAttributes.map((attribute) => {
                     const values = [...new Set(productVariations.map((variation) => optionValue(variation, attribute)).filter(Boolean))];
                     return <div className="field" key={attribute}><label htmlFor={`product-${attribute}-${product.id}`}>Select {attribute === 'size' ? 'size' : attribute === 'colour' ? 'colour' : attribute}</label><select id={`product-${attribute}-${product.id}`} name={attribute} value={selectedOptions[attribute] ?? ''} onChange={(event) => { const next = { ...selectedOptions, [attribute]: event.target.value }; setSelectedOptions(next); setVariationMessage(''); }} required data-testid={`select-product-${attribute}-${product.id}`}><option value="" disabled>Choose {attribute === 'size' ? 'a size' : attribute === 'colour' ? 'a colour' : `a ${attribute}`}</option>{values.map((value) => <option key={value} value={value} disabled={!hasAllRequiredSelections && !hasCompatibleVariation({ ...selectedOptions, [attribute]: value })}>{value}</option>)}</select></div>;
                   })}
                   {availableVariations.length === 0 && <p className="variation-message">This product is currently unavailable.</p>}
                   {variationMessage && <p className="variation-message" role="alert">{variationMessage}</p>}
                    </div>
                  )}
                 <div className="detail-quantity">
                   <span className="detail-quantity-label">Quantity</span>
                   <div className="detail-quantity-control">
                     <button type="button" onClick={() => setQuantity((current) => Math.max(1, current - 1))} disabled={quantity <= 1} aria-label="Decrease quantity">&minus;</button>
                     <output aria-live="polite" aria-label={`Quantity ${quantity}`}>{quantity}</output>
                     <button type="button" onClick={() => setQuantity((current) => Math.min(availableQuantity, current + 1))} disabled={isSoldOut || !availableQuantity || quantity >= availableQuantity} aria-label="Increase quantity">+</button>
                   </div>
                 </div>
                </div>
                
                {isSoldOut && <p className="variation-message">This product is currently out of stock.</p>}
                
                <button className="button detail-add-to-bag" type="submit" disabled={isSoldOut || (product.type === 'Variable' && !selectedVariation)} data-testid={`button-add-to-bag-${product.id}`}>
                  {isSoldOut ? 'Out of stock' : `ADD TO BAG · ${displayedPrice}`}
                  <ShoppingBag size={18} />
                </button>

              <div className="product-policies">
                <div className="product-policy">
                  <RefreshCcw className="product-policy-icon" aria-hidden="true" />
                  <div>
                    <h3 className="product-policy-title">21-Day Returns</h3>
                    <p className="product-policy-text">Return unworn items with tags attached for a full refund.</p>
                  </div>
                </div>
                <div className="product-policy">
                  <CreditCard className="product-policy-icon" aria-hidden="true" />
                  <div>
                    <h3 className="product-policy-title">Secure Checkout</h3>
                    <p className="product-policy-text">Your card details are handled securely by Stripe.</p>
                  </div>
                </div>
              </div>
              
               {(productInformation.length > 0 || sizeGuide.length > 0 || deliveryInformation.length > 0) && (
                 <div className="detail-accordion" aria-label="Product information">
                   {productInformation.map((section) => (
                     <details key={section.title} open={openProductInformation === section.title}>
                       <summary onClick={(event) => {
                         event.preventDefault();
                         setOpenProductInformation((current) => current === section.title ? null : section.title);
                       }}>{section.title}<span aria-hidden="true">+</span></summary>
                        <div
                          className="detail-accordion-content detail-rich-text"
                          dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(section.content) }}
                        />
                     </details>
                   ))}
                   {sizeGuide.length > 0 && (
                     <details open={openProductInformation === "Size Guide"}>
                       <summary onClick={(event) => {
                         event.preventDefault();
                         setOpenProductInformation((current) => current === "Size Guide" ? null : "Size Guide");
                       }}>Size Guide<span aria-hidden="true">+</span></summary>
                       <div className="detail-accordion-content detail-size-guide-content">
                         <div className="size-guide-table-wrap">
                           <table className="size-guide-table">
                             <thead>
                               <tr>
                                 <th scope="col" colSpan={2}>Size</th>
                                 <th scope="col">Bust</th>
                                 <th scope="col">Waist</th>
                                 <th scope="col">Hips</th>
                               </tr>
                             </thead>
                             <tbody>
                               {sizeGuide.map((row, index) => (
                                 <tr key={row.id}>
                                   {sizeGuideRowSpans[index] > 0 && <th scope="rowgroup" rowSpan={sizeGuideRowSpans[index]}>{row.size}</th>}
                                   <th scope="row">{row.ukSize}</th>
                                   <td>{row.bust}</td>
                                   <td>{row.waist}</td>
                                   <td>{row.hips}</td>
                                 </tr>
                               ))}
                             </tbody>
                           </table>
                         </div>
                       </div>
                     </details>
                   )}
                   {deliveryInformation.length > 0 && (
                     <details open={openProductInformation === "Delivery"}>
                       <summary onClick={(event) => {
                         event.preventDefault();
                         setOpenProductInformation((current) => current === "Delivery" ? null : "Delivery");
                       }}>Delivery<span aria-hidden="true">+</span></summary>
                       <div className="detail-accordion-content detail-delivery-content">
                         <div className="delivery-table-wrap">
                           <table className="delivery-information-table">
                             <thead>
                               <tr>
                                 <th scope="col">Delivery option</th>
                                 <th scope="col">Delivery information</th>
                                 <th scope="col">Delivery cost</th>
                               </tr>
                             </thead>
                             <tbody>
                               {deliveryInformation.map((row) => (
                                 <tr key={row.id}>
                                   <td data-label="Delivery option">{row.option}</td>
                                   <td data-label="Delivery information">{row.information}</td>
                                   <td data-label="Delivery cost">{row.cost === 0 ? "Free" : formatPounds(row.cost / 100)}</td>
                                 </tr>
                               ))}
                             </tbody>
                           </table>
                         </div>
                       </div>
                     </details>
                   )}
                 </div>
               )}
            </form>
          </div>
        </div>
      </div>
      {relatedProducts.length > 0 && (
        <section className="related-products container" aria-labelledby="related-products-heading" data-testid="section-related-products">
          <div className="related-products-heading">
            <div>
              <div className="eyebrow">Keep exploring</div>
              <h2 id="related-products-heading">Related products</h2>
            </div>
            <a className="text-link" href={`/category/${slugify(product.category)}`}>Shop {product.category.toLowerCase()} <span aria-hidden="true">&rarr;</span></a>
          </div>
          <div className="product-grid">
            {relatedProducts.map((relatedProduct) => <ProductCard key={relatedProduct.id} product={relatedProduct} />)}
          </div>
          <a className="text-link related-products-mobile-link" href={`/category/${slugify(product.category)}`}>Shop {product.category.toLowerCase()} <span aria-hidden="true">&rarr;</span></a>
        </section>
      )}
    </Shell>
  );
}

function WishlistPage() {
  useLiveInventory();
  const { productIds, isLoading, error, isPending, removeProduct, moveProductToCart } = useWishlist();
  const [cartError, setCartError] = useState("");
  const products = getStorefrontProducts();
  const wishlistProducts = productIds.flatMap((productId) => {
    const product = products.find((candidate) => candidate.id === productId);
    return product ? [product] : [];
  });

  function isAvailable(product: CatalogProduct) {
    return product.type === "Simple"
      ? product.stock > 0
      : product.variations.some((variation) => variation.stock > 0);
  }

  async function handleAddToCart(product: CatalogProduct) {
    setCartError("");
    if (!isAvailable(product)) return;
    await moveProductToCart(product.id, product.name, () => addProductToCart(product));
  }

  return (
    <Shell>
      <section className="wishlist-hero">
        <div className="container">
          <div className="eyebrow">Saved for later</div>
          <h1>Your wishlist.</h1>
          <p>Keep the pieces you love close by, ready for your next plan.</p>
        </div>
      </section>
      <div className="container wishlist-page">
        {error && <p className="wishlist-message wishlist-message-error" role="alert">{error}</p>}
        {cartError && <p className="wishlist-message wishlist-message-error" role="alert">{cartError}</p>}
        {isLoading ? (
          <div className="wishlist-empty-state"><p>Loading your saved pieces…</p></div>
        ) : wishlistProducts.length === 0 ? (
          <div className="wishlist-empty-state">
            <div className="wishlist-empty-heart" aria-hidden="true">♡</div>
            <h2>Your wishlist is empty.</h2>
            <p>Save your favourite pieces and they’ll be waiting here whenever you’re ready.</p>
            <a className="button button-pink" href="/shop">Continue Shopping</a>
          </div>
        ) : (
          <div className="wishlist-grid">
            {wishlistProducts.map((product) => {
              const available = isAvailable(product);
              const salePrice = product.salePrice;
              const hasSalePrice = Boolean(salePrice && parsePounds(salePrice) < parsePounds(product.price));
              return (
                <article className="wishlist-item" key={product.id}>
                  <a className="wishlist-item-image" href={`/product/${product.slug}`} aria-label={`View ${product.name}`}>
                    {!available && <span className="badge">Out of stock</span>}
                    <img src={product.image} alt={product.name} style={{ objectPosition: product.position }} />
                  </a>
                  <div className="wishlist-item-content">
                    <div>
                      <p className="wishlist-item-category">{product.category}</p>
                      <h2><a href={`/product/${product.slug}`}>{product.name}</a></h2>
                      <div className={`wishlist-item-price${hasSalePrice ? " is-on-sale" : ""}`}>
                        {hasSalePrice && <del>{product.price}</del>}
                        <strong>{hasSalePrice ? salePrice : product.price}</strong>
                      </div>
                      <p className={`wishlist-stock${available ? " is-in-stock" : ""}`}>{available ? "In stock" : "Out of stock"}</p>
                    </div>
                    <div className="wishlist-item-actions">
                      <a className="button wishlist-view-button" href={`/product/${product.slug}`}>View Product</a>
                      {product.type === "Variable" ? (
                        <a className="button button-pink" href={`/product/${product.slug}`}>Add to Cart</a>
                      ) : (
                        <button className="button button-pink" type="button" disabled={!available || isPending(product.id)} onClick={() => void handleAddToCart(product)} data-testid={`button-wishlist-cart-${product.id}`}>
                          {!available ? "Out of stock" : isPending(product.id) ? "Adding…" : "Add to Cart"}
                        </button>
                      )}
                      <button className="wishlist-remove-button" type="button" disabled={isPending(product.id)} onClick={() => void removeProduct(product.id, product.name)} data-testid={`button-wishlist-remove-${product.id}`}>Remove</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}

function About() {
  const values = [
    {
      title: "Considered edits",
      copy: "We hand-pick every style for quality, fit and feel, so your wardrobe works harder for you.",
      icon: <path d="M12 3.5 14.4 9l5.9.6-4.4 3.9 1.3 5.8L12 16.4l-5.2 2.9 1.3-5.8-4.4-3.9L9.6 9 12 3.5Z" />,
    },
    {
      title: "Confidence first",
      copy: "From the perfect fit to the little details, our pieces are designed to help you feel unstoppable.",
      icon: <path d="M12 20.2S4.3 15.7 4.3 9.8A4.1 4.1 0 0 1 12 7.4a4.1 4.1 0 0 1 7.7 2.4c0 5.9-7.7 10.4-7.7 10.4Z" />,
    },
    {
      title: "For every plan",
      copy: "Day out or date night, weekend plans or weddings — we have a look for every moment.",
      icon: <path d="M5.5 8.5h13l-1 11h-11zM9 9V6.8a3 3 0 0 1 6 0V9" />,
    },
  ];

  return (
    <Shell>
      <div className="about-page">
        <section className="about-hero" aria-labelledby="about-hero-heading">
          <img className="about-hero-image" src={aboutHeroImage} alt="Woman wearing a pink printed dress seated beside the sea" />
          <div className="about-hero-overlay" aria-hidden="true" />
          <div className="container about-hero-copy">
            <div className="eyebrow">The Glam Too story</div>
            <h1 id="about-hero-heading">Made for<br />your moment.</h1>
            <p>Glam Too is modern fashion for women who love to express themselves, wherever the day takes them.</p>
          </div>
        </section>

        <section className="container about-intro" aria-labelledby="about-intro-heading">
          <div className="about-intro-copy">
            <div className="eyebrow">Style that moves with you</div>
            <h2 id="about-intro-heading">More you,<br />more often.</h2>
            <p>At Glam Too, we believe getting dressed should feel exciting, effortless and unmistakably you.</p>
            <p>We create pieces that move between moments with everyday wearability — from stand-out dresses and feminine co-ords to premium staples and accessories.</p>
            <p>Thoughtful fabrics, flattering fits and on-trend details come together in collections designed to take you from day plans to big moments and everywhere in between.</p>
            <strong>This is fashion, made for real life.</strong>
            <a className="about-text-link" href="/shop">Explore the edit <span aria-hidden="true">↗</span></a>
          </div>
          <div className="about-intro-media">
            <img src={aboutStudioImage} alt="Woman in a white co-ord set holding a handbag" />
          </div>
        </section>

        <section className="about-values" aria-labelledby="about-values-heading">
          <div className="container">
            <h2 id="about-values-heading" className="sr-only">What matters to us</h2>
            <div className="about-values-grid">
              {values.map((value) => (
                <article className="about-value" key={value.title}>
                  <span className="about-value-icon" aria-hidden="true"><svg viewBox="0 0 24 24">{value.icon}</svg></span>
                  <h3>{value.title}</h3>
                  <p>{value.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="container about-story" aria-labelledby="about-story-heading">
          <div className="about-story-media">
            <img src={aboutStoryImage} alt="Woman wearing a pink printed dress from Glam Too" />
          </div>
          <div className="about-story-copy">
            <div className="eyebrow">Our story</div>
            <h2 id="about-story-heading">The Glam Too story</h2>
            <p>Glam Too was founded with a simple idea: premium style should feel accessible and inclusive.</p>
            <p>We&apos;re a team of fashion lovers, buyers and creatives who live and breathe trends, quality and our community. Every collection is inspired by you — your plans, your confidence and everything that comes next.</p>
            <p>Every collection is designed to make getting dressed feel like the best part of the day.</p>
            <strong>Thanks for being part of the Glam Too story.</strong>
            <a className="about-text-link" href="/shop">Find your next look <span aria-hidden="true">↗</span></a>
          </div>
        </section>

        <section
          className="about-cta"
          aria-labelledby="about-cta-heading"
          style={{ backgroundImage: `linear-gradient(rgba(43, 19, 26, .5), rgba(43, 19, 26, .5)), url(${getCatalogMediaSource("/objects/uploads/bfdfc3f3-ba5f-4632-8b6a-0258cf1f37ee")})` }}
        >
          <div className="container">
            <div className="eyebrow">Your next chapter</div>
            <h2 id="about-cta-heading">Find your next look.</h2>
            <p>New styles, endless plans and a little inspiration — delivered straight to your wardrobe.</p>
            <a className="button button-light" href="/shop">Shop new in</a>
          </div>
        </section>
      </div>
    </Shell>
  );
}

function FAQ() {
  const faqItems = [
    { category: "Orders", question: "Where is my order?", answer: "Once your order has been dispatched, you will receive a confirmation email with a tracking link. You can use this link to follow your parcel’s journey in real time." },
    { category: "Orders", question: "Can I change or cancel my order?", answer: "We start preparing orders quickly, but email hello@glamtoo.co.uk as soon as possible and our team will do their best to help before dispatch." },
    { category: "Orders", question: "Can I update my delivery address?", answer: "If your order has not been dispatched, contact us straight away with your order number and the corrected address. We cannot guarantee changes after dispatch." },
    { category: "Delivery", question: "How long does delivery take?", answer: "Standard delivery takes 2–4 working days and express delivery takes 1–2 working days. You will receive tracking as soon as your parcel leaves us." },
    { category: "Delivery", question: "Do you deliver internationally?", answer: "We currently deliver within the UK. Delivery options and costs are shown at checkout before you place your order." },
    { category: "Delivery", question: "How much does delivery cost?", answer: "Standard delivery is £3.95, or free on orders of £75 or more. Express delivery is £6.95." },
    { category: "Returns", question: "How do I return an item?", answer: "Send unworn, unwashed items back within 28 days of delivery with tags attached. Email hello@glamtoo.co.uk with your order number to start your return." },
    { category: "Returns", question: "When will I receive my refund?", answer: "We will process your refund once your return has been checked. Please allow up to 5 working days for the refund to appear in your original payment account." },
    { category: "Products", question: "How do I choose the right size?", answer: "Every product page includes fit notes and garment measurements to help you choose. If you are between sizes, we recommend sizing up in fitted styles." },
    { category: "Products", question: "How should I care for my Glam Too pieces?", answer: "Follow the care label on each garment. We recommend a cool wash where possible and keeping occasionwear away from perfume, makeup and deodorant." },
    { category: "Payments", question: "Which payment methods do you accept?", answer: "You can pay securely by card through Stripe. Your available card options are shown at checkout." },
    { category: "Payments", question: "Is checkout secure?", answer: "Yes. Card details are handled securely by Stripe and never stored by Glam Too. We only receive the payment confirmation needed to complete your order." },
  ];
  const faqGroups = [
    { label: "Orders & delivery", categories: ["Orders", "Delivery"] },
    { label: "Returns & refunds", categories: ["Returns"] },
    { label: "Products & payments", categories: ["Products", "Payments"] },
  ];
  const [openQuestion, setOpenQuestion] = useState(faqItems[0]?.question ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const groupedQuestions = faqGroups.map((group) => ({
    ...group,
    questions: faqItems.filter((item) =>
      group.categories.includes(item.category)
      && (!searchQuery.trim() || `${item.question} ${item.answer}`.toLowerCase().includes(searchQuery.trim().toLowerCase())),
    ),
  })).filter((group) => group.questions.length > 0);

  return (
    <Shell>
      <div className="faq-page">
        <section
          className="faq-hero"
          aria-labelledby="faq-heading"
          style={{ backgroundImage: `linear-gradient(rgba(34, 15, 20, .52), rgba(34, 15, 20, .52)), url(${aboutStoryImage})` }}
        >
          <div className="eyebrow">Help centre</div>
          <h1 id="faq-heading">Frequently asked questions</h1>
          <p>Find quick answers to our most common questions.<span>Can&apos;t find what you&apos;re looking for? We&apos;re here to help.</span></p>
          <div className="faq-search-wrap">
            <Search aria-hidden="true" />
            <label className="sr-only" htmlFor="faq-search">Search for an answer</label>
            <input
              id="faq-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search for an answer"
              data-testid="input-faq-search"
            />
          </div>
        </section>

        <div className="container faq-content">
          <div className="faq-results" aria-live="polite">
            {groupedQuestions.length > 0 ? groupedQuestions.map((group) => (
              <section className="faq-group" key={group.label}>
                <h2>{group.label}</h2>
                {group.questions.map((item, index) => (
                  <details className="faq-item" key={item.question} open={openQuestion === item.question}>
                    <summary
                      onClick={(event) => {
                        event.preventDefault();
                        setOpenQuestion((current) => current === item.question ? "" : item.question);
                      }}
                      data-testid={`text-faq-question-${item.question}`}
                    >
                      <span className="faq-number">{String(index + 1).padStart(2, "0")}</span>
                      <span className="faq-question">{item.question}</span>
                      <span className="faq-item-symbol" aria-hidden="true" />
                    </summary>
                    <div className="faq-answer"><p>{item.answer}</p></div>
                  </details>
                ))}
              </section>
            )) : (
              <div className="faq-empty">
                <h2>No answers found yet.</h2>
                <p>Try another search, or send our team a note and we&apos;ll help you find the right answer.</p>
                <a className="button button-pink" href="/contact">Contact us</a>
              </div>
            )}
          </div>

          <section className="faq-support" aria-labelledby="faq-support-heading">
            <div className="faq-support-copy">
              <div className="faq-support-icon" aria-hidden="true"><Headphones /></div>
              <div>
                <div className="eyebrow">Customer care</div>
                <h2 id="faq-support-heading">Still need help?</h2>
                <p>Our friendly support team is here for you. Get in touch and we&apos;ll be happy to assist.</p>
                <a className="button button-pink" href="/contact" data-testid="link-faq-contact">Contact us</a>
              </div>
            </div>
            <div className="faq-support-image"><img src={aboutStoryImage} alt="Woman wearing a pink printed Glam Too dress" /></div>
          </section>
        </div>
      </div>
    </Shell>
  );
}

function Contact() {
  const submitEnquiry = useSubmitContactEnquiry();
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [submissionError, setSubmissionError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmissionMessage("");
    setSubmissionError("");
    const formData = new FormData(event.currentTarget);
    const form = event.currentTarget;
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const order = String(formData.get("order") ?? "").trim();
    const topic = String(formData.get("topic") ?? "").trim() as "Order help" | "Delivery" | "Returns" | "Product & sizing" | "Something else";
    const message = String(formData.get("message") ?? "").trim();
    submitEnquiry.mutate({ data: { name, email, order: order || undefined, topic, message } }, {
      onSuccess: (result) => {
        setSubmissionMessage(result.message);
        form.reset();
      },
      onError: (error) => {
        const apiError = error as Error & { data?: { error?: string } };
        setSubmissionError(apiError.data?.error || "Your message could not be sent. Please try again.");
      },
    });
  };

  return (
    <Shell>
      <div className="contact-care">
        <div className="contact-care-head">
          <div className="eyebrow">Customer Care</div>
          <h1>Contact us</h1>
          <p>We&apos;re here to make every experience effortless.<br />Tell us what you need and we&apos;ll take care of the rest.</p>
        </div>

        <div className="contact-cards">
          <div className="contact-card">
            <div className="contact-card-icon">
              <ShoppingBag />
            </div>
            <h3>Order support</h3>
            <p>Help with an existing order, returns or exchanges.</p>
            <a href="#contact-form" className="text-link">GET SUPPORT <span>&#8594;</span></a>
          </div>
          <div className="contact-card">
            <div className="contact-card-icon">
              <Truck />
            </div>
            <h3>Delivery &amp; returns</h3>
            <p>Track your order or start a return.</p>
            <Link href="/delivery-returns" className="text-link">LEARN MORE <span>&#8594;</span></Link>
          </div>
          <div className="contact-card">
            <div className="contact-card-icon">
              <Ruler />
            </div>
            <h3>Product &amp; sizing</h3>
            <p>Find sizing advice and product information.</p>
            <Link href="/faq" className="text-link">SIZE GUIDE <span>&#8594;</span></Link>
          </div>
        </div>

        <div className="contact-form-wrap" id="contact-form">
          <div className="contact-form-head">
            <h2>Send us a message</h2>
            <p>Complete the form below and our team will get back to you as soon as possible.</p>
          </div>
          <form className="contact-form" onSubmit={handleSubmit}>
              <div className="contact-form-grid">
                <div className="field">
                  <label htmlFor="contact-name">Name *</label>
                  <input id="contact-name" name="name" type="text" placeholder="Enter your name" required data-testid="input-contact-name" />
                </div>
                <div className="field">
                  <label htmlFor="contact-email">Email address *</label>
                  <input id="contact-email" name="email" type="email" placeholder="Enter your email address" required data-testid="input-contact-email" />
                </div>
                <div className="field">
                  <label htmlFor="contact-order">Order number (optional)</label>
                  <input id="contact-order" name="order" type="text" placeholder="e.g. #123456" />
                </div>
                <div className="field">
                  <label htmlFor="contact-topic">Choose a topic</label>
                  <select id="contact-topic" name="topic" defaultValue="" required data-testid="select-contact-topic">
                    <option value="" disabled>Select a topic</option>
                    <option>Order help</option>
                    <option>Delivery</option>
                    <option>Returns</option>
                    <option>Product &amp; sizing</option>
                    <option>Something else</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="contact-message">Message</label>
                <textarea id="contact-message" name="message" placeholder="Tell us more..." required data-testid="textarea-contact-message"></textarea>
              </div>
            <button className="button" type="submit" disabled={submitEnquiry.isPending} data-testid="button-contact-submit">{submitEnquiry.isPending ? "SENDING…" : "SEND MESSAGE"}</button>
            {submissionMessage && <p className="contact-form-success" role="status" data-testid="status-contact-success">{submissionMessage}</p>}
            {submissionError && <p className="contact-form-error" role="alert" data-testid="status-contact-error">{submissionError}</p>}
            {!submissionMessage && !submissionError && <p className="contact-form-note">Your message will be sent securely to the Glam Too team.</p>}
          </form>
        </div>

        <div className="contact-details">
          <div className="contact-detail">
            <div className="contact-detail-icon"><Mail /></div>
            <h4>Email us</h4>
            <p>hello@glamtoo.co.uk</p>
            <a href="mailto:hello@glamtoo.co.uk" className="text-link">SEND EMAIL <span>&#8594;</span></a>
          </div>
          <div className="contact-detail">
            <div className="contact-detail-icon"><Phone /></div>
            <h4>Call us</h4>
            <p>+44 20 7123 4567</p>
            <a href="tel:+442071234567" className="text-link">CALL NOW <span>&#8594;</span></a>
          </div>
          <div className="contact-detail">
            <div className="contact-detail-icon"><Clock /></div>
            <h4>Opening hours</h4>
            <div className="hours">
              <span>Mon - Fri</span><span>9am - 6pm</span>
              <span>Sat</span><span>10am - 4pm</span>
              <span>Sun</span><span>Closed</span>
            </div>
          </div>
          <div className="contact-detail">
            <div className="contact-detail-icon"><MessageSquare /></div>
            <h4>Response time</h4>
            <p>We aim to respond to all enquiries within 24 hours.</p>
          </div>
        </div>
      </div>

      <div className="contact-quick">
        <div className="contact-quick-inner">
          <div className="contact-quick-content">
            <div className="contact-quick-icon">
              <HelpCircle />
            </div>
            <div className="contact-quick-text">
              <h3>Looking for a quick answer?</h3>
              <p>Browse our FAQ for instant answers to the most common questions.</p>
            </div>
          </div>
          <Link href="/faq" className="text-link" style={{ color: 'var(--pink-deep)', borderColor: 'var(--pink-deep)' }}>VISIT OUR FAQ <span>&#8594;</span></Link>
        </div>
      </div>
    </Shell>
  );
}

function ReturnsPage() {
  const returnQuestions = [
    {
      question: "How do I make a return or exchange?",
      answer: "Contact our customer care team with your order number and the item you would like to return. We’ll send you the return address and instructions. Items must be returned unworn, unused, and with their original tags attached.",
    },
    {
      question: "What should I do if I receive an incorrect or faulty item?",
      answer: "Please contact us before sending the item back. Include your order number, a description of the problem, and clear photographs where possible. Our team will arrange the most appropriate replacement, exchange, or refund.",
    },
    {
      question: "What is the Glam Too returns policy?",
      answer: "Return requests must be made within 21 days of purchase. Returned items must be unused, undamaged, in their original packaging, and have all tags attached. Earrings and other hygiene-sensitive items cannot be returned unless faulty.",
    },
    {
      question: "How much does it cost to return an item?",
      answer: "Customers are responsible for return postage unless the item is incorrect or faulty. We recommend using a tracked postal service because returned parcels remain your responsibility until they reach us.",
    },
    {
      question: "How do I track my return?",
      answer: "Use the tracking number supplied by your chosen postal service. Keep your postage receipt until your return has been processed.",
    },
    {
      question: "Where is my refund?",
      answer: "We’ll email you after your return has been received and inspected. Approved refunds are sent to your original payment method. Your bank or card provider may take several working days to display the funds.",
    },
    {
      question: "Why have I been refunded a different amount?",
      answer: "Original delivery charges and return postage are not normally refundable. Discounts, promotional codes, and partial order returns can also affect the final refund amount. Contact us if you believe the amount is incorrect.",
    },
    {
      question: "What is the process for international returns?",
      answer: "Contact our team before returning an international order. You are responsible for return postage, customs forms, and any related charges. Mark the parcel clearly as returned goods to help prevent customs delays.",
    },
    {
      question: "How can I make a complaint?",
      answer: "Please use our contact form and include your order number and a clear description of the issue. Our customer care team will review your complaint and respond as soon as possible.",
    },
  ];

  return (
    <Shell>
      <main className="returns-page">
        <div className="container returns-page-inner">
          <nav className="returns-breadcrumb" aria-label="Breadcrumb">
            <Link href="/">Home</Link><span aria-hidden="true">/</span><span>Returns</span>
          </nav>

          <header className="returns-page-header">
            <div className="returns-page-icon"><RefreshCcw aria-hidden="true" /></div>
            <p className="eyebrow">Need some help?</p>
            <h1>Returns</h1>
            <p>Everything you need to know about returning an item and receiving your refund.</p>
          </header>

          <section className="returns-policy-card returns-faq-card" aria-label="Returns frequently asked questions">
            <div className="returns-faq-list">
              {returnQuestions.map((item, index) => (
                <details key={item.question} open={index === 0}>
                  <summary>{item.question}<ChevronDown aria-hidden="true" /></summary>
                  <div className="returns-faq-answer"><p>{item.answer}</p></div>
                </details>
              ))}
            </div>
          </section>

          <section className="returns-help">
            <div>
              <Mail aria-hidden="true" />
              <div>
                <h2>Need help with a return?</h2>
                <p>Our customer care team can help with your order, return, or refund.</p>
              </div>
            </div>
            <Link href="/contact" className="button button-pink">Contact us</Link>
          </section>
        </div>
      </main>
    </Shell>
  );
}

function DeliveryReturnsPage() {
  return (
    <Shell>
      <div className="dr-page">
        <header className="dr-hero">
          <div className="container">
            <div className="eyebrow">The useful details</div>
            <h1>Delivery & returns</h1>
            <p>Everything you need to know about getting your order and sending it back if it’s not quite right.</p>
          </div>
        </header>

        <section className="dr-section dr-delivery-section">
          <div className="container dr-grid">
            <div className="dr-sidebar">
              <div className="dr-icon-box"><Truck /></div>
              <h2>Delivery</h2>
              <p>We aim to dispatch all orders quickly, so your new pieces arrive when you need them.</p>
            </div>
            <div className="dr-content">
              <div className="dr-cards">
                <div className="dr-card">
                  <div className="dr-card-head">
                    <h3>Standard UK</h3>
                    <span className="dr-price">£3.95</span>
                  </div>
                  <div className="dr-card-body">
                    <p className="dr-time">2–4 working days</p>
                    <p className="dr-desc">Perfect for when you’re not in a rush. Delivered via our trusted courier partners.</p>
                    <div className="dr-promo">
                      <Sparkles />
                      <span>Free on orders of £75 or more</span>
                    </div>
                  </div>
                </div>

                <div className="dr-card">
                  <div className="dr-card-head">
                    <h3>Express UK</h3>
                    <span className="dr-price">£6.95</span>
                  </div>
                  <div className="dr-card-body">
                    <p className="dr-time">1–2 working days</p>
                    <p className="dr-desc">Need it sooner? Choose express delivery at checkout for priority dispatch.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="dr-section dr-returns-section">
          <div className="container dr-grid">
            <div className="dr-sidebar">
              <div className="dr-icon-box"><RefreshCcw /></div>
              <h2>Returns</h2>
              <p>Changed your mind? We gladly accept returns within 28 days of delivery.</p>
            </div>
            <div className="dr-content">
              <div className="dr-steps">
                <div className="dr-step">
                  <div className="dr-step-number">01</div>
                  <div className="dr-step-text">
                    <h4>Check your items</h4>
                    <p>Ensure items are unworn and have all original tags attached. Worn items may be declined.</p>
                  </div>
                </div>
                <div className="dr-step">
                  <div className="dr-step-number">02</div>
                  <div className="dr-step-text">
                    <h4>Email us to start</h4>
                    <p>Contact our team at <a href="mailto:hello@glamtoo.co.uk" className="text-link">hello@glamtoo.co.uk</a> with your order number to begin the process.</p>
                  </div>
                </div>
                <div className="dr-step">
                  <div className="dr-step-number">03</div>
                  <div className="dr-step-text">
                    <h4>Send it back</h4>
                    <p>We’ll provide you with a return address and instructions for sending your package safely back to us.</p>
                  </div>
                </div>
              </div>

              <div className="dr-note">
                <h4>A note on occasionwear</h4>
                <p>Please try on occasionwear over underwear and ensure you keep makeup, perfume, and deodorant away from garments. Items showing signs of wear may not be accepted for a refund.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="dr-cta-section">
          <div className="container">
            <div className="dr-cta-box">
              <Mail />
              <h2>Still have questions?</h2>
              <p>If you need help with a delivery or return, our team is always here for you.</p>
              <Link href="/contact" className="button button-pink">Get in touch</Link>
            </div>
          </div>
        </section>
      </div>
    </Shell>
  );
}

function LegalPage({ type }: { type: 'privacy' | 'terms' }) {
  const copy = type === 'privacy' ? { eyebrow: 'The small print', title: 'Privacy policy', heads: ['The short version', 'What we collect', 'How we use your information'], paras: ['We respect your information and only collect what we need to make your Glam Too experience work well. This policy explains what happens to your details when you browse or shop with us.', 'When you place an order, sign up to our notes or contact us, we may collect your name, contact details, delivery address and order information. We never sell your personal information.', 'We use information to process orders, answer your questions, improve our website and send emails you have chosen to receive. You can unsubscribe at any time.'] } : { eyebrow: 'The small print', title: 'Terms & conditions', heads: ['Using this site', 'Products and pricing', 'Orders'], paras: ['By using glamtoo.co.uk, you agree to use the site lawfully and with respect for our content, team and community. These terms apply to every visit and purchase.', 'We take care to keep product descriptions, colours and prices accurate. Occasionally a detail may change; if it affects your order, we will contact you before dispatch.', 'An order is confirmed when you receive our email confirmation. If we cannot fulfil an item, we will let you know and refund the unavailable part of your order.'] };
  return <Shell><div className="container legal"><div className="eyebrow">{copy.eyebrow}</div><h1>{copy.title}</h1>{copy.heads.map((head, index) => <section key={head}><h2>{head}</h2><p>{copy.paras[index]}</p></section>)}<p>Last updated: February 2026. For any questions, please <a className="text-link" href="/contact">contact our team</a>.</p></div></Shell>;
}

function Cart() {
  useLiveInventory();
  const [items, setItems] = useState<CartItem[]>(() => {
    const storedItems = getCartItems();
    const queryItem = getCartQueryItem();
    return queryItem && !storedItems.some((item) =>
      item.productId === queryItem.productId
      && item.size === queryItem.size
      && item.colour === queryItem.colour
      && item.variationId === queryItem.variationId,
    )
      ? [...storedItems, queryItem]
      : storedItems;
  });
  const products = getStorefrontProducts();
  const cartLines = items.flatMap((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    const variation = product?.type === 'Variable'
      ? product.variations.find((candidate) => candidate.id === item.variationId)
      : undefined;
    return product ? [{ item, product, variation }] : [];
  });
  const subtotal = cartLines.reduce((total, { item, product, variation }) => total + parsePounds(variation?.price ?? product.price) * item.quantity, 0);
  const deliveryAmount = calculateCheckoutDeliveryAmount("standard", subtotal);

  function removeCartItem(itemToRemove: CartItem) {
    const nextItems = items.filter((item) =>
      item.productId !== itemToRemove.productId
      || item.size !== itemToRemove.size
      || item.colour !== itemToRemove.colour
      || item.variationId !== itemToRemove.variationId,
    );
    setItems(nextItems);
    try {
      window.localStorage.setItem(cartStorageKey, JSON.stringify(nextItems));
      if (nextItems.length === 0) saveCheckoutPreferences({ couponCode: undefined });
    } catch {
      // The visible cart still updates if browser storage is unavailable.
    }
    const queryItem = getCartQueryItem();
    if (
      queryItem?.productId === itemToRemove.productId
      && queryItem.size === itemToRemove.size
      && queryItem.colour === itemToRemove.colour
      && queryItem.variationId === itemToRemove.variationId
    ) {
      window.history.replaceState({}, '', '/cart');
    }
    window.dispatchEvent(new Event('glam-cart-updated'));
  }

  function updateCartItemQuantity(itemToUpdate: CartItem, quantity: number) {
    const nextQuantity = Math.max(1, Math.floor(quantity));
    const nextItems = items.map((item) =>
      item.productId === itemToUpdate.productId
      && item.size === itemToUpdate.size
      && item.colour === itemToUpdate.colour
      && item.variationId === itemToUpdate.variationId
        ? { ...item, quantity: nextQuantity }
        : item,
    );
    setItems(nextItems);
    try {
      window.localStorage.setItem(cartStorageKey, JSON.stringify(nextItems));
    } catch {
      // The visible cart still updates if browser storage is unavailable.
    }
    window.dispatchEvent(new Event('glam-cart-updated'));
  }

  return (
    <Shell>
      <div className="container cart-page">
        <div className="eyebrow">Your edit</div>
        <h1>Your bag.</h1>
        {cartLines.length === 0 ? (
          <p>Your bag is empty. <a className="text-link" href="/shop">Continue shopping</a></p>
        ) : (
          <div className="cart-layout">
            <div>
              {cartLines.map(({ item, product, variation }) => (
                <div className="cart-item" key={`${item.productId}-${item.variationId ?? item.size}-${item.colour ?? ''}`}>
                  <img src={product.image} alt={product.name} style={{ objectPosition: product.position }} />
                  <div>
                    <h3>{product.name}</h3>
                    <p>{[item.size !== 'One size' ? item.size : '', item.colour ?? '', ...Object.values(item.options ?? {})].filter(Boolean).join(' · ')}</p>
                    <div className="cart-quantity" aria-label={`Quantity for ${product.name}`}>
                      <button
                        className="cart-quantity-button"
                        type="button"
                        aria-label={`Decrease quantity of ${product.name}`}
                        data-testid={`button-decrease-cart-${item.productId}-${item.variationId ?? item.size.replace(/\s+/g, '-').toLowerCase()}`}
                        disabled={item.quantity <= 1}
                        onClick={() => updateCartItemQuantity(item, item.quantity - 1)}
                      >
                        −
                      </button>
                      <span className="cart-quantity-value" aria-live="polite">{item.quantity}</span>
                      <button
                        className="cart-quantity-button"
                        type="button"
                        aria-label={`Increase quantity of ${product.name}`}
                        data-testid={`button-increase-cart-${item.productId}-${item.variationId ?? item.size.replace(/\s+/g, '-').toLowerCase()}`}
                        disabled={item.quantity >= (variation?.stock ?? product.stock)}
                        onClick={() => updateCartItemQuantity(item, item.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                    <a className="text-link" href={`/product/${product.slug}`}>Edit item</a>
                  </div>
                  <strong>{formatPounds(parsePounds(variation?.price ?? product.price) * item.quantity)}</strong>
                  <button className="cart-remove" type="button" aria-label={`Remove ${product.name}`} data-testid={`button-remove-cart-${item.productId}-${item.variationId ?? item.size.replace(/\s+/g, '-').toLowerCase()}`} onClick={() => removeCartItem(item)}>×</button>
                </div>
              ))}
              <a className="text-link" href="/shop" data-testid="link-cart-continue">Continue shopping</a>
            </div>
            <aside className="cart-summary">
              <h2>Summary</h2>
              <div className="summary-row"><span>Subtotal</span><span>{formatPounds(subtotal)}</span></div>
              <div className="summary-row"><span>Standard delivery</span><span>{deliveryAmount === 0 ? "Free" : formatPounds(deliveryAmount)}</span></div>
              <div className="summary-row total"><span>Total</span><span>{formatPounds(subtotal + deliveryAmount)}</span></div>
              <a className="button button-pink" href="/checkout" data-testid="link-checkout">Go to checkout</a>
            </aside>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Checkout() {
  useLiveInventory();
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [cardError, setCardError] = useState("");
  const [delivery, setDelivery] = useState<string>(() => getCheckoutPreferences().delivery ?? "standard");
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [shippingMethodsLoading, setShippingMethodsLoading] = useState(true);
  const [shippingMethodsError, setShippingMethodsError] = useState("");
  const [publishableKey, setPublishableKey] = useState("");
  const [paymentSetupError, setPaymentSetupError] = useState("");
  const [checkoutProfile, setCheckoutProfile] = useState<CustomerProfile>(emptyCustomerProfile);
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<SavedPaymentMethod[]>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
  const [couponCode, setCouponCode] = useState(() => getCheckoutPreferences().couponCode ?? "");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponMessage, setCouponMessage] = useState("");
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const cardMountRef = useRef<HTMLDivElement | null>(null);
  const stripePaymentRef = useRef<{ stripe: StripeJs; card: StripeCardElement } | null>(null);
  const stripeClientRef = useRef<StripeJs | null>(null);
  const products = getStorefrontProducts();
  const storedItems = getCartItems();
  const queryItem = getCartQueryItem();
  const checkoutItems = queryItem && !storedItems.some((item) =>
    item.productId === queryItem.productId
    && item.size === queryItem.size
    && item.colour === queryItem.colour
    && item.variationId === queryItem.variationId,
  ) ? [...storedItems, queryItem] : storedItems;
  const cartLines = checkoutItems.flatMap((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    const variation = product?.type === "Variable"
      ? product.variations.find((candidate) => candidate.id === item.variationId)
      : undefined;
    return product ? [{ item, product, variation }] : [];
  });
  const subtotal = cartLines.reduce((total, { item, product, variation }) => total + parsePounds(variation?.price ?? product.price) * item.quantity, 0);

  useEffect(() => {
    setShippingMethodsLoading(true);
    setShippingMethodsError("");
    fetch("/api/shipping-methods", { credentials: "include" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Shipping methods unavailable")))
      .then((result: { shippingMethods?: ShippingMethod[] }) => {
        const methods = result.shippingMethods ?? [];
        setShippingMethods(methods);
        if (methods.length && !methods.some((method) => method.id === delivery)) {
          setDelivery(methods[0].id);
          saveCheckoutPreferences({ delivery: methods[0].id });
        }
      })
      .catch((error: unknown) => {
        setShippingMethods([]);
        setShippingMethodsError(error instanceof Error ? error.message : "Shipping methods could not be loaded.");
      })
      .finally(() => setShippingMethodsLoading(false));
  }, []);

  function checkoutLinePayload() {
    return cartLines.map(({ item, product, variation }) => ({
      productId: String(product.id),
      variationId: variation ? String(variation.id) : undefined,
      quantity: item.quantity,
    }));
  }

  async function applyCoupon(codeValue = couponCode, silent = false) {
    const code = codeValue.trim();
    if (!code) {
      setCouponError("Enter a coupon code.");
      setCouponMessage("");
      return;
    }
    setCouponLoading(true);
    setCouponError("");
    if (!silent) setCouponMessage("");
    try {
      const response = await fetch("/api/stripe/coupon/validate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, lines: checkoutLinePayload(), delivery }),
      });
      const result = await response.json() as { coupon?: AppliedCoupon["coupon"]; discountAmount?: number; total?: number; vatAmount?: number; deliveryAmount?: number; error?: string };
      if (!response.ok || !result.coupon || typeof result.discountAmount !== "number" || typeof result.total !== "number" || typeof result.vatAmount !== "number" || typeof result.deliveryAmount !== "number") {
        throw new Error(result.error || "That coupon could not be applied.");
      }
      setCouponCode(result.coupon.code);
      setAppliedCoupon({ coupon: result.coupon, discountAmount: result.discountAmount, total: result.total, vatAmount: result.vatAmount, deliveryAmount: result.deliveryAmount });
      saveCheckoutPreferences({ delivery, couponCode: result.coupon.code });
      if (!silent) setCouponMessage(`${result.coupon.code} has been applied.`);
    } catch (error) {
      setAppliedCoupon(null);
      if (silent) saveCheckoutPreferences({ couponCode: undefined });
      setCouponError(error instanceof Error ? error.message : "That coupon could not be applied.");
    } finally {
      setCouponLoading(false);
    }
  }

  useEffect(() => {
    if (cartLines.length === 0) {
      setCouponCode("");
      setAppliedCoupon(null);
      saveCheckoutPreferences({ couponCode: undefined });
      setLocation(`${basePath}/cart`);
    }
  }, [cartLines.length, setLocation]);

  useEffect(() => {
    let cancelled = false;
    setPaymentSetupError("");
    fetch("/api/stripe/payment-config", { credentials: "include" })
      .then(async (response) => {
        const payload = await response.json() as { publishableKey?: string; error?: string };
        if (!response.ok || !payload.publishableKey) throw new Error(payload.error || "Stripe card payments are unavailable.");
        if (!cancelled) setPublishableKey(payload.publishableKey);
      })
      .catch((error) => {
        if (!cancelled) setPaymentSetupError(error instanceof Error ? error.message : "Stripe card payments are unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    Promise.all([
      fetch("/api/account/profile", { credentials: "include" }).then(async (response) => {
        const result = await response.json() as { profile?: CustomerProfile };
        return response.ok ? result.profile : undefined;
      }),
      fetch("/api/stripe/payment-methods", { credentials: "include" }).then(async (response) => {
        const result = await response.json() as { paymentMethods?: SavedPaymentMethod[] };
        return response.ok && Array.isArray(result.paymentMethods) ? result.paymentMethods : [];
      }),
    ])
      .then(([profile, paymentMethods]) => {
        if (cancelled) return;
        if (profile) setCheckoutProfile(profile);
        setSavedPaymentMethods(paymentMethods);
        if (paymentMethods[0]) setSelectedPaymentMethodId(paymentMethods[0].id);
      })
      .catch(() => {
        // Checkout stays available with blank fields if saved details cannot be loaded.
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (appliedCoupon) void applyCoupon(appliedCoupon.coupon.code, true);
  // Recalculate percent discounts whenever delivery changes; the server remains authoritative.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivery]);

  useEffect(() => {
    const restoredCouponCode = getCheckoutPreferences().couponCode;
    if (restoredCouponCode) void applyCoupon(restoredCouponCode, true);
  // Restore and revalidate a coupon saved before the page reload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!publishableKey) return;
    let cancelled = false;
    let card: StripeCardElement | null = null;
    void loadStripeJs()
      .then(() => {
        const stripe = window.Stripe?.(publishableKey);
        if (!stripe) throw new Error("Stripe payments could not be initialized.");
        if (cancelled) return;
        stripeClientRef.current = stripe;
        if (selectedPaymentMethodId || !cardMountRef.current) return;
        card = stripe.elements().create("card", {
          disableLink: true,
          hidePostalCode: true,
          style: {
            base: {
              color: "#171615",
              fontFamily: "DM Sans, sans-serif",
              fontSize: "16px",
              "::placeholder": { color: "#827975" },
            },
            invalid: { color: "#b42342" },
          },
        });
        card.mount(cardMountRef.current);
        card.on("change", (event) => setCardError(event.error?.message ?? ""));
        stripePaymentRef.current = { stripe, card };
      })
      .catch((error) => {
        if (!cancelled) setPaymentSetupError(error instanceof Error ? error.message : "Stripe payments are unavailable.");
      });
    return () => {
      cancelled = true;
      stripeClientRef.current = null;
      stripePaymentRef.current = null;
      card?.destroy();
    };
  }, [publishableKey, selectedPaymentMethodId]);

  async function beginStripeCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSignedIn) {
      setPaymentError("Sign in before checkout so this order is saved to your account.");
      return;
    }
    if (shippingMethodsLoading || !selectedShipping) {
      setPaymentError(shippingMethodsLoading ? "Delivery options are still loading. Please wait a moment." : shippingMethodsError || "Choose an available delivery method before paying.");
      return;
    }
    if (cartLines.length === 0) {
      setPaymentError("Your bag is empty. Add a piece before checking out.");
      return;
    }

    if (!selectedPaymentMethodId && !stripePaymentRef.current) {
      setPaymentError(paymentSetupError || "Stripe card fields are still loading. Please wait a moment and try again.");
      return;
    }

    setIsPaying(true);
    setPaymentError("");
    const formData = new FormData(event.currentTarget);
    const lines = checkoutLinePayload();

    try {
      const pendingPaymentIntentId = localStorage.getItem(pendingCouponPaymentStorageKey);
      if (pendingPaymentIntentId) {
        const abandonmentResponse = await fetch("/api/stripe/abandon-payment", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentIntentId: pendingPaymentIntentId }),
        });
        if (!abandonmentResponse.ok) {
          const abandonmentResult = await abandonmentResponse.json() as { paymentSucceeded?: boolean };
          if (abandonmentResult.paymentSucceeded) {
            window.location.assign(`${basePath}/order-confirmation?payment_intent=${encodeURIComponent(pendingPaymentIntentId)}`);
            return;
          }
          throw new Error("We still need to cancel your earlier payment attempt. Please try again in a moment.");
        }
        localStorage.removeItem(pendingCouponPaymentStorageKey);
      }
      const customerName = [formData.get("firstName"), formData.get("lastName")].filter(Boolean).join(" ");
      const response = await fetch("/api/stripe/payment-intent", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          customerName,
          phone: formData.get("phone"),
          lines,
          delivery,
          couponCode: appliedCoupon?.coupon.code,
          paymentMethodId: selectedPaymentMethodId || undefined,
          address: {
            line1: formData.get("address"),
            line2: formData.get("addressTwo"),
            city: formData.get("city"),
            postcode: formData.get("postcode"),
            country: formData.get("country"),
          },
        }),
      });
      const result = await response.json() as { clientSecret?: string; paymentIntentId?: string; error?: string };
      if (!response.ok || !result.clientSecret) throw new Error(result.error || "Stripe checkout is not available right now.");
      if (result.paymentIntentId) {
        localStorage.setItem(pendingCouponPaymentStorageKey, result.paymentIntentId);
      }

      const billingDetails = {
        name: customerName,
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? "") || undefined,
        address: {
          line1: String(formData.get("address") ?? ""),
          line2: String(formData.get("addressTwo") ?? "") || undefined,
          city: String(formData.get("city") ?? ""),
          postal_code: String(formData.get("postcode") ?? ""),
          country: String(formData.get("country") ?? "GB"),
        },
      };
      let stripe = stripePaymentRef.current?.stripe ?? stripeClientRef.current;
      if (!stripe) {
        await loadStripeJs();
        stripe = window.Stripe?.(publishableKey) ?? null;
        if (stripe) stripeClientRef.current = stripe;
      }
      if (!stripe) throw new Error("Stripe payments are still loading. Please wait a moment and try again.");
      const paymentMethod = selectedPaymentMethodId
        ? selectedPaymentMethodId
        : stripePaymentRef.current?.card
          ? {
              card: stripePaymentRef.current.card,
              billing_details: billingDetails,
            }
          : null;
      if (!paymentMethod) throw new Error("Stripe card fields are still loading. Please wait a moment and try again.");
      const confirmation = await stripe.confirmCardPayment(result.clientSecret, {
        payment_method: paymentMethod,
        return_url: `${window.location.origin}${basePath}/order-confirmation`,
      });
      if (confirmation.error) {
        if (result.paymentIntentId) {
          const abandonmentResponse = await fetch("/api/stripe/abandon-payment", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paymentIntentId: result.paymentIntentId }),
          }).catch(() => undefined);
          if (!abandonmentResponse?.ok) {
            throw new Error("Your card was not charged, but we still need to cancel this coupon payment attempt. Please try again in a moment.");
          }
          localStorage.removeItem(pendingCouponPaymentStorageKey);
        }
        throw new Error(confirmation.error.message || "Your card could not be confirmed.");
      }
      if (confirmation.paymentIntent?.status !== "succeeded") throw new Error("Your payment needs additional confirmation. Please try again.");
      const finaliseResponse = await fetch("/api/stripe/finalize-payment", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId: confirmation.paymentIntent.id }),
      });
      if (!finaliseResponse.ok) {
        window.location.assign(`${basePath}/order-confirmation?payment_intent=${encodeURIComponent(confirmation.paymentIntent.id)}`);
        return;
      }
      localStorage.removeItem(pendingCouponPaymentStorageKey);
      clearCart();
      window.location.assign(`${basePath}/order-confirmation?payment_intent=${encodeURIComponent(confirmation.paymentIntent.id)}`);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Unable to start Stripe checkout.");
      setIsPaying(false);
    }
  }

  const selectedShipping = shippingMethods.find((method) => method.id === delivery);
  const standardDeliveryCharge = selectedShipping
    ? (selectedShipping.freeOver !== null && subtotal >= selectedShipping.freeOver / 100 ? 0 : selectedShipping.price / 100)
    : calculateCheckoutDeliveryAmount("standard", subtotal);
  const deliveryAmount = appliedCoupon ? appliedCoupon.deliveryAmount / 100 : standardDeliveryCharge;
  const discountAmount = appliedCoupon ? appliedCoupon.discountAmount / 100 : 0;
  const total = Math.max(0, subtotal + deliveryAmount - discountAmount);
  const vatAmount = appliedCoupon ? appliedCoupon.vatAmount / 100 : Math.round(total * 100 / 6) / 100;
  const updateCheckoutProfile = (field: keyof CustomerProfile, value: string) => {
    setCheckoutProfile((current) => ({ ...current, [field]: value }));
  };

  if (cartLines.length === 0) return null;

  return (
    <Shell>
      <main className="container checkout-page">
        <header className="checkout-heading">
          <div>
            <div className="eyebrow">Nearly yours</div>
            <h1>Checkout.</h1>
            <p>Enter your details, review your order, then pay securely with Stripe.</p>
          </div>
          <a className="text-link" href="/cart">Return to bag</a>
        </header>
        <form className="checkout-layout" onSubmit={beginStripeCheckout}>
          <div className="checkout-details">
            {!isSignedIn && <div className="checkout-account-notice"><strong>Sign in to save this order to your account.</strong><a className="text-link" href="/account">Sign in or create an account</a></div>}
            <section className="checkout-section">
              <div className="checkout-section-heading"><span>01</span><div><h2>Billing details</h2><p>We&apos;ll use these details for your payment confirmation.</p></div></div>
              <div className="checkout-field-grid">
                <div className="field"><label htmlFor="checkout-first-name">First name</label><input id="checkout-first-name" name="firstName" type="text" required data-testid="input-checkout-first-name" value={checkoutProfile.firstName} onChange={(event) => updateCheckoutProfile("firstName", event.target.value)} /></div>
                <div className="field"><label htmlFor="checkout-last-name">Last name</label><input id="checkout-last-name" name="lastName" type="text" required data-testid="input-checkout-last-name" value={checkoutProfile.lastName} onChange={(event) => updateCheckoutProfile("lastName", event.target.value)} /></div>
                <div className="field checkout-field-wide"><label htmlFor="checkout-email">Email address</label><input id="checkout-email" name="email" type="email" required autoComplete="email" data-testid="input-checkout-email" value={checkoutProfile.email} onChange={(event) => updateCheckoutProfile("email", event.target.value)} /></div>
                <div className="field checkout-field-wide"><label htmlFor="checkout-country">Country / region</label><select id="checkout-country" name="country" value={checkoutProfile.country} onChange={(event) => updateCheckoutProfile("country", event.target.value)}><option value="GB">United Kingdom</option></select></div>
                <div className="field checkout-field-wide"><label htmlFor="checkout-address">Street address</label><input id="checkout-address" name="address" type="text" required autoComplete="address-line1" placeholder="House number and street name" data-testid="input-checkout-address" value={checkoutProfile.addressLine1} onChange={(event) => updateCheckoutProfile("addressLine1", event.target.value)} /></div>
                <div className="field checkout-field-wide"><label htmlFor="checkout-address-two">Address line 2 <span>Optional</span></label><input id="checkout-address-two" name="addressTwo" type="text" autoComplete="address-line2" placeholder="Apartment, suite, unit, etc." value={checkoutProfile.addressLine2} onChange={(event) => updateCheckoutProfile("addressLine2", event.target.value)} /></div>
                <div className="field"><label htmlFor="checkout-city">Town or city</label><input id="checkout-city" name="city" type="text" required autoComplete="address-level2" data-testid="input-checkout-city" value={checkoutProfile.city} onChange={(event) => updateCheckoutProfile("city", event.target.value)} /></div>
                <div className="field"><label htmlFor="checkout-postcode">Postcode</label><input id="checkout-postcode" name="postcode" type="text" required autoComplete="postal-code" data-testid="input-checkout-postcode" value={checkoutProfile.postcode} onChange={(event) => updateCheckoutProfile("postcode", event.target.value)} /></div>
                <div className="field checkout-field-wide"><label htmlFor="checkout-phone">Phone <span>Optional</span></label><input id="checkout-phone" name="phone" type="tel" autoComplete="tel" placeholder="For delivery updates only" value={checkoutProfile.phone} onChange={(event) => updateCheckoutProfile("phone", event.target.value)} /></div>
              </div>
            </section>
            <section className="checkout-section">
              <div className="checkout-section-heading"><span>02</span><div><h2>Shipping</h2><p>Choose how quickly you&apos;d like your order to arrive.</p></div></div>
              <div className="checkout-delivery-options">
                {shippingMethods.map((method) => {
                  const charge = method.freeOver !== null && subtotal >= method.freeOver / 100 ? 0 : method.price / 100;
                  return <label key={method.id} className={`checkout-delivery-option ${delivery === method.id ? "is-selected" : ""}`}><input type="radio" name="delivery" value={method.id} checked={delivery === method.id} onChange={() => { setDelivery(method.id); saveCheckoutPreferences({ delivery: method.id }); setAppliedCoupon(null); }} /><span><strong>{method.name}</strong><small>{method.description}</small></span><b>{charge === 0 ? "Free" : formatPounds(charge)}</b></label>;
                })}
              </div>
              {shippingMethodsLoading && <p className="checkout-payment-error" role="status">Loading delivery options…</p>}
              {!shippingMethodsLoading && shippingMethodsError && <p className="checkout-payment-error" role="alert">{shippingMethodsError}</p>}
              {!shippingMethodsLoading && !shippingMethodsError && shippingMethods.length === 0 && <p className="checkout-payment-error" role="alert">No delivery methods are currently available. Please try again later.</p>}
            </section>
            <section className="checkout-section checkout-payment-section">
              <div className="checkout-section-heading"><span>03</span><div><h2>Payment</h2><p>Your card details are encrypted and sent directly to Stripe.</p></div></div>
              <div className="checkout-stripe-note"><strong>Pay securely with Stripe</strong><span>Card payments · protected checkout</span></div>
              {savedPaymentMethods.length > 0 && <div className="checkout-saved-cards" aria-label="Saved payment methods">
                <p>Choose a saved card or enter a new one.</p>
                {savedPaymentMethods.map((method) => <label key={method.id}><input type="radio" name="saved-payment-method" checked={selectedPaymentMethodId === method.id} onChange={() => setSelectedPaymentMethodId(method.id)} /><span><strong>{method.brand.toUpperCase()} ending in {method.last4}</strong><small>Expires {String(method.expMonth).padStart(2, "0")}/{method.expYear}</small></span></label>)}
                <label><input type="radio" name="saved-payment-method" checked={!selectedPaymentMethodId} onChange={() => setSelectedPaymentMethodId("")} /><span><strong>Use a new card</strong><small>Securely save it with Stripe for later</small></span></label>
              </div>}
              {paymentSetupError ? <p className="checkout-payment-error" role="alert">{paymentSetupError}</p> : !selectedPaymentMethodId && <div className="checkout-card-field" ref={cardMountRef} data-testid="stripe-card-field" aria-label="Card details" />}
              {cardError && <p className="checkout-payment-error" role="alert">{cardError}</p>}
            </section>
            {paymentError && <p className="checkout-payment-error" role="alert">{paymentError}</p>}
          </div>
          <aside className="checkout-order-review">
            <div className="checkout-order-heading"><h2>Your order</h2><span>{cartLines.reduce((count, { item }) => count + item.quantity, 0)} item{cartLines.reduce((count, { item }) => count + item.quantity, 0) === 1 ? "" : "s"}</span></div>
            {cartLines.length === 0 ? <div className="checkout-empty-order"><p>Your bag is empty.</p><a className="text-link" href="/shop">Continue shopping</a></div> : <div className="checkout-order-items">{cartLines.map(({ item, product, variation }) => <article className="checkout-order-item" key={`${item.productId}-${item.variationId ?? item.size}-${item.colour ?? ""}`}><img src={product.image} alt={product.name} style={{ objectPosition: product.position }} /><div><h3>{product.name}</h3><p>{[item.size !== "One size" ? item.size : "", item.colour ?? "", ...Object.values(item.options ?? {})].filter(Boolean).join(" · ") || "One size"} · Qty {item.quantity}</p></div><strong>{formatPounds(parsePounds(variation?.price ?? product.price) * item.quantity)}</strong></article>)}</div>}
            <div className="checkout-coupon" aria-label="Coupon code">
              <label htmlFor="checkout-coupon-code">Coupon code</label>
              {appliedCoupon ? (
                <div className="checkout-applied-coupon"><span><strong>{appliedCoupon.coupon.code}</strong><small>{appliedCoupon.coupon.discountType === "percentage" ? `${appliedCoupon.coupon.discountValue}% off` : `${formatPounds(appliedCoupon.coupon.discountValue / 100)} off`}</small></span><button type="button" onClick={() => { setAppliedCoupon(null); saveCheckoutPreferences({ couponCode: undefined }); setCouponMessage("Coupon removed."); setCouponError(""); }}>Remove</button></div>
              ) : (
                <div className="checkout-coupon-form"><input id="checkout-coupon-code" value={couponCode} onChange={(event) => { setCouponCode(event.target.value.toUpperCase()); setCouponError(""); }} placeholder="Enter code" autoComplete="off" data-testid="input-coupon-code" /><button type="button" onClick={() => void applyCoupon()} disabled={couponLoading} data-testid="button-apply-coupon">{couponLoading ? "Applying…" : "Apply"}</button></div>
              )}
              {couponError && <p className="checkout-coupon-error" role="alert">{couponError}</p>}
              {couponMessage && <p className="checkout-coupon-success" role="status">{couponMessage}</p>}
            </div>
            <div className="checkout-totals"><div><span>Subtotal</span><strong>{formatPounds(subtotal)}</strong></div><div><span>Delivery</span><strong>{deliveryAmount === 0 ? "Free" : formatPounds(deliveryAmount)}</strong></div>{appliedCoupon && <div className="checkout-discount-row"><span>Discount · {appliedCoupon.coupon.code}</span><strong>−{formatPounds(discountAmount)}</strong></div>}<div><span>VAT included (20%)</span><strong>{formatPounds(vatAmount)}</strong></div><div className="checkout-total"><span>Total</span><strong>{formatPounds(total)}</strong></div></div>
             <button className="button checkout-pay-button" type="submit" disabled={!isLoaded || !isSignedIn || isPaying || !publishableKey || Boolean(paymentSetupError) || cartLines.length === 0 || shippingMethodsLoading || shippingMethods.length === 0 || !selectedShipping} data-testid="button-place-order">{isPaying ? "Processing secure payment…" : shippingMethodsLoading ? "Loading delivery options…" : shippingMethods.length === 0 ? "Delivery unavailable" : !isLoaded ? "Checking account…" : !isSignedIn ? "Sign in to checkout" : !publishableKey ? "Loading secure payment…" : `Pay securely · ${formatPounds(total)}`}</button>
            <p className="checkout-security-copy">Your card details never touch Glam Too&apos;s servers. Stripe processes your payment securely.</p>
          </aside>
        </form>
      </main>
    </Shell>
  );
}

function Confirmation() {
  const [state, setState] = useState<"confirming" | "confirmed" | "error" | "missing">("confirming");
  const [order, setOrder] = useState<CustomerOrder | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentIntentId = params.get("payment_intent");
    const checkoutSessionId = params.get("stripe_session_id");
    if (!paymentIntentId && !checkoutSessionId) {
      setState("missing");
      return;
    }
    let active = true;
    async function confirmOrder() {
      try {
        const response = await fetch("/api/stripe/finalize-payment", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(paymentIntentId ? { paymentIntentId } : { checkoutSessionId }),
        });
        const result = await response.json() as { order?: CustomerOrder; error?: string };
        if (!response.ok || !result.order) throw new Error(result.error || "Your payment is still being confirmed.");
        if (!active) return;
        if (paymentIntentId === localStorage.getItem(pendingCouponPaymentStorageKey)) {
          localStorage.removeItem(pendingCouponPaymentStorageKey);
        }
        clearCart();
        setOrder(result.order);
        setState("confirmed");
      } catch {
        if (active) setState("error");
      }
    }
    void confirmOrder();
    return () => { active = false; };
  }, []);

  if (state === "confirming") {
    return <Shell><div className="container confirmation"><div className="confirmation-mark">…</div><div className="eyebrow">Confirming payment</div><h1>One moment.</h1><p>We&apos;re saving your paid order securely. Please keep this page open.</p></div></Shell>;
  }
  if (state === "error") {
    return <Shell><div className="container confirmation"><div className="confirmation-mark">!</div><div className="eyebrow">Payment received</div><h1>We&apos;re confirming your order.</h1><p>Your card payment may have succeeded, but we have not yet received a saved order confirmation. Your bag has been kept safe. Refresh this page in a moment to check again.</p><button className="button button-pink" type="button" onClick={() => window.location.reload()}>Check my order</button></div></Shell>;
  }
  if (state === "missing") {
    return <Shell><div className="container confirmation"><div className="eyebrow">Order confirmation</div><h1>We need your payment reference.</h1><p>Return to your account to view confirmed orders, or contact us if you have been charged.</p><a className="button button-pink" href="/account">View my orders</a></div></Shell>;
  }
  if (order?.paymentResolution && order.paymentResolution !== "none") {
    const copy = paymentResolutionCopy(order);
    return <Shell><div className="container confirmation"><div className="confirmation-mark">!</div><div className="eyebrow">Payment received</div><h1>{copy.title}</h1><p>{copy.detail}</p><p>Your reference is {order.id}. You can check this update any time in your account.</p><a className="button button-pink" href="/account">View my orders</a></div></Shell>;
  }
  return <Shell><div className="container confirmation"><div className="confirmation-mark">✓</div><div className="eyebrow">Order received</div><h1>It&apos;s a yes.</h1><p>Thank you for shopping Glam Too. Your order {order?.id} is being wrapped with care.</p><a className="button button-pink" href="/shop" data-testid="link-confirmation-shop">Keep browsing</a></div></Shell>;
}

function CustomerSignInPage() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <Shell><div className="customer-auth-page"><p>Loading your account…</p></div></Shell>;
  return isSignedIn ? <CustomerAccountPage /> : <CustomerSignInContent />;
}

function CustomerSignInContent() {
  return <Shell><div className="customer-auth-page"><div className="customer-auth-copy"><div className="eyebrow">Your Glam Too account</div><h1>Welcome back.</h1><p>Sign in to manage your details and make shopping your next plan even easier.</p></div><div className="customer-auth-card"><SignIn signUpUrl={`${basePath}/register`} fallbackRedirectUrl={basePath || '/'} /><a className="customer-recovery-link" href={`${basePath}/account/recovery`}>Forgot your password?</a></div></div></Shell>;
}

function formatCustomerOrderDate(value: string | null) {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

function formatCustomerOrderCountry(value: string) {
  if (value.toUpperCase() === "GB" || value.toUpperCase() === "UK") return "United Kingdom";
  return value;
}

function customerOrderStatus(order: CustomerOrder) {
  return order.paymentStatus === "cancelled" ? "Cancelled" : order.status;
}
function CustomerOrderDetailPage({ order, onBack }: { order: CustomerOrder; onBack: () => void }) {
  const itemSubtotal = order.subtotal ?? order.items.reduce((total, item) => total + item.total, 0);
  const discountAmount = order.discountAmount ?? 0;
  const deliveryAmount = order.deliveryAmount ?? Math.max(order.total - itemSubtotal + discountAmount, 0);
  const vatAmount = order.vatAmount ?? Math.round(order.total / 6);
  const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);
  const addressParts = [
    order.delivery.address.line1,
    order.delivery.address.line2,
    order.delivery.address.city,
    order.delivery.address.postcode,
    formatCustomerOrderCountry(order.delivery.address.country),
  ].filter(Boolean);

  return (
    <div className="account-order-page">
      <div className="account-order-page-topbar">
        <button className="account-order-back" type="button" onClick={onBack}>← Back to orders</button>
        <span>Glam Too order history</span>
      </div>
      <div className="account-order-page-heading">
        <div>
          <div className="eyebrow">Order details</div>
          <h2>{order.id}</h2>
          <p>Placed {formatCustomerOrderDate(order.placedAt)}</p>
        </div>
        <div className="account-order-page-total">
          <strong>{formatPounds(order.total / 100)}</strong>
          <span className={`account-order-status ${customerOrderStatus(order).toLowerCase().replace(/\s+/g, "-")}`}>{customerOrderStatus(order)}</span>
        </div>
      </div>
      {order.paymentResolution && order.paymentResolution !== "none" && (
        <section className="account-payment-resolution" role="status">
          <div className="eyebrow">Payment update</div>
          <h3>{paymentResolutionCopy(order).title}</h3>
          <p>{paymentResolutionCopy(order).detail}</p>
        </section>
      )}

      <div className="account-order-page-layout">
        <section className="account-order-detail-card">
          <div className="account-order-detail-heading">
            <div><div className="eyebrow">Your purchase</div><h3>Items</h3></div>
            <span>{itemCount} item{itemCount === 1 ? "" : "s"}</span>
          </div>
          {order.items.length > 0 ? (
            <div className="account-order-detail-items">
              {order.items.map((item, index) => (
                <div className="account-order-detail-item" key={`${item.productId ?? item.name}-${index}`}>
                  <div><strong>{item.name}</strong><span>Quantity {item.quantity}</span></div>
                  <strong>{formatPounds(item.total / 100)}</strong>
                </div>
              ))}
            </div>
          ) : <p className="account-muted">Item details are being prepared.</p>}
          <div className="account-order-detail-totals">
            <div><span>Items subtotal</span><strong>{formatPounds(itemSubtotal / 100)}</strong></div>
            {deliveryAmount > 0 && <div><span>{order.delivery.method}</span><strong>{formatPounds(deliveryAmount / 100)}</strong></div>}
            {discountAmount > 0 && <div><span>Coupon {order.couponCode || ""}</span><strong>−{formatPounds(discountAmount / 100)}</strong></div>}
            <div><span>VAT included (20%)</span><strong>{formatPounds(vatAmount / 100)}</strong></div>
            <div className="account-order-detail-total"><span>Order total</span><strong>{formatPounds(order.total / 100)}</strong></div>
          </div>
        </section>

        <aside className="account-order-page-sidebar">
          <section className="account-order-detail-card">
            <div className="account-order-detail-heading"><div><div className="eyebrow">Delivery</div><h3>Delivery details</h3></div></div>
            <dl className="account-order-detail-list">
              <div><dt>Method</dt><dd>{order.delivery.method}</dd></div>
              <div><dt>Recipient</dt><dd>{order.delivery.name || "Recipient unavailable"}</dd></div>
            </dl>
            <address className="account-order-detail-address">
              {addressParts.length > 0 ? addressParts.map((part, index) => <span key={`${part}-${index}`}>{part}</span>) : <span>Address unavailable</span>}
            </address>
          </section>
          <section className="account-order-detail-card">
            <div className="account-order-detail-heading"><div><div className="eyebrow">Payment</div><h3>Payment details</h3></div></div>
            <dl className="account-order-detail-list">
              <div><dt>Payment status</dt><dd>{order.paymentStatus === "cancelled" ? "Payment received · order cancelled" : "Paid"}</dd></div>
              <div><dt>Payment method</dt><dd>Card via Stripe</dd></div>
              <div><dt>Email receipt</dt><dd>{order.email || "Email unavailable"}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

function PaymentMethodsPanel({ profile }: { profile: CustomerProfile }) {
  const [paymentMethods, setPaymentMethods] = useState<SavedPaymentMethod[]>([]);
  const [publishableKey, setPublishableKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const cardMountRef = useRef<HTMLDivElement | null>(null);
  const stripeSetupRef = useRef<{ stripe: StripeJs; card: StripeCardElement } | null>(null);

  async function loadPaymentMethods() {
    const response = await fetch("/api/stripe/payment-methods", { credentials: "include" });
    const result = await response.json() as { paymentMethods?: SavedPaymentMethod[]; error?: string };
    if (!response.ok) throw new Error(result.error || "Your saved payment methods could not be loaded.");
    setPaymentMethods(Array.isArray(result.paymentMethods) ? result.paymentMethods : []);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch("/api/stripe/payment-config", { credentials: "include" }).then(async (response) => {
        const result = await response.json() as { publishableKey?: string; error?: string };
        if (!response.ok || !result.publishableKey) throw new Error(result.error || "Stripe card fields are unavailable.");
        return result.publishableKey;
      }),
      fetch("/api/stripe/payment-methods", { credentials: "include" }).then(async (response) => {
        const result = await response.json() as { paymentMethods?: SavedPaymentMethod[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Your saved payment methods could not be loaded.");
        return Array.isArray(result.paymentMethods) ? result.paymentMethods : [];
      }),
    ])
      .then(([key, methods]) => {
        if (cancelled) return;
        setPublishableKey(key);
        setPaymentMethods(methods);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Your payment methods could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!publishableKey || !cardMountRef.current) return;
    let cancelled = false;
    let card: StripeCardElement | null = null;
    void loadStripeJs()
      .then(() => {
        const stripe = window.Stripe?.(publishableKey);
        if (!stripe || !cardMountRef.current) throw new Error("Stripe card fields could not be initialized.");
        card = stripe.elements().create("card", {
          disableLink: true,
          hidePostalCode: true,
          style: {
            base: { color: "#171615", fontFamily: "DM Sans, sans-serif", fontSize: "16px", "::placeholder": { color: "#827975" } },
            invalid: { color: "#b42342" },
          },
        });
        if (cancelled) {
          card.destroy();
          return;
        }
        card.mount(cardMountRef.current);
        card.on("change", (event) => setError(event.error?.message ?? ""));
        stripeSetupRef.current = { stripe, card };
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Stripe card fields are unavailable.");
      });
    return () => {
      cancelled = true;
      stripeSetupRef.current = null;
      card?.destroy();
    };
  }, [publishableKey]);

  async function savePaymentMethod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripeSetupRef.current) {
      setError("Stripe card fields are still loading. Please wait a moment and try again.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
      const setupResponse = await fetch("/api/stripe/payment-method-setup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: profile.email }),
      });
      const setup = await setupResponse.json() as { clientSecret?: string; error?: string };
      if (!setupResponse.ok || !setup.clientSecret) throw new Error(setup.error || "Your card could not be saved.");
      const confirmation = await stripeSetupRef.current.stripe.confirmCardSetup(setup.clientSecret, {
        payment_method: {
          card: stripeSetupRef.current.card,
          billing_details: {
            name,
            email: profile.email,
            phone: profile.phone || undefined,
            address: {
              line1: profile.addressLine1 || undefined,
              line2: profile.addressLine2 || undefined,
              city: profile.city || undefined,
              postal_code: profile.postcode || undefined,
              country: profile.country || "GB",
            },
          },
        },
      });
      if (confirmation.error) throw new Error(confirmation.error.message || "Your card could not be saved.");
      if (confirmation.setupIntent?.status !== "succeeded") throw new Error("Your card needs additional confirmation. Please try again.");
      await loadPaymentMethods();
      setNotice("Your card has been saved securely with Stripe.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your card could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function removePaymentMethod(paymentMethodId: string) {
    setRemovingId(paymentMethodId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/stripe/payment-methods/${encodeURIComponent(paymentMethodId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || "That card could not be removed.");
      }
      setPaymentMethods((current) => current.filter((method) => method.id !== paymentMethodId));
      setNotice("Your saved card has been removed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That card could not be removed.");
    } finally {
      setRemovingId("");
    }
  }

  return (
    <section className="account-panel account-payment-panel">
      <div className="eyebrow">Protected by Stripe</div>
      <h2>Payment methods.</h2>
      <p>Your card details are encrypted and saved by Stripe. Glam Too never stores your full card number.</p>
      {loading ? <p className="account-muted">Loading your saved cards…</p> : (
        <div className="saved-payment-methods">
          {paymentMethods.length === 0 ? <p className="account-empty-copy">No payment methods saved yet.</p> : paymentMethods.map((method) => (
            <div className="saved-payment-method" key={method.id}>
              <div><strong>{method.brand.toUpperCase()} ending in {method.last4}</strong><span>Expires {String(method.expMonth).padStart(2, "0")}/{method.expYear}</span></div>
              <button type="button" onClick={() => void removePaymentMethod(method.id)} disabled={removingId === method.id}>{removingId === method.id ? "Removing…" : "Remove"}</button>
            </div>
          ))}
        </div>
      )}
      <form className="account-payment-form" onSubmit={(event) => void savePaymentMethod(event)}>
        <h3>Add a card</h3>
        <div className="checkout-card-field account-card-field" ref={cardMountRef} aria-label="Card details to save" />
        {error && <p className="account-form-error" role="alert">{error}</p>}
        {notice && <p className="account-form-success" role="status">{notice}</p>}
        <button className="button button-pink" type="submit" disabled={saving || loading || !publishableKey}>{saving ? "Saving card…" : "Save payment method"}</button>
      </form>
    </section>
  );
}

function CustomerAccountPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accountSection, setAccountSection] = useState<AccountSection>("dashboard");
  const [details, setDetails] = useState({ firstName: "", lastName: "" });
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [detailsNotice, setDetailsNotice] = useState("");
  const [detailsError, setDetailsError] = useState("");
  const [profile, setProfile] = useState<CustomerProfile>(emptyCustomerProfile);
  const [profileLoading, setProfileLoading] = useState(true);
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressNotice, setAddressNotice] = useState("");
  const [addressError, setAddressError] = useState("");
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  useEffect(() => {
    if (!logoutConfirmOpen) return;
    function handleLogoutDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setLogoutConfirmOpen(false);
    }
    window.addEventListener("keydown", handleLogoutDialogKeyDown);
    return () => window.removeEventListener("keydown", handleLogoutDialogKeyDown);
  }, [logoutConfirmOpen]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setOrders([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    fetch("/api/stripe/orders", { credentials: "include" })
      .then(async (response) => {
        const result = await response.json() as { orders?: CustomerOrder[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Your orders could not be loaded right now.");
        if (!cancelled) setOrders(Array.isArray(result.orders) ? result.orders : []);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Your orders could not be loaded right now.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!user) return;
    setDetails({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
    });
    setProfile((current) => ({
      ...current,
      firstName: current.firstName || user.firstName || "",
      lastName: current.lastName || user.lastName || "",
      email: current.email || user.primaryEmailAddress?.emailAddress || "",
    }));
  }, [user]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setProfileLoading(false);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    fetch("/api/account/profile", { credentials: "include" })
      .then(async (response) => {
        const result = await response.json() as { profile?: CustomerProfile; error?: string };
        if (!response.ok || !result.profile) throw new Error(result.error || "Your saved details could not be loaded.");
        if (!cancelled) {
          setProfile(result.profile);
          setDetails({
            firstName: result.profile.firstName,
            lastName: result.profile.lastName,
          });
        }
      })
      .catch((caught) => {
        if (!cancelled) setAddressError(caught instanceof Error ? caught.message : "Your saved details could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  async function saveProfile(nextProfile: CustomerProfile) {
    const response = await fetch("/api/account/profile", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextProfile),
    });
    const result = await response.json() as { profile?: CustomerProfile; error?: string };
    if (!response.ok || !result.profile) throw new Error(result.error || "Your saved details could not be saved.");
    setProfile((current) => ({ ...current, ...result.profile, email: current.email }));
  }

  async function saveAccountDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setDetailsSaving(true);
    setDetailsNotice("");
    setDetailsError("");
    try {
      await saveProfile({
        ...profile,
        firstName: details.firstName.trim(),
        lastName: details.lastName.trim(),
      });
      setDetailsNotice("Your account details have been saved.");
    } catch (caught) {
      setDetailsError(caught instanceof Error ? caught.message : "Your account details could not be saved.");
    } finally {
      setDetailsSaving(false);
    }
  }

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddressSaving(true);
    setAddressError("");
    setAddressNotice("");
    try {
      await saveProfile({
        ...profile,
        firstName: details.firstName.trim() || profile.firstName,
        lastName: details.lastName.trim() || profile.lastName,
      });
      setAddressNotice("Your delivery address has been saved and will be ready at checkout.");
    } catch (caught) {
      setAddressError(caught instanceof Error ? caught.message : "Your delivery address could not be saved.");
    } finally {
      setAddressSaving(false);
    }
  }

  if (!isLoaded) return <Shell><div className="customer-auth-page"><p>Loading your account…</p></div></Shell>;
  if (!isSignedIn) return <CustomerSignInContent />;

  const accountName = profile.firstName || user?.firstName || user?.username || "there";
  const selectedOrder = selectedOrderId ? orders.find((order) => order.id === selectedOrderId) ?? null : null;
  const accountSections: Array<{ id: AccountSection; label: string; icon: LucideIcon }> = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "orders", label: "Orders", icon: ShoppingBag },
    { id: "addresses", label: "Addresses", icon: MapPin },
    { id: "payment-methods", label: "Payment methods", icon: CreditCard },
    { id: "account-details", label: "Account details", icon: UserRound },
  ];
  const sectionCopy: Record<AccountSection, { title: string; description: string }> = {
    dashboard: { title: "Your account.", description: "Manage your orders, details, and delivery preferences in one place." },
    orders: { title: "Your orders.", description: "Everything you’ve bought from us, in one lovely place." },
    addresses: { title: "Your addresses.", description: "Keep your delivery details close for a smoother checkout." },
    "payment-methods": { title: "Payment methods.", description: "Your payments stay protected by Stripe from checkout to confirmation." },
    "account-details": { title: "Account details.", description: "Keep your personal details up to date." },
  };
  const activeSectionCopy = selectedOrder && accountSection === "orders"
    ? { title: "Order details.", description: "Review your purchase, delivery, and payment information." }
    : sectionCopy[accountSection];

  return (
    <Shell>
      <div className="account-page">
        <div className="account-heading">
          <div>
            <div className="eyebrow">Your Glam Too account</div>
            <h1>{activeSectionCopy.title}</h1>
            <p>{activeSectionCopy.description}</p>
          </div>
        </div>

        <div className="account-layout">
          <nav className="account-nav" aria-label="Account navigation">
            <div className="account-nav-links">
              {accountSections.map((section) => (
                <button
                  className={accountSection === section.id ? "is-active" : ""}
                  type="button"
                  key={section.id}
                  onClick={() => { setAccountSection(section.id); setSelectedOrderId(null); }}
                  aria-current={accountSection === section.id ? "page" : undefined}
                >
                  <section.icon className="account-nav-icon" aria-hidden="true" />
                  <span>{section.label}</span>
                </button>
              ))}
            </div>
            <button className="account-nav-logout" type="button" onClick={() => setLogoutConfirmOpen(true)}><LogOut className="account-nav-icon" aria-hidden="true" /><span>Log out</span></button>
          </nav>

          <div className="account-content">
            {accountSection === "dashboard" && (
              <section className="account-panel account-dashboard">
                <div className="eyebrow">Hello, {accountName}</div>
                <h2>Welcome back.</h2>
                <p>From your account dashboard you can view your recent orders, manage your addresses, and edit your account details.</p>
                <div className="account-shortcuts">
                  <button type="button" onClick={() => setAccountSection("orders")}><span>Orders</span><strong>{orders.length}</strong><small>View your purchases</small></button>
                  <button type="button" onClick={() => setAccountSection("addresses")}><span>Addresses</span><strong>→</strong><small>Manage delivery details</small></button>
                  <button type="button" onClick={() => setAccountSection("account-details")}><span>Account details</span><strong>→</strong><small>Update your information</small></button>
                </div>
              </section>
            )}

            {accountSection === "orders" && (
              <>
                {selectedOrder ? <CustomerOrderDetailPage order={selectedOrder} onBack={() => setSelectedOrderId(null)} /> : (
                  <>
                    {error && <div className="account-message account-error" role="alert">{error}</div>}
                    {loading ? (
                      <div className="account-message">Loading your orders…</div>
                    ) : orders.length === 0 ? (
                      <section className="account-empty">
                        <div className="eyebrow">Nothing here yet</div>
                        <h2>Your next favourite is out there.</h2>
                        <p>Once you place an order while signed in, it will appear here with its delivery details.</p>
                        <a className="button button-pink" href="/shop">Start shopping</a>
                      </section>
                    ) : (
                      <div className="account-orders-table" role="table" aria-label="Your orders">
                        <div className="account-orders-table-head" role="row">
                          <span>Order</span><span>Date</span><span>Status</span><span>Total</span><span>Actions</span>
                        </div>
                        {orders.map((order) => {
                          const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);
                          return (
                            <div className="account-orders-table-row" role="row" key={order.id}>
                              <button className="account-order-number" type="button" onClick={() => setSelectedOrderId(order.id)}>{order.id}</button>
                              <span>{formatCustomerOrderDate(order.placedAt)}</span>
                              <span className={`account-order-status ${customerOrderStatus(order).toLowerCase().replace(/\s+/g, "-")}`}>{customerOrderStatus(order)}</span>
                              <span className="account-order-total-cell"><strong>{formatPounds(order.total / 100)}</strong><small>{itemCount} item{itemCount === 1 ? "" : "s"}</small></span>
                              <button className="account-order-view-button" type="button" onClick={() => setSelectedOrderId(order.id)}>View</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {accountSection === "addresses" && (
              <section className="account-panel">
                <div className="eyebrow">Delivery book</div>
                <h2>Addresses.</h2>
                <p>Save your default UK delivery address here and we&apos;ll prefill it at checkout.</p>
                <form className="account-details-form" onSubmit={(event) => void saveAddress(event)}>
                  <div className="account-details-fields">
                    <div className="field account-field-wide"><label htmlFor="account-address-line-one">Street address</label><input id="account-address-line-one" type="text" required value={profile.addressLine1} onChange={(event) => setProfile((current) => ({ ...current, addressLine1: event.target.value }))} placeholder="House number and street name" /></div>
                    <div className="field account-field-wide"><label htmlFor="account-address-line-two">Address line 2 <span>Optional</span></label><input id="account-address-line-two" type="text" value={profile.addressLine2} onChange={(event) => setProfile((current) => ({ ...current, addressLine2: event.target.value }))} placeholder="Apartment, suite, unit, etc." /></div>
                    <div className="field"><label htmlFor="account-address-city">Town or city</label><input id="account-address-city" type="text" required value={profile.city} onChange={(event) => setProfile((current) => ({ ...current, city: event.target.value }))} /></div>
                    <div className="field"><label htmlFor="account-address-postcode">Postcode</label><input id="account-address-postcode" type="text" required value={profile.postcode} onChange={(event) => setProfile((current) => ({ ...current, postcode: event.target.value }))} /></div>
                    <div className="field"><label htmlFor="account-address-phone">Phone <span>Optional</span></label><input id="account-address-phone" type="tel" value={profile.phone} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} /></div>
                    <div className="field"><label htmlFor="account-address-country">Country / region</label><input id="account-address-country" type="text" value="United Kingdom" readOnly /></div>
                  </div>
                  {addressError && <p className="account-form-error" role="alert">{addressError}</p>}
                  {addressNotice && <p className="account-form-success" role="status">{addressNotice}</p>}
                  <button className="button button-pink" type="submit" disabled={addressSaving || profileLoading}>{addressSaving ? "Saving address…" : "Save delivery address"}</button>
                </form>
              </section>
            )}

            {accountSection === "payment-methods" && (
              <PaymentMethodsPanel profile={profile} />
            )}

            {accountSection === "account-details" && (
              <section className="account-panel">
                <div className="eyebrow">Your information</div>
                <h2>Account details.</h2>
                <form className="account-details-form" onSubmit={(event) => void saveAccountDetails(event)}>
                  <div className="account-details-fields">
                    <div className="field"><label htmlFor="account-first-name">First name</label><input id="account-first-name" type="text" value={details.firstName} onChange={(event) => setDetails((current) => ({ ...current, firstName: event.target.value }))} /></div>
                    <div className="field"><label htmlFor="account-last-name">Last name</label><input id="account-last-name" type="text" value={details.lastName} onChange={(event) => setDetails((current) => ({ ...current, lastName: event.target.value }))} /></div>
                    <div className="field account-field-wide"><label htmlFor="account-email">Email address</label><input id="account-email" type="email" value={user?.primaryEmailAddress?.emailAddress ?? ""} readOnly /></div>
                  </div>
                  {detailsError && <p className="account-form-error" role="alert">{detailsError}</p>}
                  {detailsNotice && <p className="account-form-success" role="status">{detailsNotice}</p>}
                  <button className="button button-pink" type="submit" disabled={detailsSaving}>{detailsSaving ? "Saving details…" : "Save changes"}</button>
                </form>
              </section>
            )}
          </div>
        </div>
      </div>
      {logoutConfirmOpen && (
        <div
          className="account-logout-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setLogoutConfirmOpen(false);
          }}
        >
          <div className="account-logout-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-dialog-title" aria-describedby="logout-dialog-description">
            <button className="account-logout-close" type="button" onClick={() => setLogoutConfirmOpen(false)} aria-label="Close logout confirmation"><X aria-hidden="true" /></button>
            <div className="eyebrow">Sign out</div>
            <h2 id="logout-dialog-title">Log out of your account?</h2>
            <p id="logout-dialog-description">You&apos;ll need to sign in again to view your orders and account details.</p>
            <div className="account-logout-actions">
              <button className="button account-logout-cancel" type="button" onClick={() => setLogoutConfirmOpen(false)}>Cancel</button>
              <button className="button button-pink" type="button" onClick={() => { setLogoutConfirmOpen(false); void signOut({ redirectUrl: basePath || "/" }); }}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function CustomerSignUpPage() {
  return <Shell><div className="customer-auth-page"><div className="customer-auth-copy"><div className="eyebrow">New here?</div><h1>Create your account.</h1><p>Register to keep your Glam Too details ready for every checkout.</p></div><SignUp signInUrl={`${basePath}/account`} fallbackRedirectUrl={basePath || '/'} /></div></Shell>;
}

function PasswordRecoveryPage() {
  const { signIn } = useSignIn();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<"email" | "code" | "password">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const getErrorMessage = (caught: unknown) => {
    if (typeof caught === "object" && caught && "errors" in caught) {
      const errors = (caught as { errors?: Array<{ longMessage?: string; message?: string }> }).errors;
      return errors?.[0]?.longMessage || errors?.[0]?.message || "We could not complete that step. Please try again.";
    }
    return "We could not complete that step. Please try again.";
  };

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signIn) return;
    setLoading(true);
    setError("");
    try {
      const createResult = await signIn.create({ identifier: email });
      if (createResult.error) throw createResult.error;
      const sendResult = await signIn.resetPasswordEmailCode.sendCode();
      if (sendResult.error) throw sendResult.error;
      setStep("code");
    } catch (caught) {
      setError(caught instanceof Error && caught.message.includes("No password") ? caught.message : getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signIn) return;
    setLoading(true);
    setError("");
    try {
      const verifyResult = await signIn.resetPasswordEmailCode.verifyCode({ code });
      if (verifyResult.error || signIn.status !== "needs_new_password") throw new Error("That code could not be verified. Please try again.");
      setStep("password");
    } catch (caught) {
      setError(caught instanceof Error && caught.message.includes("code could") ? caught.message : getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signIn) return;
    setLoading(true);
    setError("");
    try {
      const passwordResult = await signIn.resetPasswordEmailCode.submitPassword({ password });
      if (passwordResult.error || signIn.status !== "complete") throw new Error("Your password could not be updated. Please try again.");
      const finalizeResult = await signIn.finalize();
      if (finalizeResult.error) throw finalizeResult.error;
      setLocation("/");
    } catch (caught) {
      setError(caught instanceof Error && caught.message.includes("could not") ? caught.message : getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  const titles = {
    email: ["Reset your password.", "Enter the email address on your Glam Too account and we’ll send a secure verification code."],
    code: ["Check your inbox.", "Enter the verification code sent to your email address."],
    password: ["Choose a new password.", "Your new password will replace your previous one after you save it."],
  } as const;

  return <Shell><div className="customer-auth-page"><div className="customer-auth-copy"><div className="eyebrow">Account recovery</div><h1>{titles[step][0]}</h1><p>{titles[step][1]}</p></div><section className="customer-recovery-card">
    {step === "email" && <form onSubmit={requestCode}><label>Email address<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><button type="submit" className="customer-recovery-button" disabled={loading}>{loading ? "Sending…" : "Send recovery code"}</button></form>}
    {step === "code" && <form onSubmit={verifyCode}><label>Verification code<input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value)} /></label><button type="submit" className="customer-recovery-button" disabled={loading}>{loading ? "Checking…" : "Verify code"}</button></form>}
    {step === "password" && <form onSubmit={resetPassword}><label>New password<input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></label><button type="submit" className="customer-recovery-button" disabled={loading}>{loading ? "Saving…" : "Save new password"}</button></form>}
    {error && <p className="customer-recovery-error" role="alert">{error}</p>}
    <a href={`${basePath}/account`}>Back to sign in</a>
  </section></div></Shell>;
}

function AdminSignInPage() {
  return <div className="admin-auth-page"><div className="admin-signin-wrap"><SignIn signUpUrl={`${basePath}/register`} fallbackRedirectUrl={`${basePath}/admin`} /><p>Customer registration does not grant admin access. Admin access is granted manually by an approved administrator.</p></div></div>;
}

function AdminAccessDenied({ onSignOut }: { onSignOut: () => void }) {
  return <div className="admin-auth-page"><div className="admin-access-denied"><div className="eyebrow">Private studio</div><h1>Admin access only.</h1><p>This account is signed in, but it is not approved to access the Glam Too admin area.</p><div className="admin-access-actions"><button className="button" type="button" onClick={onSignOut}>Sign out</button><a className="text-link" href="/">Return to storefront</a></div></div></div>;
}

function AdminRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [accessState, setAccessState] = useState<"checking" | "allowed" | "denied" | "error">("checking");

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setAccessState("checking");
      return;
    }

    let cancelled = false;
    setAccessState("checking");
    fetch("/api/admin/access", { credentials: "include" })
      .then((response) => {
        if (cancelled) return;
        setAccessState(response.ok ? "allowed" : response.status === 403 ? "denied" : "error");
      })
      .catch(() => {
        if (!cancelled) setAccessState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) return <div className="admin-auth-page"><p>Loading secure admin access…</p></div>;
  if (!isSignedIn) return <AdminSignInPage />;
  if (accessState === "checking") return <div className="admin-auth-page"><p>Verifying admin access…</p></div>;
  if (accessState === "denied") return <AdminAccessDenied onSignOut={() => void signOut({ redirectUrl: basePath || '/' })} />;
  if (accessState === "error") return <div className="admin-auth-page"><div className="admin-access-denied"><div className="eyebrow">Private studio</div><h1>Access check unavailable.</h1><p>We could not verify this account right now. Please try again shortly.</p><div className="admin-access-actions"><button className="button" type="button" onClick={() => window.location.reload()}>Try again</button><a className="text-link" href="/">Return to storefront</a></div></div></div>;
  return <AdminDashboard onSignOut={() => signOut({ redirectUrl: basePath || '/' })} />;
}

function AppRoutes() {
  const mediaVersion = useContext(CatalogMediaContext);
  const [location] = useLocation();
  const routeKey = location === "/admin" ? "admin" : mediaVersion;
  return <Switch key={routeKey}>
    <Route path="/" component={Home} />
    <Route path="/about" component={About} />
    <Route path="/shop" component={Shop} />
    <Route path="/product/:slug" component={ProductDetail} />
    <Route path="/category" component={CategoryIndex} />
    <Route path="/category/:slug" component={CategoryDetail} />
    <Route path="/faq" component={FAQ} />
    <Route path="/contact" component={Contact} />
    <Route path="/privacy" component={() => <LegalPage type="privacy" />} />
    <Route path="/terms" component={() => <LegalPage type="terms" />} />
    <Route path="/returns" component={ReturnsPage} />
    <Route path="/delivery-returns" component={ReturnsPage} />
    <Route path="/cart" component={Cart} />
    <Route path="/wishlist" component={WishlistPage} />
    <Route path="/checkout" component={Checkout} />
    <Route path="/order-confirmation" component={Confirmation} />
    <Route path="/admin" component={AdminRoute} />
    <Route path="/account/recovery/*?" component={PasswordRecoveryPage} />
    <Route path="/account/*?" component={CustomerSignInPage} />
    <Route path="/register/*?" component={CustomerSignUpPage} />
    <Route path="/sign-in/*?" component={CustomerSignInPage} />
    <Route path="/sign-up/*?" component={CustomerSignUpPage} />
    <Route component={NotFoundRoute} />
  </Switch>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/account`}
      signUpUrl={`${basePath}/register`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <CatalogMediaHydrator><WishlistProvider><AppRoutes /></WishlistProvider></CatalogMediaHydrator>
    </ClerkProvider>
  );
}

function CatalogMediaHydrator({ children }: { children: ReactNode }) {
  const [mediaVersion, setMediaVersion] = useState(0);

  useEffect(() => {
    let active = true;
    async function refreshCatalog() {
      await Promise.all([
        hydrateCatalogProductMedia(getStoredCatalogMediaRecords()),
        fetch("/api/catalog")
          .then(async (response) => {
            const payload = await response.json() as { products?: CatalogProduct[]; categories?: CatalogCategory[]; initialized?: boolean };
            if (!response.ok || !Array.isArray(payload.products) || !Array.isArray(payload.categories)) throw new Error("Catalog unavailable");
            sharedCatalog = payload.initialized ? { products: payload.products, categories: payload.categories } : null;
          })
          .catch(() => undefined),
      ]);
      if (active) setMediaVersion((version) => version + 1);
    }
    void refreshCatalog();
    window.addEventListener("glam-catalog-updated", refreshCatalog);
    return () => {
      active = false;
      window.removeEventListener("glam-catalog-updated", refreshCatalog);
    };
  }, []);

  return <CatalogMediaContext.Provider value={mediaVersion}>{children}</CatalogMediaContext.Provider>;
}
function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}

export default App;

function paymentResolutionCopy(order: CustomerOrder) {
  if (order.paymentResolution === "refunded") {
    return {
      title: "Order cancelled and refund processed",
      detail: "Your payment arrived after this order had been cancelled and the reserved availability changed. We have cancelled the order and processed a full refund. Your bank may take a few working days to show it.",
    };
  }
  if (order.paymentResolution === "manual_resolution") {
    return {
      title: "Order cancelled — payment being resolved",
      detail: "Your payment arrived after this order had been cancelled and the reserved availability changed. This order will not be fulfilled. Our customer-care team is resolving the payment and will contact you if anything else is needed.",
    };
  }
  if (order.paymentResolution === "refund_processing") {
    return {
      title: "Order cancelled — refund processing",
      detail: "Your payment arrived after this order had been cancelled and the reserved availability changed. This order will not be fulfilled. Your full refund is being processed and your bank may take a few working days to show it.",
    };
  }
  return {
    title: "Order cancelled — refund on its way",
    detail: "Your payment arrived after this order had been cancelled and the reserved availability changed. This order will not be fulfilled. We are arranging a full refund and will update this order once it has been processed.",
  };
}
