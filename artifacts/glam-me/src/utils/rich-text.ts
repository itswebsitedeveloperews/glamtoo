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
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return value;
  const document = new DOMParser().parseFromString(`<div>${value}</div>`, "text/html");
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
  return root.innerHTML;
}

export function hasRichTextContent(value: string) {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return Boolean(value.trim());
  const document = new DOMParser().parseFromString(value, "text/html");
  return Boolean(document.body.textContent?.trim());
}