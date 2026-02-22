"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ResourcesBySectionSingle, { type Section } from '../ResourcesBySectionSingle';
import ImageWithLoader from '../ImageWithLoader';
import type { SectionComponentProps, GraduationHeroConfig } from '../engine/types';

function Skeleton({ title, years, school }: GraduationHeroConfig) {
  return (
    <section className="text-center space-y-6 pb-4 relative z-10 animate-pulse pt-10">
      <h2 className="text-5xl font-bold text-gray-300">{title}</h2>
      <div className="mx-auto w-[90%] sm:w-[80%] md:w-[70%] lg:w-[600px] aspect-[3/2] bg-gray-200 rounded shadow-md" />
      <div className="text-4xl font-bold text-gray-300"><h3>{years}</h3></div>
      <div className="flex flex-row items-center justify-center gap-4 md:gap-6 max-w-4xl mx-auto">
        <div className="w-24 h-24 md:w-32 md:h-32 bg-gray-200 rounded" />
        <div className="h-10 w-48 md:w-64 bg-gray-200 rounded" />
      </div>
    </section>
  );
}

export default function GraduationHero({ sectionId, config, EVENTS_URL }: SectionComponentProps) {
  const { title, years, school } = config as unknown as GraduationHeroConfig;
  const [section, setSection] = useState<Section | null>(null);

  return (
    <>
      <ResourcesBySectionSingle sectionId={sectionId} EVENTS_URL={EVENTS_URL} onLoaded={setSection} />

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
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bigilla font-semibold text-[#07293a]">
                {title}
              </h2>
            </div>

            <div className="mx-auto w-[90%] sm:w-[80%] md:w-[70%] lg:w-[600px] aspect-[3/2] bg-gray-100 rounded shadow-md overflow-hidden">
              {section.sectionResources[0]?.view_url && (
                <ImageWithLoader
                  src={section.sectionResources[0].view_url}
                  alt={section.sectionResources[0].title || title}
                  className="w-full h-full object-cover"
                  priority
                />
              )}
            </div>

            <div>
              <h3 className="text-2xl sm:text-3xl md:text-4xl font-bigilla text-[#07293a]">{years}</h3>
            </div>

            <div className="flex flex-row items-center justify-center gap-3 sm:gap-4 md:gap-6 max-w-4xl mx-auto">
              <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 flex-shrink-0">
                {section.sectionResources[1]?.view_url && (
                  <ImageWithLoader
                    src={section.sectionResources[1].view_url}
                    alt={section.sectionResources[1].title || title}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <h3 className="text-3xl sm:text-4xl md:text-5xl font-semibold font-bigilla text-[#8B5D3D] text-center md:text-start mt-4 md:mt-0">
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
            <Skeleton title={title} years={years} school={school} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
