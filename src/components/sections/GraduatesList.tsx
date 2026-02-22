"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import ResourcesBySectionSingle, { type Section } from '../ResourcesBySectionSingle';
import ImageWithLoader from '../ImageWithLoader';
import type { SectionComponentProps, GraduatesListConfig } from '../engine/types';

interface Attendee {
  first_name: string;
  last_name: string;
  nickname: string;
  role: string;
  order: number;
}

function displayName(a: Attendee): string {
  return a.nickname || `${a.first_name} ${a.last_name}`.trim();
}

function Skeleton() {
  return (
    <section className="space-y-6 text-center relative z-0 animate-pulse pt-10">
      <h2 className="text-3xl font-semibold">Graduados</h2>
      <ul className="space-y-1 max-w-sm mx-auto">
        {[...Array(5)].map((_, i) => (
          <li key={i} className="h-4 bg-gray-200 rounded w-3/4 mx-auto" />
        ))}
      </ul>
      <div className="mx-auto w-[90%] sm:w-[80%] md:w-[70%] lg:w-[600px] aspect-[3/2] bg-gray-200 rounded shadow-md overflow-hidden my-6" />
      <p className="italic text-xl text-gray-300">cargando...</p>
    </section>
  );
}

export default function GraduatesList({ sectionId, config, EVENTS_URL }: SectionComponentProps) {
  const { closing } = config as unknown as GraduatesListConfig;
  const [section, setSection] = useState<Section | null>(null);
  const [attendees, setAttendees] = useState<Attendee[] | null>(null);

  useEffect(() => {
    const CACHE_KEY = `attendees-${sectionId}`;
    const CACHE_TTL = 30 * 60 * 1000; // 30 min

    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const { data, ts } = JSON.parse(raw) as { data: Attendee[]; ts: number };
        if (Date.now() - ts < CACHE_TTL) {
          setAttendees(data);
          return;
        }
        sessionStorage.removeItem(CACHE_KEY);
      }
    } catch {
      // corrupt cache — fall through to fetch
    }

    fetch(`${EVENTS_URL}api/events/section/${sectionId}/attendees`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(json => {
        const data: Attendee[] = Array.isArray(json?.data) ? json.data : [];
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch { /* full */ }
        setAttendees(data);
      })
      .catch(err => {
        console.error('[GraduatesList] Error fetching attendees:', err);
        setAttendees([]);
      });
  }, [sectionId, EVENTS_URL]);

  const isReady = section !== null && attendees !== null;

  return (
    <>
      <ResourcesBySectionSingle sectionId={sectionId} EVENTS_URL={EVENTS_URL} onLoaded={setSection} />

      <AnimatePresence mode="wait">
        {isReady ? (
          <motion.section
            key="loaded"
            className="space-y-6 text-center relative z-0 pt-10"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl font-semibold font-bigilla text-black">Graduados</h2>

            <motion.ul
              className="font-medium space-y-1"
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
            >
              {attendees.map((attendee, index) => (
                <motion.li
                  key={attendee.order + '-' + displayName(attendee)}
                  className={cn(
                    'text-lg font-quicksand',
                    index % 2 === 0 ? 'text-blue' : 'text-navy',
                  )}
                  variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
                  transition={{ duration: 0.6 }}
                >
                  {displayName(attendee)}
                </motion.li>
              ))}
            </motion.ul>

            {section.sectionResources[0]?.view_url && (
              <div className="mx-auto w-[100%] sm:w-[80%] md:w-[70%] lg:w-[600px] aspect-[5/2] bg-gray-100 rounded shadow-md overflow-hidden my-6">
                <ImageWithLoader
                  src={section.sectionResources[0].view_url}
                  alt={section.sectionResources[0].title || ''}
                />
              </div>
            )}

            <p className="font-bigilla font-semibold text-xl md:text-2xl text-[#8B5D3D]">{closing}</p>
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
