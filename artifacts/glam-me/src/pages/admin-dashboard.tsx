import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { catalogCategories, catalogProducts, createProductSlug, formatCatalogPrice, getCatalogPriceInput, type CatalogProduct, type CatalogVariation } from "@/data/catalog";

type AdminSection =
  | "overview"
  | "products"
  | "categories"
  | "orders"
  | "shipping"
  | "payments"
  | "users";

type ProductStatus = "Published" | "Draft";
type ProductType = "Simple" | "Variable";

type ProductVariation = CatalogVariation;
type Product = CatalogProduct;

type ProductDraft = Omit<Product, "id">;

type Category = {
  id: number;
  name: string;
  image: string;
  description: string;
};

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
  customer: string;
  date: string;
  total: string;
  status: "Processing" | "Shipped" | "Delivered";
};

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  createdAt: number;
  lastSignInAt: number | null;
  isAdmin: boolean;
  isBootstrapAdmin: boolean;
};

const navItems: Array<{ id: AdminSection; label: string; hint: string }> = [
  { id: "overview", label: "Overview", hint: "Today" },
  { id: "products", label: "Products", hint: "Catalog" },
  { id: "categories", label: "Categories", hint: "Organize" },
  { id: "orders", label: "Orders", hint: "Fulfilment" },
  { id: "shipping", label: "Shipping", hint: "Delivery rules" },
  { id: "payments", label: "Payments", hint: "Stripe" },
  { id: "users", label: "Users", hint: "Access" },
];

const productsStorageKey = "glam-me-admin-products-v4";
const legacyProductsStorageKey = "glam-me-admin-products-v3";
const initialProducts: Product[] = catalogProducts;

function withoutProductDetail(product: Product): Product {
  const cleanedProduct = { ...product } as Product & { detail?: unknown };
  delete cleanedProduct.detail;
  return {
    ...cleanedProduct,
    slug: createProductSlug(cleanedProduct.slug || cleanedProduct.name),
    price: formatCatalogPrice(cleanedProduct.price),
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
    const customProducts = parsed.filter((product) => !seededIds.has(product.id));
    return [...initialProducts, ...customProducts].map(withoutProductDetail);
  } catch {
    return initialProducts;
  }
}

function getStoredProducts() {
  try {
    const storedProducts = window.localStorage.getItem(productsStorageKey);
    if (!storedProducts) return getInitialProducts();
    const parsed = JSON.parse(storedProducts) as Product[];
    return Array.isArray(parsed) ? parsed.map(withoutProductDetail) : getInitialProducts();
  } catch {
    return getInitialProducts();
  }
}

const initialCategories: Category[] = catalogCategories.map((category) => ({ ...category }));

const initialOrders: Order[] = [
  { id: "#GM-1048", customer: "Lily Carter", date: "Today, 10:42", total: "£148.98", status: "Processing" },
  { id: "#GM-1047", customer: "Maya Patel", date: "Today, 09:18", total: "£89.99", status: "Shipped" },
  { id: "#GM-1046", customer: "Amelia Jones", date: "Yesterday", total: "£59.99", status: "Delivered" },
];

function parseOrderTotal(total: string) {
  const amount = Number.parseFloat(total.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function formatPounds(amount: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
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
      persist(resolvedValue);
      return resolvedValue;
    });
  };

  useEffect(() => {
    persist(value);
  }, [key, value]);

  return [value, setStoredValue] as const;
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
    price: "",
    stock: 0,
    status: "Draft",
    type: "Simple",
    description: "",
    sku: "",
    image: "",
    position: "50% 50%",
    variations: [],
  };
}

