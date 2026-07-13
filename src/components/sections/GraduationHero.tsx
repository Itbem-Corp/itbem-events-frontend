"use client";

import { useState } from "react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import ResourcesBySectionSingle, {
  type Section,
} from "../ResourcesBySectionSingle";
import ImageWithLoader from "../ImageWithLoader";
import type {
  SectionComponentProps,
  GraduationHeroConfig,
} from "../engine/types";
import { resourceAtPosition } from "../../lib/publicResources";

const headingStyle = {
  color: "var(--eventi-color-heading, #07293a)",
  fontFamily: "var(--eventi-font-heading-effective, Bigilla, serif)",
};

const accentStyle = {
  color: "var(--eventi-color-accent, #8B5D3D)",
  fontFamily: "var(--eventi-font-accent-effective, Bigilla, serif)",
};

function Skeleton({
  title,
  years,
}: Pick<GraduationHeroConfig, "title" | "years">) {
  return (
    <section className="text-center space-y-6 pb-4 relative z-10 animate-pulse pt-10">
      <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-300">
        {title}
      </h2>
      <div className="mx-auto w-[90%] sm:w-[80%] md:w-[70%] lg:w-[600px] aspect-[3/2] bg-gray-200 rounded shadow-md" />
      <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-300">
        <h3>{years}</h3>
      </div>
      <div className="flex flex-row items-center justify-center gap-4 md:gap-6 max-w-4xl mx-auto">
        <div className="w-24 h-24 md:w-32 md:h-32 bg-gray-200 rounded" />
        <div className="h-10 w-48 md:w-64 bg-gray-200 rounded" />
      </div>
    </section>
  );
}

export default function GraduationHero({
  sectionId,
  config,
  EVENTS_URL,
  publicAccess,
}: SectionComponentProps) {
  const { title, years, school } = config as unknown as GraduationHeroConfig;
  const [section, setSection] = useState<Section | null>(null);
  const heroImage = resourceAtPosition(section?.sectionResources, 0);
  const schoolLogo = resourceAtPosition(section?.sectionResources, 1);

  return (
    <MotionConfig reducedMotion="user">
      <>
        <ResourcesBySectionSingle
          sectionId={sectionId}
          EVENTS_URL={EVENTS_URL}
          publicAccess={publicAccess}
          onLoaded={setSection}
        />

        <AnimatePresence mode="wait">
          {section ? (
            <motion.section
              key="loaded"
              className="text-center space-y-6 pb-4 relative z-10 pt-10"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.6 }}
            >
              <div>
                <h2
                  className="text-3xl sm:text-4xl md:text-5xl font-bigilla font-semibold"
                  style={headingStyle}
                >
                  {title}
                </h2>
              </div>

              <div className="mx-auto w-[90%] sm:w-[80%] md:w-[70%] lg:w-[600px] aspect-[3/2] bg-gray-100 rounded shadow-md overflow-hidden">
                {heroImage?.view_url && (
                  <ImageWithLoader
                    src={heroImage.view_url}
                    alt={heroImage.title || title}
                    className="w-full h-full object-cover"
                    priority
                  />
                )}
              </div>

              <div>
                <h3
                  className="text-2xl sm:text-3xl md:text-4xl font-bigilla"
                  style={headingStyle}
                >
                  {years}
                </h3>
              </div>

              <div className="flex flex-row items-center justify-center gap-3 sm:gap-4 md:gap-6 max-w-4xl mx-auto">
                <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 flex-shrink-0">
                  {schoolLogo?.view_url && (
                    <ImageWithLoader
                      src={schoolLogo.view_url}
                      alt={schoolLogo.title || title}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <h3
                  className="text-xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold font-bigilla text-center md:text-start mt-4 md:mt-0"
                  style={accentStyle}
                >
                  {school}
                </h3>
              </div>
            </motion.section>
          ) : (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Skeleton title={title} years={years} />
            </motion.div>
          )}
        </AnimatePresence>
      </>
    </MotionConfig>
  );
}
