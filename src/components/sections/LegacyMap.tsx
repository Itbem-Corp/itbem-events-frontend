"use client";

import { motion } from "framer-motion";
import type { LegacyMapConfig, SectionComponentProps } from "../engine/types";

const headingStyle = {
  color: "var(--eventi-color-heading, #07293a)",
  fontFamily: "var(--eventi-font-heading-effective, Bigilla, serif)",
};

const bodyStyle = {
  color: "var(--eventi-color-body, #27485a)",
};

export default function LegacyMap({ config }: SectionComponentProps) {
  const { title, content, mapUrl } = config as unknown as LegacyMapConfig;

  if (!mapUrl) return null;

  return (
    <motion.section
      className="relative z-10 mx-auto max-w-3xl space-y-4 px-2 py-8 text-center"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      {title && (
        <h2 className="font-bigilla text-3xl font-semibold sm:text-4xl" style={headingStyle}>
          {title}
        </h2>
      )}
      {content && (
        <p className="mx-auto max-w-2xl whitespace-pre-line font-quicksand text-base leading-8" style={bodyStyle}>
          {content}
        </p>
      )}
      <div className="mx-auto aspect-[4/3] w-full max-w-[640px] overflow-hidden rounded-lg bg-gray-200 shadow-sm">
        <iframe
          src={mapUrl}
          className="h-full w-full"
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer"
          title={title || "Mapa del evento"}
        />
      </div>
    </motion.section>
  );
}
