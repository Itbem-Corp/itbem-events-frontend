"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ResourcesBySectionSingle, { type Section } from '../ResourcesBySectionSingle';
import ImageWithLoader from '../ImageWithLoader';
import type { SectionComponentProps } from '../engine/types';

function Skeleton() {
  return (
    <section className="space-y-6 relative z-0 animate-pulse pt-10">
      <div className="grid grid-cols-2 gap-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-gray-200 aspect-[3/2] rounded shadow-md" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-gray-200 aspect-[3/2] rounded shadow-md" />
        ))}
      </div>
    </section>
  );
}

export default function PhotoGrid({ sectionId, EVENTS_URL }: SectionComponentProps) {
  const [section, setSection] = useState<Section | null>(null);

  return (
    <>
      <ResourcesBySectionSingle sectionId={sectionId} EVENTS_URL={EVENTS_URL} onLoaded={setSection} />

      <AnimatePresence mode="wait">
        {section ? (
          <motion.section
            key="loaded"
            className="space-y-6 relative z-0 pt-10"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.6 }}
          >
            {/* Top row — 2 columns */}
            <motion.div
              className="grid grid-cols-2 gap-4"
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.1 } }, hidden: {} }}
            >
              {section.sectionResources.slice(0, 2).map(r => (
                <motion.div
                  key={r.position}
                  variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
                  transition={{ duration: 0.4 }}
                  className="bg-transparent aspect-[3/2] rounded shadow-md overflow-hidden"
                >
                  <ImageWithLoader src={r.view_url} alt={r.title || ''} />
                </motion.div>
              ))}
            </motion.div>

            {/* Bottom row — 3 columns */}
            <motion.div
              className="grid grid-cols-3 gap-4"
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.1 } }, hidden: {} }}
            >
              {section.sectionResources.slice(2, 5).map(r => (
                <motion.div
                  key={r.position}
                  variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
                  transition={{ duration: 0.4 }}
                  className="bg-transparent aspect-[3/2] rounded shadow-md overflow-hidden"
                >
                  <ImageWithLoader src={r.view_url} alt={r.title || ''} />
                </motion.div>
              ))}
            </motion.div>
          </motion.section>
        ) : (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Skeleton />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