function blankCategory(): CategoryDraft {
  return { name: "", image: "", description: "" };
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

function ProductEditor({
  product,
  categories,
  onCancel,
  onSave,
}: {
  product?: Product;
  categories: string[];
  onCancel: () => void;
  onSave: (draft: ProductDraft) => void;
}) {
  const [draft, setDraft] = useState<ProductDraft>(() =>
    product
      ? {
           slug: product.slug || createProductSlug(product.name),
          name: product.name,
          category: product.category,
           price: getCatalogPriceInput(product.price),
          stock: product.stock,
          status: product.status,
          type: product.type,
          description: product.description,
          sku: product.sku,
           image: product.image,
           position: product.position,
           variations: product.variations.map((variation) => ({ ...variation, price: getCatalogPriceInput(variation.price) })),
        }
      : blankProduct(categories[0] ?? "Dresses"),
  );
  const [validationMessage, setValidationMessage] = useState("");
  const [productImageFileName, setProductImageFileName] = useState("");

  const publishLabel = product && draft.status === "Published" ? "Update product" : "Publish product";
  const totalVariationStock = draft.variations.reduce((total, variation) => total + variation.stock, 0);

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
    if (!draft.name.trim() || !formattedPrice) {
      setValidationMessage("Add a product name and a valid price before saving.");
      return;
    }
    if (draft.type === "Variable" && draft.variations.length === 0) {
      setValidationMessage("Add at least one variation or change the product type to Simple.");
      return;
    }
    onSave({
      ...draft,
      slug: createProductSlug(draft.slug || draft.name),
      name: draft.name.trim(),
      price: formattedPrice,
      status,
      variations: draft.type === "Variable" ? draft.variations.map((variation) => ({
        ...variation,
        price: formatCatalogPrice(variation.price) || formattedPrice,
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
            <div className="admin-card-heading"><div><p className="admin-eyebrow">Product details</p><h2>Tell the story</h2></div><span className="admin-required-note">* Required</span></div>
            <label className="admin-editor-label">Product name *
               <input className="admin-editor-input admin-editor-title-input" value={draft.name} onChange={(event) => updateProductName(event.target.value)} placeholder="e.g. Sienna Slip Dress" required />
            </label>
            <label className="admin-editor-label">Product slug
              <input className="admin-editor-input" value={draft.slug} onChange={(event) => updateDraft({ slug: event.target.value })} placeholder="sienna-slip-dress" />
              <small>Auto-generated from the product name. Edit it to change this product&apos;s storefront URL.</small>
            </label>
            <label className="admin-editor-label">Description
              <textarea className="admin-editor-input admin-editor-textarea" value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} placeholder="Describe the fit, feeling, and details customers should know." rows={5} />
            </label>
          </section>

          <section className="admin-editor-card">
            <div className="admin-card-heading"><div><p className="admin-eyebrow">Product data</p><h2>What are you selling?</h2></div></div>
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
              <label className="admin-editor-label">Regular price *
                <input className="admin-editor-input" type="number" min="0.01" step="0.01" value={draft.price} onChange={(event) => updateDraft({ price: event.target.value })} inputMode="decimal" placeholder="89.99" required />
              </label>
              <label className="admin-editor-label">Stock quantity
                <input className="admin-editor-input" type="number" min="0" value={draft.stock} onChange={(event) => updateDraft({ stock: Number(event.target.value) || 0 })} />
              </label>
            </div>
          </section>

          {draft.type === "Variable" && (
            <section className="admin-editor-card admin-variations-card">
              <div className="admin-card-heading">
                <div><p className="admin-eyebrow">Variable product</p><h2>Variations</h2><p className="admin-card-description">Add each purchasable combination of size, colour, price, and stock.</p></div>
                <button className="admin-secondary" type="button" onClick={addVariation}>+ Add variation</button>
              </div>
              {draft.variations.length === 0 ? (
                <div className="admin-empty-variations"><strong>No variations yet</strong><span>Add your first size and colour combination to make this product ready to sell.</span><button className="admin-primary" type="button" onClick={addVariation}>Add first variation</button></div>
              ) : (
                <div className="admin-variation-table">
                  <div className="admin-variation-table-head"><span>Size</span><span>Colour</span><span>Variation SKU</span><span>Price</span><span>Stock</span><span /></div>
                  {draft.variations.map((variation) => (
                    <div className="admin-variation-row" key={variation.id}>
                      <input aria-label="Variation size" value={variation.size} onChange={(event) => updateVariation(variation.id, { size: event.target.value })} placeholder="UK 8" />
                      <input aria-label="Variation colour" value={variation.colour} onChange={(event) => updateVariation(variation.id, { colour: event.target.value })} placeholder="Blush" />
                      <input aria-label="Variation SKU" value={variation.sku} onChange={(event) => updateVariation(variation.id, { sku: event.target.value })} placeholder="GM-001-8" />
                      <input aria-label="Variation price" type="number" min="0.01" step="0.01" value={variation.price} onChange={(event) => updateVariation(variation.id, { price: event.target.value })} inputMode="decimal" placeholder="89.99" />
                      <input aria-label="Variation stock" type="number" min="0" value={variation.stock} onChange={(event) => updateVariation(variation.id, { stock: Number(event.target.value) || 0 })} />
                      <button className="admin-remove-button" type="button" onClick={() => removeVariation(variation.id)} aria-label={`Remove ${variation.size || "variation"}`}>×</button>
                    </div>
                  ))}
                </div>
              )}
              {draft.variations.length > 0 && <p className="admin-variation-summary">{draft.variations.length} variation{draft.variations.length === 1 ? "" : "s"} · {totalVariationStock} units in stock</p>}
            </section>
          )}
        </div>

        <aside className="admin-editor-sidebar">
          <section className="admin-publish-card">
            <div className="admin-card-heading"><div><p className="admin-eyebrow">Publishing</p><h2>Product status</h2></div><span className={`admin-publish-dot ${draft.status.toLowerCase()}`} /></div>
            <label className="admin-editor-label">Status
              <select className="admin-editor-input" value={draft.status} onChange={(event) => updateDraft({ status: event.target.value as ProductStatus })}>
                <option value="Draft">Draft</option>
                <option value="Published">Published</option>
              </select>
            </label>
            <p className="admin-publish-help">{draft.status === "Published" ? "This product is visible on your storefront." : "This product is hidden until you publish it."}</p>
            <div className="admin-publish-actions">
              <button className="admin-secondary" type="button" onClick={() => save("Draft")}>Move to draft</button>
              <button className="admin-primary" type="button" onClick={() => save("Published")}>{publishLabel}</button>
            </div>
          </section>

          <section className="admin-editor-card admin-sidebar-card">
            <p className="admin-eyebrow">Organization</p>
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
               <label className="admin-upload-button">Upload image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleProductImageUpload} /></label>
               <span>{productImageFileName || "PNG, JPG, WEBP or GIF · max 4MB"}</span>
             </div>
           </section>

          <section className="admin-editor-card admin-sidebar-card">
            <p className="admin-eyebrow">Editor checklist</p>
            <ul className="admin-checklist">
              <li className={draft.name ? "is-complete" : ""}>Product name</li>
              <li className={draft.price ? "is-complete" : ""}>Price</li>
              <li className={draft.type === "Simple" || draft.variations.length > 0 ? "is-complete" : ""}>{draft.type === "Variable" ? "At least one variation" : "Stock quantity"}</li>
            </ul>
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
  const [section, setSection] = useState<AdminSection>("overview");
  const [products, setProducts] = useStoredState<Product[]>(productsStorageKey, getStoredProducts());
  const [categories, setCategories] = useStoredState<Category[]>("glam-me-admin-categories-v2", initialCategories);
  const [orders, setOrders] = useStoredState<Order[]>("glam-me-admin-orders", initialOrders);
  const [stripeStatus, setStripeStatus] = useState<StripeStatus>({ connected: false, configured: false, mode: "unknown", paymentMethods: [] });
  const [stripeStatusLoading, setStripeStatusLoading] = useState(true);
  const [stripeGuideOpen, setStripeGuideOpen] = useState(false);
  const [stripeCredentials, setStripeCredentials] = useState({ publishableKey: "", secretKey: "", webhookSecret: "" });
  const [stripeCredentialsSaving, setStripeCredentialsSaving] = useState(false);
  const [stripeCredentialsError, setStripeCredentialsError] = useState("");
  const [stripeCredentialsNotice, setStripeCredentialsNotice] = useState("");
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [editorProductId, setEditorProductId] = useState<number | "new" | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(blankCategory);
  const [categoryImageFileName, setCategoryImageFileName] = useState("");
  const [notice, setNotice] = useState("");
  const categoryNames = categories.map((category) => category.name);

  useEffect(() => {
    function handleStorageError(event: Event) {
      const storageKey = (event as CustomEvent<{ key?: string }>).detail?.key;
      if (storageKey === productsStorageKey) {
        setNotice("This product could not be saved in your browser. Please use a smaller image and try again.");
      }
    }
    window.addEventListener("glam-storage-error", handleStorageError);
    return () => window.removeEventListener("glam-storage-error", handleStorageError);
  }, []);

  const inventoryTotal = useMemo(
    () => products.reduce((total, product) => total + (product.type === "Variable" ? product.variations.reduce((sum, variation) => sum + variation.stock, 0) : product.stock), 0),
    [products],
  );
  const salesToday = orders.filter((order) => order.date.startsWith("Today")).reduce((total, order) => total + parseOrderTotal(order.total), 0);
  const salesYesterday = orders.filter((order) => order.date.startsWith("Yesterday")).reduce((total, order) => total + parseOrderTotal(order.total), 0);
  const salesChange = salesYesterday > 0 ? ((salesToday - salesYesterday) / salesYesterday) * 100 : null;
  const salesChangeLabel = salesChange === null
    ? "No sales recorded yesterday"
    : `${salesChange >= 0 ? "+" : ""}${salesChange.toFixed(1)}% from yesterday`;

  function openNewProduct() {
    setSection("products");
    setEditorProductId("new");
    setNotice("");
  }

  function getUniqueProductSlug(requestedSlug: string, productId?: number) {
    const baseSlug = createProductSlug(requestedSlug) || "glam-too-piece";
    let candidate = baseSlug;
    let suffix = 2;
    while (products.some((product) => product.id !== productId && product.slug === candidate)) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  function saveProduct(draft: ProductDraft) {
    const productId = typeof editorProductId === "number" ? editorProductId : undefined;
    const slug = getUniqueProductSlug(draft.slug || draft.name, productId);
    const savedDraft = { ...draft, slug };
    if (editorProductId === "new") {
      const newProduct: Product = { id: Date.now(), ...savedDraft };
      setProducts((current) => [newProduct, ...current]);
      setNotice(`${newProduct.name} was ${newProduct.status === "Published" ? "published" : "saved as a draft"}.`);
    } else if (typeof editorProductId === "number") {
      setProducts((current) => current.map((product) => product.id === editorProductId ? { id: product.id, ...savedDraft } : product));
      setNotice(`${savedDraft.name} was ${savedDraft.status === "Published" ? "updated and published" : "moved to draft"}.`);
    }
    setEditorProductId(null);
    setSection("products");
  }

  function removeProduct(product: Product) {
    setProducts((current) => current.filter((item) => item.id !== product.id));
    setNotice(`${product.name} was removed from the catalog.`);
  }

  function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = categoryDraft.name.trim();
    const description = categoryDraft.description.trim();
    if (!name) return;
    if (categories.some((category) => category.name.toLowerCase() === name.toLowerCase() && category.id !== editingCategoryId)) {
      setNotice(`${name} already exists.`);
      return;
    }
    if (editingCategoryId !== null) {
      setCategories((current) => current.map((category) => category.id === editingCategoryId ? { ...category, name, image: categoryDraft.image.trim(), description } : category));
      setNotice(`${name} category updated.`);
    } else {
      setCategories((current) => [...current, { id: Date.now(), name, image: categoryDraft.image.trim(), description }]);
      setNotice(`${name} category created.`);
    }
    setCategoryDraft(blankCategory());
    setEditingCategoryId(null);
  }

  function editCategory(category: Category) {
    setEditingCategoryId(category.id);
    setCategoryDraft({ name: category.name, image: category.image, description: category.description });
    setCategoryImageFileName("");
    setNotice("");
    setSection("categories");
  }

  function deleteCategory(category: Category) {
    setCategories((current) => current.filter((item) => item.id !== category.id));
    if (editingCategoryId === category.id) {
      setEditingCategoryId(null);
      setCategoryDraft(blankCategory());
      setCategoryImageFileName("");
    }
    setNotice(`${category.name} category deleted.`);
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

  function updateOrderStatus(orderId: string, status: Order["status"]) {
    setOrders((current) => current.map((order) => (order.id === orderId ? { ...order, status } : order)));
    setNotice(`${orderId} is now marked ${status.toLowerCase()}.`);
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

  useEffect(() => {
    void refreshStripeStatus();
  }, []);

  useEffect(() => {
    if (section === "users") void refreshUsers();
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
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/" aria-label="Return to Glam Too storefront">
          <img src="/logo.svg" alt="Glam Too" />
          <small>Commerce Studio</small>
        </a>
        <nav className="admin-nav" aria-label="Admin navigation">
          {navItems.map((item) => (
            <button type="button" key={item.id} className={section === item.id && editorProductId === null ? "is-active" : ""} onClick={() => { setSection(item.id); setEditorProductId(null); }}>
              <span>{item.label}</span><small>{item.hint}</small>
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
          <>
            <SectionTitle eyebrow="Glam Too administration" title="Good Morning" description="Your storefront is looking beautiful. Here’s what needs your attention today." action={<button className="admin-primary" type="button" onClick={openNewProduct}>Add a product</button>} />
            <div className="admin-stat-grid">
              <article><p>Sales today</p><strong>{formatPounds(salesToday)}</strong><span>{salesChangeLabel}</span></article>
              <article><p>Open orders</p><strong>{orders.filter((order) => order.status !== "Delivered").length}</strong><span>Ready for fulfilment</span></article>
              <article><p>Products in stock</p><strong>{inventoryTotal}</strong><span>Across {products.length} styles</span></article>
              <article><p>Average order</p><strong>£74.25</strong><span>Last 30 days</span></article>
            </div>
            <div className="admin-two-column">
              <section className="admin-panel"><div className="admin-panel-header"><div><p className="admin-eyebrow">Fulfilment</p><h2>Recent orders</h2></div><button type="button" onClick={() => setSection("orders")}>View all</button></div><div className="admin-list">{orders.map((order) => <div className="admin-order-row" key={order.id}><div><strong>{order.id}</strong><span>{order.customer} · {order.date}</span></div><div><strong>{order.total}</strong><span className={`order-status ${order.status.toLowerCase()}`}>{order.status}</span></div></div>)}</div></section>
              <section className="admin-panel admin-pink-panel"><p className="admin-eyebrow">Payments</p><h2>{stripeStatus.configured ? `Stripe ${stripeStatus.mode === "live" ? "live payments are ready" : "test mode is ready"}` : stripeStatus.connected ? "Stripe keys need setup" : "Stripe needs attention"}</h2><p>{stripeStatus.configured ? "Card payments can now use Stripe-hosted checkout." : stripeStatus.connected ? "Your Stripe connection is attached. Add its secure key configuration to activate card payments." : "Check your secure Stripe workspace connection to activate payments."}</p><button className="admin-quiet-button" type="button" onClick={() => setSection("payments")}>Open payment settings</button></section>
            </div>
          </>
        )}

        {section === "products" && editorProductId !== null && <ProductEditor product={editorProduct} categories={categoryNames} onCancel={() => setEditorProductId(null)} onSave={saveProduct} />}

        {section === "products" && editorProductId === null && (
          <>
            <SectionTitle eyebrow="Catalog" title="Products" description="Create, edit, publish, or move products back to draft from one product workspace." action={<button className="admin-primary" type="button" onClick={openNewProduct}>Add product</button>} />
            <section className="admin-panel admin-product-catalog-panel">
              <div className="admin-product-catalog-heading">
                <div><p className="admin-eyebrow">The Glam Edit</p><h2>Our Current Obsessions</h2></div>
                <span className="admin-muted-count">{products.length} products</span>
              </div>
              <div className="admin-product-catalog-grid">
                {products.map((product) => (
                  <article className="admin-product-catalog-card" key={product.id} data-testid={`admin-card-product-${product.id}`}>
                    <div className="admin-product-catalog-image">
                      {product.image ? <img src={product.image} alt={`${product.name} product preview`} /> : <div className="admin-image-placeholder">Add product media</div>}
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
                      {category.image ? <img src={category.image} alt="" /> : <div className="admin-category-image-empty">No image</div>}
                      <div className="admin-category-card-content">
                        <h3>{category.name}</h3>
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
                <label>Category title<input value={categoryDraft.name} onChange={(event) => setCategoryDraft((current) => ({ ...current, name: event.target.value }))} required placeholder="e.g. Weekend plans" /></label>
                <label>Image URL<input type="url" value={categoryDraft.image.startsWith("data:") ? "" : categoryDraft.image} onChange={(event) => { setCategoryImageFileName(""); setCategoryDraft((current) => ({ ...current, image: event.target.value })); }} placeholder="https://..." /></label>
                <div className="admin-image-upload">
                  <label className="admin-upload-button">Upload image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleCategoryImageUpload} /></label>
                  <span>{categoryImageFileName || "PNG, JPG, WEBP or GIF · max 4MB"}</span>
                </div>
                {categoryDraft.image && <img className="admin-category-form-preview" src={categoryDraft.image} alt="Category preview" />}
                <label>Description<textarea value={categoryDraft.description} onChange={(event) => setCategoryDraft((current) => ({ ...current, description: event.target.value }))} placeholder="A short description for this collection." rows={4} /></label>
                <div className="admin-category-form-actions"><button className="admin-primary" type="submit">{editingCategoryId !== null ? "Update category" : "Create category"}</button>{editingCategoryId !== null && <button className="admin-secondary" type="button" onClick={cancelCategoryEdit}>Cancel</button>}</div>
              </form>
            </div>
          </>
        )}

        {section === "orders" && (
          <>
            <SectionTitle eyebrow="Fulfilment" title="Orders" description="Track customer purchases and move each order through delivery." />
            <section className="admin-panel admin-table-panel"><div className="admin-table"><div className="admin-table-head admin-order-table-head"><span>Order</span><span>Customer</span><span>Date</span><span>Total</span><span>Status</span></div>{orders.map((order) => <div className="admin-table-row admin-order-table-row" key={order.id}><strong>{order.id}</strong><span>{order.customer}</span><span>{order.date}</span><span>{order.total}</span><select value={order.status} onChange={(event) => updateOrderStatus(order.id, event.target.value as Order["status"])} aria-label={`Update ${order.id} status`}><option>Processing</option><option>Shipped</option><option>Delivered</option></select></div>)}</div></section>
          </>
        )}

        {section === "shipping" && (
          <>
            <SectionTitle eyebrow="Store settings" title="Shipping" description="Set delivery methods, rates, and your free-shipping threshold." />
            <form className="admin-shipping-grid" onSubmit={(event) => { event.preventDefault(); setNotice("Shipping settings saved."); }}><section className="admin-panel admin-simple-form"><p className="admin-eyebrow">Standard delivery</p><h2>UK Standard</h2><label>Rate<input defaultValue="£3.99" /></label><label>Estimated delivery<input defaultValue="3–5 working days" /></label></section><section className="admin-panel admin-simple-form"><p className="admin-eyebrow">Free shipping</p><h2>Delivery incentive</h2><label>Free shipping over<input defaultValue="£75.00" /></label><label>Announcement text<input defaultValue="Free delivery on orders over £75" /></label></section><button className="admin-primary" type="submit">Save shipping rules</button></form>
          </>
        )}

        {section === "users" && (
          <>
            <SectionTitle eyebrow="Private studio" title="Users & access" description="Review all customer accounts and grant admin access manually. Passwords and private account data are never shown here." action={<button className="admin-secondary" type="button" onClick={() => void refreshUsers()} disabled={usersLoading}>{usersLoading ? "Refreshing…" : "Refresh users"}</button>} />
            <section className="admin-panel admin-users-panel">
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
                        <div className="admin-user-actions"><span className="admin-role-badge">{user.isBootstrapAdmin ? "Primary owner" : "Admin"}</span>{user.isBootstrapAdmin ? <small>Protected</small> : <button type="button" className="admin-secondary" disabled={updatingUserId === user.id} onClick={() => void updateUserAccess(user, false)}>{updatingUserId === user.id ? "Updating…" : "Remove admin"}</button>}</div>
                      </article>
                    ))}
                  </section>
                  <section className="admin-user-group">
                    <div className="admin-user-group-heading"><div><p className="admin-eyebrow">Customer accounts</p><h2>Customers</h2></div><span>{customerUsers.length}</span></div>
                    {customerUsers.length === 0 ? <p className="admin-users-state">No customer accounts match this search.</p> : customerUsers.map((user) => (
                      <article className="admin-user-card" key={user.id}>
                        <div className="admin-user-avatar customer" aria-hidden="true">{user.name.charAt(0).toUpperCase()}</div>
                        <div className="admin-user-details"><strong>{user.name}</strong><span>{user.email}</span><small>Joined {formatUserDate(user.createdAt)} · Last sign-in {formatUserDate(user.lastSignInAt)}</small></div>
                        <div className="admin-user-actions"><span className="admin-role-badge customer">Customer</span><button type="button" className="admin-primary" disabled={updatingUserId === user.id} onClick={() => void updateUserAccess(user, true)}>{updatingUserId === user.id ? "Updating…" : "Make admin"}</button></div>
                      </article>
                    ))}
                  </section>
                </div>
              )}
            </section>
          </>
        )}

        {section === "payments" && (
          <>
            <SectionTitle eyebrow="Store settings" title="Payments" description="Secure payment processing and transaction reporting for Glam Too." />
            <section className="admin-payment-card"><div><span className="stripe-mark">stripe</span><h2>{stripeStatus.configured ? "Stripe checkout is connected" : stripeStatus.connected ? "Add Stripe key configuration" : "Connect Stripe to accept payments"}</h2><p>{stripeStatus.configured ? "Your keys are held by the secure workspace connection. Customers are sent to Stripe’s hosted checkout to pay by card." : stripeStatus.connected ? "Your Stripe connection is attached, but its secure secret key is not configured yet." : "Stripe is not ready yet. Check the secure workspace integration for your publishable and secret key setup."}</p></div><div className="admin-payment-status"><strong>Connection status</strong><span>{stripeStatusLoading ? "Checking…" : stripeStatus.configured ? `${stripeStatus.mode === "live" ? "Live" : "Test"} mode connected` : stripeStatus.connected ? "Key setup needed" : "Not connected"}</span></div></section>
            <section className="admin-panel admin-payment-next admin-payment-settings"><p className="admin-eyebrow">Stripe details</p><h2>Payment setup</h2><div className="admin-payment-detail-grid"><div><span>Environment</span><strong>{stripeStatus.configured ? `${stripeStatus.mode === "live" ? "Live" : "Test"} mode` : stripeStatus.connected ? "Awaiting secure keys" : "Not configured"}</strong></div><div><span>Publishable key</span><strong>{stripeStatus.publishableKeyConfigured ? "Connected securely" : "Managed by Stripe connection"}</strong></div><div><span>Secret key</span><strong>{stripeStatus.configured ? "Stored server-side" : stripeStatus.connected ? "Add in workspace connection" : "Not configured"}</strong></div><div><span>Payment methods</span><strong>{stripeStatus.paymentMethods.length ? stripeStatus.paymentMethods.join(", ") : "Card payments pending"}</strong></div></div>{stripeStatus.error && <p className="admin-payment-error" role="alert">{stripeStatus.error}</p>}<div className="admin-payment-actions"><button className="admin-primary" type="button" onClick={() => void refreshStripeStatus()} disabled={stripeStatusLoading}>{stripeStatusLoading ? "Checking Stripe…" : "Refresh Stripe details"}</button><button className="admin-secondary" type="button" onClick={() => setStripeGuideOpen((open) => !open)} aria-expanded={stripeGuideOpen}>{stripeGuideOpen ? "Hide key options" : "Manage Stripe keys"}</button></div><p>For safety, keys are never copied into this browser or saved in local storage. Update test or live keys in the secure Stripe workspace connection; this page will show the updated status after refresh.</p></section>
            {stripeGuideOpen && <section className="admin-panel admin-stripe-guide" aria-label="Manage Stripe keys"><div><p className="admin-eyebrow">Admin payment controls</p><h2>Add or replace Stripe keys</h2><p>Save keys directly from this protected admin page. The secret is encrypted on the server, never shown after saving, and never stored in your browser.</p></div><form className="admin-stripe-credentials-form" onSubmit={saveStripeCredentials}><label>Publishable key<input type="text" autoComplete="off" value={stripeCredentials.publishableKey} onChange={(event) => setStripeCredentials((current) => ({ ...current, publishableKey: event.target.value }))} placeholder={stripeStatus.publishableKeyConfigured ? "Leave blank to keep the saved publishable key" : "pk_test_… or pk_live_…"} /></label><label>Secret key<input type="password" autoComplete="new-password" value={stripeCredentials.secretKey} onChange={(event) => setStripeCredentials((current) => ({ ...current, secretKey: event.target.value }))} placeholder={stripeStatus.configured && stripeStatus.source === "admin" ? "Leave blank to keep the saved secret key" : "sk_test_… or sk_live_…"} /></label><label>Webhook signing secret <span>Optional</span><input type="password" autoComplete="new-password" value={stripeCredentials.webhookSecret} onChange={(event) => setStripeCredentials((current) => ({ ...current, webhookSecret: event.target.value }))} placeholder={stripeStatus.webhookSecretConfigured ? "Leave blank to keep the saved webhook secret" : "whsec_…"} /></label><p className="admin-stripe-form-note">Use matching test or live publishable and secret keys. A newly entered secret key is verified with Stripe before it is saved.</p>{stripeCredentialsError && <p className="admin-payment-error" role="alert">{stripeCredentialsError}</p>}{stripeCredentialsNotice && <p className="admin-stripe-success" role="status">{stripeCredentialsNotice}</p>}<div className="admin-payment-actions"><button className="admin-primary" type="submit" disabled={stripeCredentialsSaving}>{stripeCredentialsSaving ? "Saving securely…" : "Update Stripe keys"}</button>{stripeStatus.source === "admin" && <button className="admin-danger-button" type="button" onClick={() => void clearStripeCredentials()} disabled={stripeCredentialsSaving}>Disconnect saved keys</button>}</div></form><div className="admin-stripe-key-options"><article><span className="admin-stripe-option-label">Test mode</span><h3>Test API keys</h3><p>Use sandbox payments while you confirm checkout, webhooks, and order handling.</p><a className="admin-secondary" href="https://dashboard.stripe.com/test/apikeys" target="_blank" rel="noreferrer">Open test keys <span aria-hidden="true">↗</span></a></article><article><span className="admin-stripe-option-label">Live mode</span><h3>Live API keys</h3><p>Connect live keys only when your store is ready to accept real customer payments.</p><a className="admin-secondary" href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noreferrer">Open live keys <span aria-hidden="true">↗</span></a></article></div></section>}
            <section className="admin-panel admin-payment-how"><p className="admin-eyebrow">How payments work</p><h2>From checkout to confirmation</h2><ol><li>Customers complete checkout and are sent to Stripe-hosted payment.</li><li>Stripe confirms the payment securely and sends the order result back to Glam Too.</li><li>Keep the webhook signing secret updated when you configure webhooks for live payments.</li></ol></section>
          </>
        )}
      </main>
    </div>
  );
}