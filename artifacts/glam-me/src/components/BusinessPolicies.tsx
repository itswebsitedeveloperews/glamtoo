import { useContext, useEffect, useState } from "react";
import { useShippingMethods } from "../hooks/use-shipping-methods";
import { hasRichTextContent, sanitizeRichTextHtml } from "../utils/rich-text";
import { PublicSnapshotContext } from "../data/public-snapshot";

const pounds = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);

export function DeliveryPolicy() {
  const { shippingMethods, shippingMethodsLoading, shippingMethodsError } = useShippingMethods();
  if (shippingMethodsLoading) return <p role="status">Loading delivery information…</p>;
  if (shippingMethodsError || !shippingMethods.length) return <p>Delivery information is currently unavailable. <a href="/contact">Contact us</a> before ordering.</p>;
  return <div className="policy-table-wrap"><table className="delivery-information-table">
    <thead><tr><th scope="col">Delivery option</th><th scope="col">Information</th><th scope="col">Cost</th></tr></thead>
    <tbody>{shippingMethods.map((method) => <tr key={method.id}>
      <th scope="row">{method.name}</th><td>{method.description || "Contact us for delivery details."}{method.freeOver !== null && method.freeOver !== undefined && <span className="delivery-free-threshold">Free on orders of {pounds(method.freeOver)} or more</span>}</td>
      <td>{pounds(method.price)}</td>
    </tr>)}</tbody>
  </table></div>;
}

export function ReturnPolicy() {
  const snapshot = useContext(PublicSnapshotContext);
  const [content, setContent] = useState(snapshot?.returnInformation ?? "");
  const [loading, setLoading] = useState(snapshot?.returnInformation === undefined);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/return-information`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Return information unavailable");
        const payload = await response.json();
        if (typeof payload.content !== "string") throw new Error("Invalid return information");
        setContent(payload.content);
      })
      .catch(() => { if (!controller.signal.aborted) setContent(""); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  if (loading) return <p role="status">Loading return information…</p>;
  return hasRichTextContent(content)
    ? <div className="detail-rich-text" dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(content) }} />
    : <p>Return information is currently unavailable. <a href="/contact">Contact us</a> for the current policy.</p>;
}

export default function BusinessPolicies() {
  return <section className="business-policies" aria-label="Delivery and returns">
    <h2>Delivery</h2><DeliveryPolicy />
    <h2>Returns</h2><ReturnPolicy />
  </section>;
}
