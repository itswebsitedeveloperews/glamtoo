import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { ArrowUpRight, Check, CircleDollarSign, Copy, CreditCard, Eye, FlaskConical, FolderOpen, Globe2, Image as ImageIcon, Inbox, KeyRound, LayoutDashboard, ListChecks, LockKeyhole, Mail, MapPin, Package, Ruler, Save, Send, Server, ShieldCheck, ShoppingBag, Tags, TicketPercent, Truck, UserRound, Users, Upload, X, type LucideIcon } from "lucide-react";
import {
  catalogCategories,
  catalogProducts,
  createProductSlug,
  formatCatalogPrice,
  getCatalogMediaSource,
  getCatalogPriceInput,
  getCategorySlug,
  hydrateCatalogProductMedia,
  isCatalogMediaReference,
  type CatalogCategory,
  type CatalogProduct,
  type CatalogVariation,
} from "@/data/catalog";
import { sanitizeRichTextHtml } from "@/utils/rich-text";
import { productContentGaps } from "@/utils/storefront-truth";
import logoImage from "@assets/logo-soft-options/glam-too-selected-dark.svg";
import AdminHomePage from "./admin-home-page";
import AdminPromotionalPreview from "@/components/AdminPromotionalPreview";
import { defaultHomePageSettings, type HomePageSettings } from "@/data/home-page";
import AdminGmailSettings from "@/components/admin-gmail-settings";
import AdminContactEmailSettings from "@/components/admin-contact-email-settings";
import type { AdminCatalogSaveInput } from "@workspace/api-client-react";

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && document.activeElement !== editor && editor.innerHTML !== value) {
      editor.innerHTML = sanitizeRichTextHtml(value);
    }
  }, [value]);

  function runCommand(command: string) {
    editorRef.current?.focus();
    document.execCommand(command);
    const editor = editorRef.current;
    if (editor) onChange(sanitizeRichTextHtml(editor.innerHTML));
  }

  function addLink() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !editorRef.current?.contains(selection.anchorNode)) {
      window.alert("Select the text you want to link first.");
      return;
    }
    const href = window.prompt("Enter a link, for example /returns or https://example.com");
    if (!href?.trim()) return;
    runCommandWithValue("createLink", href.trim());
  }

  function runCommandWithValue(command: string, value: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    const editor = editorRef.current;
    if (editor) onChange(sanitizeRichTextHtml(editor.innerHTML));
  }

  return (
    <div className="admin-rich-text">
      <div className="admin-rich-text-toolbar" role="toolbar" aria-label="Returns formatting">
        <button type="button" aria-label="Bold" title="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("bold")}><strong>B</strong></button>
        <button type="button" aria-label="Italic" title="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("italic")}><em>I</em></button>
        <button type="button" aria-label="Underline" title="Underline" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("underline")}><u>U</u></button>
        <button type="button" aria-label="Bulleted list" title="Bulleted list" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertUnorderedList")}>• List</button>
        <button type="button" aria-label="Numbered list" title="Numbered list" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertOrderedList")}>1. List</button>
        <button type="button" aria-label="Add link" title="Add link" onMouseDown={(event) => event.preventDefault()} onClick={addLink}>Link</button>
        <button type="button" aria-label="Remove link" title="Remove link" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("unlink")}>Unlink</button>
      </div>
      <div
        ref={editorRef}
        className="admin-rich-text-editor"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Returns"
        data-placeholder={placeholder}
        onInput={(event) => onChange(sanitizeRichTextHtml(event.currentTarget.innerHTML))}
        onBlur={(event) => onChange(sanitizeRichTextHtml(event.currentTarget.innerHTML))}
      />
    </div>
  );
}

type AdminSection =
  | "overview"
  | "home-page"
  | "products"
  | "categories"
  | "orders"
  | "shipping"
  | "delivery"
  | "size-guide"
  | "payments"
  | "coupons"
  | "messages"
  | "users";

type ProductStatus = "Published" | "Draft";
type ProductType = "Simple" | "Variable";

type ProductVariation = CatalogVariation;
type Product = CatalogProduct;
type VariationAttribute = string;

type ProductDraft = Omit<Product, "id">;

type Category = CatalogCategory;

function resolveBuiltInCatalogAssets(products: Product[], categories: Category[]) {
  const resolvedProducts = products.map((product) => {
    const fallback = catalogProducts.find((candidate) =>
      candidate.id === product.id || candidate.name.toLowerCase() === product.name.toLowerCase(),
    );
    const resolvedProduct = fallback && product.image.startsWith("/assets/")
      ? { ...product, image: fallback.image }
      : product;
    return resolvedProduct;
  });
  const resolvedCategories = categories.map((category) => {
    const fallback = catalogCategories.find((candidate) =>
      candidate.id === category.id || candidate.name.toLowerCase() === category.name.toLowerCase(),
    );
    return fallback && category.image.startsWith("/assets/")
      ? { ...category, image: fallback.image }
      : category;
  });
  return { products: resolvedProducts, categories: resolvedCategories };
}

type CategoryDraft = Omit<Category, "id">;

type StripeStatus = {
  connected: boolean;
  configured?: boolean;
  mode: "test" | "live" | "unknown";
  paymentMethods: string[];
  publishableKeyConfigured?: boolean;
  webhookSecretConfigured?: boolean;
  source?: "admin" | "connection";
  error?: string;
};

type Order = {
  id: string;
  stripeSessionId: string;
  customer: string;
  email: string;
  placedAt: string | null;
  date: string;
  amount: number;
  total: string;
  currency: string;
  vatAmount?: number;
  couponCode?: string | null;
  discountAmount?: number;
  paymentStatus?: "pending" | "paid" | "cancelled";
  paymentResolution?: "none" | "refund_pending" | "refund_processing" | "refunded" | "manual_resolution";
  paymentResolutionReason?: "inventory_reallocated" | "coupon_reallocated" | "inventory_and_coupon_reallocated" | null;
  status: "Processing" | "Shipped" | "Delivered";
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
    quantity: number;
    total: number;
  }>;
};

type OrderPayload = {
  id: string;
  stripeSessionId: string;
  placedAt: string | null;
  status: Order["status"];
  total: number;
  currency: string;
  vatAmount?: number;
  couponCode?: string | null;
  discountAmount?: number;
  paymentStatus?: Order["paymentStatus"];
  paymentResolution?: Order["paymentResolution"];
  paymentResolutionReason?: Order["paymentResolutionReason"];
  email: string;
  delivery: {
    name: string;
    method: string;
    address: {
      line1: string;
      line2: string;
      city: string;
      postcode: string;
      country: string;
    };
  };
  items: Order["items"];
};

type ManagedUser = {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  createdAt: number;
  lastSignInAt: number | null;
  isAdmin: boolean;
  isBootstrapAdmin: boolean;
};

type EditUserDraft = {
  firstName: string;
  lastName: string;
  email: string;
};

type NewUserDraft = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: "customer" | "admin";
};

type CouponRecord = {
  id: number;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  minimumSpend: number;
  usageLimit: number | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
};

type CouponDraft = {
  code: string;
  discountType: CouponRecord["discountType"];
  discountValue: string;
  startsAt: string;
  endsAt: string;
  minimumSpend: string;
  usageLimit: string;
  active: boolean;
};

type ContactEnquiry = {
  id: number;
  name: string;
  email: string;
  orderNumber: string | null;
  topic: string;
  message: string;
  deliveryStatus: "pending" | "sending" | "accepted" | "partial" | "uncertain" | "delivered" | "failed" | "not_configured";
  emailRecipients?: Array<{ email: string; status: string; messageId: string; error: string | null }>;
  emailMessageId: string | null;
  deliveryError: string | null;
  createdAt: string;
  deliveredAt: string | null;
};

type ShippingMethod = {
  id: string;
  name: string;
  description: string;
  price: number;
  freeOver: number | null;
  enabled: boolean;
  sortOrder: number;
};

type ShippingDraft = {
  name: string;
  description: string;
  price: string;
  freeOver: string;
  enabled: boolean;
};

const blankShipping: ShippingDraft = { name: "", description: "", price: "0", freeOver: "", enabled: true };

type DeliveryInformationRow = {
  id: string;
  option: string;
  information: string;
  cost: string;
  freeOver: number | null;
};

type SizeGuideRow = {
  id: string;
  size: string;
  ukSize: string;
  bust: string;
  waist: string;
  hips: string;
};

const blankSizeGuideRow = (): SizeGuideRow => ({
  id: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  size: "",
  ukSize: "",
  bust: "",
  waist: "",
  hips: "",
});

const navItems: Array<{ id: AdminSection; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "home-page", label: "Home Page", icon: FolderOpen },
  { id: "products", label: "Products", icon: Package },
  { id: "categories", label: "Categories", icon: Tags },
  { id: "orders", label: "Orders", icon: ShoppingBag },
  { id: "shipping", label: "Shipping", icon: Truck },
  { id: "delivery", label: "Delivery & Return", icon: MapPin },
  { id: "size-guide", label: "Size Guide", icon: Ruler },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "coupons", label: "Coupons", icon: TicketPercent },
  { id: "messages", label: "Contact Form", icon: Inbox },
  { id: "users", label: "Users", icon: Users },
];

const productsStorageKey = "glam-me-admin-products-v4";
const categoriesStorageKey = "glam-me-admin-categories-v2";
const catalogMigrationStorageKey = "glam-me-shared-catalog-migration-v1";
const legacyProductsStorageKey = "glam-me-admin-products-v3";
const initialProducts: Product[] = catalogProducts;

function withoutProductDetail(product: Product): Product {
  const cleanedProduct = { ...product } as Product & { detail?: unknown };
  delete cleanedProduct.detail;
  return {
    ...cleanedProduct,
    slug: createProductSlug(cleanedProduct.slug || cleanedProduct.name),
    price: formatCatalogPrice(cleanedProduct.price),
    galleryImages: Array.isArray(cleanedProduct.galleryImages)
      ? [...new Set(cleanedProduct.galleryImages
        .filter((image): image is string => typeof image === "string" && image.trim().length > 0)
        .map((image) => image.trim())
        .filter((image) => image !== cleanedProduct.image.trim()))]
      : undefined,
    variations: (cleanedProduct.variations ?? []).map((variation) => ({
      ...variation,
      price: formatCatalogPrice(variation.price),
    })),
  };
}

function getInitialProducts() {
  try {
    const legacyProducts = window.localStorage.getItem(legacyProductsStorageKey);
    if (!legacyProducts) return initialProducts;
    const parsed = JSON.parse(legacyProducts) as Product[];
    if (!Array.isArray(parsed)) return initialProducts;
    const seededIds = new Set(initialProducts.map((product) => product.id));
    const legacyById = new Map(parsed.map((product) => [product.id, product]));
    const seededProducts = initialProducts.map((product) => {
      const legacyProduct = legacyById.get(product.id);
      return withoutProductDetail(legacyProduct
        ? { ...product, ...legacyProduct, variations: legacyProduct.variations ?? product.variations }
        : product);
    });
    const customProducts = parsed.filter((product) => !seededIds.has(product.id));
    return [...seededProducts, ...customProducts].map(withoutProductDetail);
  } catch {
    return initialProducts;
  }
}

function getStoredProducts() {
  try {
    const storedProducts = window.localStorage.getItem(productsStorageKey);
    if (!storedProducts) return getInitialProducts();
    const parsed = JSON.parse(storedProducts) as Product[];
    return Array.isArray(parsed)
      ? parsed.map((product) => withoutProductDetail({
        ...product,
        deliveryAndReturns: product.deliveryAndReturns ?? "",
      }))
      : getInitialProducts();
  } catch {
    return getInitialProducts();
  }
}

const initialCategories: Category[] = catalogCategories.map((category) => ({ ...category }));

function getStoredCategories() {
  try {
    const storedCategories = window.localStorage.getItem(categoriesStorageKey);
    const categories = storedCategories ? JSON.parse(storedCategories) : initialCategories;
    return Array.isArray(categories) ? (categories as Category[]).map((category) => ({
      ...category,
      slug: getCategorySlug(category),
    })) : initialCategories;
  } catch {
    return initialCategories;
  }
}

