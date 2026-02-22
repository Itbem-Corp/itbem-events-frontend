"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ResourcesBySectionSingle, { type Section } from '../ResourcesBySectionSingle';
import ImageWithLoader from '../ImageWithLoader';
import type { SectionComponentProps, EventVenueConfig } from '../engine/types';

function Skeleton() {
  return (
    <section className="text-center space-y-6 relative z-10 animate-pulse pt-10">
      <div className="grid grid-cols-2 gap-2">
        <div className="aspect-[3/2] bg-gray-200 rounded shadow-md w-full" />
        <div className="aspect-[3/2] bg-gray-200 rounded shadow-md w-full" />
      </div>
      <p className="bg-gray-200 h-6 w-3/4 mx-auto rounded" />
      <div className="mx-auto w-[90%] sm:w-[80%] md:w-[70%] lg:w-[600px] aspect-[3/2] bg-gray-200 rounded shadow-md" />
      <p className="bg-gray-200 h-6 w-1/2 mx-auto rounded" />
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="sm:basis-2/3 space-y-2 sm:pe-4">
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-5/6" />
        </div>
        <div className="sm:basis-2/3 px-2">
          <div className="bg-gray-200 w-full max-w-[500px] aspect-[4/3] rounded mx-auto" />
        </div>
      </div>
    </section>
  );
}

export default function EventVenue({ sectionId, config, EVENTS_URL }: SectionComponentProps) {
  const { text, date, venueText, mapUrl } = config as unknown as EventVenueConfig;
  const [section, setSection] = useState<Section | null>(null);

  return (
    <>
      <ResourcesBySectionSingle sectionId={sectionId} EVENTS_URL={EVENTS_URL} onLoaded={setSection} />

      <AnimatePresence mode="wait">
        {section ? (
          <motion.section
            key="loaded"
            className="text-center space-y-6 relative z-10 pt-10"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.6 }}
          >
            <div className="grid grid-cols-2 gap-2">
              {section.sectionResources.slice(0, 2).map(r => (
                <div key={r.position} className="aspect-[3/2] bg-gray-100 rounded shadow-md overflow-hidden">
                  <ImageWithLoader src={r.view_url} alt={r.title || ''} />
                </div>
              ))}
            </div>

            <p className="text-2xl font-semibold font-bigilla leading-snug text-[#07293A]">{text}</p>

            {section.sectionResources[2]?.view_url && (
              <div className="mx-auto w-[90%] sm:w-[80%] md:w-[70%] lg:w-[600px] aspect-[3/2] bg-gray-100 rounded shadow-md overflow-hidden">
                <ImageWithLoader
                  src={section.sectionResources[2].view_url}
                  alt={section.sectionResources[2].title || ''}
                />
              </div>
            )}

            <p className="text-2xl font-semibold font-bigilla text-[#8B5D3D]">{date}</p>

            <div className="flex flex-col sm:flex-row">
              <div className="sm:basis-2/3 place-content-center sm:pe-4 pb-4 sm:pb-0">
                <p className="text-sm sm:text-base md:text-2xl leading-relaxed font-quicksand text-[#07293A]">
                  {venueText}
                </p>
              </div>
              <div className="sm:basis-2/3 px-2">
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
