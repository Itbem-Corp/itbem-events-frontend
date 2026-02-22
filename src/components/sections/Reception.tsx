"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ResourcesBySectionSingle, { type Section } from '../ResourcesBySectionSingle';
import ImageWithLoader from '../ImageWithLoader';
import type { SectionComponentProps, ReceptionConfig } from '../engine/types';

function Skeleton() {
  return (
    <section className="space-y-6 text-center relative z-0 animate-pulse pt-10">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-200 aspect-[3/2] rounded shadow-md w-full" />
        <div className="bg-gray-200 aspect-[3/2] rounded shadow-md w-full" />
      </div>
      <div className="flex flex-row gap-2">
        <div className="basis-full sm:basis-2/3 px-2">
          <div className="bg-gray-200 w-full max-w-[500px] aspect-[4/3] rounded mx-auto" />
        </div>
        <div className="basis-2/3 space-y-2 ps-2">
          <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto" />
          <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-200 aspect-[3/2] rounded shadow-md w-full" />
        <div className="bg-gray-200 aspect-[3/2] rounded shadow-md w-full" />
      </div>
    </section>
  );
}

export default function Reception({ sectionId, config, EVENTS_URL }: SectionComponentProps) {
  const { venueText, mapUrl } = config as unknown as ReceptionConfig;
  const [section, setSection] = useState<Section | null>(null);

  return (
    <>
      <ResourcesBySectionSingle sectionId={sectionId} EVENTS_URL={EVENTS_URL} onLoaded={setSection} />

      <AnimatePresence mode="wait">
        {section ? (
          <motion.section
            key="loaded"
            className="space-y-6 text-center relative z-0 pt-10"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.6 }}
          >
            <div className="grid grid-cols-2 gap-4">
              {section.sectionResources.slice(0, 2).map(r => (
                <div key={r.position} className="bg-gray-100 aspect-[3/2] rounded shadow-md overflow-hidden">
                  <ImageWithLoader src={r.view_url} alt={r.title || ''} />
                </div>
              ))}
            </div>

            <div className="flex flex-row">
              <div className="basis-full sm:basis-2/3 px-2">
                <div className="bg-gray-300 w-full max-w-[500px] aspect-[4/3] rounded mx-auto overflow-hidden">
                  <iframe
                    src={mapUrl}
                    className="w-full h-full"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </div>
              <div className="basis-2/3 place-content-center ps-2">
                <p className="text-sm md:text-2xl leading-relaxed font-quicksand text-[#07293A]">
                  {venueText}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {section.sectionResources.slice(2, 4).map(r => (
                <div key={r.position} className="bg-gray-100 aspect-[3/2] rounded shadow-md overflow-hidden">
                  <ImageWithLoader src={r.view_url} alt={r.title || ''} />
                </div>
              ))}
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
            <Skeleton />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
