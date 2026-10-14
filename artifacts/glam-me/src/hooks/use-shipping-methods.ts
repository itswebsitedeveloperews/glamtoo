import { useContext, useEffect, useState } from "react";
import type { ShippingMethod } from "@workspace/shipping";
import { PublicSnapshotContext } from "../data/public-snapshot";

export function useShippingMethods() {
  const snapshot = useContext(PublicSnapshotContext);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>(snapshot?.shippingMethods?.filter(method => method.enabled) ?? []);
  const [shippingMethodsLoading, setShippingMethodsLoading] = useState(snapshot?.shippingMethods === undefined);
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
