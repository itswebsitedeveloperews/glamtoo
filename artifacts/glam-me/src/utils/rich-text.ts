const ALLOWED_TAGS = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "A"]);

function isSafeHref(value: string) {
  const href = value.trim();
  return href.startsWith("/")
    || href.startsWith("#")
    || href.startsWith("https://")
    || href.startsWith("http://")
    || href.startsWith("mailto:");
}

export function sanitizeRichTextHtml(value: string) {
  if (typeof DOMParser === "undefined") throw new Error("HTML parser unavailable");
  const document = new DOMParser().parseFromString(`<html><body><div>${value}</div></body></html>`, "text/html");
  const root = document.body.firstElementChild;
  if (!root) return "";

  const clean = (element: Element) => {
    [...element.children].forEach((child) => {
      clean(child);
      if (!ALLOWED_TAGS.has(child.tagName)) child.replaceWith(...child.childNodes);
    });
    const href = element.tagName === "A" ? element.getAttribute("href") ?? "" : "";
    [...element.attributes].forEach((attribute) => element.removeAttribute(attribute.name));
    if (element.tagName === "A" && isSafeHref(href)) {
      element.setAttribute("href", href.trim());
      element.setAttribute("rel", "noopener noreferrer");
    } else if (element.tagName === "A") {
      element.replaceWith(...element.childNodes);
    }
  };
  clean(root);
  // Native DOM and the server DOM serialize attribute insertion order
  // differently. Emit a deterministic allowlisted representation on both sides
  // so identical content also hydrates without an innerHTML mismatch.
  const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\u00a0/g, "&nbsp;");
  const serialize = (node: Node): string => {
    if (node.nodeType === 3) return escapeText(node.textContent ?? "");
    if (node.nodeType !== 1) return "";
    const element = node as Element;
    const tag = element.tagName.toLowerCase();
    if (tag === "br") return "<br>";
    const href = element.getAttribute("href");
    const attributes = tag === "a" && href !== null
      ? ` href="${escapeText(href).replace(/"/g, "&quot;")}" rel="noopener noreferrer"` : "";
    return `<${tag}${attributes}>${[...element.childNodes].map(serialize).join("")}</${tag}>`;
  };
  return [...root.childNodes].map(serialize).join("");
}

export function hasRichTextContent(value: string) {
  if (typeof DOMParser === "undefined") throw new Error("HTML parser unavailable");
  const document = new DOMParser().parseFromString(`<html><body>${value}</body></html>`, "text/html");
  return Boolean(document.body.textContent?.trim());
}