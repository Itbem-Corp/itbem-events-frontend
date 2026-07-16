import { buildEventApiUrl } from "./apiUrls";
import { publicAccessFetchInit, type PublicAccessFetchParams } from "./publicPreview";

export type PublicRumMetricName =
  | "lcp"
  | "inp"
  | "cls"
  | "page_spec_ms"
  | "photo_visible_ms"
  | "rsvp_submit_ms";
export type PublicRumRoute = "event" | "moments" | "rsvp" | "upload" | "tv";

interface RumSession {
  eventsUrl: string;
  identifier: string;
  route: PublicRumRoute;
  access?: PublicAccessFetchParams;
  metrics: Map<PublicRumMetricName, number>;
  sentCore: boolean;
}

let activeSession: RumSession | null = null;

export function recordPublicRumMetric(name: PublicRumMetricName, value: number) {
  if (!activeSession || !Number.isFinite(value) || value < 0) return;
  activeSession.metrics.set(name, Math.min(value, 600_000));
}

async function flushPublicRum(core = false) {
  const session = activeSession;
  if (!session || session.metrics.size === 0 || (core && session.sentCore)) return;
  if (core) session.sentCore = true;
  const metrics = [...session.metrics].map(([name, value]) => ({ name, value }));
  session.metrics.clear();
  try {
    await fetch(
      buildEventApiUrl(session.eventsUrl, session.identifier, "performance"),
      publicAccessFetchInit(session.access ?? {}, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ route: session.route, metrics }),
        keepalive: true,
      }),
    );
  } catch {
    // RUM is observational and must never affect the guest experience.
  }
}

export function installPublicRum(options: Omit<RumSession, "metrics" | "sentCore">): () => void {
  if (typeof window === "undefined" || !options.identifier) return () => {};
  activeSession = { ...options, metrics: new Map(), sentCore: false };
  const observers: PerformanceObserver[] = [];
  const observe = (type: string, handler: (entry: PerformanceEntry) => void) => {
    try {
      const observer = new PerformanceObserver((list) => list.getEntries().forEach(handler));
      observer.observe({ type, buffered: true });
      observers.push(observer);
    } catch {
      // Older Safari versions may not expose every entry type.
    }
  };
  observe("largest-contentful-paint", (entry) => recordPublicRumMetric("lcp", entry.startTime));
  let cls = 0;
  observe("layout-shift", (entry) => {
    const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
    if (!shift.hadRecentInput) {
      cls += shift.value ?? 0;
      recordPublicRumMetric("cls", cls);
    }
  });
  observe("event", (entry) => recordPublicRumMetric("inp", Math.max(activeSession?.metrics.get("inp") ?? 0, entry.duration)));
  const timer = window.setTimeout(() => void flushPublicRum(true), 8_000);
  const onVisibility = () => {
    if (document.visibilityState === "hidden") void flushPublicRum();
  };
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    observers.forEach((observer) => observer.disconnect());
    void flushPublicRum();
  };
}
