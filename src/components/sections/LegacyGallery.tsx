"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ResourcesBySectionSingle, {
  type Section,
} from "../ResourcesBySectionSingle";
import ImageWithLoader from "../ImageWithLoader";
import type {
  LegacyGalleryConfig,
  SectionComponentProps,
} from "../engine/types";
import { resourceAtPosition } from "../../lib/publicResources";

const headingStyle = {
  color: "var(--eventi-color-heading, #07293a)",
  fontFamily: "var(--eventi-font-heading-effective, Bigilla, serif)",
};

const mutedStyle = {
  color: "var(--eventi-color-muted, #5d7380)",
};

export default function LegacyGallery({
  sectionId,
  config,
  EVENTS_URL,
  publicAccess,
}: SectionComponentProps) {
  const { title, subtitle } = config as unknown as LegacyGalleryConfig;
  const [section, setSection] = useState<Section | null>(null);
  const resources = [0, 1, 2, 3, 4, 5]
    .map((position) => resourceAtPosition(section?.sectionResources, position))
    .filter((resource): resource is NonNullable<typeof resource> => Boolean(resource));

  return (
    <section className="relative z-10 space-y-6 py-8">
      <ResourcesBySectionSingle
        sectionId={sectionId}
        EVENTS_URL={EVENTS_URL}
        publicAccess={publicAccess}
        onLoaded={setSection}
      />

      {(title || subtitle) && (
        <div className="mx-auto max-w-2xl space-y-2 text-center">
          {title && (
            <h2 className="font-bigilla text-3xl font-semibold sm:text-4xl" style={headingStyle}>
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="font-quicksand text-sm sm:text-base" style={mutedStyle}>
              {subtitle}
            </p>
          )}
        </div>
      )}

      <AnimatePresence>
        {resources.length > 0 && (
          <motion.div
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
          >
            {resources.map((resource) => (
              <div
                key={`${resource.position}-${resource.view_url}`}
                className={[
                  "overflow-hidden rounded shadow-sm",
                  resource.position === 0
                    ? "col-span-2 aspect-[16/10] sm:col-span-1"
                    : "aspect-[4/3]",
                ].join(" ")}
              >
                <ImageWithLoader
                  src={resource.view_url}
                  alt={resource.title || title || "Galeria"}
                />
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
