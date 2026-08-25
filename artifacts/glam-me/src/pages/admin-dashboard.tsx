import { FormEvent, useMemo, useState } from "react";

type AdminSection =
  | "overview"
  | "products"
  | "categories"
  | "variations"
  | "orders"
  | "shipping"
  | "payments";

type Product = {
  id: number;
  name: string;
  category: string;
  price: string;
  stock: number;
  status: "Active" | "Draft";
};

type Order = {
  id: string;
  customer: string;
  date: string;
  total: string;
  status: "Processing" | "Shipped" | "Delivered";
};

const navItems: Array<{ id: AdminSection; label: string; hint: string }> = [
  { id: "overview", label: "Overview", hint: "Today" },
  { id: "products", label: "Products", hint: "Catalog" },
  { id: "categories", label: "Categories", hint: "Organize" },
  { id: "variations", label: "Variations", hint: "Sizes & colours" },
  { id: "orders", label: "Orders", hint: "Fulfilment" },
  { id: "shipping", label: "Shipping", hint: "Delivery rules" },
  { id: "payments", label: "Payments", hint: "Stripe" },
];

const initialProducts: Product[] = [
  { id: 1, name: "Luna Ruffle Mini Dress", category: "Dresses", price: "£89.99", stock: 14, status: "Active" },
  { id: 2, name: "Ella Tailored Jumpsuit", category: "Co-Ords", price: "£59.99", stock: 8, status: "Active" },
  { id: 3, name: "Mila Satin Maxi Dress", category: "Occasion", price: "£44.99", stock: 0, status: "Draft" },
];

const initialOrders: Order[] = [
  { id: "#GM-1048", customer: "Lily Carter", date: "Today, 10:42", total: "£148.98", status: "Processing" },
  { id: "#GM-1047", customer: "Maya Patel", date: "Today, 09:18", total: "£89.99", status: "Shipped" },
  { id: "#GM-1046", customer: "Amelia Jones", date: "Yesterday", total: "£59.99", status: "Delivered" },
];

function SectionTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
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

