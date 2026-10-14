import { useLayoutEffect, type RefObject } from "react";

export function useMobileMenu(open: boolean, close: () => void, menu: RefObject<HTMLElement | null>, trigger: RefObject<HTMLButtonElement | null>) {
  useLayoutEffect(() => {
    if (!open || !menu.current) return;
    const panel = menu.current;
    const originalOverflow = document.body.style.overflow;
    const background = new Map<HTMLElement, boolean>();
    // Inert each sibling along the ancestor chain, not the dialog's own ancestor.
    const makeBackgroundInert = () => {
      for (let current: HTMLElement | null = panel; current?.parentElement; current = current.parentElement) {
        for (const sibling of current.parentElement.children) {
          if (sibling instanceof HTMLElement && sibling !== current && !sibling.classList.contains("nav-overlay")) {
            if (!background.has(sibling)) background.set(sibling, sibling.inert);
            sibling.inert = true;
          }
        }
      }
    };
    makeBackgroundInert();
    // Catalog refresh notices and other new background regions must also stay inaccessible.
    const backgroundObserver = new MutationObserver(makeBackgroundInert);
    backgroundObserver.observe(document.body, { childList: true, subtree: true });
    document.body.style.overflow = "hidden";
    const focusable = () => [...panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]')]
      .filter((element) => element.getClientRects().length > 0);
    (focusable()[0] ?? panel).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key === "Tab") {
        const items = focusable();
        const first = items[0] ?? panel;
        const last = items.at(-1) ?? panel;
        if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (!panel.contains(event.target as Node)) (focusable()[0] ?? panel).focus();
    };
    const viewport = window.matchMedia("(max-width: 800px)");
    const onViewport = () => { if (!viewport.matches) close(); };
    onViewport();
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocus);
    viewport.addEventListener("change", onViewport);
    return () => {
      backgroundObserver.disconnect();
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocus);
      viewport.removeEventListener("change", onViewport);
      for (const [element, inert] of background) element.inert = inert;
      document.body.style.overflow = originalOverflow;
      if (trigger.current?.isConnected && viewport.matches) trigger.current.focus();
      else if (panel.isConnected && !viewport.matches) panel.querySelector<HTMLAnchorElement>("a[href]")?.focus();
    };
  }, [open, menu, trigger, close]);
}
