"use client";

import { Mail, MessageCircle } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { PageContact } from "../engine/types";

interface FooterProps {
  contact?: PageContact;
}

const footerStyle = {
  background:
    "linear-gradient(145deg, color-mix(in srgb, var(--eventi-color-surface, #fff) 96%, transparent), color-mix(in srgb, var(--eventi-color-surface, #fff) 88%, var(--eventi-brand-soft)))",
  borderColor: "var(--eventi-color-border, rgba(16, 47, 63, 0.12))",
  color: "var(--eventi-color-muted, #607783)",
};

const contactStyle = {
  color: "var(--eventi-color-heading, #102f3f)",
};

export default function Footer({ contact }: FooterProps = {}) {
  const shouldReduceMotion = useReducedMotion();
  const contactName = contact?.name?.trim();
  const currentYear = new Date().getFullYear();
  const hasContact = Boolean(contactName || contact?.phone || contact?.email);

  return (
    <motion.footer
      className="relative mt-16 overflow-hidden rounded-t-[2rem] border-x border-t px-5 py-9 text-sm sm:mt-20 sm:px-8 sm:py-10"
      style={footerStyle}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.48, ease: "easeOut" }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-[#dd2284]/[0.45] to-transparent"
      />

      <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] md:items-center">
        <div className="text-center md:text-left">
          <img
            src="/backgrounds/vectores-03.svg"
            alt="EventiApp by ITBEM"
            className="mx-auto w-[145px] sm:w-[165px] md:mx-0"
            loading="lazy"
            decoding="async"
          />
          <p className="mx-auto mt-3 max-w-xs text-xs leading-5 md:mx-0">
            Detalles, confirmaciones y recuerdos del evento en un solo lugar.
          </p>
        </div>

        {hasContact && (
          <address className="not-italic md:border-l md:pl-8" style={contactStyle}>
            <p className="eventi-eyebrow text-center md:text-left">
              Contacto del evento
            </p>
            {contactName && (
              <p className="mt-2 text-center text-lg font-semibold tracking-[-0.015em] md:text-left">
                {contactName}
              </p>
            )}

            <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center md:justify-start">
              {contact?.phone && (
                <a
                  href={`https://wa.me/${contact.phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white/60 px-3.5 text-sm font-semibold transition hover:-translate-y-0.5 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#dd2284]/20 motion-reduce:transform-none motion-reduce:transition-none"
                  aria-label={`Contactar por WhatsApp: ${contact.phone}`}
                >
                  <MessageCircle aria-hidden="true" className="size-4 text-[#168646]" />
                  <span>{contact.phone}</span>
                </a>
              )}

              {contact?.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white/60 px-3.5 text-sm font-semibold transition hover:-translate-y-0.5 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#dd2284]/20 motion-reduce:transform-none motion-reduce:transition-none"
                  aria-label={`Enviar correo a ${contact.email}`}
                >
                  <Mail aria-hidden="true" className="size-4 shrink-0 text-[#b91468]" />
                  <span className="truncate">{contact.email}</span>
                </a>
              )}
            </div>
          </address>
        )}
      </div>

      <div className="mx-auto mt-8 flex max-w-5xl flex-col items-center justify-between gap-1 border-t pt-5 text-center text-[0.68rem] leading-5 sm:flex-row sm:text-left" style={{ borderColor: "var(--eventi-color-border, rgba(16, 47, 63, 0.1))" }}>
        <p>© {currentYear} EventiApp. Creado para celebrar.</p>
        <p>Una experiencia digital de ITBEM.</p>
      </div>
    </motion.footer>
  );
}
