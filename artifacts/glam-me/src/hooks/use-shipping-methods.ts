import { useEffect, useState } from "react";
import type { ShippingMethod } from "@workspace/shipping";

export function useShippingMethods() {
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [shippingMethodsLoading, setShippingMethodsLoading] = useState(true);
  const [shippingMethodsError, setShippingMethodsError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/shipping-methods`, {
      credentials: "include", cache: "no-store", signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Delivery options could not be loaded. Please refresh to try again.")))
      .then((result: { shippingMethods?: ShippingMethod[] }) => {
        if (!Array.isArray(result.shippingMethods)) throw new Error("Delivery options could not be loaded. Please refresh to try again.");
        setShippingMethods(result.shippingMethods.filter((method) => method.enabled));
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setShippingMethodsError(error instanceof Error ? error.message : "Delivery options could not be loaded.");
      })
      .finally(() => { if (!controller.signal.aborted) setShippingMethodsLoading(false); });
    return () => controller.abort();
  }, []);
  return { shippingMethods, shippingMethodsLoading, shippingMethodsError };
}
