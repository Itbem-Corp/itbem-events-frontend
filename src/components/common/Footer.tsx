"use client";

import { motion } from "framer-motion";
import type { PageContact } from "../engine/types";

interface FooterProps {
  contact?: PageContact;
}

export default function Footer({ contact }: FooterProps = {}) {
  const phone = contact?.phone ?? "9999988610";
  const email = contact?.email ?? "contacto.eventiapp@itbem.com";
  const showName = Boolean(contact?.name?.trim());

  return (
    <motion.footer
      className="relative bg-white border-t mt-16 py-10 text-gray-600 text-sm overflow-hidden"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <div className="max-w-5xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
        {/* Logo eventiapp */}
        <img
          src="/backgrounds/vectores-03.svg"
          alt="eventiapp 2025 by itbem"
          className="w-[160px] sm:w-[200px] md:w-[240px]"
          loading="lazy"
          decoding="async"
        />

        {showName && (
          <p className="font-aloevera text-dark text-lg font-semibold">
            {contact!.name}
          </p>
        )}

        {/* WhatsApp */}
        <a
          href={`https://wa.me/${phone.replace(/\D/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:opacity-80 transition-opacity"
          aria-label={`Contactar por WhatsApp: ${phone}`}
        >
          <img
            src="/backgrounds/vectores-04.svg"
            alt=""
            className="w-12 h-12"
            loading="lazy"
            decoding="async"
            aria-hidden="true"
          />
          <span className="text-black font-aloevera text-xl">{phone}</span>
        </a>

        {/* Email */}
        <a
          href={`mailto:${email}`}
          className="flex items-center gap-1 hover:opacity-80 transition-opacity"
          aria-label={`Enviar correo a ${email}`}
        >
          <img
            src="/backgrounds/vectores-05.svg"
            alt=""
            className="w-12 h-12"
            loading="lazy"
            decoding="async"
            aria-hidden="true"
          />
          <span className="text-black font-aloevera text-md">{email}</span>
        </a>
      </div>
    </motion.footer>
  );
}