function parseOrderTotal(total: string) {
  const amount = Number.parseFloat(total.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function formatPounds(amount: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
}

function formatOrderDate(value: string | null) {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isOrderOnDate(value: string | null, dayOffset: number) {
  if (!value) return false;
  const date = new Date(value);
  const target = new Date();
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + dayOffset);
  return date.getFullYear() === target.getFullYear()
    && date.getMonth() === target.getMonth()
    && date.getDate() === target.getDate();
}

function isOrderWithinLastDays(value: string | null, days: number) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const now = Date.now();
  return timestamp <= now && timestamp >= now - days * 24 * 60 * 60 * 1000;
}

function toAdminOrder(order: OrderPayload): Order {
  return {
    id: order.id,
    stripeSessionId: order.stripeSessionId,
    customer: order.delivery.name || order.email || "Customer",
    email: order.email,
    placedAt: order.placedAt,
    date: formatOrderDate(order.placedAt),
    amount: order.total,
    total: formatPounds(order.total / 100),
    currency: order.currency,
    vatAmount: order.vatAmount,
    couponCode: order.couponCode,
    discountAmount: order.discountAmount,
    paymentStatus: order.paymentStatus,
    paymentResolution: order.paymentResolution,
    paymentResolutionReason: order.paymentResolutionReason,
    status: order.status,
    delivery: order.delivery,
    items: order.items,
  };
}

function AdminOrderDetailPage({
  order,
  products,
  updating,
  onStatusChange,
  resolvingPayment,
  onPaymentResolution,
  onBack,
}: {
  order: Order;
  products: Product[];
  updating: boolean;
  onStatusChange: (status: Order["status"]) => void;
  resolvingPayment: boolean;
  onPaymentResolution: (action: "retry_refund" | "mark_manual_resolution") => void;
  onBack: () => void;
}) {
  const itemSubtotal = order.items.reduce((total, item) => total + item.total, 0);
  const discountAmount = order.discountAmount ?? 0;
  const deliveryAmount = Math.max(order.amount - itemSubtotal + discountAmount, 0);
  const vatAmount = order.vatAmount ?? Math.round(order.amount / 6);
  const addressParts = [
    order.delivery.address.line1,
    order.delivery.address.line2,
    order.delivery.address.city,
    order.delivery.address.postcode,
    order.delivery.address.country,
  ].filter(Boolean);
  const paymentNeedsResolution = order.paymentResolution && order.paymentResolution !== "none";
  const paymentResolutionTitle = order.paymentResolution === "refunded"
    ? "Refund processed"
    : order.paymentResolution === "manual_resolution"
      ? "Manual payment resolution recorded"
      : order.paymentResolution === "refund_processing"
        ? "Refund processing"
      : "Refund needs attention";
  const paymentResolutionDetail = order.paymentResolutionReason?.includes("inventory")
    ? "Stock was reallocated after this paid order was cancelled."
    : "Promotion capacity was reallocated after this paid order was cancelled.";
  const productsById = new Map(products.map((product) => [String(product.id), product]));
  const progressSteps = [
    { label: "Order placed", complete: true, current: false },
    { label: "Paid", complete: order.paymentStatus !== "pending", current: false },
    { label: "Processing", complete: order.status === "Shipped" || order.status === "Delivered", current: order.status === "Processing" },
    { label: "Shipped", complete: order.status === "Shipped" || order.status === "Delivered", current: false },
  ];

  return (
    <div className="admin-order-page">
      <div className="admin-order-page-topbar">
        <span className="admin-order-page-context">Orders <b>/</b> {order.id}</span>
      </div>

      <div className="admin-order-page-heading">
        <div className="admin-order-heading-back">
          <button className="admin-back-button" type="button" onClick={onBack}>← Back to orders</button>
        </div>
        <div className="admin-order-heading-main">
          <div className="admin-order-heading-kicker">
            <p className="admin-eyebrow">Order overview</p>
            <span className={`admin-order-status-badge ${order.status.toLowerCase()}`}>{order.status}</span>
          </div>
          <h1>{order.id}</h1>
          <div className="admin-order-heading-meta">
            <span>Placed on {order.date}</span>
            <span className="admin-order-meta-divider">·</span>
            <span>{order.paymentStatus === "cancelled" ? "Payment received after cancellation" : "Paid via Stripe"}</span>
          </div>
        </div>
        <div className="admin-order-page-heading-actions">
          <div className="admin-order-heading-total"><span>Total paid</span><strong>{order.total}</strong></div>
        </div>
        <ol className="admin-order-progress" aria-label="Order progress">
          {progressSteps.map((step, index) => (
            <li className={step.complete ? "is-complete" : step.current ? "is-current" : ""} key={step.label}>
              <span className="admin-order-progress-marker">{step.complete ? <Check aria-hidden="true" /> : index + 1}</span>
              <span>{step.label}</span>
              {index < progressSteps.length - 1 && <i aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </div>

      <div className="admin-order-page-layout">
        <div className="admin-order-page-main">
          {paymentNeedsResolution && (
            <section className="admin-order-card admin-payment-resolution-card">
              <div className="admin-order-card-heading"><div><p className="admin-eyebrow">Payment exception</p><h2>{paymentResolutionTitle}</h2></div></div>
              <p>{paymentResolutionDetail} This order remains cancelled and must not be fulfilled.</p>
              {(order.paymentResolution === "refund_pending" || order.paymentResolution === "refund_processing") && <div className="admin-payment-resolution-actions">
                <button className="admin-primary" type="button" disabled={resolvingPayment} onClick={() => onPaymentResolution("retry_refund")}>{resolvingPayment ? "Checking refund…" : order.paymentResolution === "refund_processing" ? "Check Stripe refund" : "Retry Stripe refund"}</button>
                {order.paymentResolution === "refund_pending" && <button className="admin-secondary" type="button" disabled={resolvingPayment} onClick={() => onPaymentResolution("mark_manual_resolution")}>Record manual resolution</button>}
              </div>}
            </section>
          )}
          <section className="admin-order-card">
            <div className="admin-order-card-heading">
              <div><p className="admin-eyebrow">Purchased items</p><h2>Order items</h2></div>
              <span>{order.items.length} line{order.items.length === 1 ? "" : "s"}</span>
            </div>
            {order.items.length === 0 ? (
              <p className="admin-order-empty">Item details are unavailable for this order.</p>
            ) : (
              <div className="admin-order-item-table">
                <div className="admin-order-item-head"><span>Product</span><span>Unit price</span><span>Quantity</span><span>Total</span></div>
                {order.items.map((item, index) => {
                  const product = item.productId ? productsById.get(item.productId) : undefined;
                  const imageSource = product ? getCatalogMediaSource(product.image) : "";
                  return (
                  <div className="admin-order-item-row" key={`${item.productId ?? item.name}-${index}`}>
                    <div className="admin-order-item-product">
                      <div className="admin-order-item-image">{imageSource ? <img src={imageSource} alt={item.name} loading="lazy" decoding="async" /> : <span aria-hidden="true">No image</span>}</div>
                      <div><strong>{item.name}</strong>{item.productId && <small>Product ID: {item.productId}</small>}</div>
                    </div>
                    <span>{formatPounds((item.quantity > 0 ? item.total / item.quantity : item.total) / 100)}</span>
                    <span>{item.quantity}</span>
                    <strong>{formatPounds(item.total / 100)}</strong>
                  </div>
                  );
                })}
              </div>
            )}
            <div className="admin-order-totals">
              <div><span>Items subtotal</span><strong>{formatPounds(itemSubtotal / 100)}</strong></div>
              <div><span>{order.delivery.method}</span><strong>{deliveryAmount > 0 ? formatPounds(deliveryAmount / 100) : "Free"}</strong></div>
              {discountAmount > 0 && <div><span>Coupon {order.couponCode || ""}</span><strong>−{formatPounds(discountAmount / 100)}</strong></div>}
              <div><span>VAT included (20%)</span><strong>{formatPounds(vatAmount / 100)}</strong></div>
              <div className="admin-order-total-row"><span>Order total</span><strong>{order.total}</strong></div>
            </div>
          </section>

          <section className="admin-order-card">
            <div className="admin-order-card-heading">
              <div><p className="admin-eyebrow">Internal record</p><h2>Order notes</h2></div>
            </div>
            <div className="admin-order-note-empty">No notes have been added to this order.</div>
            <p className="admin-order-note-help">Keep fulfilment updates and customer-care notes with the order as it moves through delivery.</p>
          </section>
        </div>

        <aside className="admin-order-page-sidebar">
          <section className="admin-order-card admin-order-actions-card">
            <div className="admin-order-card-heading"><div><p className="admin-eyebrow">Fulfilment</p><h2>Order actions</h2></div><span className={`admin-order-status-badge ${order.status.toLowerCase()}`}>{order.status}</span></div>
            <label className="admin-order-status-field">Status
              <select id="admin-order-status" value={order.status} disabled={updating || Boolean(paymentNeedsResolution)} onChange={(event) => onStatusChange(event.target.value as Order["status"])}>
                <option>Processing</option>
                <option>Shipped</option>
                <option>Delivered</option>
              </select>
            </label>
            <p className="admin-order-status-help">{paymentNeedsResolution ? "Fulfilment is disabled because this paid order was cancelled." : updating ? "Saving order status…" : "Update the order when it moves to its next delivery stage."}</p>
            <button className="admin-primary admin-order-save-status" type="button" disabled={updating || Boolean(paymentNeedsResolution)} onClick={() => onStatusChange(order.status)}>{updating ? "Saving status…" : "Save status"}</button>
            <button className="admin-order-mark-shipped" type="button" disabled={updating || Boolean(paymentNeedsResolution) || order.status === "Shipped" || order.status === "Delivered"} onClick={() => onStatusChange("Shipped")}><Truck aria-hidden="true" /> Mark as shipped</button>
          </section>

          <section className="admin-order-card">
            <div className="admin-order-card-heading"><div><p className="admin-eyebrow">Customer</p><h2>Customer &amp; delivery</h2></div></div>
            <div className="admin-order-customer-grid">
              <div><UserRound aria-hidden="true" /><span>Name</span><strong>{order.customer || "Customer unavailable"}</strong></div>
              <div><Mail aria-hidden="true" /><span>Email</span><strong>{order.email || "Email unavailable"}</strong></div>
              <div><Truck aria-hidden="true" /><span>Delivery method</span><strong>{order.delivery.method}</strong></div>
              <div><UserRound aria-hidden="true" /><span>Recipient</span><strong>{order.delivery.name || order.customer || "Recipient unavailable"}</strong></div>
              <div className="admin-order-customer-address"><MapPin aria-hidden="true" /><span>Address</span><address>{addressParts.length > 0 ? addressParts.map((part, index) => <span key={`${part}-${index}`}>{part}</span>) : <span>Address unavailable</span>}</address></div>
            </div>
            <div className="admin-order-customer-actions"><a href={`mailto:${order.email}`}><Mail aria-hidden="true" /> Email customer</a><button type="button" onClick={() => void navigator.clipboard?.writeText(addressParts.join(", "))}><Copy aria-hidden="true" /> Copy address</button></div>
          </section>

          <section className="admin-order-card admin-order-payment-card">
            <div className="admin-order-card-heading"><div><p className="admin-eyebrow">Payment</p><h2>Payment details</h2></div></div>
            <dl className="admin-order-detail-list">
              <div><dt>Gateway</dt><dd>Stripe</dd></div>
              <div><dt>Payment</dt><dd>{order.paymentResolution === "refunded" ? "Refunded" : order.paymentResolution === "refund_processing" ? "Refund processing" : order.paymentResolution === "refund_pending" ? "Refund pending" : order.paymentResolution === "manual_resolution" ? "Manual resolution" : "Paid"}</dd></div>
              <div><dt>Currency</dt><dd>{order.currency?.toUpperCase() || "GBP"}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

function formatUserDate(value: number | null) {
  if (!value) return "Not signed in yet";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : fallback;
    } catch {
      return fallback;
    }
  });

  function persist(nextValue: T) {
    try {
      window.localStorage.setItem(key, JSON.stringify(nextValue));
      return true;
    } catch {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("glam-storage-error", { detail: { key } }));
      }, 0);
      return false;
    }
  }

  const setStoredValue = (nextValue: T | ((current: T) => T)) => {
    setValue((current) => {
      const resolvedValue = typeof nextValue === "function"
        ? (nextValue as (current: T) => T)(current)
        : nextValue;
      return persist(resolvedValue) ? resolvedValue : current;
    });
  };

  useEffect(() => {
    persist(value);
  // This retains the existing first-load migration from the legacy catalog key.
    // Updates are persisted synchronously through setStoredValue or commitStoredValue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commitStoredValue(nextValue: T) {
    if (!persist(nextValue)) return false;
    setValue(nextValue);
    return true;
  }

  return [value, setStoredValue, commitStoredValue] as const;
}

function SectionTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="admin-section-title">
      <div>
        <p className="admin-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function blankProduct(category: string): ProductDraft {
  return {
    slug: "",
    name: "",
    category,
    eyebrow: "",
    price: "",
    stock: 0,
    status: "Draft",
    type: "Simple",
    description: "",
    longDescription: "",
    fitAndSize: "",
    deliveryAndReturns: "",
    careDetails: "",
    sku: "",
    image: "",
    position: "50% 50%",
    galleryImages: [],
    variationAttributes: [],
    variations: [],
  };
}

function blankCategory(): CategoryDraft {
  return { name: "", slug: "", image: "", description: "", parentId: null };
}

function blankCoupon(): CouponDraft {
  return {
    code: "",
    discountType: "percentage",
    discountValue: "",
    startsAt: "",
    endsAt: "",
    minimumSpend: "",
    usageLimit: "",
    active: true,
  };
}

function couponDraftFromRecord(coupon: CouponRecord): CouponDraft {
  return {
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountType === "fixed"
      ? (coupon.discountValue / 100).toFixed(2)
      : String(coupon.discountValue),
    startsAt: coupon.startsAt ?? "",
    endsAt: coupon.endsAt ?? "",
    minimumSpend: coupon.minimumSpend ? (coupon.minimumSpend / 100).toFixed(2) : "",
    usageLimit: coupon.usageLimit ? String(coupon.usageLimit) : "",
    active: coupon.active,
  };
}

function formatCouponDiscount(coupon: CouponRecord) {
  return coupon.discountType === "percentage"
    ? `${coupon.discountValue}% off`
    : `${formatPounds(coupon.discountValue / 100)} off`;
}

function compressProductImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("The image could not be read."));
        return;
      }
      const image = new Image();
      image.onerror = () => reject(new Error("The image could not be loaded."));
      image.onload = () => {
        const maxDimension = 1200;
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("The image could not be processed."));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function ProductEditorWithMultipleUploads({
  product,
  categories,
  availableImages,
  onCancel,
  onSave,
}: {
  product?: Product;
  categories: string[];
  availableImages: string[];
  onCancel: () => void;
  onSave: (draft: ProductDraft) => void;
}) {
  const [draft, setDraft] = useState<ProductDraft>(() =>
    product
      ? {
           slug: product.slug || createProductSlug(product.name),
          name: product.name,
          category: product.category,
          eyebrow: product.eyebrow ?? "",
           price: getCatalogPriceInput(product.price),
          stock: product.stock,
          status: product.status,
          type: product.type,
          description: product.description,
          longDescription: product.longDescription ?? "",
          fitAndSize: product.fitAndSize ?? "",
          deliveryAndReturns: product.deliveryAndReturns ?? "",
          careDetails: product.careDetails ?? "",
          sku: product.sku,
           image: product.image,
           position: product.position,
           galleryImages: [...new Set((product.galleryImages ?? []).filter((image) => image !== product.image))],
           variationAttributes: product.variationAttributes ?? [
             ...(product.variations.some((variation) => variation.size) ? ["size" as const] : []),
             ...(product.variations.some((variation) => variation.colour) ? ["colour" as const] : []),
           ],
           variations: product.variations.map((variation) => ({ ...variation, price: getCatalogPriceInput(variation.price) })),
        }
      : blankProduct(categories[0] ?? "Dresses"),
  );
  const [validationMessage, setValidationMessage] = useState("");
  const [productImageFileName, setProductImageFileName] = useState("");
  const [galleryImageUrl, setGalleryImageUrl] = useState("");
  const [galleryImageFileNames, setGalleryImageFileNames] = useState<string[]>([]);
  const [primaryMediaLibraryOpen, setPrimaryMediaLibraryOpen] = useState(false);
  const [galleryMediaLibraryOpen, setGalleryMediaLibraryOpen] = useState(false);
  const productImagePreview = getCatalogMediaSource(draft.image);

  const publishLabel = product && draft.status === "Published" ? "Update product" : "Publish product";
  const totalVariationStock = draft.variations.reduce((total, variation) => total + variation.stock, 0);
  const checklistItems = [
    { label: "Product name", complete: Boolean(draft.name.trim()) },
    {
      label: draft.type === "Variable" ? "Variation prices" : "Price",
      complete: draft.type === "Variable"
        ? draft.variations.length > 0 && draft.variations.every((variation) => Boolean(formatCatalogPrice(variation.price)))
        : Boolean(formatCatalogPrice(draft.price)),
    },
    { label: "Inventory", complete: draft.type === "Simple" || draft.variations.length > 0 },
    { label: "Media", complete: Boolean(draft.image.trim()) },
    { label: "Category", complete: Boolean(draft.category.trim()) },
  ];
  const completedChecklistItems = checklistItems.filter((item) => item.complete).length;

  function updateDraft(patch: Partial<ProductDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setValidationMessage("");
  }

  function updateProductName(name: string) {
    setDraft((current) => ({
      ...current,
      name,
      slug: !current.slug || current.slug === createProductSlug(current.name)
        ? createProductSlug(name)
        : current.slug,
    }));
    setValidationMessage("");
  }

  function save(status: ProductStatus) {
    const formattedPrice = formatCatalogPrice(draft.price);
    const isVariableProduct = draft.type === "Variable";
    if (!draft.name.trim() || (!isVariableProduct && !formattedPrice)) {
      setValidationMessage(isVariableProduct ? "Add a product name before saving." : "Add a product name and a valid price before saving.");
      return;
    }
    if (isVariableProduct && draft.variations.length === 0) {
      setValidationMessage("Add at least one variation or change the product type to Simple.");
      return;
    }
    if (isVariableProduct && (draft.variationAttributes ?? []).length === 0) {
      setValidationMessage("Choose at least one variation attribute.");
      return;
    }
    if (isVariableProduct && draft.variations.some((variation) =>
      (draft.variationAttributes ?? []).some((attribute) => !(attribute === "size" ? variation.size : attribute === "colour" ? variation.colour : variation.attributes?.[attribute] ?? "").trim()),
    )) {
      setValidationMessage("Complete every selected attribute for each variation.");
      return;
    }
    const combinationKeys = draft.variations.map((variation) =>
      (draft.variationAttributes ?? []).map((attribute) => (attribute === "size" ? variation.size : attribute === "colour" ? variation.colour : variation.attributes?.[attribute] ?? "").trim().toLowerCase()).join("|"),
    );
    if (isVariableProduct && new Set(combinationKeys).size !== combinationKeys.length) {
      setValidationMessage("Each variation combination must be unique.");
      return;
    }
    if (isVariableProduct && draft.variations.some((variation) => !formatCatalogPrice(variation.price))) {
      setValidationMessage("Add a valid price for every variation before saving.");
      return;
    }
    onSave({
      ...draft,
      slug: createProductSlug(draft.slug || draft.name),
      name: draft.name.trim(),
      eyebrow: draft.eyebrow?.trim(),
      description: draft.description.trim(),
      longDescription: draft.longDescription?.trim(),
      fitAndSize: draft.fitAndSize?.trim(),
      deliveryAndReturns: draft.deliveryAndReturns?.trim(),
      careDetails: draft.careDetails?.trim(),
      price: formattedPrice,
      status,
      image: draft.image.trim(),
      galleryImages: Array.from(new Set((draft.galleryImages ?? []).map((image) => image.trim()).filter((image) => image && image !== draft.image.trim()))),
      variations: isVariableProduct ? draft.variations.map((variation) => ({
        ...variation,
        price: formatCatalogPrice(variation.price),
      })) : [],
    });
  }

  function addVariation() {
    setDraft((current) => ({
      ...current,
      variations: [
        ...current.variations,
        {
          id: Date.now(),
          size: "",
          colour: "",
          sku: current.sku ? `${current.sku}-${current.variations.length + 1}` : "",
          price: current.price,
          stock: 0,
          attributes: {},
        },
      ],
    }));
  }

  function toggleVariationAttribute(attribute: VariationAttribute) {
    setDraft((current) => {
      const attributes = current.variationAttributes ?? [];
      const enabled = attributes.includes(attribute);
      return {
        ...current,
        variationAttributes: enabled ? attributes.filter((item) => item !== attribute) : [...attributes, attribute],
        variations: enabled
          ? current.variations.map((variation) => ({ ...variation, attributes: { ...variation.attributes, [attribute]: "" } }))
          : current.variations,
      };
    });
  }

  function addCustomVariationAttribute() {
    const name = window.prompt("Attribute name (for example Material or Length)")?.trim();
    if (!name || !/^[a-zA-Z0-9 _-]{1,60}$/.test(name)) return;
    setDraft((current) => current.variationAttributes?.includes(name)
      ? current
      : { ...current, variationAttributes: [...(current.variationAttributes ?? []), name] });
  }

  function updateVariation(id: number, patch: Partial<ProductVariation> & { attributes?: Record<string, string> }) {
    setDraft((current) => ({
      ...current,
      variations: current.variations.map((variation) =>
        variation.id === id ? { ...variation, ...patch } : variation,
      ),
    }));
  }

  function removeVariation(id: number) {
    setDraft((current) => ({
      ...current,
      variations: current.variations.filter((variation) => variation.id !== id),
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save(draft.status);
  }

  async function handleProductImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setValidationMessage("Please choose an image file.");
      event.target.value = "";
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setValidationMessage("Please choose an image smaller than 4MB.");
      event.target.value = "";
      return;
    }
    try {
      const compressedImage = await compressProductImage(file);
      updateDraft({ image: compressedImage });
      setProductImageFileName(file.name);
    } catch {
      setValidationMessage("The image could not be processed. Please choose another image.");
      event.target.value = "";
    }
  }

  function addGalleryImage(image: string) {
    const normalizedImage = image.trim();
    if (!normalizedImage) return;
    if (normalizedImage === draft.image.trim() || (draft.galleryImages ?? []).includes(normalizedImage)) {
      setValidationMessage("This image is already in the product gallery.");
      return;
    }
    updateDraft({
      galleryImages: [...new Set([...(draft.galleryImages ?? []), normalizedImage])],
    });
    setGalleryImageUrl("");
    setGalleryImageFileNames((current) => [...current, ""]);
  }

  function addGalleryImages(images: string[], fileNames: string[]) {
    const primaryImage = draft.image.trim();
    const existingImages = draft.galleryImages ?? [];
    const existingImageSet = new Set([primaryImage, ...existingImages]);
    const newImageEntries = images
      .map((image, index) => ({ image: image.trim(), fileName: fileNames[index] ?? "" }))
      .filter(({ image }) => {
        if (!image || existingImageSet.has(image)) return false;
        existingImageSet.add(image);
        return true;
      });
    if (newImageEntries.length === 0) {
      setValidationMessage("Those images are already in the product gallery.");
      return;
    }
    updateDraft({ galleryImages: [...existingImages, ...newImageEntries.map(({ image }) => image)] });
    setGalleryImageFileNames((current) => [...current, ...newImageEntries.map(({ fileName }) => fileName)]);
  }

  function removeGalleryImage(index: number) {
    updateDraft({ galleryImages: (draft.galleryImages ?? []).filter((_, imageIndex) => imageIndex !== index) });
    setGalleryImageFileNames((current) => current.filter((_, imageIndex) => imageIndex !== index));
  }

  function moveGalleryImage(index: number, direction: -1 | 1) {
    const currentImages = [...(draft.galleryImages ?? [])];
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= currentImages.length) return;
    [currentImages[index], currentImages[nextIndex]] = [currentImages[nextIndex], currentImages[index]];
    updateDraft({ galleryImages: currentImages });
    setGalleryImageFileNames((current) => {
      const nextNames = [...current];
      [nextNames[index], nextNames[nextIndex]] = [nextNames[nextIndex], nextNames[index]];
      return nextNames;
    });
  }

  async function handleGalleryImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    const invalidFile = files.find((file) => !file.type.startsWith("image/"));
    if (invalidFile) {
      setValidationMessage("Please choose an image file.");
      event.target.value = "";
      return;
    }
    const oversizedFile = files.find((file) => file.size > 4 * 1024 * 1024);
    if (oversizedFile) {
      setValidationMessage("Please choose an image smaller than 4MB.");
      event.target.value = "";
      return;
    }
    try {
      const compressedImages = await Promise.all(files.map((file) => compressProductImage(file)));
      addGalleryImages(compressedImages, files.map((file) => file.name));
    } catch {
      setValidationMessage("One or more gallery images could not be processed. Please choose another selection.");
      event.target.value = "";
    }
    event.target.value = "";
  }

  return (
    <form className="admin-product-editor" onSubmit={handleSubmit}>
      <div className="admin-editor-topbar">
        <button className="admin-back-button" type="button" onClick={onCancel}>← Back to products</button>
        <span>{product ? "Edit product" : "Add new product"}</span>
      </div>
      <div className="admin-editor-heading">
        <div>
          <p className="admin-eyebrow">Catalog / {product ? "Edit" : "New"}</p>
          <h1>{product ? product.name : "Add new product"}</h1>
          <p>{product ? "Update the product details, variations, or publishing status." : "Create a product customers will love to add to their next plan."}</p>
        </div>
        <div className="admin-editor-heading-actions">
          <button className="admin-secondary" type="button" onClick={() => save("Draft")}>Save draft</button>
          <button className="admin-primary" type="button" onClick={() => save("Published")}>{publishLabel}</button>
        </div>
      </div>

      {validationMessage && <div className="admin-validation" role="alert">{validationMessage}</div>}

      <div className="admin-editor-layout">
        <div className="admin-editor-column">
          <section className="admin-editor-card">
            <div className="admin-card-heading">
              <div className="admin-card-title"><span className="admin-card-icon"><Package aria-hidden="true" /></span><h2>Product details</h2></div>
              <span className="admin-required-note">* Required</span>
            </div>
            <div className="admin-detail-fields">
              <label className="admin-editor-label">Product name *
                <input className="admin-editor-input admin-editor-title-input" value={draft.name} onChange={(event) => updateProductName(event.target.value)} placeholder="e.g. Sienna Slip Dress" required />
              </label>
              <label className="admin-editor-label">Product slug
                <span className="admin-slug-input">
                  <input className="admin-editor-input" value={draft.slug} onChange={(event) => updateDraft({ slug: event.target.value })} placeholder="sienna-slip-dress" />
                  <small><Check aria-hidden="true" />Auto-generated</small>
                </span>
              </label>
              <label className="admin-editor-label">Product eyebrow
                <input className="admin-editor-input" value={draft.eyebrow ?? ""} onChange={(event) => updateDraft({ eyebrow: event.target.value })} placeholder={`${draft.category || "Dresses"} edit · Glam Too`} />
                <small>Shown above the product title. Leave blank to use the category automatically.</small>
              </label>
              <label className="admin-editor-label">Description
                <textarea className="admin-editor-input admin-editor-textarea" value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} placeholder="A short description shown beside the product title." rows={3} />
              </label>
              <label className="admin-editor-label">Long description
                <textarea className="admin-editor-input admin-editor-textarea" value={draft.longDescription ?? ""} onChange={(event) => updateDraft({ longDescription: event.target.value })} placeholder="Add the full product story, materials, and design details." rows={5} />
              </label>
              <label className="admin-editor-label">Fit &amp; size
                <textarea className="admin-editor-input admin-editor-textarea" value={draft.fitAndSize ?? ""} onChange={(event) => updateDraft({ fitAndSize: event.target.value })} placeholder="Add fit guidance, measurements, and sizing advice." rows={4} />
              </label>
              <label className="admin-editor-label">Care details
                <textarea className="admin-editor-input admin-editor-textarea" value={draft.careDetails ?? ""} onChange={(event) => updateDraft({ careDetails: event.target.value })} placeholder="Add washing, ironing, storage, and fabric-care instructions." rows={4} />
              </label>
            </div>
          </section>

          <section className="admin-editor-card">
            <div className="admin-card-heading"><div className="admin-card-title"><span className="admin-card-icon"><CircleDollarSign aria-hidden="true" /></span><h2>Pricing &amp; inventory</h2></div></div>
            <div className="admin-field-grid">
              <label className="admin-editor-label">Product type
                <select className="admin-editor-input" value={draft.type} onChange={(event) => updateDraft({ type: event.target.value as ProductType })}>
                  <option value="Simple">Simple product</option>
                  <option value="Variable">Variable product</option>
                </select>
                <small>{draft.type === "Variable" ? "Customers will choose from the variations below." : "One price and stock level for this product."}</small>
              </label>
              <label className="admin-editor-label">SKU
                <input className="admin-editor-input" value={draft.sku} onChange={(event) => updateDraft({ sku: event.target.value })} placeholder="e.g. GM-SIENNA" />
              </label>
              <label className="admin-editor-label">{draft.type === "Variable" ? "Regular price (optional)" : "Regular price *"}
                <input className="admin-editor-input" type="number" min="0.01" step="0.01" value={draft.price} onChange={(event) => updateDraft({ price: event.target.value })} inputMode="decimal" placeholder="89.99" required={draft.type === "Simple"} />
                {draft.type === "Variable" && <small>Set the selling price on each variation below.</small>}
              </label>
              <label className="admin-editor-label">Stock quantity
                <input className="admin-editor-input" type="number" min="0" value={draft.stock} onChange={(event) => updateDraft({ stock: Number(event.target.value) || 0 })} />
              </label>
            </div>
          </section>

          {draft.type === "Variable" && (
            <section className="admin-editor-card admin-variations-card">
              <div className="admin-card-heading">
                <div><p className="admin-eyebrow">Variable product</p><h2>Variations</h2><p className="admin-card-description">Choose the attributes this product needs, then add each purchasable combination.</p></div>
                <button className="admin-secondary" type="button" onClick={addVariation} disabled={(draft.variationAttributes ?? []).length === 0}>+ Add variation</button>
              </div>
              <div className="admin-variation-attributes">
                <span className="admin-card-description">Attributes</span>
                <label><input type="checkbox" checked={(draft.variationAttributes ?? []).includes("size")} onChange={() => toggleVariationAttribute("size")} /> Size</label>
                <label><input type="checkbox" checked={(draft.variationAttributes ?? []).includes("colour")} onChange={() => toggleVariationAttribute("colour")} /> Colour</label>
                {(draft.variationAttributes ?? []).filter((attribute) => attribute !== "size" && attribute !== "colour").map((attribute) => <label key={attribute}><input type="checkbox" checked onChange={() => toggleVariationAttribute(attribute)} /> {attribute}</label>)}
                <button className="admin-secondary" type="button" onClick={addCustomVariationAttribute}>+ Custom attribute</button>
              </div>
              <div className="admin-variation-attributes">
                <strong>1. Choose attributes</strong>
                <div>
                  <label><input type="checkbox" checked={(draft.variationAttributes ?? []).includes("size")} onChange={() => toggleVariationAttribute("size")} /> Size</label>
                  <label><input type="checkbox" checked={(draft.variationAttributes ?? []).includes("colour")} onChange={() => toggleVariationAttribute("colour")} /> Colour</label>
                  {(draft.variationAttributes ?? []).filter((attribute) => attribute !== "size" && attribute !== "colour").map((attribute) => <label key={attribute}><input type="checkbox" checked onChange={() => toggleVariationAttribute(attribute)} /> {attribute}</label>)}
                  <button type="button" className="admin-secondary" onClick={addCustomVariationAttribute}>+ Custom attribute</button>
                </div>
              </div>
              {draft.variations.length === 0 ? (
                <div className="admin-empty-variations"><strong>2. Add combinations</strong><span>Add each combination with its own SKU, price, and stock.</span><button className="admin-primary" type="button" onClick={addVariation} disabled={(draft.variationAttributes ?? []).length === 0}>Add first variation</button></div>
              ) : (
                <div className={`admin-variation-table ${(draft.variationAttributes ?? []).length === 1 ? "is-single-attribute" : ""}`}>
                  <div className="admin-variation-table-head">{(draft.variationAttributes ?? []).map((attribute) => <span key={attribute}>{attribute === "size" ? "Size" : attribute === "colour" ? "Colour" : attribute}</span>)}<span>Variation SKU</span><span>Price *</span><span>Stock</span><span /></div>
                  {draft.variations.map((variation) => (
                    <div className="admin-variation-row" key={variation.id}>
                      {(draft.variationAttributes ?? []).map((attribute) => <input key={attribute} aria-label={`Variation ${attribute}`} value={attribute === "size" ? variation.size : attribute === "colour" ? variation.colour : variation.attributes?.[attribute] ?? ""} onChange={(event) => attribute === "size" || attribute === "colour" ? updateVariation(variation.id, { [attribute]: event.target.value }) : updateVariation(variation.id, { attributes: { ...variation.attributes, [attribute]: event.target.value } })} placeholder={attribute === "size" ? "UK 8" : attribute === "colour" ? "Blush" : `Enter ${attribute}`} />)}
                      <input aria-label="Variation SKU" value={variation.sku} onChange={(event) => updateVariation(variation.id, { sku: event.target.value })} placeholder="GM-001-8" />
                      <input aria-label="Variation price" type="number" min="0.01" step="0.01" value={variation.price} onChange={(event) => updateVariation(variation.id, { price: event.target.value })} inputMode="decimal" placeholder="89.99" required />
                      <input aria-label="Variation stock" type="number" min="0" value={variation.stock} onChange={(event) => updateVariation(variation.id, { stock: Number(event.target.value) || 0 })} />
                      <button className="admin-remove-button" type="button" onClick={() => removeVariation(variation.id)} aria-label={`Remove ${variation.size || "variation"}`}>×</button>
                    </div>
                  ))}
                </div>
              )}
              {draft.variations.length > 0 && <p className="admin-variation-summary">{draft.variations.length} variation{draft.variations.length === 1 ? "" : "s"} · {totalVariationStock} units in stock</p>}
            </section>
          )}

          <section className="admin-editor-card admin-media-card">
            <div className="admin-card-heading"><div className="admin-card-title"><span className="admin-card-icon"><ImageIcon aria-hidden="true" /></span><h2>Product media</h2></div></div>
            <div className="admin-media-workspace">
              <div className="admin-media-primary">
                <div className="admin-media-primary-frame">
                  {productImagePreview ? <img className="admin-product-image-preview" src={productImagePreview} alt={`${draft.name || "Product"} preview`} /> : <div className="admin-image-placeholder"><ImageIcon aria-hidden="true" /><strong>Add a primary product image</strong><span>PNG, JPG or WEBP · max 4MB</span></div>}
                  <button type="button" className="admin-media-edit-button" aria-label="Change primary product image" onClick={() => setPrimaryMediaLibraryOpen(true)}><ImageIcon aria-hidden="true" /></button>
                  <MediaLibrary
                    isOpen={primaryMediaLibraryOpen}
                    onClose={() => setPrimaryMediaLibraryOpen(false)}
                    availableImages={availableImages}
                    onSelect={(images) => {
                      if (images[0]) {
                        setProductImageFileName("");
                        updateDraft({ image: images[0] });
                      }
                    }}
                    onUpload={handleProductImageUpload}
                  />
                </div>
                <label className="admin-media-url-field">Primary image URL<input className="admin-editor-input" value={draft.image.startsWith("data:") || isCatalogMediaReference(draft.image) ? "" : draft.image} onChange={(event) => { setProductImageFileName(""); updateDraft({ image: event.target.value }); }} placeholder="Paste image URL" /></label>
              </div>
              <div className="admin-media-gallery">
                <div className="admin-gallery-heading">
                  <strong>Gallery images</strong>
                  <small>Add supporting views for the product page. The primary image stays first.</small>
                </div>
                <div className="admin-product-gallery-strip" aria-label="Gallery image order">
                  {(draft.galleryImages ?? []).map((image, index) => (
                      <div className="admin-product-gallery-item" key={`${image}-${index}`}>
                        {getCatalogMediaSource(image) ? <img src={getCatalogMediaSource(image)} alt={`${draft.name || "Product"} gallery view ${index + 1}`} /> : <div className="admin-image-placeholder">Loading image…</div>}
                        <div className="admin-product-gallery-item-actions">
                          <button type="button" onClick={() => moveGalleryImage(index, -1)} disabled={index === 0} aria-label={`Move gallery image ${index + 1} left`}>←</button>
                          <button type="button" onClick={() => moveGalleryImage(index, 1)} disabled={index === (draft.galleryImages ?? []).length - 1} aria-label={`Move gallery image ${index + 1} right`}>→</button>
                          <button className="admin-remove-button" type="button" onClick={() => removeGalleryImage(index)} aria-label={`Remove gallery image ${index + 1}`}>×</button>
                        </div>
                      </div>
                  ))}
                  <button type="button" className="admin-gallery-upload-tile" onClick={() => setGalleryMediaLibraryOpen(true)}><span aria-hidden="true">+</span><strong>Select</strong></button>
                  <MediaLibrary
                    isOpen={galleryMediaLibraryOpen}
                    onClose={() => setGalleryMediaLibraryOpen(false)}
                    availableImages={availableImages}
                    multiple
                    onSelect={(images) => {
                      addGalleryImages(images, images.map(() => ""));
                    }}
                    onUpload={handleGalleryImageUpload}
                  />
                </div>
                <div className="admin-gallery-add">
                  <input className="admin-editor-input" value={galleryImageUrl} onChange={(event) => setGalleryImageUrl(event.target.value)} placeholder="Or paste a gallery image URL" aria-label="Gallery image URL" />
                  <button className="admin-secondary" type="button" onClick={() => addGalleryImage(galleryImageUrl)} disabled={!galleryImageUrl.trim()}>Add</button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="admin-editor-sidebar">
          <section className="admin-publish-card">
            <div className="admin-card-heading"><div className="admin-card-title"><span className="admin-card-icon"><Package aria-hidden="true" /></span><h2>Product status</h2></div></div>
            <label className="admin-editor-label">Status
              <select className="admin-editor-input" value={draft.status} onChange={(event) => updateDraft({ status: event.target.value as ProductStatus })}>
                <option value="Draft">Draft</option>
                <option value="Published">Published</option>
              </select>
            </label>
            <div className="admin-status-summary">
              <div><span>Visibility</span><strong>{draft.status === "Published" ? "Visible" : "Hidden"}</strong></div>
              <div><span>Publish</span><strong>{draft.status === "Published" ? "Published" : "Publish manually"}</strong></div>
            </div>
            <p className="admin-publish-help">{draft.status === "Published" ? "This product is visible on your storefront." : "This product stays hidden until you publish it."}</p>
          </section>

          <section className="admin-editor-card admin-sidebar-card">
            <div className="admin-card-heading"><div className="admin-card-title"><span className="admin-card-icon"><FolderOpen aria-hidden="true" /></span><h2>Organization</h2></div></div>
            <label className="admin-editor-label">Category
              <select className="admin-editor-input" value={draft.category} onChange={(event) => updateDraft({ category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select>
            </label>
          </section>

           <section className="admin-editor-card admin-sidebar-card">
             <p className="admin-eyebrow">Product media</p>
             {draft.image ? <img className="admin-product-image-preview" src={draft.image} alt={`${draft.name || "Product"} preview`} /> : <div className="admin-image-placeholder">Add an image URL or upload an image to preview your product.</div>}
             <label className="admin-editor-label">Image URL
               <input className="admin-editor-input" value={draft.image.startsWith("data:") ? "" : draft.image} onChange={(event) => { setProductImageFileName(""); updateDraft({ image: event.target.value }); }} placeholder="https://..." />
             </label>
             <div className="admin-image-upload">
               <button type="button" className="admin-upload-button" onClick={() => setPrimaryMediaLibraryOpen(true)}>Select image</button>
               <span>{productImageFileName || "PNG, JPG, WEBP or GIF · max 4MB"}</span>
             </div>
              <div className="admin-gallery-divider" />
              <div className="admin-gallery-heading">
                <p className="admin-eyebrow">Gallery images</p>
                <small>Add supporting views for the product page. The primary image stays first.</small>
              </div>
              <div className="admin-gallery-add">
                <input className="admin-editor-input" value={galleryImageUrl} onChange={(event) => setGalleryImageUrl(event.target.value)} placeholder="https://... gallery image URL" aria-label="Gallery image URL" />
                <button className="admin-secondary" type="button" onClick={() => addGalleryImage(galleryImageUrl)} disabled={!galleryImageUrl.trim()}>Add image</button>
              </div>
              <div className="admin-image-upload">
                <button type="button" className="admin-upload-button" onClick={() => setGalleryMediaLibraryOpen(true)}>Select gallery images</button>
                <span>{galleryImageFileNames.filter(Boolean).join(", ") || "Select one or more · max 4MB each"}</span>
              </div>
              {(draft.galleryImages ?? []).length > 0 ? (
                <div className="admin-product-gallery-list" aria-label="Gallery image order">
                  {(draft.galleryImages ?? []).map((image, index) => (
                    <div className="admin-product-gallery-item" key={`${image}-${index}`}>
                      <img src={image} alt={`${draft.name || "Product"} gallery view ${index + 1}`} />
                      <div className="admin-product-gallery-item-actions">
                        <span>View {index + 2}</span>
                        <button type="button" onClick={() => moveGalleryImage(index, -1)} disabled={index === 0} aria-label={`Move gallery image ${index + 1} earlier`}>↑</button>
                        <button type="button" onClick={() => moveGalleryImage(index, 1)} disabled={index === (draft.galleryImages ?? []).length - 1} aria-label={`Move gallery image ${index + 1} later`}>↓</button>
                        <button className="admin-remove-button" type="button" onClick={() => removeGalleryImage(index)} aria-label={`Remove gallery image ${index + 1}`}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="admin-gallery-empty">No additional gallery images yet.</p>}
           </section>

          <section className="admin-editor-card admin-sidebar-card">
            <div className="admin-card-heading admin-checklist-heading">
              <div className="admin-card-title"><span className="admin-card-icon"><ListChecks aria-hidden="true" /></span><h2>Product checklist</h2></div>
              <span>{completedChecklistItems} of {checklistItems.length} complete</span>
            </div>
            <ul className="admin-checklist">
              {checklistItems.map((item) => <li className={item.complete ? "is-complete" : ""} key={item.label}>{item.label}</li>)}
            </ul>
            <div className="admin-checklist-progress" aria-hidden="true"><span style={{ width: `${(completedChecklistItems / checklistItems.length) * 100}%` }} /></div>
          </section>
        </aside>
      </div>
    </form>
  );
}
type MediaLibraryProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (images: string[]) => void;
  multiple?: boolean;
  availableImages: string[];
  onUpload: (e: ChangeEvent<HTMLInputElement>) => Promise<void> | void;
  isUploading?: boolean;
};

function MediaLibrary({
  isOpen,
  onClose,
  onSelect,
  multiple = false,
  availableImages,
  onUpload,
  isUploading,
}: MediaLibraryProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) setSelected(new Set());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function toggleSelection(image: string) {
    const next = new Set(multiple ? selected : []);
    if (next.has(image)) {
      next.delete(image);
    } else {
      next.add(image);
    }
    setSelected(next);
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal admin-media-library" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="media-library-title">
        <header className="admin-modal-header">
          <h2 id="media-library-title">Select Image</h2>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close"><X aria-hidden="true" /></button>
        </header>
        <div className="admin-media-library-content">
          <div className="admin-media-library-grid">
            <div className="admin-media-library-upload-card" onClick={() => fileInputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}>
              <Upload aria-hidden="true" />
              <span>Upload new</span>
              <input ref={fileInputRef} type="file" multiple={multiple} accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => {
                void onUpload(e);
                onClose();
              }} disabled={isUploading} />
            </div>
            {availableImages.map((image, i) => {
              const isSelected = selected.has(image);
              const preview = getCatalogMediaSource(image);
              return (
                <button
                  key={`${image}-${i}`}
                  className={`admin-media-library-item ${isSelected ? "is-selected" : ""}`}
                  type="button"
                  onClick={() => toggleSelection(image)}
                >
                  {preview ? <img src={preview} alt={`Product media preview ${i + 1}`} loading="lazy" decoding="async" /> : <div className="admin-image-placeholder"><ImageIcon aria-hidden="true" /></div>}
                  {isSelected && <div className="admin-media-library-item-check"><Check aria-hidden="true" /></div>}
                </button>
              );
            })}
            {availableImages.length === 0 && (
              <div className="admin-media-library-empty">No images found.</div>
            )}
          </div>
        </div>
        <footer className="admin-modal-footer">
          <span className="admin-media-library-count">{selected.size} selected</span>
          <div className="admin-modal-actions">
            <button type="button" className="admin-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="admin-primary" disabled={selected.size === 0 || isUploading} onClick={() => { onSelect(Array.from(selected)); onClose(); }}>
              {isUploading ? "Uploading..." : "Select"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// The active editor below combines the multi-upload UI with storage-safe persistence.
function ProductEditor({
  product,
  categories,
  availableImages,
  promotionalProducts,
  onCancel,
  onSave,
}: {
  product?: Product;
  categories: string[];
  availableImages: string[];
  promotionalProducts: Product[];
  onCancel: () => void;
  onSave: (draft: ProductDraft) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<ProductDraft>(() =>
    product
      ? {
           slug: product.slug || createProductSlug(product.name),
          name: product.name,
          category: product.category,
          eyebrow: product.eyebrow ?? "",
           price: getCatalogPriceInput(product.price),
          stock: product.stock,
          status: product.status,
          type: product.type,
          description: product.description,
          longDescription: product.longDescription ?? "",
          fitAndSize: product.fitAndSize ?? "",
          deliveryAndReturns: product.deliveryAndReturns ?? "",
          careDetails: product.careDetails ?? "",
          sku: product.sku,
           image: product.image,
           position: product.position,
           galleryImages: [...new Set((product.galleryImages ?? []).filter((image) => image !== product.image))],
           variationAttributes: product.variationAttributes ?? [
             ...(product.variations.some((variation) => variation.size) ? ["size"] : []),
             ...(product.variations.some((variation) => variation.colour) ? ["colour"] : []),
           ],
           variations: product.variations.map((variation) => ({ ...variation, price: getCatalogPriceInput(variation.price) })),
        }
      : blankProduct(categories[0] ?? "Dresses"),
  );
  const [validationMessage, setValidationMessage] = useState("");
  const [productImageFileName, setProductImageFileName] = useState("");
  const [galleryImageUrl, setGalleryImageUrl] = useState("");
  const [galleryImageFileNames, setGalleryImageFileNames] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingGalleryUploads, setPendingGalleryUploads] = useState(0);
  const [customAttributeName, setCustomAttributeName] = useState("");
  const [primaryMediaLibraryOpen, setPrimaryMediaLibraryOpen] = useState(false);
  const [galleryMediaLibraryOpen, setGalleryMediaLibraryOpen] = useState(false);
  const productImagePreview = getCatalogMediaSource(draft.image);

  const publishLabel = product && draft.status === "Published" ? "Update product" : "Publish product";
  const totalVariationStock = draft.variations.reduce((total, variation) => total + variation.stock, 0);
  const checklistItems = [
    { label: "Product name", complete: Boolean(draft.name.trim()) },
    {
      label: draft.type === "Variable" ? "Variation prices" : "Price",
      complete: draft.type === "Variable"
        ? draft.variations.length > 0 && draft.variations.every((variation) => Boolean(formatCatalogPrice(variation.price)))
        : Boolean(formatCatalogPrice(draft.price)),
    },
    { label: "Inventory", complete: draft.type === "Simple" || draft.variations.length > 0 },
    { label: "Media", complete: Boolean(draft.image.trim()) },
    { label: "Category", complete: Boolean(draft.category.trim()) },
  ];
  const completedChecklistItems = checklistItems.filter((item) => item.complete).length;

  function updateDraft(patch: Partial<ProductDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setValidationMessage("");
  }

  function updateProductName(name: string) {
    setDraft((current) => ({
      ...current,
      name,
      slug: !current.slug || current.slug === createProductSlug(current.name)
        ? createProductSlug(name)
        : current.slug,
    }));
    setValidationMessage("");
  }

  async function save(status: ProductStatus) {
    if (pendingGalleryUploads > 0) {
      setValidationMessage("Your gallery images are still being prepared. Please wait a moment before saving.");
      return;
    }
    const formattedPrice = formatCatalogPrice(draft.price);
    const isVariableProduct = draft.type === "Variable";
    if (!draft.name.trim() || (!isVariableProduct && !formattedPrice)) {
      setValidationMessage(isVariableProduct ? "Add a product name before saving." : "Add a product name and a valid price before saving.");
      return;
    }
    if (isVariableProduct && draft.variations.length === 0) {
      setValidationMessage("Add at least one variation or change the product type to Simple.");
      return;
    }
    if (isVariableProduct && (draft.variationAttributes ?? []).length === 0) {
      setValidationMessage("Choose at least one variation attribute.");
      return;
    }
    if (isVariableProduct && draft.variations.some((variation) =>
      (draft.variationAttributes ?? []).some((attribute) =>
        !(attribute === "size" ? variation.size : attribute === "colour" ? variation.colour : variation.attributes?.[attribute] ?? "").trim(),
      ),
    )) {
      setValidationMessage("Complete every selected attribute for each variation.");
      return;
    }
    const combinationKeys = draft.variations.map((variation) =>
      (draft.variationAttributes ?? []).map((attribute) =>
        (attribute === "size" ? variation.size : attribute === "colour" ? variation.colour : variation.attributes?.[attribute] ?? "").trim().toLowerCase(),
      ).join("|"),
    );
    if (isVariableProduct && new Set(combinationKeys).size !== combinationKeys.length) {
      setValidationMessage("Each variation combination must be unique.");
      return;
    }
    if (isVariableProduct && draft.variations.some((variation) => !formatCatalogPrice(variation.price))) {
      setValidationMessage("Add a valid price for every variation before saving.");
      return;
    }
    setIsSaving(true);
    const wasSaved = await onSave({
      ...draft,
      slug: createProductSlug(draft.slug || draft.name),
      name: draft.name.trim(),
      eyebrow: draft.eyebrow?.trim(),
      description: draft.description.trim(),
      longDescription: draft.longDescription?.trim(),
      fitAndSize: draft.fitAndSize?.trim(),
      deliveryAndReturns: draft.deliveryAndReturns?.trim(),
      careDetails: draft.careDetails?.trim(),
      price: formattedPrice,
      status,
      image: draft.image.trim(),
      galleryImages: Array.from(new Set((draft.galleryImages ?? []).map((image) => image.trim()).filter((image) => image && image !== draft.image.trim()))),
      variations: isVariableProduct ? draft.variations.map((variation) => ({
        ...variation,
        price: formatCatalogPrice(variation.price),
      })) : [],
    });
    setIsSaving(false);
    if (!wasSaved) {
      setValidationMessage("Your product is still open and nothing was discarded. Free browser storage or use smaller images, then try again.");
    }
  }

  function addVariation() {
    setDraft((current) => ({
      ...current,
      variations: [
        ...current.variations,
        {
          id: Date.now(),
          size: "",
          colour: "",
          sku: current.sku ? `${current.sku}-${current.variations.length + 1}` : "",
          price: current.price,
          stock: 0,
          attributes: {},
        },
      ],
    }));
  }

  function updateVariation(id: number, patch: Partial<ProductVariation>) {
    setDraft((current) => ({
      ...current,
      variations: current.variations.map((variation) =>
        variation.id === id ? { ...variation, ...patch } : variation,
      ),
    }));
  }

  function toggleVariationAttribute(attribute: string) {
    setDraft((current) => {
      const attributes = current.variationAttributes ?? [];
      const enabled = attributes.includes(attribute);
      return {
        ...current,
        variationAttributes: enabled ? attributes.filter((item) => item !== attribute) : [...attributes, attribute],
        variations: enabled ? current.variations.map((variation) => ({
          ...variation,
          size: attribute === "size" ? "" : variation.size,
          colour: attribute === "colour" ? "" : variation.colour,
          attributes: Object.fromEntries(Object.entries(variation.attributes ?? {}).filter(([key]) => key !== attribute)),
        })) : current.variations,
      };
    });
    setValidationMessage("");
  }

  function addCustomVariationAttribute() {
    const name = customAttributeName.trim();
    if (!name || !/^[a-zA-Z0-9 _-]{1,60}$/.test(name)) {
      setValidationMessage("Enter an attribute name using letters, numbers, spaces, hyphens, or underscores.");
      return;
    }
    setDraft((current) => current.variationAttributes?.includes(name)
      ? current
      : { ...current, variationAttributes: [...(current.variationAttributes ?? []), name] });
    setCustomAttributeName("");
    setValidationMessage("");
  }

  function removeVariation(id: number) {
    setDraft((current) => ({
      ...current,
      variations: current.variations.filter((variation) => variation.id !== id),
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(draft.status);
  }

  async function handleProductImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setValidationMessage("Please choose an image file.");
      event.target.value = "";
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setValidationMessage("Please choose an image smaller than 4MB.");
      event.target.value = "";
      return;
    }
    try {
      const compressedImage = await compressProductImage(file);
      updateDraft({ image: compressedImage });
      setProductImageFileName(file.name);
    } catch {
      setValidationMessage("The image could not be processed. Please choose another image.");
      event.target.value = "";
    }
  }

  function addGalleryImage(image: string) {
    const normalizedImage = image.trim();
    if (!normalizedImage) return;
    if (normalizedImage === draft.image.trim() || (draft.galleryImages ?? []).includes(normalizedImage)) {
      setValidationMessage("This image is already in the product gallery.");
      return;
    }
    updateDraft({
      galleryImages: [...new Set([...(draft.galleryImages ?? []), normalizedImage])],
    });
    setGalleryImageUrl("");
    setGalleryImageFileNames((current) => [...current, ""]);
  }

  function addGalleryImages(images: string[], fileNames: string[]) {
    const incomingImages = images.map((image, index) => ({ image: image.trim(), fileName: fileNames[index] ?? "" }));
    setDraft((current) => {
      const existingImageSet = new Set([current.image.trim(), ...(current.galleryImages ?? [])]);
      const additions = incomingImages.filter(({ image }) => {
        if (!image || existingImageSet.has(image)) return false;
        existingImageSet.add(image);
        return true;
      });
      if (additions.length === 0) return current;
      return {
        ...current,
        galleryImages: [...(current.galleryImages ?? []), ...additions.map(({ image }) => image)],
      };
    });
    setGalleryImageFileNames((current) => [...current, ...incomingImages.map(({ fileName }) => fileName)]);
    setValidationMessage("");
  }

  function removeGalleryImage(index: number) {
    updateDraft({ galleryImages: (draft.galleryImages ?? []).filter((_, imageIndex) => imageIndex !== index) });
    setGalleryImageFileNames((current) => current.filter((_, imageIndex) => imageIndex !== index));
  }

  function moveGalleryImage(index: number, direction: -1 | 1) {
    const currentImages = [...(draft.galleryImages ?? [])];
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= currentImages.length) return;
    [currentImages[index], currentImages[nextIndex]] = [currentImages[nextIndex], currentImages[index]];
    updateDraft({ galleryImages: currentImages });
    setGalleryImageFileNames((current) => {
      const nextNames = [...current];
      [nextNames[index], nextNames[nextIndex]] = [nextNames[nextIndex], nextNames[index]];
      return nextNames;
    });
  }

  async function handleGalleryImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    if (files.some((file) => !file.type.startsWith("image/"))) {
      setValidationMessage("Please choose an image file.");
      event.target.value = "";
      return;
    }
    if (files.some((file) => file.size > 4 * 1024 * 1024)) {
      setValidationMessage("Please choose an image smaller than 4MB.");
      event.target.value = "";
      return;
    }
    setPendingGalleryUploads((count) => count + 1);
    try {
      const compressedImages = await Promise.all(files.map((file) => compressProductImage(file)));
      addGalleryImages(compressedImages, files.map((file) => file.name));
    } catch {
      setValidationMessage("One or more gallery images could not be processed. Please choose another selection.");
      event.target.value = "";
    } finally {
      setPendingGalleryUploads((count) => Math.max(0, count - 1));
    }
    event.target.value = "";
  }

  return (
    <form className="admin-product-editor" onSubmit={handleSubmit}>
      <div className="admin-editor-topbar">
        <button className="admin-back-button" type="button" onClick={onCancel}>Products</button>
        <span aria-hidden="true">/</span>
        <span>{product ? "Edit product" : "Add product"}</span>
      </div>
      <div className="admin-editor-heading">
        <div>
          <h1>{product ? product.name : "Add new product"}</h1>
          <p>{product ? "Update the product details, variations, or publishing status." : "Create a product your customers will love."}</p>
        </div>
        <div className="admin-editor-heading-actions">
          <span className="admin-editor-save-state"><span aria-hidden="true" />{isSaving ? "Saving changes" : pendingGalleryUploads > 0 ? "Preparing images" : "Unsaved changes"}</span>
          <button className="admin-secondary admin-editor-action" type="button" onClick={() => void save("Draft")} disabled={isSaving || pendingGalleryUploads > 0}><Save aria-hidden="true" />{isSaving ? "Saving…" : "Save draft"}</button>
          <button
            className="admin-secondary admin-editor-action"
            type="button"
            onClick={() => {
              if (!product) {
                setValidationMessage("Save this product as a draft before previewing it.");
                return;
              }
              window.open(`/product/${product.slug}`, "_blank", "noopener,noreferrer");
            }}
          >
            <Eye aria-hidden="true" />Preview
          </button>
          <button className="admin-primary admin-editor-action" type="button" onClick={() => void save("Published")} disabled={isSaving || pendingGalleryUploads > 0}><Send aria-hidden="true" />{isSaving ? "Saving…" : publishLabel}</button>
        </div>
      </div>

      {validationMessage && <div className="admin-validation" role="alert">{validationMessage}</div>}

      <div className="admin-editor-layout">
        <div className="admin-editor-column">
          <section className="admin-editor-card">
            <div className="admin-card-heading">
              <div className="admin-card-title"><span className="admin-card-icon"><Package aria-hidden="true" /></span><h2>Product details</h2></div>
              <span className="admin-required-note">* Required</span>
            </div>
            <div className="admin-detail-fields">
              <label className="admin-editor-label">Product name *
                <input className="admin-editor-input admin-editor-title-input" value={draft.name} onChange={(event) => updateProductName(event.target.value)} placeholder="e.g. Sienna Slip Dress" required />
              </label>
              <label className="admin-editor-label">Product slug
                <span className="admin-slug-input">
                  <input className="admin-editor-input" value={draft.slug} onChange={(event) => updateDraft({ slug: event.target.value })} placeholder="sienna-slip-dress" />
                  <small><Check aria-hidden="true" />Auto-generated</small>
                </span>
              </label>
              <label className="admin-editor-label">Product eyebrow
                <input className="admin-editor-input" value={draft.eyebrow ?? ""} onChange={(event) => updateDraft({ eyebrow: event.target.value })} placeholder={`${draft.category || "Dresses"} edit · Glam Too`} />
                <small>Shown above the product title. Leave blank to use the category automatically.</small>
              </label>
              <label className="admin-editor-label">Description
                <textarea className="admin-editor-input admin-editor-textarea" value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} placeholder="A short description shown beside the product title." rows={3} />
              </label>
              <label className="admin-editor-label">Long description
                <textarea className="admin-editor-input admin-editor-textarea" value={draft.longDescription ?? ""} onChange={(event) => updateDraft({ longDescription: event.target.value })} placeholder="Add the full product story, materials, and design details." rows={5} />
              </label>
              <label className="admin-editor-label">Fit &amp; size
                <textarea className="admin-editor-input admin-editor-textarea" value={draft.fitAndSize ?? ""} onChange={(event) => updateDraft({ fitAndSize: event.target.value })} placeholder="Add fit guidance, measurements, and sizing advice." rows={4} />
              </label>
              <label className="admin-editor-label">Care details
                <textarea className="admin-editor-input admin-editor-textarea" value={draft.careDetails ?? ""} onChange={(event) => updateDraft({ careDetails: event.target.value })} placeholder="Add washing, ironing, storage, and fabric-care instructions." rows={4} />
              </label>
            </div>
          </section>

          <section className="admin-editor-card">
            <div className="admin-card-heading"><div className="admin-card-title"><span className="admin-card-icon"><CircleDollarSign aria-hidden="true" /></span><h2>Pricing &amp; inventory</h2></div></div>
            <div className="admin-field-grid">
              <label className="admin-editor-label">Product type
                <select className="admin-editor-input" value={draft.type} onChange={(event) => updateDraft({ type: event.target.value as ProductType })}>
                  <option value="Simple">Simple product</option>
                  <option value="Variable">Variable product</option>
                </select>
                <small>{draft.type === "Variable" ? "Customers will choose from the variations below." : "One price and stock level for this product."}</small>
              </label>
              <label className="admin-editor-label">SKU
                <input className="admin-editor-input" value={draft.sku} onChange={(event) => updateDraft({ sku: event.target.value })} placeholder="e.g. GM-SIENNA" />
              </label>
              <label className="admin-editor-label">{draft.type === "Variable" ? "Regular price (optional)" : "Regular price *"}
                <input className="admin-editor-input" type="number" min="0.01" step="0.01" value={draft.price} onChange={(event) => updateDraft({ price: event.target.value })} inputMode="decimal" placeholder="89.99" required={draft.type === "Simple"} />
                {draft.type === "Variable" && <small>Set the selling price on each variation below.</small>}
              </label>
              <label className="admin-editor-label">Stock quantity
                <input className="admin-editor-input" type="number" min="0" value={draft.stock} onChange={(event) => updateDraft({ stock: Number(event.target.value) || 0 })} />
              </label>
            </div>
          </section>

          {draft.type === "Variable" && (
            <section className="admin-editor-card admin-variations-card">
              <div className="admin-card-heading">
                <div><p className="admin-eyebrow">Variable product</p><h2>Variations</h2><p className="admin-card-description">Choose the attributes this product needs, then add each purchasable combination.</p></div>
                <button className="admin-secondary" type="button" onClick={addVariation} disabled={(draft.variationAttributes ?? []).length === 0}>+ Add variation</button>
              </div>
              <div className="admin-variation-attributes">
                <strong>1. Choose attributes</strong>
                <div>
                  <label><input type="checkbox" checked={(draft.variationAttributes ?? []).includes("size")} onChange={() => toggleVariationAttribute("size")} /> Size</label>
                  <label><input type="checkbox" checked={(draft.variationAttributes ?? []).includes("colour")} onChange={() => toggleVariationAttribute("colour")} /> Colour</label>
                  {(draft.variationAttributes ?? []).filter((attribute) => attribute !== "size" && attribute !== "colour").map((attribute) => <label key={attribute}><input type="checkbox" checked onChange={() => toggleVariationAttribute(attribute)} /> {attribute}</label>)}
                </div>
                <div className="admin-custom-attribute-field">
                  <input value={customAttributeName} onChange={(event) => setCustomAttributeName(event.target.value)} placeholder="e.g. Material or Length" maxLength={60} />
                  <button className="admin-secondary" type="button" onClick={addCustomVariationAttribute}>+ Add custom attribute</button>
                </div>
              </div>
              {draft.variations.length === 0 ? (
                <div className="admin-empty-variations"><strong>2. Add combinations</strong><span>Add each combination with its own SKU, price, and stock.</span><button className="admin-primary" type="button" onClick={addVariation} disabled={(draft.variationAttributes ?? []).length === 0}>Add first variation</button></div>
              ) : (
                <div className="admin-variation-table">
                  <div className="admin-variation-table-head" style={{ gridTemplateColumns: `${(draft.variationAttributes ?? []).map(() => "minmax(110px, 1fr)").join(" ")} minmax(150px, 1.35fr) minmax(90px, .8fr) minmax(75px, .65fr) 28px` }}>
                    {(draft.variationAttributes ?? []).map((attribute) => <span key={attribute}>{attribute === "size" ? "Size" : attribute === "colour" ? "Colour" : attribute}</span>)}
                    <span>Variation SKU</span><span>Price *</span><span>Stock</span><span />
                  </div>
                  {draft.variations.map((variation) => (
                    <div className="admin-variation-row" key={variation.id} style={{ gridTemplateColumns: `${(draft.variationAttributes ?? []).map(() => "minmax(110px, 1fr)").join(" ")} minmax(150px, 1.35fr) minmax(90px, .8fr) minmax(75px, .65fr) 28px` }}>
                      {(draft.variationAttributes ?? []).map((attribute) => <input key={attribute} aria-label={`Variation ${attribute}`} value={attribute === "size" ? variation.size : attribute === "colour" ? variation.colour : variation.attributes?.[attribute] ?? ""} onChange={(event) => attribute === "size" || attribute === "colour" ? updateVariation(variation.id, { [attribute]: event.target.value }) : updateVariation(variation.id, { attributes: { ...variation.attributes, [attribute]: event.target.value } })} placeholder={attribute === "size" ? "UK 8" : attribute === "colour" ? "Blush" : `Enter ${attribute}`} />)}
                      <input aria-label="Variation SKU" value={variation.sku} onChange={(event) => updateVariation(variation.id, { sku: event.target.value })} placeholder="GM-001-8" />
                      <input aria-label="Variation price" type="number" min="0.01" step="0.01" value={variation.price} onChange={(event) => updateVariation(variation.id, { price: event.target.value })} inputMode="decimal" placeholder="89.99" required />
                      <input aria-label="Variation stock" type="number" min="0" value={variation.stock} onChange={(event) => updateVariation(variation.id, { stock: Number(event.target.value) || 0 })} />
                      <button className="admin-remove-button" type="button" onClick={() => removeVariation(variation.id)} aria-label={`Remove ${variation.size || "variation"}`}>×</button>
                    </div>
                  ))}
                </div>
              )}
              {draft.variations.length > 0 && <p className="admin-variation-summary">{draft.variations.length} variation{draft.variations.length === 1 ? "" : "s"} · {totalVariationStock} units in stock</p>}
            </section>
          )}

          <section className="admin-editor-card admin-media-card">
            <div className="admin-card-heading"><div className="admin-card-title"><span className="admin-card-icon"><ImageIcon aria-hidden="true" /></span><h2>Product media</h2></div></div>
            <div className="admin-media-workspace">
              <div className="admin-media-primary">
                <div className="admin-media-primary-frame">
                  {productImagePreview ? <img className="admin-product-image-preview" src={productImagePreview} alt={`${draft.name || "Product"} preview`} /> : <div className="admin-image-placeholder"><ImageIcon aria-hidden="true" /><strong>Add a primary product image</strong><span>PNG, JPG or WEBP · max 4MB</span></div>}
                  <button type="button" className="admin-media-edit-button" aria-label="Change primary product image" onClick={() => setPrimaryMediaLibraryOpen(true)}><ImageIcon aria-hidden="true" /></button>
                  <MediaLibrary
                    isOpen={primaryMediaLibraryOpen}
                    onClose={() => setPrimaryMediaLibraryOpen(false)}
                    availableImages={availableImages}
                    onSelect={(images) => {
                      if (images[0]) {
                        setProductImageFileName("");
                        updateDraft({ image: images[0] });
                      }
                    }}
                    onUpload={handleProductImageUpload}
                  />
                </div>
                <label className="admin-media-url-field">Primary image URL<input className="admin-editor-input" value={draft.image.startsWith("data:") || isCatalogMediaReference(draft.image) ? "" : draft.image} onChange={(event) => { setProductImageFileName(""); updateDraft({ image: event.target.value }); }} placeholder="Paste image URL" /></label>
              </div>
              <div className="admin-media-gallery">
                <div className="admin-gallery-heading">
                  <strong>Gallery images</strong>
                  <small>Add supporting views for the product page. The primary image stays first.</small>
                </div>
                <div className="admin-product-gallery-strip" aria-label="Gallery image order">
                  {(draft.galleryImages ?? []).map((image, index) => (
                      <div className="admin-product-gallery-item" key={`${image}-${index}`}>
                        {getCatalogMediaSource(image) ? <img src={getCatalogMediaSource(image)} alt={`${draft.name || "Product"} gallery view ${index + 1}`} /> : <div className="admin-image-placeholder">Loading image…</div>}
                        <div className="admin-product-gallery-item-actions">
                          <button type="button" onClick={() => moveGalleryImage(index, -1)} disabled={index === 0} aria-label={`Move gallery image ${index + 1} left`}>←</button>
                          <button type="button" onClick={() => moveGalleryImage(index, 1)} disabled={index === (draft.galleryImages ?? []).length - 1} aria-label={`Move gallery image ${index + 1} right`}>→</button>
                          <button className="admin-remove-button" type="button" onClick={() => removeGalleryImage(index)} aria-label={`Remove gallery image ${index + 1}`}>×</button>
                        </div>
                      </div>
                  ))}
                  <button type="button" className="admin-gallery-upload-tile" onClick={() => setGalleryMediaLibraryOpen(true)}><span aria-hidden="true">+</span><strong>Select</strong></button>
                  <MediaLibrary
                    isOpen={galleryMediaLibraryOpen}
                    onClose={() => setGalleryMediaLibraryOpen(false)}
                    availableImages={availableImages}
                    multiple
                    onSelect={(images) => {
                      addGalleryImages(images, images.map(() => ""));
                    }}
                    onUpload={handleGalleryImageUpload}
                  />
                </div>
                <div className="admin-gallery-add">
                  <input className="admin-editor-input" value={galleryImageUrl} onChange={(event) => setGalleryImageUrl(event.target.value)} placeholder="Or paste a gallery image URL" aria-label="Gallery image URL" />
                  <button className="admin-secondary" type="button" onClick={() => addGalleryImage(galleryImageUrl)} disabled={!galleryImageUrl.trim()}>Add</button>
                </div>
              </div>
            </div>
          </section>
          <AdminPromotionalPreview
            moments={promotionalProducts.some(item => item.id === product?.id)
              ? promotionalProducts.map(item => item.id === product?.id ? { ...draft, id: item.id } : item)
              : [{ ...draft, id: product?.id ?? -1 }, ...promotionalProducts].slice(0, 4)}
            note={promotionalProducts.some(item => item.id === product?.id)
              ? "Your unsaved primary image and copy are shown in this product’s current homepage position."
              : "This product is not currently featured. Shown as an example in the first moment slot; this does not add it to the homepage."}
          />
        </div>

        <aside className="admin-editor-sidebar">
          <section className="admin-publish-card">
            <div className="admin-card-heading"><div className="admin-card-title"><span className="admin-card-icon"><Package aria-hidden="true" /></span><h2>Product status</h2></div></div>
            <label className="admin-editor-label">Status
              <select className="admin-editor-input" value={draft.status} onChange={(event) => updateDraft({ status: event.target.value as ProductStatus })}>
                <option value="Draft">Draft</option>
                <option value="Published">Published</option>
              </select>
            </label>
            <div className="admin-status-summary">
              <div><span>Visibility</span><strong>{draft.status === "Published" ? "Visible" : "Hidden"}</strong></div>
              <div><span>Publish</span><strong>{draft.status === "Published" ? "Published" : "Publish manually"}</strong></div>
            </div>
            <p className="admin-publish-help">{draft.status === "Published" ? "This product is visible on your storefront." : "This product stays hidden until you publish it."}</p>
          </section>

          <section className="admin-editor-card admin-sidebar-card">
            <div className="admin-card-heading"><div className="admin-card-title"><span className="admin-card-icon"><FolderOpen aria-hidden="true" /></span><h2>Organization</h2></div></div>
            <label className="admin-editor-label">Category
              <select className="admin-editor-input" value={draft.category} onChange={(event) => updateDraft({ category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select>
            </label>
          </section>

           <section className="admin-editor-card admin-sidebar-card admin-legacy-media-card">
             <p className="admin-eyebrow">Product media</p>
             {productImagePreview ? <img className="admin-product-image-preview" src={productImagePreview} alt={`${draft.name || "Product"} preview`} /> : <div className="admin-image-placeholder">Add an image URL or upload an image to preview your product.</div>}
             <label className="admin-editor-label">Image URL
               <input className="admin-editor-input" value={draft.image.startsWith("data:") || isCatalogMediaReference(draft.image) ? "" : draft.image} onChange={(event) => { setProductImageFileName(""); updateDraft({ image: event.target.value }); }} placeholder="https://..." />
             </label>
             <div className="admin-image-upload">
               <button type="button" className="admin-upload-button" onClick={() => setPrimaryMediaLibraryOpen(true)}>Select image</button>
               <span>{productImageFileName || "PNG, JPG, WEBP or GIF · max 4MB"}</span>
             </div>
              <div className="admin-gallery-divider" />
              <div className="admin-gallery-heading">
                <p className="admin-eyebrow">Gallery images</p>
                <small>Add supporting views for the product page. The primary image stays first.</small>
              </div>
              <div className="admin-gallery-add">
                <input className="admin-editor-input" value={galleryImageUrl} onChange={(event) => setGalleryImageUrl(event.target.value)} placeholder="https://... gallery image URL" aria-label="Gallery image URL" />
                <button className="admin-secondary" type="button" onClick={() => addGalleryImage(galleryImageUrl)} disabled={!galleryImageUrl.trim()}>Add image</button>
              </div>
              <div className="admin-image-upload">
                <button type="button" className="admin-upload-button" onClick={() => setGalleryMediaLibraryOpen(true)}>Select gallery images</button>
                <span>{galleryImageFileNames.filter(Boolean).join(", ") || "Select one or more · max 4MB each"}</span>
              </div>
              {(draft.galleryImages ?? []).length > 0 ? (
                <div className="admin-product-gallery-list" aria-label="Gallery image order">
                  {(draft.galleryImages ?? []).map((image, index) => (
                    <div className="admin-product-gallery-item" key={`${image}-${index}`}>
                      {getCatalogMediaSource(image) ? <img src={getCatalogMediaSource(image)} alt={`${draft.name || "Product"} gallery view ${index + 1}`} /> : <div className="admin-image-placeholder">Loading gallery image…</div>}
                      <div className="admin-product-gallery-item-actions">
                        <span>View {index + 2}</span>
                        <button type="button" onClick={() => moveGalleryImage(index, -1)} disabled={index === 0} aria-label={`Move gallery image ${index + 1} earlier`}>↑</button>
                        <button type="button" onClick={() => moveGalleryImage(index, 1)} disabled={index === (draft.galleryImages ?? []).length - 1} aria-label={`Move gallery image ${index + 1} later`}>↓</button>
                        <button className="admin-remove-button" type="button" onClick={() => removeGalleryImage(index)} aria-label={`Remove gallery image ${index + 1}`}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="admin-gallery-empty">No additional gallery images yet.</p>}
           </section>

          <section className="admin-editor-card admin-sidebar-card">
            <div className="admin-card-heading admin-checklist-heading">
              <div className="admin-card-title"><span className="admin-card-icon"><ListChecks aria-hidden="true" /></span><h2>Product checklist</h2></div>
              <span>{completedChecklistItems} of {checklistItems.length} complete</span>
            </div>
            <ul className="admin-checklist">
              {checklistItems.map((item) => <li className={item.complete ? "is-complete" : ""} key={item.label}>{item.label}</li>)}
            </ul>
            <div className="admin-checklist-progress" aria-hidden="true"><span style={{ width: `${(completedChecklistItems / checklistItems.length) * 100}%` }} /></div>
          </section>
        </aside>
      </div>
    </form>
  );
}

export default function AdminDashboard({
  onSignOut,
}: {
  onSignOut: () => void;
}) {
  const hadLegacyCatalogRef = useRef<boolean>((() => {
    try {
      return Boolean(
        window.localStorage.getItem(productsStorageKey)
        || window.localStorage.getItem(legacyProductsStorageKey)
        || window.localStorage.getItem(categoriesStorageKey),
      );
    } catch {
      return false;
    }
  })());
  const [section, setSection] = useState<AdminSection>(() => new URLSearchParams(window.location.search).has("gmail") ? "payments" : "overview");
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [products, setProducts, commitProducts] = useStoredState<Product[]>(productsStorageKey, getStoredProducts());
  const [categories, setCategories, commitCategories] = useStoredState<Category[]>(categoriesStorageKey, getStoredCategories());
  const [homePageSettings, setHomePageSettings] = useState<HomePageSettings | null>(null);
  const previewSettings = homePageSettings ?? defaultHomePageSettings(categories, products);
  const promotionalCategories = previewSettings.categoryIds.flatMap(id => categories.filter(category => category.id === id));
  const promotionalProducts = previewSettings.momentIds.flatMap(id => products.filter(product => product.id === id && product.status === "Published"));
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [resolvingPaymentOrderId, setResolvingPaymentOrderId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [stripeStatus, setStripeStatus] = useState<StripeStatus>({ connected: false, configured: false, mode: "unknown", paymentMethods: [] });
  const [stripeStatusLoading, setStripeStatusLoading] = useState(true);
  const [stripeCredentials, setStripeCredentials] = useState({ publishableKey: "", secretKey: "", webhookSecret: "" });
  const [stripeCredentialsSaving, setStripeCredentialsSaving] = useState(false);
  const [stripeCredentialsError, setStripeCredentialsError] = useState("");
  const [stripeCredentialsNotice, setStripeCredentialsNotice] = useState("");
  const [coupons, setCoupons] = useState<CouponRecord[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [couponsError, setCouponsError] = useState("");
  const [contactEnquiries, setContactEnquiries] = useState<ContactEnquiry[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [couponEditorOpen, setCouponEditorOpen] = useState(false);
  const [editingCouponId, setEditingCouponId] = useState<number | null>(null);
  const [couponDraft, setCouponDraft] = useState<CouponDraft>(blankCoupon);
  const [couponSaving, setCouponSaving] = useState(false);
  const [deletingCouponId, setDeletingCouponId] = useState<number | null>(null);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingSaving, setShippingSaving] = useState(false);
  const [shippingError, setShippingError] = useState("");
  const [shippingDraft, setShippingDraft] = useState<ShippingDraft>(blankShipping);
  const [editingShippingId, setEditingShippingId] = useState<string | null>(null);
  const [deletingShippingId, setDeletingShippingId] = useState<string | null>(null);
  const [deliveryInformation, setDeliveryInformation] = useState<DeliveryInformationRow[]>([]);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const [deliveryContentTab, setDeliveryContentTab] = useState<"delivery" | "return">("delivery");
  const [returnInformation, setReturnInformation] = useState("");
  const [returnLoading, setReturnLoading] = useState(false);
  const [returnSaving, setReturnSaving] = useState(false);
  const [returnError, setReturnError] = useState("");
  const [sizeGuide, setSizeGuide] = useState<SizeGuideRow[]>([]);
  const [sizeGuideLoading, setSizeGuideLoading] = useState(false);
  const [sizeGuideSaving, setSizeGuideSaving] = useState(false);
  const [sizeGuideError, setSizeGuideError] = useState("");
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserDraft, setEditUserDraft] = useState<EditUserDraft>({ firstName: "", lastName: "", email: "" });
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUserError, setNewUserError] = useState("");
  const [newUserDraft, setNewUserDraft] = useState<NewUserDraft>({ firstName: "", lastName: "", email: "", password: "", role: "customer" });
  const [editorProductId, setEditorProductId] = useState<number | "new" | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(blankCategory);
  const [categoryImageFileName, setCategoryImageFileName] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryMediaLibraryOpen, setCategoryMediaLibraryOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [, setCatalogMediaVersion] = useState(0);
  const parentCategoryIds = new Set(categories.map((category) => category.parentId).filter((id): id is number => typeof id === "number"));
  const categoryNames = categories.filter((category) => !parentCategoryIds.has(category.id)).map((category) => category.name);

  useEffect(() => {
    function handleStorageError(event: Event) {
      const storageKey = (event as CustomEvent<{ key?: string }>).detail?.key;
      if (storageKey === productsStorageKey) {
        setNotice("This product was not saved because browser storage is full. Your product details are still open. Free some browser storage or use smaller images, then try again.");
      }
    }
    window.addEventListener("glam-storage-error", handleStorageError);
    return () => window.removeEventListener("glam-storage-error", handleStorageError);
  }, []);

  useEffect(() => {
    let active = true;
    void hydrateCatalogProductMedia(products).then(() => {
      if (active) setCatalogMediaVersion((version) => version + 1);
    });
    return () => {
      active = false;
    };
  }, [products]);

  useEffect(() => {
    if (editorProductId === null) return;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, [editorProductId]);

  useEffect(() => {
    let active = true;
    const locallySavedProducts = window.localStorage.getItem(productsStorageKey);
    const locallySavedLegacyProducts = window.localStorage.getItem(legacyProductsStorageKey);
    const locallySavedCategories = window.localStorage.getItem(categoriesStorageKey);
    const hasLocalCatalog = hadLegacyCatalogRef.current;

    async function loadSharedCatalog() {
      try {
        await hydrateCatalogProductMedia(getStoredProducts());
        const response = await fetch("/api/admin/catalog", { credentials: "include" });
        const catalog = await response.json() as { products?: Product[]; categories?: Category[]; homePage?: HomePageSettings | null; initialized?: boolean; error?: string };
        if (!response.ok || !Array.isArray(catalog.products) || !Array.isArray(catalog.categories)) {
          throw new Error(catalog.error || "The shared catalog could not be loaded.");
        }
        let nextCatalog = catalog;
        if (!catalog.initialized && !window.localStorage.getItem(catalogMigrationStorageKey) && hasLocalCatalog) {
          nextCatalog = await publishCatalog(
            locallySavedProducts || locallySavedLegacyProducts ? getStoredProducts() : [],
            locallySavedCategories ? getStoredCategories() : [],
            "migrate",
          );
          window.localStorage.setItem(catalogMigrationStorageKey, "complete");
        } else if (!catalog.initialized) {
          nextCatalog = await publishCatalog(catalogProducts, initialCategories);
        }
        const legacyCategoryNames = new Set(["Occasion", "Co-Ords", "Denim", "Accessories"]);
        const needsCategoryHierarchyMigration = (nextCatalog.categories ?? []).some((category) =>
          legacyCategoryNames.has(category.name)
          || (category.name === "Dresses" && !category.parentId),
        );
        if (needsCategoryHierarchyMigration) {
          const categoryByProductId = new Map<number, string>([
            [101, "Dresses"],
            [102, "Jumpsuits"],
            [103, "Dresses"],
            [104, "Dresses"],
            [105, "Tops"],
            [106, "Jumpsuits"],
            [107, "Dresses"],
            [108, "Coats"],
          ]);
          const legacyCategoryMap = new Map<string, string>([
            ["Occasion", "Dresses"],
            ["Co-Ords", "Co-ords"],
            ["Denim", "Trousers"],
            ["Accessories", "Jewellery"],
          ]);
          const remappedProducts = (nextCatalog.products ?? []).map((product) => ({
            ...product,
            category: categoryByProductId.get(product.id) ?? legacyCategoryMap.get(product.category) ?? product.category,
          }));
          nextCatalog = await publishCatalog(remappedProducts, initialCategories);
        } else {
          const existingCategoryIds = new Set((nextCatalog.categories ?? []).map((category) => category.id));
          const missingCategories = initialCategories.filter((category) => !existingCategoryIds.has(category.id));
          if (missingCategories.length > 0) {
            nextCatalog = await publishCatalog(
              catalog.products ?? [],
              [...(catalog.categories ?? []), ...missingCategories],
            );
          }
        }
        if (!active) return;
        setHomePageSettings(catalog.homePage ?? null);
        const resolvedCatalog = resolveBuiltInCatalogAssets(
          nextCatalog.products ?? [],
          nextCatalog.categories ?? [],
        );
        await hydrateCatalogProductMedia(resolvedCatalog.products);
        commitProducts(resolvedCatalog.products);
        commitCategories(resolvedCatalog.categories);
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : "The shared catalog could not be loaded.");
      }
    }
    void loadSharedCatalog();
    return () => {
      active = false;
    };
  // The first successful request establishes the shared catalog and migrates legacy browser records once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/inventory")
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load inventory");
        return response.json() as Promise<{ inventory?: Record<string, unknown> }>;
      })
      .then(({ inventory }) => {
        if (!active || !inventory) return;
        setProducts((current) => current.map((product) => {
          if (product.type === "Variable") {
            return {
              ...product,
              variations: product.variations.map((variation) => {
                const stock = inventory[`${product.id}:${variation.id}`];
                return typeof stock === "number" && Number.isInteger(stock) && stock >= 0
                  ? { ...variation, stock }
                  : variation;
              }),
            };
          }
          const stock = inventory[String(product.id)];
          return typeof stock === "number" && Number.isInteger(stock) && stock >= 0 ? { ...product, stock } : product;
        }));
      })
      .catch(() => {
        if (active) setNotice("Live inventory could not be loaded. Try refreshing before changing stock.");
      });
    return () => {
      active = false;
    };
  }, [setProducts]);

  const catalogImages = useMemo(() => {
    const images = new Set<string>();
    for (const p of products) {
      if (p.image && !p.image.startsWith("data:")) images.add(p.image);
      for (const img of p.galleryImages ?? []) {
        if (img && !img.startsWith("data:")) images.add(img);
      }
    }
    for (const c of categories) {
      if (c.image && !c.image.startsWith("data:")) images.add(c.image);
    }
    return Array.from(images);
  }, [products, categories]);

  const inventoryTotal = useMemo(
    () => products.reduce((total, product) => total + (product.type === "Variable" ? product.variations.reduce((sum, variation) => sum + variation.stock, 0) : product.stock), 0),
    [products],
  );
  const salesToday = orders.filter((order) => isOrderOnDate(order.placedAt, 0)).reduce((total, order) => total + parseOrderTotal(order.total), 0);
  const salesYesterday = orders.filter((order) => isOrderOnDate(order.placedAt, -1)).reduce((total, order) => total + parseOrderTotal(order.total), 0);
  const salesChange = salesYesterday > 0 ? ((salesToday - salesYesterday) / salesYesterday) * 100 : null;
  const salesChangeLabel = salesChange === null
    ? "No sales recorded yesterday"
    : `${salesChange >= 0 ? "+" : ""}${salesChange.toFixed(1)}% from yesterday`;
  const recentOrders = orders.filter((order) => isOrderWithinLastDays(order.placedAt, 30));
  const averageOrderValue = recentOrders.length > 0
    ? recentOrders.reduce((total, order) => total + order.amount, 0) / recentOrders.length / 100
    : 0;
  const averageOrderLabel = recentOrders.length > 0
    ? `Last 30 days · ${recentOrders.length} order${recentOrders.length === 1 ? "" : "s"}`
    : "No orders in the last 30 days";
  const selectedOrder = selectedOrderId ? orders.find((order) => order.id === selectedOrderId) ?? null : null;

  function openNewProduct() {
    setSection("products");
    setEditorProductId("new");
    setNotice("");
  }

  async function uploadCatalogImage(value: string, name: string) {
    const source = value.trim();
    if (!source || (!source.startsWith("data:image/") && !isCatalogMediaReference(source))) return source;
    const mediaSource = getCatalogMediaSource(source);
    if (!mediaSource) throw new Error("A previously uploaded image could not be recovered from this browser.");
    const imageResponse = await fetch(mediaSource);
    if (!imageResponse.ok) throw new Error("An image could not be read before publishing.");
    const blob = await imageResponse.blob();
    const response = await fetch("/api/storage/uploads/request-url", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, size: blob.size, contentType: blob.type || "image/jpeg" }),
    });
    const upload = await response.json() as { uploadURL?: string; objectPath?: string; error?: string };
    if (!response.ok || !upload.uploadURL || !upload.objectPath) throw new Error(upload.error || "An image upload URL could not be created.");
    const result = await fetch(upload.uploadURL, {
      method: "PUT",
      headers: { "Content-Type": blob.type || "image/jpeg" },
      body: blob,
    });
    if (!result.ok) throw new Error("An image could not be uploaded. Your product details are still open.");
    return upload.objectPath;
  }

  async function uploadCatalogMedia(nextProducts: Product[], nextCategories: Category[]) {
    const productsWithUploadedMedia = await Promise.all(nextProducts.map(async (product) => ({
      ...product,
      image: await uploadCatalogImage(product.image, `${product.slug || product.id}-primary`),
      galleryImages: await Promise.all((product.galleryImages ?? []).map((image, index) =>
        uploadCatalogImage(image, `${product.slug || product.id}-gallery-${index + 1}`),
      )),
    })));
    const categoriesWithUploadedMedia = await Promise.all(nextCategories.map(async (category) => ({
      ...category,
      image: await uploadCatalogImage(category.image, `${category.name || category.id}-category`),
    })));
    return { products: productsWithUploadedMedia, categories: categoriesWithUploadedMedia };
  }

  async function publishCatalog(nextProducts: Product[], nextCategories: Category[], mode: "save" | "migrate" = "save", stockUpdates: string[] = []) {
    const catalogWithUploadedMedia = await uploadCatalogMedia(nextProducts, nextCategories);
    // Redirect history belongs to the server, never to a locally cached catalog.
    const requestCatalog: AdminCatalogSaveInput = {
      stockUpdates,
      products: catalogWithUploadedMedia.products.map(({ slugHistory: _history, ...product }) => product),
      categories: catalogWithUploadedMedia.categories.map(({ slugHistory: _history, ...category }) => category),
    };
    const response = await fetch(`/api/admin/catalog${mode === "migrate" ? "/migrate" : ""}`, {
      method: mode === "migrate" ? "POST" : "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestCatalog),
    });
    const catalog = await response.json() as { products?: Product[]; categories?: Category[]; error?: string };
    if (!response.ok || !Array.isArray(catalog.products) || !Array.isArray(catalog.categories)) {
      throw new Error(catalog.error || "The shared catalog could not be saved.");
    }
    window.dispatchEvent(new Event("glam-catalog-updated"));
    return catalog;
  }

  async function saveProduct(draft: ProductDraft) {
    const slug = createProductSlug(draft.slug || draft.name);
    const savedDraft = { ...draft, slug };
    const product: Product | null = editorProductId === "new"
      ? { id: Date.now(), ...savedDraft }
      : typeof editorProductId === "number"
        ? { id: editorProductId, ...savedDraft }
        : null;
    if (!product) return false;

    try {
      const nextProducts = editorProductId === "new"
        ? [product, ...products]
        : products.map((currentProduct) => currentProduct.id === product.id ? product : currentProduct);
      const previous = products.find((item) => item.id === product.id);
      const stockUpdates = product.type === "Variable"
        ? product.variations.filter((item) => previous?.variations.find((old) => old.id === item.id)?.stock !== item.stock).map((item) => `${product.id}:${item.id}`)
        : previous?.stock !== product.stock ? [String(product.id)] : [];
      const catalog = await publishCatalog(nextProducts, categories, "save", stockUpdates);
      const savedProduct = catalog.products!.find((currentProduct) => currentProduct.id === product.id);
      if (!savedProduct) throw new Error("The server did not return the saved product. Refresh the catalog before editing again.");
      commitProducts(catalog.products!);
      commitCategories(catalog.categories!);

      setNotice(`${product.name} was ${product.status === "Published"
        ? editorProductId === "new" ? "published" : "updated and published"
        : editorProductId === "new" ? "saved as a draft" : "moved to draft"}.`);
      // Publishing now commits catalog and sellable inventory together.
      setEditorProductId(null);
      setSection("products");
      return true;
    } catch (error) {
      setNotice(error instanceof Error
        ? error.message
        : "This product could not be saved. Your product details are still open; please try again.");
      return false;
    }
  }

  async function removeProduct(product: Product) {
    try {
      const catalog = await publishCatalog(products.filter((item) => item.id !== product.id), categories);
      commitProducts(catalog.products!);
      commitCategories(catalog.categories!);
      setNotice(`${product.name} was removed from the catalog.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "This product could not be removed.");
    }
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = categoryDraft.name.trim();
    const description = categoryDraft.description.trim();
    const slug = createProductSlug(categoryDraft.slug || name);
    if (!name) return;
    if (categories.some((category) => category.name.toLowerCase() === name.toLowerCase() && category.id !== editingCategoryId)) {
      setNotice(`${name} already exists.`);
      return;
    }
    setCategorySaving(true);
    try {
      const previousName = categories.find((category) => category.id === editingCategoryId)?.name;
      const nextProducts = previousName && previousName !== name
        ? products.map((product) => createProductSlug(product.category) === createProductSlug(previousName)
          ? { ...product, category: name }
          : product)
        : products;
      const nextCategories = editingCategoryId !== null
        ? categories.map((category) => category.id === editingCategoryId ? { ...category, name, slug, image: categoryDraft.image.trim(), description, parentId: categoryDraft.parentId ?? null } : category)
        : [...categories, { id: Date.now(), name, slug, image: categoryDraft.image.trim(), description, parentId: categoryDraft.parentId ?? null }];
      const catalog = await publishCatalog(nextProducts, nextCategories);
      if (!catalog.categories!.some((category) => category.id === (editingCategoryId ?? nextCategories[nextCategories.length - 1].id))) {
        throw new Error("The server did not return the saved category. Refresh the catalog before editing again.");
      }
      commitProducts(catalog.products!);
      commitCategories(catalog.categories!);
      setNotice(`${name} category ${editingCategoryId !== null ? "updated" : "created"}.`);
      setCategoryDraft(blankCategory());
      setEditingCategoryId(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "This category could not be saved.");
    } finally {
      setCategorySaving(false);
    }
  }

  function editCategory(category: Category) {
    setEditingCategoryId(category.id);
    setCategoryDraft({ name: category.name, slug: getCategorySlug(category), image: category.image, description: category.description, parentId: category.parentId ?? null });
    setCategoryImageFileName("");
    setNotice("");
    setSection("categories");
  }

  async function deleteCategory(category: Category) {
    if (categories.some((item) => item.parentId === category.id)) {
      setNotice(`Move or delete the subcategories inside ${category.name} before deleting it.`);
      return;
    }
    try {
      const catalog = await publishCatalog(products, categories.filter((item) => item.id !== category.id));
      commitProducts(catalog.products!);
      commitCategories(catalog.categories!);
      if (editingCategoryId === category.id) {
        setEditingCategoryId(null);
        setCategoryDraft(blankCategory());
        setCategoryImageFileName("");
      }
      setNotice(`${category.name} category deleted.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "This category could not be deleted.");
    }
  }

  function cancelCategoryEdit() {
    setEditingCategoryId(null);
    setCategoryDraft(blankCategory());
    setCategoryImageFileName("");
    setNotice("");
  }

  function handleCategoryImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("Please choose an image file.");
      event.target.value = "";
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setNotice("Please choose an image smaller than 4MB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCategoryDraft((current) => ({ ...current, image: reader.result as string }));
        setCategoryImageFileName(file.name);
        setNotice("");
      }
    };
    reader.readAsDataURL(file);
  }

  async function refreshOrders() {
    setOrdersLoading(true);
    setOrdersError("");
    try {
      const response = await fetch("/api/admin/orders", { credentials: "include" });
      const payload = await response.json() as { orders?: OrderPayload[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Orders could not be loaded.");
      setOrders((payload.orders ?? []).map(toAdminOrder));
    } catch (error) {
      setOrdersError(error instanceof Error ? error.message : "Orders could not be loaded.");
    } finally {
      setOrdersLoading(false);
    }
  }

  async function updateOrderStatus(order: Order, status: Order["status"]) {
    setUpdatingOrderId(order.id);
    setOrdersError("");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.stripeSessionId)}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json() as { order?: OrderPayload; error?: string };
      if (!response.ok || !payload.order) throw new Error(payload.error || "Order status could not be updated.");
      const updatedOrder = toAdminOrder(payload.order);
      setOrders((current) => current.map((item) => item.id === order.id ? updatedOrder : item));
      setNotice(`${order.id} is now marked ${status.toLowerCase()}.`);
    } catch (error) {
      setOrdersError(error instanceof Error ? error.message : "Order status could not be updated.");
    } finally {
      setUpdatingOrderId(null);
    }
  }

  async function resolveOrderPayment(order: Order, action: "retry_refund" | "mark_manual_resolution") {
    setResolvingPaymentOrderId(order.id);
    setOrdersError("");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.stripeSessionId)}/payment-resolution`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json() as { order?: OrderPayload; error?: string };
      if (!response.ok || !payload.order) throw new Error(payload.error || "The payment resolution could not be updated.");
      const updatedOrder = toAdminOrder(payload.order);
      setOrders((current) => current.map((item) => item.id === order.id ? updatedOrder : item));
      setNotice(action === "retry_refund"
        ? updatedOrder.paymentResolution === "refunded"
          ? `${order.id} refund was sent to Stripe.`
          : `${order.id} still needs a refund. Check Stripe and try again shortly.`
        : `${order.id} has been recorded for manual payment resolution.`);
    } catch (error) {
      setOrdersError(error instanceof Error ? error.message : "The payment resolution could not be updated.");
    } finally {
      setResolvingPaymentOrderId(null);
    }
  }

  async function refreshStripeStatus() {
    setStripeStatusLoading(true);
    try {
      const response = await fetch("/api/stripe/status", { credentials: "include" });
      const status = await response.json() as StripeStatus;
      setStripeStatus(status);
    } catch {
      setStripeStatus({ connected: false, configured: false, mode: "unknown", paymentMethods: [], error: "Unable to reach Stripe settings." });
    } finally {
      setStripeStatusLoading(false);
    }
  }

  async function saveStripeCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStripeCredentialsSaving(true);
    setStripeCredentialsError("");
    setStripeCredentialsNotice("");
    try {
      const response = await fetch("/api/stripe/credentials", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stripeCredentials),
      });
      const payload = await response.json() as StripeStatus;
      if (!response.ok) throw new Error(payload.error || "Stripe keys could not be saved.");
      setStripeStatus(payload);
      setStripeCredentials({ publishableKey: "", secretKey: "", webhookSecret: "" });
      setStripeCredentialsNotice("Stripe credentials were saved securely. Saved keys are never shown again.");
    } catch (error) {
      setStripeCredentialsError(error instanceof Error ? error.message : "Stripe keys could not be saved.");
    } finally {
      setStripeCredentialsSaving(false);
    }
  }

  async function clearStripeCredentials() {
    if (!window.confirm("Remove the Stripe keys saved from this admin panel? Card checkout will stop until you save new keys.")) return;
    setStripeCredentialsSaving(true);
    setStripeCredentialsError("");
    setStripeCredentialsNotice("");
    try {
      const response = await fetch("/api/stripe/credentials", { method: "DELETE", credentials: "include" });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error || "Saved Stripe keys could not be cleared.");
      }
      setStripeCredentials({ publishableKey: "", secretKey: "", webhookSecret: "" });
      setStripeCredentialsNotice("Saved Stripe credentials were removed.");
      await refreshStripeStatus();
    } catch (error) {
      setStripeCredentialsError(error instanceof Error ? error.message : "Saved Stripe keys could not be cleared.");
    } finally {
      setStripeCredentialsSaving(false);
    }
  }

  async function refreshUsers() {
    setUsersLoading(true);
    setUsersError("");
    try {
      const response = await fetch("/api/admin/users", { credentials: "include" });
      const payload = await response.json() as { users?: ManagedUser[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "User accounts could not be loaded.");
      setManagedUsers(payload.users ?? []);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "User accounts could not be loaded.");
    } finally {
      setUsersLoading(false);
    }
  }

  async function refreshMessages() {
    setMessagesLoading(true);
    setMessagesError("");
    try {
      const response = await fetch("/api/admin/contact-enquiries", { credentials: "include" });
      const payload = await response.json() as { enquiries?: ContactEnquiry[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Customer messages could not be loaded.");
      setContactEnquiries(payload.enquiries ?? []);
    } catch (error) {
      setMessagesError(error instanceof Error ? error.message : "Customer messages could not be loaded.");
    } finally {
      setMessagesLoading(false);
    }
  }

  async function refreshCoupons() {
    setCouponsLoading(true);
    setCouponsError("");
    try {
      const response = await fetch("/api/admin/coupons", { credentials: "include" });
      const payload = await response.json() as { coupons?: CouponRecord[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Coupons could not be loaded.");
      setCoupons(payload.coupons ?? []);
    } catch (error) {
      setCouponsError(error instanceof Error ? error.message : "Coupons could not be loaded.");
    } finally {
      setCouponsLoading(false);
    }
  }

  async function refreshShipping() {
    setShippingLoading(true);
    setShippingError("");
    try {
      const response = await fetch("/api/admin/shipping-methods", { credentials: "include" });
      const payload = await response.json() as { shippingMethods?: ShippingMethod[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Shipping methods could not be loaded.");
      setShippingMethods(payload.shippingMethods ?? []);
    } catch (error) {
      setShippingError(error instanceof Error ? error.message : "Shipping methods could not be loaded.");
    } finally { setShippingLoading(false); }
  }

  function editShipping(method: ShippingMethod) {
    setEditingShippingId(method.id);
    setShippingDraft({ name: method.name, description: method.description, price: String(method.price / 100), freeOver: method.freeOver === null ? "" : String(method.freeOver / 100), enabled: method.enabled });
    setShippingError("");
  }

  async function saveShipping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = Number(shippingDraft.price);
    const freeOver = shippingDraft.freeOver.trim() ? Number(shippingDraft.freeOver) : null;
    if (!shippingDraft.name.trim() || !Number.isFinite(price) || price < 0 || (freeOver !== null && (!Number.isFinite(freeOver) || freeOver < 0))) {
      setShippingError("Enter a name and valid non-negative GBP amounts.");
      return;
    }
    setShippingSaving(true);
    setShippingError("");
    try {
      const response = await fetch(editingShippingId ? `/api/admin/shipping-methods/${editingShippingId}` : "/api/admin/shipping-methods", {
        method: editingShippingId ? "PATCH" : "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: shippingDraft.name, description: shippingDraft.description, price, freeOver, enabled: shippingDraft.enabled, sortOrder: editingShippingId ? shippingMethods.find((item) => item.id === editingShippingId)?.sortOrder ?? 0 : shippingMethods.length }),
      });
      const result = await response.json() as { shippingMethod?: ShippingMethod; error?: string };
      if (!response.ok || !result.shippingMethod) throw new Error(result.error || "Shipping method could not be saved.");
      setShippingMethods((current) => editingShippingId ? current.map((item) => item.id === result.shippingMethod!.id ? result.shippingMethod! : item) : [...current, result.shippingMethod!]);
      setShippingDraft(blankShipping);
      setEditingShippingId(null);
      setNotice(`${result.shippingMethod.name} was ${editingShippingId ? "updated" : "created"}.`);
    } catch (error) { setShippingError(error instanceof Error ? error.message : "Shipping method could not be saved."); }
    finally { setShippingSaving(false); }
  }

  async function updateShipping(method: ShippingMethod, updates: Partial<ShippingDraft> & { sortOrder?: number }) {
    setShippingError("");
    try {
      const payload = { ...updates, ...(updates.price !== undefined ? { price: Number(updates.price) } : {}), ...(updates.freeOver !== undefined ? { freeOver: updates.freeOver.trim() ? Number(updates.freeOver) : null } : {}) };
      const response = await fetch(`/api/admin/shipping-methods/${method.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { shippingMethod?: ShippingMethod; error?: string };
      if (!response.ok || !result.shippingMethod) throw new Error(result.error || "Shipping method could not be updated.");
      setShippingMethods((current) => current.map((item) => item.id === method.id ? result.shippingMethod! : item));
    } catch (error) { setShippingError(error instanceof Error ? error.message : "Shipping method could not be updated."); }
  }

  async function deleteShipping(method: ShippingMethod) {
    if (!window.confirm(`Delete ${method.name}?`)) return;
    setDeletingShippingId(method.id);
    try {
      const response = await fetch(`/api/admin/shipping-methods/${method.id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) { const result = await response.json() as { error?: string }; throw new Error(result.error || "Shipping method could not be deleted."); }
      setShippingMethods((current) => current.filter((item) => item.id !== method.id));
      setNotice(`${method.name} was deleted.`);
    } catch (error) { setShippingError(error instanceof Error ? error.message : "Shipping method could not be deleted."); }
    finally { setDeletingShippingId(null); }
  }

  async function moveShipping(method: ShippingMethod, direction: -1 | 1) {
    const index = shippingMethods.findIndex((item) => item.id === method.id);
    const other = shippingMethods[index + direction];
    if (!other) return;
    await Promise.all([updateShipping(method, { sortOrder: other.sortOrder }), updateShipping(other, { sortOrder: method.sortOrder })]);
    setShippingMethods((current) => { const next = [...current]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next; });
  }

  async function refreshDeliveryInformation() {
    setDeliveryLoading(true);
    setDeliveryError("");
    try {
      const response = await fetch("/api/admin/delivery-information", { credentials: "include" });
      const payload = await response.json() as {
        deliveryInformation?: Array<Omit<DeliveryInformationRow, "cost"> & { cost: number }>;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Delivery information could not be loaded.");
      setDeliveryInformation((payload.deliveryInformation ?? []).map((row) => ({
        ...row,
        cost: (row.cost / 100).toFixed(2),
      })));
    } catch (error) {
      setDeliveryError(error instanceof Error ? error.message : "Delivery information could not be loaded.");
    } finally {
      setDeliveryLoading(false);
    }
  }

  async function refreshReturnInformation() {
    setReturnLoading(true);
    setReturnError("");
    try {
      const response = await fetch("/api/admin/return-information", { credentials: "include" });
      const payload = await response.json() as { content?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Return information could not be loaded.");
      setReturnInformation(payload.content ?? "");
    } catch (error) {
      setReturnError(error instanceof Error ? error.message : "Return information could not be loaded.");
    } finally {
      setReturnLoading(false);
    }
  }

  async function saveReturnInformation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReturnSaving(true);
    setReturnError("");
    try {
      const response = await fetch("/api/admin/return-information", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: returnInformation }),
      });
      const payload = await response.json() as { content?: string; error?: string };
      if (!response.ok || typeof payload.content !== "string") throw new Error(payload.error || "Return information could not be saved.");
      setReturnInformation(payload.content);
      setNotice("Product return information was saved.");
    } catch (error) {
      setReturnError(error instanceof Error ? error.message : "Return information could not be saved.");
    } finally {
      setReturnSaving(false);
    }
  }

  async function refreshSizeGuide() {
    setSizeGuideLoading(true);
    setSizeGuideError("");
    try {
      const response = await fetch("/api/admin/size-guide", { credentials: "include" });
      const payload = await response.json() as { sizeGuide?: SizeGuideRow[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Size guide could not be loaded.");
      setSizeGuide(payload.sizeGuide ?? []);
    } catch (error) {
      setSizeGuideError(error instanceof Error ? error.message : "Size guide could not be loaded.");
    } finally {
      setSizeGuideLoading(false);
    }
  }

  function updateSizeGuideRow(id: string, updates: Partial<SizeGuideRow>) {
    setSizeGuide((rows) => rows.map((row) => row.id === id ? { ...row, ...updates } : row));
  }

  function moveSizeGuideRow(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sizeGuide.length) return;
    setSizeGuide((rows) => {
      const next = [...rows];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  async function saveSizeGuide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sizeGuide.some((row) => !row.size.trim() || !row.ukSize.trim() || !row.bust.trim() || !row.waist.trim() || !row.hips.trim())) {
      setSizeGuideError("Every row needs a size, UK size, bust, waist, and hips value.");
      return;
    }
    setSizeGuideSaving(true);
    setSizeGuideError("");
    try {
      const response = await fetch("/api/admin/size-guide", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sizeGuide: sizeGuide.map((row) => ({
            ...row,
            id: row.id.startsWith("new-") ? undefined : row.id,
          })),
        }),
      });
      const payload = await response.json() as { sizeGuide?: SizeGuideRow[]; error?: string };
      if (!response.ok || !payload.sizeGuide) throw new Error(payload.error || "Size guide could not be saved.");
      setSizeGuide(payload.sizeGuide);
      setNotice("Product size guide was saved.");
    } catch (error) {
      setSizeGuideError(error instanceof Error ? error.message : "Size guide could not be saved.");
    } finally {
      setSizeGuideSaving(false);
    }
  }

  function openNewCoupon() {
    setCouponDraft(blankCoupon());
    setEditingCouponId(null);
    setCouponEditorOpen(true);
    setCouponsError("");
    setNotice("");
  }

  function editCoupon(coupon: CouponRecord) {
    setCouponDraft(couponDraftFromRecord(coupon));
    setEditingCouponId(coupon.id);
    setCouponEditorOpen(true);
    setCouponsError("");
    setNotice("");
  }

  function closeCouponEditor() {
    setCouponEditorOpen(false);
    setEditingCouponId(null);
    setCouponDraft(blankCoupon());
    setCouponsError("");
  }

  async function saveCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCouponSaving(true);
    setCouponsError("");
    const fixedAmount = Number(couponDraft.discountValue);
    const minimumSpend = couponDraft.minimumSpend.trim() ? Number(couponDraft.minimumSpend) : 0;
    const usageLimit = couponDraft.usageLimit.trim() ? Number(couponDraft.usageLimit) : null;
    const payload = {
      code: couponDraft.code,
      discountType: couponDraft.discountType,
      discountValue: couponDraft.discountType === "fixed" ? Math.round(fixedAmount * 100) : fixedAmount,
      startsAt: couponDraft.startsAt || null,
      endsAt: couponDraft.endsAt || null,
      minimumSpend: Math.round(minimumSpend * 100),
      usageLimit,
      active: couponDraft.active,
    };
    try {
      const isEditing = editingCouponId !== null;
      const response = await fetch(isEditing ? `/api/admin/coupons/${editingCouponId}` : "/api/admin/coupons", {
        method: isEditing ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { coupon?: CouponRecord; error?: string };
      if (!response.ok || !result.coupon) throw new Error(result.error || "Coupon could not be saved.");
      setCoupons((current) => isEditing
        ? current.map((coupon) => coupon.id === result.coupon!.id ? result.coupon! : coupon)
        : [result.coupon!, ...current]);
      setNotice(`${result.coupon.code} was ${isEditing ? "updated" : "created"}.`);
      closeCouponEditor();
    } catch (error) {
      setCouponsError(error instanceof Error ? error.message : "Coupon could not be saved.");
    } finally {
      setCouponSaving(false);
    }
  }

  async function toggleCoupon(coupon: CouponRecord) {
    setCouponsError("");
    try {
      const response = await fetch(`/api/admin/coupons/${coupon.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !coupon.active }),
      });
      const result = await response.json() as { coupon?: CouponRecord; error?: string };
      if (!response.ok || !result.coupon) throw new Error(result.error || "Coupon status could not be updated.");
      setCoupons((current) => current.map((item) => item.id === coupon.id ? result.coupon! : item));
      setNotice(`${coupon.code} is now ${result.coupon.active ? "active" : "inactive"}.`);
    } catch (error) {
      setCouponsError(error instanceof Error ? error.message : "Coupon status could not be updated.");
    }
  }

  async function deleteCoupon(coupon: CouponRecord) {
    if (!window.confirm(`Delete ${coupon.code}? This cannot be undone.`)) return;
    setDeletingCouponId(coupon.id);
    setCouponsError("");
    try {
      const response = await fetch(`/api/admin/coupons/${coupon.id}`, { method: "DELETE", credentials: "include" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Coupon could not be deleted.");
      setCoupons((current) => current.filter((item) => item.id !== coupon.id));
      setNotice(`${coupon.code} was deleted.`);
    } catch (error) {
      setCouponsError(error instanceof Error ? error.message : "Coupon could not be deleted.");
    } finally {
      setDeletingCouponId(null);
    }
  }

  async function updateUserAccess(user: ManagedUser, isAdmin: boolean) {
    if (!isAdmin && user.isBootstrapAdmin) return;
    const action = isAdmin ? "grant admin access to" : "remove admin access from";
    if (!window.confirm(`Are you sure you want to ${action} ${user.email}?`)) return;
    setUpdatingUserId(user.id);
    setUsersError("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}/access`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAdmin }),
      });
      const payload = await response.json() as { user?: ManagedUser; error?: string };
      if (!response.ok || !payload.user) throw new Error(payload.error || "Admin access could not be updated.");
      setManagedUsers((current) => current.map((item) => item.id === user.id ? payload.user as ManagedUser : item));
      setNotice(`${user.email} is now ${isAdmin ? "an administrator" : "a customer account"}.`);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "Admin access could not be updated.");
    } finally {
      setUpdatingUserId(null);
    }
  }

  function editUser(user: ManagedUser) {
    setEditingUserId(user.id);
    setEditUserDraft({ firstName: user.firstName, lastName: user.lastName, email: user.email });
    setUsersError("");
  }

  async function saveUser(event: FormEvent<HTMLFormElement>, user: ManagedUser) {
    event.preventDefault();
    setUpdatingUserId(user.id);
    setUsersError("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editUserDraft),
      });
      const payload = await response.json() as { user?: ManagedUser; error?: string };
      if (!response.ok || !payload.user) throw new Error(payload.error || "User details could not be updated.");
      setManagedUsers((current) => current.map((item) => item.id === user.id ? payload.user as ManagedUser : item));
      setEditingUserId(null);
      setNotice(`${payload.user.name} was updated.`);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "User details could not be updated.");
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingUser(true);
    setNewUserError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUserDraft),
      });
      const payload = await response.json() as { user?: ManagedUser; error?: string };
      if (!response.ok || !payload.user) throw new Error(payload.error || "User could not be created.");
      setManagedUsers((current) => [payload.user as ManagedUser, ...current]);
      setNewUserDraft({ firstName: "", lastName: "", email: "", password: "", role: "customer" });
      setCreateUserOpen(false);
      setNotice(`${payload.user.email} was created as a ${newUserDraft.role}.`);
    } catch (error) {
      setNewUserError(error instanceof Error ? error.message : "User could not be created.");
    } finally {
      setCreatingUser(false);
    }
  }

  async function deleteUser(user: ManagedUser) {
    if (user.isBootstrapAdmin) return;
    if (!window.confirm(`Delete ${user.email}? This permanently removes their account and cannot be undone.`)) return;
    setDeletingUserId(user.id);
    setUsersError("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE", credentials: "include" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "User could not be deleted.");
      setManagedUsers((current) => current.filter((item) => item.id !== user.id));
      setNotice(`${user.email} was deleted.`);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "User could not be deleted.");
    } finally {
      setDeletingUserId(null);
    }
  }

  useEffect(() => {
    void refreshOrders();
    void refreshStripeStatus();
  }, []);

  useEffect(() => {
    if (section === "orders") void refreshOrders();
    if (section === "users") void refreshUsers();
    if (section === "coupons") void refreshCoupons();
    if (section === "shipping") void refreshShipping();
    if (section === "delivery") {
      setDeliveryContentTab("delivery");
      void refreshDeliveryInformation();
      void refreshReturnInformation();
    }
    if (section === "size-guide") void refreshSizeGuide();
    if (section === "messages") void refreshMessages();
  }, [section]);

  useEffect(() => {
    if (section !== "messages") return;
    const timer = window.setInterval(() => void refreshMessages(), 30_000);
    return () => window.clearInterval(timer);
  }, [section]);

  const editorProduct = typeof editorProductId === "number" ? products.find((product) => product.id === editorProductId) : undefined;
  const visibleUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    return managedUsers.filter((user) => !query || user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query));
  }, [managedUsers, userSearch]);
  const adminUsers = visibleUsers.filter((user) => user.isAdmin);
  const customerUsers = visibleUsers.filter((user) => !user.isAdmin);

  return (
    <div className="admin-app">
      {adminMenuOpen && (
        <button
          className="admin-nav-overlay"
          type="button"
          aria-label="Close admin menu"
          onClick={() => setAdminMenuOpen(false)}
        />
      )}
      <aside className={`admin-sidebar${adminMenuOpen ? " is-menu-open" : ""}`}>
        <a className="admin-brand" href="/" aria-label="Return to Glam Too storefront">
          <span className="admin-brand-mark">
            <img src={logoImage} alt="Glam Too logo" />
          </span>
          <small>Commerce Studio</small>
        </a>
        <button
          className="admin-menu-toggle"
          type="button"
          aria-label={adminMenuOpen ? "Close admin menu" : "Open admin menu"}
          aria-expanded={adminMenuOpen}
          aria-controls="admin-navigation"
          onClick={() => setAdminMenuOpen((open) => !open)}
        >
          <span aria-hidden="true"><span /><span /><span /></span>
        </button>
        <nav id="admin-navigation" className="admin-nav" aria-label="Admin navigation">
            {navItems.map((item) => (
            <button type="button" key={item.id} className={section === item.id && editorProductId === null ? "is-active" : ""} onClick={() => { setSection(item.id); setEditorProductId(null); setSelectedOrderId(null); setAdminMenuOpen(false); }}>
              <span className="admin-nav-label"><item.icon className="admin-nav-icon" aria-hidden="true" /><span>{item.label}</span></span>
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <a href="/" className="admin-store-link">View storefront ↗</a>
          <button type="button" className="admin-signout" onClick={onSignOut}>Sign out</button>
        </div>
      </aside>

      <main className="admin-main">
        {notice && <div className="admin-notice" role="status"><span>{notice}</span><button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}

        {section === "overview" && (
          <div className="admin-overview">
            <div className="admin-overview-heading">
              <div>
                <p className="admin-eyebrow">Glam Too administration</p>
                <h1>Overview</h1>
                <p>Your storefront is looking beautiful. Here&apos;s what needs your attention today.</p>
              </div>
              <div className="admin-overview-heading-actions">
                <a className="admin-overview-outline-action" href="/">View storefront <ArrowUpRight aria-hidden="true" /></a>
                <button className="admin-primary" type="button" onClick={openNewProduct}>Add a product</button>
              </div>
            </div>
            <div className="admin-overview-stat-grid">
              <article className="admin-overview-stat-card">
                <span className="admin-overview-stat-icon"><CircleDollarSign aria-hidden="true" /></span>
                <div><p>Sales today</p><strong>{formatPounds(salesToday)}</strong><span>{salesChangeLabel}</span></div>
              </article>
              <article className="admin-overview-stat-card">
                <span className="admin-overview-stat-icon"><ListChecks aria-hidden="true" /></span>
                <div><p>Open orders</p><strong>{orders.filter((order) => order.status !== "Delivered").length}</strong><span>Ready for fulfilment</span></div>
              </article>
              <article className="admin-overview-stat-card">
                <span className="admin-overview-stat-icon"><Package aria-hidden="true" /></span>
                <div><p>Products in stock</p><strong>{inventoryTotal}</strong><span>Across {products.length} styles</span></div>
              </article>
              <article className="admin-overview-stat-card">
                <span className="admin-overview-stat-icon"><ShoppingBag aria-hidden="true" /></span>
                <div><p>Average order</p><strong>{formatPounds(averageOrderValue)}</strong><span>{averageOrderLabel}</span></div>
              </article>
            </div>
            <div className="admin-overview-content-grid">
              <section className="admin-overview-orders">
                <div className="admin-overview-panel-heading">
                  <div><p className="admin-eyebrow">Fulfilment</p><h2>Recent orders</h2></div>
                  <button type="button" onClick={() => setSection("orders")}>View all orders <ArrowUpRight aria-hidden="true" /></button>
                </div>
                {ordersError && <p className="admin-overview-error" role="alert">{ordersError}</p>}
                {ordersLoading && orders.length === 0 ? <p className="admin-overview-empty">Loading orders…</p> : orders.length === 0 ? <p className="admin-overview-empty">No paid orders or payment exceptions yet.</p> : (
                  <div className="admin-overview-order-table" role="table">
                    <div className="admin-overview-order-head" role="row"><span>Order</span><span>Date</span><span>Total</span><span>Status</span><span /></div>
                    {orders.slice(0, 3).map((order) => {
                      const paymentStatus = order.paymentResolution && order.paymentResolution !== "none";
                      const statusLabel = paymentStatus
                        ? order.paymentResolution === "refund_pending" ? "Refund pending" : order.paymentResolution === "refund_processing" ? "Refund processing" : order.paymentResolution === "refunded" ? "Refunded" : "Manual resolution"
                        : order.status;
                      return (
                        <button className="admin-overview-order-row" type="button" role="row" key={order.id} onClick={() => { setSection("orders"); setSelectedOrderId(order.id); }}>
                          <span className="admin-overview-order-primary"><strong>{order.id}</strong><span>{order.customer}</span></span>
                          <span>{order.date}</span>
                          <strong>{order.total}</strong>
                          <span className={`admin-overview-status-pill ${paymentStatus ? "is-payment" : order.status.toLowerCase()}`}>{statusLabel}</span>
                          <ArrowUpRight aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
              <section className="admin-overview-payment">
                <div className="admin-overview-payment-copy">
                  <div className="admin-overview-payment-topline"><p className="admin-eyebrow">Payments</p><span>{stripeStatus.configured ? stripeStatus.mode === "live" ? "Live mode" : "Test mode" : "Setup"}</span></div>
                  <h2>{stripeStatus.configured ? `Stripe ${stripeStatus.mode === "live" ? "live payments are ready" : "test mode is ready"}` : stripeStatus.connected ? "Stripe keys need setup" : "Stripe needs attention"}</h2>
                  <p>{stripeStatus.configured ? "Card payments can now use Stripe-hosted checkout." : stripeStatus.connected ? "Your Stripe connection is attached. Add its secure key configuration to activate card payments." : "Check your secure Stripe workspace connection to activate payments."}</p>
                  <button className="admin-overview-payment-button" type="button" onClick={() => setSection("payments")}>Open payment settings <ArrowUpRight aria-hidden="true" /></button>
                </div>
              </section>
            </div>
          </div>
        )}

        {section === "home-page" && <AdminHomePage categories={categories} products={products} onSaved={setHomePageSettings} />}

        {section === "products" && editorProductId !== null && <ProductEditor product={editorProduct} categories={categoryNames} availableImages={catalogImages} promotionalProducts={promotionalProducts} onCancel={() => setEditorProductId(null)} onSave={saveProduct} />}

        {section === "products" && editorProductId === null && (
          <>
            <SectionTitle eyebrow="Catalog" title="Products" description="Create, edit, publish, or move products back to draft from one product workspace." action={<button className="admin-primary" type="button" onClick={openNewProduct}>Add product</button>} />
            <section className="admin-panel admin-content-review" aria-label="Product information review">
              <h2>Product information review</h2>
              <p>Missing information does not block sales. Please confirm product-specific descriptions, fit / sizing and care details before adding them. Simple products have no option selector; this does not mean they are one-size.</p>
              <p>Owner review requested in the pre-launch report: Mini Tote Bag, Button Up Short Sleeve Blazer, Leather Cape Jacket, Button Up Belted Trouser Set, Denim Trim Ribbed Cardigan, Printed Aysemetric Tracksuit and Mesh Floral Sleeve Tracksuit.</p>
              <ul>{products.filter((product) => productContentGaps(product).length > 0).map((product) => <li key={product.id}>
                <button type="button" onClick={() => setEditorProductId(product.id)}>{product.name}</button> — Missing: {productContentGaps(product).join(", ")}
              </li>)}</ul>
              {!products.some((product) => productContentGaps(product).length > 0) && <p>No missing content fields detected on published products. Please still verify that entered facts are accurate.</p>}
            </section>
            <section className="admin-panel admin-product-catalog-panel">
              <div className="admin-product-catalog-heading">
                <div><p className="admin-eyebrow">The Glam Edit</p><h2>Our Current Obsessions</h2></div>
                <span className="admin-muted-count">{products.length} products</span>
              </div>
              <div className="admin-product-catalog-grid">
                {[...products].sort((first, second) => second.id - first.id).map((product) => (
                  <article className="admin-product-catalog-card" key={product.id} data-testid={`admin-card-product-${product.id}`}>
                    <div className="admin-product-catalog-image">
                      {getCatalogMediaSource(product.image) ? <img src={getCatalogMediaSource(product.image)} alt={`${product.name} product preview`} /> : <div className="admin-image-placeholder">Add product media</div>}
                      <span className="admin-product-catalog-heart" aria-hidden="true">♡</span>
                      <span className={`admin-product-catalog-status ${product.status.toLowerCase()}`}>{product.status}</span>
                    </div>
                    <div className="admin-product-catalog-content">
                      <div className="admin-product-catalog-info">
                        <div>
                          <div className="admin-product-catalog-name">{product.name}</div>
                          <div className="admin-product-catalog-meta">{product.category}</div>
                        </div>
                        <strong>{product.price}</strong>
                      </div>
                      <div className="admin-product-catalog-actions">
                        <a href={`/product/${product.slug}`} data-testid={`link-view-product-${product.id}`}>View product</a>
                        <button type="button" data-testid={`button-edit-product-${product.id}`} onClick={() => { setEditorProductId(product.id); setNotice(""); }}>Edit product</button>
                        <button type="button" data-testid={`button-remove-product-${product.id}`} onClick={() => removeProduct(product)}>Remove</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        {section === "categories" && (
          <>
            <SectionTitle eyebrow="Catalog structure" title="Categories" description="Organize your collection so customers can shop every moment with ease." />
            <div className="admin-two-column admin-category-layout">
              <section className="admin-panel admin-category-list-panel">
                <div className="admin-panel-header"><div><p className="admin-eyebrow">Your collections</p><h2>Existing categories</h2></div><span className="admin-muted-count">{categories.length} categories</span></div>
                <div className="admin-category-grid">
                  {categories.map((category) => (
                    <article className="admin-category-card" key={category.id}>
                      {getCatalogMediaSource(category.image) ? <img src={getCatalogMediaSource(category.image)} alt={`${category.name} collection preview`} loading="lazy" decoding="async" /> : <div className="admin-category-image-empty">No image</div>}
                      <div className="admin-category-card-content">
                        <h3>{category.name}</h3>
                        {category.parentId && <p>Parent: {categories.find((item) => item.id === category.parentId)?.name ?? "Unknown"}</p>}
                        <p>{category.description || "No description yet."}</p>
                        <div className="admin-category-actions"><button type="button" onClick={() => editCategory(category)}>Edit</button><button type="button" onClick={() => deleteCategory(category)}>Delete</button></div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              <form className="admin-panel admin-simple-form admin-category-form" onSubmit={submitCategory}>
                <p className="admin-eyebrow">{editingCategoryId !== null ? "Edit category" : "New category"}</p>
                <h2>{editingCategoryId !== null ? "Update collection" : "Add a collection"}</h2>
                <label>Category title<input value={categoryDraft.name} onChange={(event) => setCategoryDraft((current) => ({
                  ...current,
                  name: event.target.value,
                  slug: editingCategoryId === null && (!current.slug || current.slug === createProductSlug(current.name))
                    ? createProductSlug(event.target.value)
                    : current.slug,
                }))} required placeholder="e.g. Weekend plans" /></label>
                <label>Category slug
                  <span className="admin-slug-input">
                    <input value={categoryDraft.slug ?? ""} onChange={(event) => setCategoryDraft((current) => ({ ...current, slug: event.target.value }))} placeholder="weekend-plans" />
                    <small><Check aria-hidden="true" />{editingCategoryId === null ? "Auto-generated from title" : "Existing URL stays until changed"}</small>
                  </span>
                </label>
                 <label>Parent category
                   <select value={categoryDraft.parentId ?? ""} onChange={(event) => setCategoryDraft((current) => ({ ...current, parentId: event.target.value ? Number(event.target.value) : null }))}>
                     <option value="">None — top-level category</option>
                     {categories.filter((category) => !category.parentId && category.id !== editingCategoryId).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                   </select>
                 </label>
                <label>Image URL<input type="text" value={categoryDraft.image.startsWith("data:") ? "" : categoryDraft.image} onChange={(event) => { setCategoryImageFileName(""); setCategoryDraft((current) => ({ ...current, image: event.target.value })); }} placeholder="https://... or an existing image path" /></label>
                <div className="admin-image-upload">
                  <button type="button" className="admin-upload-button" onClick={() => setCategoryMediaLibraryOpen(true)}>Select image</button>
                  <span>{categoryImageFileName || "PNG, JPG, WEBP or GIF · max 4MB"}</span>
                  <MediaLibrary
                    isOpen={categoryMediaLibraryOpen}
                    onClose={() => setCategoryMediaLibraryOpen(false)}
                    availableImages={catalogImages}
                    onSelect={(images) => {
                      if (images[0]) {
                        setCategoryImageFileName("");
                        setCategoryDraft((current) => ({ ...current, image: images[0] }));
                      }
                    }}
                    onUpload={handleCategoryImageUpload}
                  />
                </div>
                {getCatalogMediaSource(categoryDraft.image) && <img className="admin-category-form-preview" src={getCatalogMediaSource(categoryDraft.image)} alt="Category preview" />}
                <label>Description<textarea value={categoryDraft.description} onChange={(event) => setCategoryDraft((current) => ({ ...current, description: event.target.value }))} placeholder="A short description for this collection." rows={4} /></label>
                <AdminPromotionalPreview
                  categories={promotionalCategories.some(item => item.id === editingCategoryId)
                    ? promotionalCategories.map(item => item.id === editingCategoryId ? { ...categoryDraft, id: item.id } : item)
                    : [{ ...categoryDraft, id: editingCategoryId ?? -1 }, ...promotionalCategories].slice(0, 5)}
                  note={promotionalCategories.some(item => item.id === editingCategoryId)
                    ? "Your unsaved image and copy are shown in this category’s current homepage position."
                    : "This category is not currently featured. Shown as an example in the first category slot; this does not add it to the homepage."}
                />
                 <div className="admin-category-form-actions"><button className="admin-primary" type="submit" disabled={categorySaving} aria-busy={categorySaving}>{categorySaving ? editingCategoryId !== null ? "Updating…" : "Creating…" : editingCategoryId !== null ? "Update category" : "Create category"}</button>{editingCategoryId !== null && <button className="admin-secondary" type="button" onClick={cancelCategoryEdit} disabled={categorySaving}>Cancel</button>}</div>
              </form>
            </div>
          </>
        )}

        {section === "orders" && selectedOrder && (
          <AdminOrderDetailPage
            order={selectedOrder}
            products={products}
            updating={updatingOrderId === selectedOrder.id}
            onStatusChange={(status) => void updateOrderStatus(selectedOrder, status)}
            resolvingPayment={resolvingPaymentOrderId === selectedOrder.id}
            onPaymentResolution={(action) => void resolveOrderPayment(selectedOrder, action)}
            onBack={() => setSelectedOrderId(null)}
          />
        )}

        {section === "orders" && !selectedOrder && (
          <>
            <SectionTitle eyebrow="Fulfilment" title="Orders" description="Track customer purchases and move each order through delivery." action={<button className="admin-secondary" type="button" onClick={() => void refreshOrders()} disabled={ordersLoading}>{ordersLoading ? "Refreshing…" : "Refresh orders"}</button>} />
            <section className="admin-panel admin-table-panel">
              {ordersError && <p className="admin-payment-error" role="alert">{ordersError}</p>}
              {ordersLoading && orders.length === 0 ? <p className="admin-users-state">Loading orders…</p> : orders.length === 0 ? <p className="admin-users-state">No paid orders or payment exceptions yet.</p> : (
                <div className="admin-table">
                  <div className="admin-table-head admin-order-table-head"><span>Order</span><span>Customer</span><span>Date</span><span>Total</span><span>Status</span><span>Details</span></div>
                  {orders.map((order) => (
                    <div className="admin-table-row admin-order-table-row" key={order.id}>
                      <strong>{order.id}</strong>
                      <span>{order.customer}</span>
                      <span>{order.date}</span>
                      <span>{order.total}</span>
                      {order.paymentResolution && order.paymentResolution !== "none"
                        ? <span className={`order-status payment-${order.paymentResolution.replace("_", "-")}`}>{order.paymentResolution === "refund_pending" ? "Refund pending" : order.paymentResolution === "refund_processing" ? "Refund processing" : order.paymentResolution === "refunded" ? "Refunded" : "Manual resolution"}</span>
                        : <select value={order.status} disabled={updatingOrderId === order.id} onChange={(event) => void updateOrderStatus(order, event.target.value as Order["status"])} aria-label={`Update ${order.id} status`}><option>Processing</option><option>Shipped</option><option>Delivered</option></select>}
                      <button className="admin-order-details-button" type="button" onClick={() => setSelectedOrderId(order.id)}>View order</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {section === "coupons" && (
          <>
            <SectionTitle
              eyebrow="Promotions"
              title="Coupons"
              description="Create one-off promotional codes and keep a close eye on their availability and redemptions."
              action={<div className="admin-section-actions"><button className="admin-secondary" type="button" onClick={() => void refreshCoupons()} disabled={couponsLoading}>{couponsLoading ? "Refreshing…" : "Refresh"}</button><button className="admin-primary" type="button" onClick={openNewCoupon}>Create coupon</button></div>}
            />
            {couponEditorOpen && (
              <form className="admin-panel admin-coupon-editor" onSubmit={saveCoupon}>
                <div className="admin-panel-header"><div><p className="admin-eyebrow">{editingCouponId ? "Edit coupon" : "New promotion"}</p><h2>{editingCouponId ? "Update coupon" : "Create a coupon"}</h2></div><button type="button" onClick={closeCouponEditor}>Cancel</button></div>
                <div className="admin-coupon-fields">
                  <label>Coupon code<input required maxLength={40} autoComplete="off" value={couponDraft.code} onChange={(event) => setCouponDraft((current) => ({ ...current, code: event.target.value.toUpperCase().replace(/\s+/g, "") }))} placeholder="e.g. WELCOME10" /></label>
                  <label>Discount type<select value={couponDraft.discountType} onChange={(event) => setCouponDraft((current) => ({ ...current, discountType: event.target.value as CouponDraft["discountType"] }))}><option value="percentage">Percentage off</option><option value="fixed">Fixed amount off</option></select></label>
                  <label>{couponDraft.discountType === "percentage" ? "Percentage" : "Amount (GBP)"}<input required type="number" min={couponDraft.discountType === "percentage" ? 1 : 0.01} max={couponDraft.discountType === "percentage" ? 100 : undefined} step={couponDraft.discountType === "percentage" ? 1 : 0.01} value={couponDraft.discountValue} onChange={(event) => setCouponDraft((current) => ({ ...current, discountValue: event.target.value }))} placeholder={couponDraft.discountType === "percentage" ? "10" : "10.00"} /></label>
                  <label>Minimum spend (GBP) <span>Optional</span><input type="number" min="0" step="0.01" value={couponDraft.minimumSpend} onChange={(event) => setCouponDraft((current) => ({ ...current, minimumSpend: event.target.value }))} placeholder="0.00" /></label>
                  <label>Starts on <span>Optional</span><input type="date" value={couponDraft.startsAt} onChange={(event) => setCouponDraft((current) => ({ ...current, startsAt: event.target.value }))} /></label>
                  <label>Ends on <span>Optional</span><input type="date" value={couponDraft.endsAt} onChange={(event) => setCouponDraft((current) => ({ ...current, endsAt: event.target.value }))} /></label>
                  <label>Usage limit <span>Optional</span><input type="number" min="1" step="1" value={couponDraft.usageLimit} onChange={(event) => setCouponDraft((current) => ({ ...current, usageLimit: event.target.value }))} placeholder="Unlimited" /></label>
                  <label className="admin-coupon-active"><input type="checkbox" checked={couponDraft.active} onChange={(event) => setCouponDraft((current) => ({ ...current, active: event.target.checked }))} /><span>Make this coupon active when saved</span></label>
                </div>
                {couponsError && <p className="admin-payment-error" role="alert">{couponsError}</p>}
                <div className="admin-coupon-form-actions"><button className="admin-primary" type="submit" disabled={couponSaving}>{couponSaving ? "Saving…" : editingCouponId ? "Save coupon" : "Create coupon"}</button><button className="admin-secondary" type="button" onClick={closeCouponEditor} disabled={couponSaving}>Cancel</button></div>
              </form>
            )}
            {!couponEditorOpen && couponsError && <p className="admin-payment-error" role="alert">{couponsError}</p>}
            <section className="admin-panel admin-table-panel admin-coupons-panel">
              {couponsLoading ? <p className="admin-users-state">Loading coupons…</p> : coupons.length === 0 ? <div className="admin-coupon-empty"><strong>No coupons yet.</strong><span>Create a code when you are ready to run your first promotion.</span><button className="admin-primary" type="button" onClick={openNewCoupon}>Create coupon</button></div> : (
                <div className="admin-table admin-coupons-table">
                  <div className="admin-table-head"><span>Code</span><span>Discount</span><span>Availability</span><span>Uses</span><span>Status</span><span>Actions</span></div>
                  {coupons.map((coupon) => (
                    <div className="admin-table-row" key={coupon.id}>
                      <strong>{coupon.code}</strong>
                      <span>{formatCouponDiscount(coupon)}{coupon.minimumSpend > 0 ? <small>Min. {formatPounds(coupon.minimumSpend / 100)}</small> : null}</span>
                      <span>{coupon.startsAt || coupon.endsAt ? `${coupon.startsAt ? `From ${coupon.startsAt}` : "Now"}${coupon.endsAt ? ` · Until ${coupon.endsAt}` : ""}` : "Always available"}</span>
                      <span>{coupon.usageCount}{coupon.usageLimit !== null ? ` / ${coupon.usageLimit}` : " / ∞"}</span>
                      <span className={`product-status ${coupon.active ? "active" : "draft"}`}>{coupon.active ? "Active" : "Inactive"}</span>
                      <div className="admin-coupon-actions"><button type="button" onClick={() => editCoupon(coupon)}>Edit</button><button type="button" onClick={() => void toggleCoupon(coupon)}>{coupon.active ? "Deactivate" : "Activate"}</button><button type="button" disabled={deletingCouponId === coupon.id} onClick={() => void deleteCoupon(coupon)}>{deletingCouponId === coupon.id ? "Deleting…" : "Delete"}</button></div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {section === "shipping" && (
          <>
            <SectionTitle eyebrow="Store settings" title="Shipping" description="Manage delivery rates and promises for both product pages and checkout." />
            <div className="admin-shipping-toolbar"><p>Enabled methods appear on product pages and at checkout. Changes here update both. Prices are in GBP; a zero price is shown as Free.</p><button className="admin-secondary" type="button" onClick={() => void refreshShipping()} disabled={shippingLoading}>{shippingLoading ? "Refreshing…" : "Refresh"}</button></div>
            {shippingError && <p className="admin-form-error" role="alert">{shippingError}</p>}
            <form className="admin-panel admin-shipping-editor" onSubmit={saveShipping}>
              <div className="admin-panel-heading"><div><p className="admin-eyebrow">{editingShippingId ? "Edit method" : "New method"}</p><h2>{editingShippingId ? "Update delivery method" : "Add a delivery method"}</h2></div></div>
              <div className="admin-shipping-form-grid">
                <label>Name<input required value={shippingDraft.name} onChange={(event) => setShippingDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Standard" /></label>
                <label>Price (GBP)<input required min="0" step="0.01" type="number" value={shippingDraft.price} onChange={(event) => setShippingDraft((draft) => ({ ...draft, price: event.target.value }))} /><small>Use 0 for a Free method.</small></label>
                <label className="admin-shipping-wide">Delivery promise and information<textarea rows={4} maxLength={2000} value={shippingDraft.description} onChange={(event) => setShippingDraft((draft) => ({ ...draft, description: event.target.value }))} placeholder="Include delivery times, order cutoffs, and postcode restrictions." /></label>
                <label>Free over (GBP)<input min="0" step="0.01" type="number" value={shippingDraft.freeOver} onChange={(event) => setShippingDraft((draft) => ({ ...draft, freeOver: event.target.value }))} placeholder="Optional" /><small>Leave blank to never make this method free.</small></label>
                <label className="admin-checkbox"><input type="checkbox" checked={shippingDraft.enabled} onChange={(event) => setShippingDraft((draft) => ({ ...draft, enabled: event.target.checked }))} /> Enabled on product pages and at checkout</label>
              </div>
              <div className="admin-form-actions"><button className="admin-primary" type="submit" disabled={shippingSaving}>{shippingSaving ? "Saving…" : editingShippingId ? "Save changes" : "Add method"}</button>{editingShippingId && <button className="admin-secondary" type="button" onClick={() => { setEditingShippingId(null); setShippingDraft(blankShipping); }}>Cancel</button>}</div>
            </form>
            {shippingLoading && shippingMethods.length === 0 ? <p className="admin-users-state">Loading shipping methods…</p> : shippingMethods.length === 0 ? <div className="admin-panel admin-shipping-empty"><strong>No shipping methods yet.</strong><span>Add one above to offer delivery at checkout.</span></div> : <div className="admin-shipping-list">{shippingMethods.map((method, index) => <article className="admin-panel admin-shipping-method" key={method.id}><div className="admin-shipping-method-main"><div><p className="admin-eyebrow">{method.enabled ? "Enabled" : "Disabled"}</p><h2>{method.name}</h2><p>{method.description || "No checkout description."}</p></div><strong>{method.price === 0 ? "Free" : `£${(method.price / 100).toFixed(2)}`}</strong></div><div className="admin-shipping-method-meta"><span>{method.freeOver === null ? "No free-shipping threshold" : `Free over £${(method.freeOver / 100).toFixed(2)}`}</span><div className="admin-section-actions"><button className="admin-secondary" type="button" onClick={() => void updateShipping(method, { enabled: !method.enabled })}>{method.enabled ? "Disable" : "Enable"}</button><button className="admin-secondary" type="button" onClick={() => moveShipping(method, -1)} disabled={index === 0}>Move up</button><button className="admin-secondary" type="button" onClick={() => moveShipping(method, 1)} disabled={index === shippingMethods.length - 1}>Move down</button><button className="admin-secondary" type="button" onClick={() => editShipping(method)}>Edit</button><button className="admin-danger" type="button" onClick={() => void deleteShipping(method)} disabled={deletingShippingId === method.id}>{deletingShippingId === method.id ? "Deleting…" : "Delete"}</button></div></div></article>)}</div>}
          </>
        )}

        {section === "delivery" && (
          <>
            <SectionTitle
              eyebrow="Product information"
              title="Delivery & Return"
              description="Manage the global Delivery and Returns accordions shown on every product page."
              action={<button className="admin-secondary" type="button" onClick={() => deliveryContentTab === "delivery" ? void refreshDeliveryInformation() : void refreshReturnInformation()} disabled={deliveryContentTab === "delivery" ? deliveryLoading : returnLoading}>{deliveryContentTab === "delivery" ? (deliveryLoading ? "Refreshing…" : "Refresh") : (returnLoading ? "Refreshing…" : "Refresh")}</button>}
            />
            <div className="admin-content-tabs" role="tablist" aria-label="Delivery and return settings">
              <button type="button" role="tab" aria-selected={deliveryContentTab === "delivery"} className={deliveryContentTab === "delivery" ? "is-active" : ""} onClick={() => setDeliveryContentTab("delivery")}>Delivery</button>
              <button type="button" role="tab" aria-selected={deliveryContentTab === "return"} className={deliveryContentTab === "return" ? "is-active" : ""} onClick={() => setDeliveryContentTab("return")}>Return</button>
            </div>
            {deliveryContentTab === "delivery" ? (
              <>
                <div className="admin-delivery-toolbar">
                  <p>This preview uses the same rates, delivery promises, and free-delivery thresholds as checkout. Edit them under Shipping to update both places.</p>
                  <button className="admin-secondary" type="button" onClick={() => setSection("shipping")}>Manage delivery in Shipping</button>
                </div>
                {deliveryError && <p className="admin-form-error" role="alert">{deliveryError}</p>}
                <div className="admin-panel admin-delivery-editor">
                  {deliveryLoading && deliveryInformation.length === 0 ? <p className="admin-users-state">Loading delivery information…</p> : deliveryInformation.length === 0 ? <div className="admin-delivery-empty"><strong>No enabled delivery methods.</strong><span>Add or enable a method under Shipping to show it on product pages and at checkout.</span></div> : (
                    <div className="admin-delivery-repeater">{deliveryInformation.map((row, index) => (
                      <fieldset className="admin-delivery-row" key={row.id}>
                        <legend>Delivery row {index + 1}</legend>
                        <label>Delivery option<input readOnly value={row.option} /></label>
                        <label className="admin-delivery-information-field">Delivery information<textarea readOnly rows={4} value={row.information} /></label>
                        <label>Delivery cost (GBP)<input readOnly value={row.cost} />{row.freeOver !== null && <small>Free on orders £{(row.freeOver / 100).toFixed(2)} or more.</small>}</label>
                      </fieldset>
                    ))}</div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="admin-return-intro"><p>Write the return policy shown in the Returns accordion on every product page.</p></div>
                {returnError && <p className="admin-form-error" role="alert">{returnError}</p>}
                <form className="admin-panel admin-return-editor" onSubmit={saveReturnInformation}>
                  {returnLoading ? <p className="admin-users-state">Loading return information…</p> : <RichTextEditor value={returnInformation} onChange={setReturnInformation} placeholder="Add your return policy, refund times, exclusions, and instructions." />}
                  <div className="admin-form-actions"><button className="admin-primary" type="submit" disabled={returnSaving || returnLoading}>{returnSaving ? "Saving…" : "Save return information"}</button></div>
                </form>
              </>
            )}
          </>
        )}

        {section === "size-guide" && (
          <>
            <SectionTitle
              eyebrow="Product information"
              title="Size Guide"
              description="Manage the measurement table shown inside the Size Guide accordion on every product page."
              action={<button className="admin-secondary" type="button" onClick={() => void refreshSizeGuide()} disabled={sizeGuideLoading}>{sizeGuideLoading ? "Refreshing…" : "Refresh"}</button>}
            />
            <div className="admin-size-guide-toolbar">
              <p>Add one row for each UK size. Use the same letter size on consecutive rows to group them together in the product table.</p>
              <button className="admin-secondary" type="button" onClick={() => setSizeGuide((rows) => [...rows, blankSizeGuideRow()])}>Add size row</button>
            </div>
            {sizeGuideError && <p className="admin-form-error" role="alert">{sizeGuideError}</p>}
            <form className="admin-panel admin-size-guide-editor" onSubmit={saveSizeGuide}>
              {sizeGuideLoading && sizeGuide.length === 0 ? (
                <p className="admin-users-state">Loading size guide…</p>
              ) : sizeGuide.length === 0 ? (
                <div className="admin-size-guide-empty">
                  <strong>No size guide rows yet.</strong>
                  <span>Add your first size to create the product-page measurement table.</span>
                  <button className="admin-primary" type="button" onClick={() => setSizeGuide([blankSizeGuideRow()])}>Add size row</button>
                </div>
              ) : (
                <div className="admin-size-guide-repeater">
                  {sizeGuide.map((row, index) => (
                    <fieldset className="admin-size-guide-row" key={row.id}>
                      <legend>Size row {index + 1}</legend>
                      <label>Size<input required maxLength={30} value={row.size} onChange={(event) => updateSizeGuideRow(row.id, { size: event.target.value })} placeholder="S" /></label>
                      <label>UK size<input required maxLength={30} value={row.ukSize} onChange={(event) => updateSizeGuideRow(row.id, { ukSize: event.target.value })} placeholder="10" /></label>
                      <label>Bust<input required maxLength={100} value={row.bust} onChange={(event) => updateSizeGuideRow(row.id, { bust: event.target.value })} placeholder={'88.5cm / 34.8"'} /></label>
                      <label>Waist<input required maxLength={100} value={row.waist} onChange={(event) => updateSizeGuideRow(row.id, { waist: event.target.value })} placeholder={'71.5cm / 28.2"'} /></label>
                      <label>Hips<input required maxLength={100} value={row.hips} onChange={(event) => updateSizeGuideRow(row.id, { hips: event.target.value })} placeholder={'95cm / 37.4"'} /></label>
                      <div className="admin-size-guide-row-actions">
                        <button className="admin-secondary" type="button" onClick={() => moveSizeGuideRow(index, -1)} disabled={index === 0}>Move up</button>
                        <button className="admin-secondary" type="button" onClick={() => moveSizeGuideRow(index, 1)} disabled={index === sizeGuide.length - 1}>Move down</button>
                        <button className="admin-danger" type="button" onClick={() => setSizeGuide((rows) => rows.filter((item) => item.id !== row.id))}>Remove</button>
                      </div>
                    </fieldset>
                  ))}
                </div>
              )}
              {sizeGuide.length > 0 && (
                <div className="admin-form-actions">
                  <button className="admin-primary" type="submit" disabled={sizeGuideSaving}>{sizeGuideSaving ? "Saving…" : "Save size guide"}</button>
                  <button className="admin-secondary" type="button" onClick={() => setSizeGuide((rows) => [...rows, blankSizeGuideRow()])}>Add another row</button>
                </div>
              )}
            </form>
          </>
        )}

        {section === "messages" && (
          <>
            <SectionTitle
              eyebrow="Customer care"
              title="Contact Form"
              description="Review every contact enquiry, including messages retained when email delivery was unavailable."
              action={<button className="admin-secondary" type="button" onClick={() => void refreshMessages()} disabled={messagesLoading}>{messagesLoading ? "Refreshing…" : "Refresh messages"}</button>}
            />
            <AdminContactEmailSettings onOpenGmail={() => setSection("payments")} />
            {messagesError && <p className="admin-payment-error" role="alert">{messagesError}</p>}
            <section className="admin-panel admin-table-panel admin-message-panel" aria-label="Contact form submissions">
              {messagesLoading && contactEnquiries.length === 0 ? (
                <p className="admin-users-state">Loading customer messages…</p>
              ) : contactEnquiries.length === 0 ? (
                <div className="admin-message-empty"><Mail aria-hidden="true" /><strong>No customer messages yet.</strong><span>New contact enquiries will appear here as soon as they are submitted.</span></div>
              ) : (
                <div className="admin-table admin-message-table">
                  <div className="admin-table-head"><span>Submitted</span><span>Customer</span><span>Email</span><span>Order</span><span>Topic</span><span>Message</span><span>Email status</span></div>
                  {contactEnquiries.map((enquiry) => {
                    const statusLabel = enquiry.deliveryStatus === "delivered"
                      ? "Legacy provider accepted"
                      : enquiry.deliveryStatus === "accepted"
                        ? "SMTP accepted"
                        : enquiry.deliveryStatus === "partial"
                          ? "Partially accepted"
                        : enquiry.deliveryStatus === "uncertain"
                          ? "Outcome unknown"
                          : enquiry.deliveryStatus === "sending"
                            ? "Sending / outcome pending"
                      : enquiry.deliveryStatus === "failed"
                        ? "Failed"
                        : enquiry.deliveryStatus === "not_configured"
                          ? "Not configured"
                          : "Pending";
                    return (
                      <div className="admin-table-row" key={enquiry.id}>
                        <span>{new Date(enquiry.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
                        <strong>{enquiry.name}</strong>
                        <a href={`mailto:${enquiry.email}`}>{enquiry.email}</a>
                        <span>{enquiry.orderNumber || "—"}</span>
                        <span>{enquiry.topic}</span>
                        <div className="admin-message-table-copy" style={{ whiteSpace: "normal", overflow: "visible" }}>
                          <details>
                            <summary>Read message</summary>
                            <span style={{ display: "block", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 16 }}>{enquiry.message}</span>
                            {enquiry.emailRecipients?.map(recipient => <span key={recipient.email} style={{ display: "block", fontSize: 14, overflowWrap: "anywhere", marginTop: 8 }}>
                              {recipient.email}: {recipient.status}{recipient.error ? ` — ${recipient.error}` : ""}<br />Message ID: {recipient.messageId}
                            </span>)}
                            {enquiry.deliveryError && <span style={{ display: "block", fontSize: 14, marginTop: 8 }}>{enquiry.deliveryError}</span>}
                            {enquiry.emailMessageId && <span style={{ display: "block", fontSize: 14, overflowWrap: "anywhere", marginTop: 8 }}>Message ID: {enquiry.emailMessageId}</span>}
                          </details>
                        </div>
                        <span className={`admin-message-status is-${enquiry.deliveryStatus}`} title={enquiry.deliveryError || undefined}>{statusLabel}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {section === "users" && (
          <>
            <header className="admin-users-header">
              <div className="admin-users-header-copy">
                <p className="admin-eyebrow">Private studio</p>
                <h1>Users &amp; access</h1>
                <p>Create customer or administrator accounts, review access, and remove accounts when needed. Passwords and private account data are never shown here.</p>
              </div>
              <div className="admin-users-header-actions">
                <button className="admin-secondary" type="button" onClick={() => void refreshUsers()} disabled={usersLoading}>{usersLoading ? "Refreshing…" : "Refresh users"}</button>
                <button className="admin-primary" type="button" onClick={() => { setCreateUserOpen((open) => !open); setNewUserError(""); }}>{createUserOpen ? "Close new user" : "New user"}</button>
              </div>
            </header>
            <section className="admin-panel admin-users-panel">
              {createUserOpen && <form className="admin-new-user-form" onSubmit={createUser}><div><p className="admin-eyebrow">Account creation</p><h2>Create a new user</h2><p>Set an initial password and choose whether this account is a Customer or Admin.</p></div><div className="admin-new-user-fields"><label>First name<input value={newUserDraft.firstName} onChange={(event) => setNewUserDraft((current) => ({ ...current, firstName: event.target.value }))} placeholder="First name" /></label><label>Last name<input value={newUserDraft.lastName} onChange={(event) => setNewUserDraft((current) => ({ ...current, lastName: event.target.value }))} placeholder="Last name" /></label><label className="admin-new-user-email">Email address<input type="email" required value={newUserDraft.email} onChange={(event) => setNewUserDraft((current) => ({ ...current, email: event.target.value }))} placeholder="name@example.com" /></label><label>Initial password<input type="password" required minLength={8} autoComplete="new-password" value={newUserDraft.password} onChange={(event) => setNewUserDraft((current) => ({ ...current, password: event.target.value }))} placeholder="At least 8 characters" /></label><label>Assign role<select value={newUserDraft.role} onChange={(event) => setNewUserDraft((current) => ({ ...current, role: event.target.value as NewUserDraft["role"] }))}><option value="customer">Customer</option><option value="admin">Admin</option></select></label></div>{newUserError && <p className="admin-payment-error" role="alert">{newUserError}</p>}<div className="admin-new-user-actions"><button className="admin-primary" type="submit" disabled={creatingUser}>{creatingUser ? "Creating…" : "Create user"}</button><button className="admin-secondary" type="button" onClick={() => setCreateUserOpen(false)}>Cancel</button></div></form>}
              <div className="admin-users-toolbar">
                <label className="admin-user-search">Search accounts<input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search by name or email" /></label>
                <span>{managedUsers.length} account{managedUsers.length === 1 ? "" : "s"}</span>
              </div>
              {usersError && <p className="admin-payment-error" role="alert">{usersError}</p>}
              {usersLoading ? <p className="admin-users-state">Loading user accounts…</p> : (
                <div className="admin-user-groups">
                  <section className="admin-user-group">
                    <div className="admin-user-group-heading"><div><p className="admin-eyebrow">Approved access</p><h2>Administrators</h2></div><span>{adminUsers.length}</span></div>
                    {adminUsers.length === 0 ? <p className="admin-users-state">No administrator accounts match this search.</p> : adminUsers.map((user) => (
                      <article className="admin-user-card" key={user.id}>
                        <div className="admin-user-avatar" aria-hidden="true">{user.name.charAt(0).toUpperCase()}</div>
                        <div className="admin-user-details"><strong>{user.name}</strong><span>{user.email}</span><small>Joined {formatUserDate(user.createdAt)} · Last sign-in {formatUserDate(user.lastSignInAt)}</small></div>
                        <div className="admin-user-actions"><span className="admin-role-badge">{user.isBootstrapAdmin ? "Primary owner" : "Admin"}</span><button type="button" className="admin-secondary" disabled={updatingUserId === user.id} onClick={() => editUser(user)}>Edit</button>{user.isBootstrapAdmin ? <small>Protected</small> : <><button type="button" className="admin-secondary" disabled={updatingUserId === user.id || deletingUserId === user.id} onClick={() => void updateUserAccess(user, false)}>{updatingUserId === user.id ? "Updating…" : "Remove admin"}</button><button type="button" className="admin-danger-button" disabled={updatingUserId === user.id || deletingUserId === user.id} onClick={() => void deleteUser(user)}>{deletingUserId === user.id ? "Deleting…" : "Delete"}</button></>}</div>
                        {editingUserId === user.id && <form className="admin-user-edit-form" onSubmit={(event) => void saveUser(event, user)}><label>First name<input value={editUserDraft.firstName} onChange={(event) => setEditUserDraft((current) => ({ ...current, firstName: event.target.value }))} /></label><label>Last name<input value={editUserDraft.lastName} onChange={(event) => setEditUserDraft((current) => ({ ...current, lastName: event.target.value }))} /></label><label>Email address<input type="email" required disabled={user.isBootstrapAdmin} value={editUserDraft.email} onChange={(event) => setEditUserDraft((current) => ({ ...current, email: event.target.value }))} />{user.isBootstrapAdmin && <small>Primary owner email is protected.</small>}</label><div className="admin-user-edit-actions"><button className="admin-primary" type="submit" disabled={updatingUserId === user.id}>{updatingUserId === user.id ? "Saving…" : "Save changes"}</button><button className="admin-secondary" type="button" onClick={() => setEditingUserId(null)}>Cancel</button></div></form>}
                      </article>
                    ))}
                  </section>
                  <section className="admin-user-group">
                    <div className="admin-user-group-heading"><div><p className="admin-eyebrow">Customer accounts</p><h2>Customers</h2></div><span>{customerUsers.length}</span></div>
                    {customerUsers.length === 0 ? <p className="admin-users-state">No customer accounts match this search.</p> : customerUsers.map((user) => (
                      <article className="admin-user-card" key={user.id}>
                        <div className="admin-user-avatar customer" aria-hidden="true">{user.name.charAt(0).toUpperCase()}</div>
                        <div className="admin-user-details"><strong>{user.name}</strong><span>{user.email}</span><small>Joined {formatUserDate(user.createdAt)} · Last sign-in {formatUserDate(user.lastSignInAt)}</small></div>
                        <div className="admin-user-actions"><span className="admin-role-badge customer">Customer</span><button type="button" className="admin-secondary" disabled={updatingUserId === user.id} onClick={() => editUser(user)}>Edit</button><button type="button" className="admin-primary" disabled={updatingUserId === user.id || deletingUserId === user.id} onClick={() => void updateUserAccess(user, true)}>{updatingUserId === user.id ? "Updating…" : "Make admin"}</button><button type="button" className="admin-danger-button" disabled={updatingUserId === user.id || deletingUserId === user.id} onClick={() => void deleteUser(user)}>{deletingUserId === user.id ? "Deleting…" : "Delete"}</button></div>
                        {editingUserId === user.id && <form className="admin-user-edit-form" onSubmit={(event) => void saveUser(event, user)}><label>First name<input value={editUserDraft.firstName} onChange={(event) => setEditUserDraft((current) => ({ ...current, firstName: event.target.value }))} /></label><label>Last name<input value={editUserDraft.lastName} onChange={(event) => setEditUserDraft((current) => ({ ...current, lastName: event.target.value }))} /></label><label>Email address<input type="email" required value={editUserDraft.email} onChange={(event) => setEditUserDraft((current) => ({ ...current, email: event.target.value }))} /></label><div className="admin-user-edit-actions"><button className="admin-primary" type="submit" disabled={updatingUserId === user.id}>{updatingUserId === user.id ? "Saving…" : "Save changes"}</button><button className="admin-secondary" type="button" onClick={() => setEditingUserId(null)}>Cancel</button></div></form>}
                      </article>
                    ))}
                  </section>
                </div>
              )}
            </section>
          </>
        )}

        {section === "payments" && (
          <div className="admin-payments-page">
            <SectionTitle eyebrow="Store settings" title="Payments" description="Secure payment processing and transaction reporting for Glam Too." action={<button className="admin-payment-view-transactions" type="button" onClick={() => setSection("orders")}>View transactions</button>} />
            <AdminGmailSettings />
            <AdminContactEmailSettings kind="order" />
            <section className={`admin-payment-card ${stripeStatus.configured ? "is-connected" : ""}`}>
              <div className="admin-payment-banner-copy">
                <div className="admin-payment-provider-row">
                  <span className="stripe-mark">stripe</span>
                  <span className="admin-payment-provider-label">Payment provider</span>
                </div>
                <h2>{stripeStatus.configured ? "Stripe checkout is connected" : stripeStatus.connected ? "Add Stripe key configuration" : "Connect Stripe to accept payments"}</h2>
                <p>{stripeStatus.configured ? "Your keys are held by the secure workspace connection. Customers are sent to Stripe’s hosted checkout to pay by card." : stripeStatus.connected ? "Your Stripe connection is attached, but its secure secret key is not configured yet." : "Stripe is not ready yet. Check the secure workspace integration for your publishable and secret key setup."}</p>
                <div className="admin-payment-tags"><span><CreditCard aria-hidden="true" /> Card payments</span><span><LockKeyhole aria-hidden="true" /> Secure connection</span></div>
              </div>
              <div className="admin-payment-status">
                <div className="admin-payment-status-icon"><ShieldCheck aria-hidden="true" /></div>
                <div className="admin-payment-status-copy">
                  <strong><span className={`admin-payment-status-dot ${stripeStatus.configured ? "is-connected" : ""}`} />Connection status</strong>
                  <span>{stripeStatusLoading ? "Checking…" : stripeStatus.configured ? `${stripeStatus.mode === "live" ? "Live" : "Test"} mode connected` : stripeStatus.connected ? "Key setup needed" : "Not connected"}</span>
                  <small>{stripeStatus.configured ? "Ready to process card payments" : "Complete setup before taking payments"}</small>
                </div>
              </div>
            </section>
            <div className="admin-payment-layout">
              <div className="admin-payment-column">
                <section className="admin-panel admin-payment-settings">
                  <p className="admin-eyebrow">Stripe details</p>
                  <h2>Payment setup</h2>
                  <div className="admin-payment-detail-grid">
                    <div><span className="admin-payment-detail-icon"><Server aria-hidden="true" /></span><span>Environment</span><strong>{stripeStatus.configured ? `${stripeStatus.mode === "live" ? "Live" : "Test"} mode` : stripeStatus.connected ? "Awaiting secure keys" : "Not configured"}</strong></div>
                    <div><span className="admin-payment-detail-icon"><ShieldCheck aria-hidden="true" /></span><span>Publishable key</span><strong>{stripeStatus.publishableKeyConfigured ? "Connected securely" : "Managed by Stripe connection"}</strong></div>
                    <div><span className="admin-payment-detail-icon"><KeyRound aria-hidden="true" /></span><span>Secret key</span><strong>{stripeStatus.configured ? "Stored server-side" : stripeStatus.connected ? "Add in workspace connection" : "Not configured"}</strong></div>
                    <div><span className="admin-payment-detail-icon"><CreditCard aria-hidden="true" /></span><span>Payment methods</span><strong>{stripeStatus.paymentMethods.length ? stripeStatus.paymentMethods.join(", ") : "Card payments pending"}</strong></div>
                  </div>
                  {stripeStatus.error && <p className="admin-payment-error" role="alert">{stripeStatus.error}</p>}
                  <div className="admin-payment-actions"><button className="admin-primary" type="button" onClick={() => void refreshStripeStatus()} disabled={stripeStatusLoading}>{stripeStatusLoading ? "Checking Stripe…" : "Refresh Stripe details"}</button></div>
                  <p>For safety, keys are never copied into this browser or saved in local storage. Update test or live keys in the secure Stripe workspace connection; this page will show the updated status after refresh.</p>
                </section>
                <section className="admin-panel admin-payment-how">
                  <p className="admin-eyebrow">How payments work</p>
                  <h2>From checkout to confirmation</h2>
                  <ol>
                    <li><span className="admin-payment-step-icon"><ShoppingBag aria-hidden="true" /><b>1</b></span><div><strong>Customer checkout</strong><p>Customers complete checkout and are sent to Stripe-hosted payment.</p></div></li>
                    <li><span className="admin-payment-step-icon"><ShieldCheck aria-hidden="true" /><b>2</b></span><div><strong>Secure payment</strong><p>Stripe confirms the payment securely and sends the order result back to Glam Too.</p></div></li>
                    <li><span className="admin-payment-step-icon"><Check aria-hidden="true" /><b>3</b></span><div><strong>Order confirmation</strong><p>Keep the webhook signing secret updated when you configure webhooks for live payments.</p></div></li>
                  </ol>
                </section>
              </div>
              <div className="admin-payment-column">
                <section className="admin-panel admin-stripe-guide" aria-label="Manage Stripe keys">
                  <div className="admin-payment-control-heading"><p className="admin-eyebrow">Admin payment controls</p><h2>Add or replace Stripe keys</h2></div>
                  <p className="admin-payment-security-note"><LockKeyhole aria-hidden="true" /> Protected settings · Secrets are encrypted and never shown after saving.</p>
                  <form className="admin-stripe-credentials-form" onSubmit={saveStripeCredentials}>
                    <label>Publishable key<input type="text" autoComplete="off" value={stripeCredentials.publishableKey} onChange={(event) => setStripeCredentials((current) => ({ ...current, publishableKey: event.target.value }))} placeholder={stripeStatus.publishableKeyConfigured ? "Leave blank to keep the saved publishable key" : "pk_test_… or pk_live_…"} /></label>
                    <label>Secret key<input type="password" autoComplete="new-password" value={stripeCredentials.secretKey} onChange={(event) => setStripeCredentials((current) => ({ ...current, secretKey: event.target.value }))} placeholder={stripeStatus.configured && stripeStatus.source === "admin" ? "Leave blank to keep the saved secret key" : "sk_test_… or sk_live_…"} /></label>
                    <label>Webhook signing secret <span>Optional</span><input type="password" autoComplete="new-password" value={stripeCredentials.webhookSecret} onChange={(event) => setStripeCredentials((current) => ({ ...current, webhookSecret: event.target.value }))} placeholder={stripeStatus.webhookSecretConfigured ? "Leave blank to keep the saved webhook secret" : "whsec_…"} /></label>
                    <p className="admin-stripe-form-note">Use matching test or live publishable and secret keys. A newly entered secret key is verified with Stripe before it is saved.</p>
                    {stripeCredentialsError && <p className="admin-payment-error" role="alert">{stripeCredentialsError}</p>}
                    {stripeCredentialsNotice && <p className="admin-stripe-success" role="status">{stripeCredentialsNotice}</p>}
                    <div className="admin-payment-actions"><button className="admin-primary" type="submit" disabled={stripeCredentialsSaving}>{stripeCredentialsSaving ? "Saving securely…" : "Update Stripe keys"}</button>{stripeStatus.source === "admin" && <button className="admin-danger-button" type="button" onClick={() => void clearStripeCredentials()} disabled={stripeCredentialsSaving}>Disconnect saved keys</button>}</div>
                  </form>
                </section>
                <div className="admin-payment-mode-grid">
                  <article className={stripeStatus.configured && stripeStatus.mode === "test" ? "is-selected" : ""}><div className="admin-payment-mode-heading"><span>Test mode</span>{stripeStatus.configured && stripeStatus.mode === "test" ? <b>Currently connected</b> : <b>Recommended for setup</b>}</div><div className="admin-payment-mode-body"><FlaskConical aria-hidden="true" /><div><h3>Test API keys</h3><p>Use sandbox payments while you confirm checkout, webhooks, and order handling.</p><a className="admin-secondary" href="https://dashboard.stripe.com/test/apikeys" target="_blank" rel="noreferrer">Open test keys <span aria-hidden="true">↗</span></a></div></div></article>
                  <article className={stripeStatus.configured && stripeStatus.mode === "live" ? "is-selected" : ""}><div className="admin-payment-mode-heading"><span>Live mode</span>{stripeStatus.configured && stripeStatus.mode === "live" && <b>Currently connected</b>}</div><div className="admin-payment-mode-body"><Globe2 aria-hidden="true" /><div><h3>Live API keys</h3><p>Connect live keys only when your store is ready to accept real customer payments.</p><a className="admin-secondary" href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noreferrer">Open live keys <span aria-hidden="true">↗</span></a></div></div></article>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
