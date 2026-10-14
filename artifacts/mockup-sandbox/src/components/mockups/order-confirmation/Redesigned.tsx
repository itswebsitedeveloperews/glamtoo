import "./_original.css";
import OrderConfirmationView, { type OrderReceipt } from "../../../../../glam-me/src/components/OrderConfirmationView";

const sample: OrderReceipt = {
  id: "GM-SAMPLE-0001", placedAt: null, status: "paid", total: 58.5, currency: "GBP",
  email: "sample@example.com", subtotal: 52.5, deliveryAmount: 6,
  accountCreation: "created",
  delivery: { method: "standard", name: "Sample Recipient", address: { line1: "1 Sample Street", line2: "", city: "London", postcode: "AB1 2CD", country: "GB" } },
  items: [{ name: "Sample scarf", productId: null, quantity: 1, total: 28 }, { name: "Sample earrings", productId: null, quantity: 1, total: 24.5 }],
};

export function Redesigned() {
  return <div className="ocv-preview"><OrderConfirmationView state="confirmed" order={sample} isSignedIn={false} error="" onRetry={() => {}} /></div>;
}
export default Redesigned;
