/**
 * Fallback for `animation-timeline: view()`. Marks `.v-scroll-in` elements for
 * the observer (so no-JS and reduced-motion users keep them visible) and adds
 * `.is-visible` once on first intersection. No-op where native scroll-driven
 * animation exists or when motion is reduced.
 */
export function observeScrollReveal(root: ParentNode = document): () => void {
  const native =
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("animation-timeline", "view()");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (native || reduced || typeof IntersectionObserver === "undefined") {
    return () => {};
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
  );

  root.querySelectorAll<HTMLElement>(".v-scroll-in").forEach((el) => {
    el.setAttribute("data-v-io", "");
    observer.observe(el);
  });
  return () => observer.disconnect();
}
