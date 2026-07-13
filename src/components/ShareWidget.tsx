"use client";

import { Check, Copy, MessageCircle, Share2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";
import { buildPublicShareUrl } from "../lib/publicShareUrl";

interface ShareWidgetProps {
  eventTitle: string;
  eventIdentifier?: string;
}

export default function ShareWidget({
  eventTitle,
  eventIdentifier,
}: ShareWidgetProps) {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const menuId = useId();
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const updateVisibility = () => {
      const nextVisible = window.scrollY > 280;
      setVisible(nextVisible);
      if (!nextVisible) setOpen(false);
    };

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  useEffect(() => {
    if (!open) return;

    const focusFrame = window.requestAnimationFrame(() => {
      firstActionRef.current?.focus();
    });

    const closeOnOutsideInteraction = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };

    document.addEventListener("pointerdown", closeOnOutsideInteraction);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", closeOnOutsideInteraction);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    },
    [],
  );

  const shareUrl =
    typeof window !== "undefined"
      ? buildPublicShareUrl(window.location.href, eventIdentifier)
      : "";
  const normalizedTitle = eventTitle.trim();
  const shareText = normalizedTitle
    ? `¡Mira mi invitación para ${normalizedTitle}!`
    : "¡Mira esta invitación!";

  const restoreTriggerFocus = () => {
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const closeMenu = () => {
    setOpen(false);
    restoreTriggerFocus();
  };

  const copyToClipboard = async (value: string): Promise<boolean> => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      // Fall through to the selection-based fallback for older/restricted browsers.
    }

    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();

    try {
      const legacyCopy = Reflect.get(document, "execCommand");
      return typeof legacyCopy === "function"
        ? Boolean(legacyCopy.call(document, "copy"))
        : false;
    } catch {
      return false;
    } finally {
      input.remove();
    }
  };

  const handleWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    closeMenu();
  };

  const handleCopy = async () => {
    const succeeded = await copyToClipboard(shareUrl);
    setCopied(succeeded);
    setCopyError(!succeeded);
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      setCopyError(false);
    }, 2400);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.nav
          ref={rootRef}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          transition={{
            duration: shouldReduceMotion ? 0 : 0.24,
            ease: "easeOut",
          }}
          className="fixed bottom-[var(--eventi-safe-bottom)] right-4 z-[45] sm:right-5"
          aria-label="Compartir invitación"
        >
          <AnimatePresence>
            {open && (
              <motion.div
                id={menuId}
                initial={
                  shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 6, scale: 0.98 }
                }
                transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
                className="eventi-floating-panel absolute bottom-[calc(100%+0.75rem)] right-0 w-60 overflow-hidden p-2"
              >
                <div className="px-3 pb-2 pt-1.5">
                  <p className="text-xs font-semibold text-[#102f3f]">
                    Comparte este momento
                  </p>
                  <p className="mt-0.5 text-[0.68rem] text-[#758893]">
                    Compartimos una versión segura, sin tokens privados.
                  </p>
                </div>

                <button
                  ref={firstActionRef}
                  onClick={handleWhatsApp}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-[#315b46] transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 motion-reduce:transition-none"
                  type="button"
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-[#25D366]/[0.12] text-[#168646]">
                    <MessageCircle aria-hidden="true" className="size-4" />
                  </span>
                  WhatsApp
                </button>

                <button
                  onClick={handleCopy}
                  className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-[#3c5968] transition hover:bg-[#f4f7f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dd2284]/25 motion-reduce:transition-none"
                  type="button"
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-[#102f3f]/[0.07] text-[#365767]">
                    {copied ? (
                      <Check aria-hidden="true" className="size-4" />
                    ) : (
                      <Copy aria-hidden="true" className="size-4" />
                    )}
                  </span>
                  <span aria-live="polite">
                    {copied
                      ? "Enlace copiado"
                      : copyError
                        ? "No se pudo copiar"
                        : "Copiar enlace"}
                  </span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            ref={triggerRef}
            whileHover={shouldReduceMotion ? undefined : { y: -2 }}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
            onClick={() => setOpen((current) => !current)}
            className="eventi-floating-control transition-colors motion-reduce:transition-none"
            aria-label={
              open ? "Cerrar opciones para compartir" : "Compartir invitación"
            }
            aria-expanded={open}
            aria-controls={menuId}
            type="button"
          >
            {open ? (
              <X aria-hidden="true" className="size-5" />
            ) : (
              <Share2 aria-hidden="true" className="size-5" />
            )}
          </motion.button>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
