const ALLOWED_TAGS = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI"]);

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
    [...element.attributes].forEach((attribute) => element.removeAttribute(attribute.name));
  };
  clean(root);
  return root.innerHTML;
}

export function hasRichTextContent(value: string) {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return Boolean(value.trim());
  const document = new DOMParser().parseFromString(value, "text/html");
  return Boolean(document.body.textContent?.trim());
}