export default function AdminDashboard({
  onSignOut,
}: {
  onSignOut: () => void;
}) {
  const [section, setSection] = useState<AdminSection>("overview");
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [categories, setCategories] = useState(["Dresses", "Occasion", "Co-Ords", "Denim", "Accessories"]);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [showProductForm, setShowProductForm] = useState(false);
  const [notice, setNotice] = useState("");

  const inventoryTotal = useMemo(
    () => products.reduce((total, product) => total + product.stock, 0),
    [products],
  );

  function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get("name") ?? "").trim();
    const category = String(fields.get("category") ?? categories[0]);
    const price = String(fields.get("price") ?? "").trim();
    const stock = Number(fields.get("stock") ?? 0);
    if (!name || !price) return;
    setProducts((current) => [
      { id: Date.now(), name, category, price: price.startsWith("£") ? price : `£${price}`, stock, status: "Active" },
      ...current,
    ]);
    setShowProductForm(false);
    setNotice(`${name} was added to your catalog.`);
  }

  function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = new FormData(event.currentTarget).get("category");
    const category = String(field ?? "").trim();
    if (!category || categories.includes(category)) return;
    setCategories((current) => [...current, category]);
    event.currentTarget.reset();
    setNotice(`${category} category created.`);
  }

  function updateOrderStatus(orderId: string, status: Order["status"]) {
    setOrders((current) =>
      current.map((order) => (order.id === orderId ? { ...order, status } : order)),
    );
    setNotice(`${orderId} is now marked ${status.toLowerCase()}.`);
  }

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/" aria-label="Return to Glam Me storefront">
          <img src="/logo.svg" alt="Glam Me" />
          <small>Commerce Studio</small>
        </a>
        <nav className="admin-nav" aria-label="Admin navigation">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={section === item.id ? "is-active" : ""}
              onClick={() => setSection(item.id)}
            >
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <a href="/" className="admin-store-link">View storefront ↗</a>
          <button type="button" className="admin-signout" onClick={onSignOut}>Sign out</button>
        </div>
      </aside>

      <main className="admin-main">
        {notice && (
          <div className="admin-notice" role="status">
            <span>{notice}</span>
            <button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button>
          </div>
        )}

        {section === "overview" && (
          <>
            <SectionTitle
              eyebrow="Glam Me administration"
              title="Good morning"
              description="Your storefront is looking beautiful. Here’s what needs your attention today."
              action={<button className="admin-primary" type="button" onClick={() => setSection("products")}>Add a product</button>}
            />
            <div className="admin-stat-grid">
              <article><p>Sales today</p><strong>£1,284.00</strong><span>+18.4% from yesterday</span></article>
              <article><p>Open orders</p><strong>{orders.filter((order) => order.status !== "Delivered").length}</strong><span>Ready for fulfilment</span></article>
              <article><p>Products in stock</p><strong>{inventoryTotal}</strong><span>Across {products.length} styles</span></article>
              <article><p>Average order</p><strong>£74.25</strong><span>Last 30 days</span></article>
            </div>
            <div className="admin-two-column">
              <section className="admin-panel">
                <div className="admin-panel-header"><div><p className="admin-eyebrow">Fulfilment</p><h2>Recent orders</h2></div><button type="button" onClick={() => setSection("orders")}>View all</button></div>
                <div className="admin-list">
                  {orders.map((order) => (
                    <div className="admin-order-row" key={order.id}>
                      <div><strong>{order.id}</strong><span>{order.customer} · {order.date}</span></div>
                      <div><strong>{order.total}</strong><span className={`order-status ${order.status.toLowerCase()}`}>{order.status}</span></div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="admin-panel admin-pink-panel">
                <p className="admin-eyebrow">Payments</p>
                <h2>Stripe is not connected</h2>
                <p>Connect Stripe through your secure workspace integration to activate card payments, refunds, and payment reporting.</p>
                <button className="admin-quiet-button" type="button" onClick={() => setSection("payments")}>Open payment settings</button>
              </section>
            </div>
          </>
        )}

        {section === "products" && (
          <>
            <SectionTitle
              eyebrow="Catalog"
              title="Products"
              description="Create, edit, or remove the pieces customers see in your Glam Me store."
              action={<button className="admin-primary" type="button" onClick={() => setShowProductForm((shown) => !shown)}>{showProductForm ? "Close form" : "Add product"}</button>}
            />
            {showProductForm && (
              <form className="admin-product-form" onSubmit={addProduct}>
                <label>Product name<input name="name" required placeholder="e.g. Sienna Slip Dress" /></label>
                <label>Category<select name="category">{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
                <label>Price<input name="price" required inputMode="decimal" placeholder="89.99" /></label>
                <label>Stock<input name="stock" required type="number" min="0" defaultValue="1" /></label>
                <button className="admin-primary" type="submit">Save product</button>
              </form>
            )}
            <section className="admin-panel admin-table-panel">
              <div className="admin-table">
                <div className="admin-table-head"><span>Product</span><span>Category</span><span>Price</span><span>Stock</span><span>Status</span><span /></div>
                {products.map((product) => (
                  <div className="admin-table-row" key={product.id}>
                    <strong>{product.name}</strong><span>{product.category}</span><span>{product.price}</span><span>{product.stock}</span><span className={`product-status ${product.status.toLowerCase()}`}>{product.status}</span>
                    <button type="button" onClick={() => { setProducts((current) => current.filter((item) => item.id !== product.id)); setNotice(`${product.name} was removed.`); }}>Remove</button>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {section === "categories" && (
          <>
            <SectionTitle eyebrow="Catalog structure" title="Categories" description="Organize your collection so customers can shop every moment with ease." />
            <div className="admin-two-column">
              <section className="admin-panel">
                <h2>Existing categories</h2>
                <div className="admin-chip-list">{categories.map((category) => <span key={category}>{category}<button type="button" aria-label={`Remove ${category}`} onClick={() => setCategories((current) => current.filter((item) => item !== category))}>×</button></span>)}</div>
              </section>
              <form className="admin-panel admin-simple-form" onSubmit={addCategory}>
                <p className="admin-eyebrow">New category</p><h2>Add a collection</h2>
                <label>Category name<input name="category" required placeholder="e.g. Weekend plans" /></label>
                <button className="admin-primary" type="submit">Create category</button>
              </form>
            </div>
          </>
        )}

        {section === "variations" && (
          <>
            <SectionTitle eyebrow="Catalog structure" title="Variations" description="Set the sizes, colours, and stock options attached to each product." />
            <section className="admin-panel">
              <div className="admin-variation-layout">
                <div><p className="admin-eyebrow">Product</p><select aria-label="Select product">{products.map((product) => <option key={product.id}>{product.name}</option>)}</select></div>
                <div><p className="admin-eyebrow">Options</p><div className="admin-chip-list"><span>Size: UK 6 <button type="button">×</button></span><span>Size: UK 8 <button type="button">×</button></span><span>Colour: Blush <button type="button">×</button></span></div></div>
                <button className="admin-primary" type="button" onClick={() => setNotice("Variation editor saved for the selected product.")}>Save variations</button>
              </div>
            </section>
          </>
        )}

        {section === "orders" && (
          <>
            <SectionTitle eyebrow="Fulfilment" title="Orders" description="Track customer purchases and move each order through delivery." />
            <section className="admin-panel admin-table-panel">
              <div className="admin-table">
                <div className="admin-table-head"><span>Order</span><span>Customer</span><span>Date</span><span>Total</span><span>Status</span></div>
                {orders.map((order) => (
                  <div className="admin-table-row admin-order-table-row" key={order.id}>
                    <strong>{order.id}</strong><span>{order.customer}</span><span>{order.date}</span><span>{order.total}</span>
                    <select value={order.status} onChange={(event) => updateOrderStatus(order.id, event.target.value as Order["status"])} aria-label={`Update ${order.id} status`}>
                      <option>Processing</option><option>Shipped</option><option>Delivered</option>
                    </select>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {section === "shipping" && (
          <>
            <SectionTitle eyebrow="Store settings" title="Shipping" description="Set delivery methods, rates, and your free-shipping threshold." />
            <form className="admin-shipping-grid" onSubmit={(event) => { event.preventDefault(); setNotice("Shipping settings saved."); }}>
              <section className="admin-panel admin-simple-form"><p className="admin-eyebrow">Standard delivery</p><h2>UK Standard</h2><label>Rate<input defaultValue="£3.99" /></label><label>Estimated delivery<input defaultValue="3–5 working days" /></label></section>
              <section className="admin-panel admin-simple-form"><p className="admin-eyebrow">Free shipping</p><h2>Delivery incentive</h2><label>Free shipping over<input defaultValue="£75.00" /></label><label>Announcement text<input defaultValue="Free delivery on orders over £75" /></label></section>
              <button className="admin-primary" type="submit">Save shipping rules</button>
            </form>
          </>
        )}

        {section === "payments" && (
          <>
            <SectionTitle eyebrow="Store settings" title="Payments" description="Secure payment processing and transaction reporting for Glam Me." />
            <section className="admin-payment-card">
              <div><span className="stripe-mark">stripe</span><h2>Connect Stripe to accept payments</h2><p>Stripe has not been authorized for this workspace. For security, payment keys are never entered or stored inside the storefront admin.</p></div>
              <div className="admin-payment-status"><strong>Connection status</strong><span>Not connected</span></div>
            </section>
            <section className="admin-panel admin-payment-next">
              <p className="admin-eyebrow">Next step</p>
              <h2>Connect through the workspace integration</h2>
              <p>Once Stripe is authorized, this page will show live payment activity, refunds, customer records, and connected checkout settings.</p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}