"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import ResourcesBySectionSingle, {
  type Section,
} from "../ResourcesBySectionSingle";
import ImageWithLoader from "../ImageWithLoader";
import type { LegacyHeroConfig, SectionComponentProps } from "../engine/types";
import { resourceAtPosition } from "../../lib/publicResources";

const surfaceStyle = {
  backgroundColor: "var(--eventi-color-surface, #f8f4ef)",
};

const headingStyle = {
  color: "var(--eventi-color-heading, #07293a)",
  fontFamily: "var(--eventi-font-heading-effective, Bigilla, serif)",
};

const accentStyle = {
  color: "var(--eventi-color-accent, #8b5d3d)",
};

const bodyStyle = {
  color: "var(--eventi-color-body, #27485a)",
};

export default function LegacyHero({
  sectionId,
  config,
  EVENTS_URL,
  publicAccess,
}: SectionComponentProps) {
  const { title, subtitle, content, imageUrl } =
    config as unknown as LegacyHeroConfig;
  const [section, setSection] = useState<Section | null>(null);
  const heroResource = resourceAtPosition(section?.sectionResources, 0);
  const heroImage = heroResource?.view_url || imageUrl;

  return (
    <motion.section
      className="relative z-10 overflow-hidden rounded-lg px-5 py-12 text-center shadow-sm sm:px-8 sm:py-16"
      style={surfaceStyle}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55 }}
    >
      <ResourcesBySectionSingle
        sectionId={sectionId}
        EVENTS_URL={EVENTS_URL}
        publicAccess={publicAccess}
        onLoaded={setSection}
      />

      {heroImage && (
        <div className="absolute inset-0 opacity-20">
          <ImageWithLoader
            src={heroImage}
            alt={title || "Evento"}
            className="scale-105"
            priority
          />
        </div>
      )}

      <div className="relative mx-auto max-w-2xl space-y-4">
        {title && (
          <h1 className="font-bigilla text-4xl font-semibold sm:text-5xl md:text-6xl" style={headingStyle}>
            {title}
          </h1>
        )}
        {subtitle && (
          <p className="font-quicksand text-base font-medium sm:text-lg" style={accentStyle}>
            {subtitle}
          </p>
        )}
        {content && (
          <p className="mx-auto max-w-xl whitespace-pre-line font-quicksand text-sm leading-7 sm:text-base" style={bodyStyle}>
            {content}
          </p>
        )}
      </div>
    </motion.section>
  );
}
