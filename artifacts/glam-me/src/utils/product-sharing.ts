export type ProductShareData = { title: string; url: string; image?: string };

/** Never substitute window.location: preview addresses must not be shared. */
export function publicShareUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || url.port
      || !host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":")
      || /(?:^|\.)(?:localhost|local|localdomain|internal|test|invalid|replit\.dev|repl\.co)$/.test(host)) return null;
    return url;
  } catch { return null; }
}

export function resolveProductShare(metadata: unknown, title: string, productPath: string): ProductShareData {
  const data = metadata as { status?: number; type?: string; canonicalUrl?: string; image?: string } | null;
  const url = publicShareUrl(data?.canonicalUrl);
  if (data?.status !== 200 || data.type !== "product" || !url || url.pathname !== productPath
    || url.search || url.hash || !title.trim()) throw new Error("The public sharing link is temporarily unavailable.");
  const image = publicShareUrl(data.image);
  return { title, url: url.href, ...(image ? { image: image.href } : {}) };
}

export function productShareLinks(data: ProductShareData) {
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: data.url, quote: data.title })}`,
    whatsapp: `https://wa.me/?${new URLSearchParams({ text: `${data.title}\n${data.url}` })}`,
    pinterest: data.image ? `https://www.pinterest.com/pin/create/button/?${new URLSearchParams({
      url: data.url, media: data.image, description: data.title,
    })}` : undefined,
  };
}

type NativeShare = { share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean };
export async function copyProductShareLink(data: ProductShareData, clipboard?: Pick<Clipboard, "writeText">) {
  if (!clipboard?.writeText) throw new Error("Clipboard unavailable");
  await clipboard.writeText(data.url);
}

export async function nativeProductShare(data: ProductShareData, device: NativeShare): Promise<"shared" | "cancelled" | "fallback"> {
  const payload = { title: data.title, text: data.title, url: data.url };
  try {
    if (!device.share || (device.canShare && !device.canShare(payload))) return "fallback";
    await device.share(payload);
    return "shared";
  } catch (error) {
    return error instanceof Error && error.name === "AbortError" ? "cancelled" : "fallback";
  }
}
