"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { normalizeEventsUrl } from "@/lib/eventsUrl";
import { buildSectionAttendeesUrl } from "@/lib/apiUrls";
import { fetchApiData } from "@/lib/apiFetch";
import { resolvePublicMediaUrl } from "@/lib/mediaUrl";
import {
  getPublicAttendeesCacheExpiresAt,
  getPublicAttendeesRefreshDelay,
  getPublicAttendeeName,
  normalizePublicAttendeesPayload,
  publicAttendeesMediaRefreshKey,
  publicAttendeeImageUrl,
  type PublicAttendee,
} from "@/lib/publicAttendees";
import {
  publicAccessFetchInit,
  publicAccessQueryParams,
  resolvePublicAccessParams,
} from "@/lib/publicPreview";
import {
  PUBLIC_ATTENDEES_CACHE_TTL_MS,
  publicAccessCacheScope,
  publicAccessScopedCacheKey,
} from "@/lib/resourceCache";
import { publicAttendeesSectionTitle } from "@/lib/sectionLabels";
import ResourcesBySectionSingle, {
  type Section,
} from "../ResourcesBySectionSingle";
import { resourceAtPosition } from "../../lib/publicResources";
import ImageWithLoader from "../ImageWithLoader";
import type {
  SectionComponentProps,
  GraduatesListConfig,
} from "../engine/types";

const headingStyle = {
  color: "var(--eventi-color-heading, #07293a)",
  fontFamily: "var(--eventi-font-heading-effective, Bigilla, serif)",
};

const accentStyle = {
  color: "var(--eventi-color-accent, #8B5D3D)",
  fontFamily: "var(--eventi-font-accent-effective, Bigilla, serif)",
};

const bodyStyle = {
  color: "var(--eventi-color-body, #07293a)",
};

const mutedStyle = {
  color: "var(--eventi-color-muted, rgba(7, 41, 58, 0.8))",
};

function Skeleton({ heading }: { heading: string }) {
  return (
    <section className="space-y-6 text-center relative z-0 animate-pulse pt-10">
      <h2 className="text-3xl font-semibold">{heading}</h2>
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

export default function GraduatesList({
  sectionId,
  sectionType,
  sectionTitle,
  config,
  EVENTS_URL,
  publicAccess,
}: SectionComponentProps) {
  const eventsUrl = normalizeEventsUrl(EVENTS_URL);
  const { closing } = config as unknown as GraduatesListConfig;
  const heading = publicAttendeesSectionTitle(
    sectionType,
    sectionTitle,
    config,
  );
  const [section, setSection] = useState<Section | null>(null);
  const [attendees, setAttendees] = useState<PublicAttendee[] | null>(null);
  const [attendeesRefreshNonce, setAttendeesRefreshNonce] = useState(0);
  const attendeesMediaRefreshDelay = useMemo(
    () => getPublicAttendeesRefreshDelay(attendees ?? []),
    [attendees],
  );
  const attendeesMediaRefreshKey = useMemo(
    () => publicAttendeesMediaRefreshKey(attendees ?? []),
    [attendees],
  );
  const lastAttendeesRefreshKeyRef = useRef("");

  useEffect(() => {
    const accessParams = resolvePublicAccessParams(
      publicAccess,
      window.location.search,
    );
    const accessScope = publicAccessCacheScope({
      previewToken: accessParams.previewToken,
      cacheKey: accessParams.cacheKey,
      invitationToken: accessParams.invitationToken,
      accessToken: accessParams.accessToken,
    });
    const CACHE_KEY = publicAccessScopedCacheKey(
      "attendees",
      sectionId,
      accessScope,
      eventsUrl,
    );
    const LEGACY_CACHE_KEY = publicAccessScopedCacheKey(
      "attendees",
      sectionId,
      accessScope,
    );
    const skipCache = accessParams.isPreview;

    if (!skipCache) {
      try {
        if (LEGACY_CACHE_KEY !== CACHE_KEY) {
          sessionStorage.removeItem(LEGACY_CACHE_KEY);
        }
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (raw) {
          const { data: rawData, ts } = JSON.parse(raw) as {
            data: unknown;
            ts: number;
          };
          if (Date.now() - ts < PUBLIC_ATTENDEES_CACHE_TTL_MS) {
            const data = normalizePublicAttendeesPayload(rawData, eventsUrl);
            if (
              Date.now() <
              getPublicAttendeesCacheExpiresAt(
                data,
                ts,
                PUBLIC_ATTENDEES_CACHE_TTL_MS,
              )
            ) {
              setAttendees(data);
              return;
            }
          }
          sessionStorage.removeItem(CACHE_KEY);
        }
      } catch {
        // corrupt cache — fall through to fetch
      }
    }

    fetchApiData<unknown>(
      buildSectionAttendeesUrl(
        eventsUrl,
        sectionId,
        publicAccessQueryParams(accessParams),
      ),
      publicAccessFetchInit(accessParams),
    )
      .then((payload) => {
        const data = normalizePublicAttendeesPayload(payload, eventsUrl);
        if (!skipCache) {
          try {
            sessionStorage.setItem(
              CACHE_KEY,
              JSON.stringify({ data, ts: Date.now() }),
            );
          } catch {
            /* full */
          }
        }
        setAttendees(data);
      })
      .catch((err) => {
        console.error("[GraduatesList] Error fetching attendees:", err);
        setAttendees([]);
      });
  }, [
    sectionId,
    eventsUrl,
    publicAccess?.previewToken,
    publicAccess?.cacheKey,
    publicAccess?.sendCacheKey,
    publicAccess?.invitationToken,
    publicAccess?.accessToken,
    attendeesRefreshNonce,
  ]);

  useEffect(() => {
    if (
      attendees === null ||
      attendeesMediaRefreshDelay === null ||
      !attendeesMediaRefreshKey
    )
      return;

    const refreshAttendeeMedia = () => {
      lastAttendeesRefreshKeyRef.current = attendeesMediaRefreshKey;
      setAttendeesRefreshNonce((nonce) => nonce + 1);
    };

    if (attendeesMediaRefreshDelay <= 0) {
      if (lastAttendeesRefreshKeyRef.current === attendeesMediaRefreshKey)
        return;
      refreshAttendeeMedia();
      return;
    }

    const timer = window.setTimeout(
      refreshAttendeeMedia,
      attendeesMediaRefreshDelay,
    );
    return () => window.clearTimeout(timer);
  }, [attendees, attendeesMediaRefreshDelay, attendeesMediaRefreshKey]);

  const isReady = section !== null && attendees !== null;
  const groupPhoto = resourceAtPosition(section?.sectionResources, 0);

  return (
    <>
      <ResourcesBySectionSingle
        sectionId={sectionId}
        EVENTS_URL={eventsUrl}
        publicAccess={publicAccess}
        onLoaded={setSection}
      />

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
            <h2
              className="text-3xl font-semibold font-bigilla"
              style={headingStyle}
            >
              {heading}
            </h2>

            <motion.ul
              className="font-medium space-y-3"
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
            >
              {attendees.map((attendee, index) => {
                const name = getPublicAttendeeName(attendee);
                const imageUrl = resolvePublicMediaUrl(
                  publicAttendeeImageUrl(attendee),
                  eventsUrl,
                );
                const hasTextDetails = Boolean(
                  attendee.headline?.trim() ||
                  attendee.bio?.trim() ||
                  attendee.signature?.trim(),
                );

                return (
                  <motion.li
                    key={attendee.order + "-" + name}
                    className="mx-auto max-w-2xl px-4 font-quicksand"
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      visible: { opacity: 1, y: 0 },
                    }}
                    transition={{ duration: 0.6 }}
                  >
                    {imageUrl && (
                      <div className="mx-auto mb-3 h-20 w-20 overflow-hidden rounded-full border border-white/70 bg-white/70 shadow-sm">
                        <ImageWithLoader
                          src={imageUrl}
                          alt={name}
                          className="rounded-full"
                        />
                      </div>
                    )}
                    <p
                      className="text-lg font-semibold"
                      style={index % 2 === 0 ? accentStyle : bodyStyle}
                    >
                      {name}
                    </p>
                    {hasTextDetails && (
                      <div
                        className="mt-1 space-y-1 text-sm leading-relaxed"
                        style={mutedStyle}
                      >
                        {attendee.headline?.trim() && (
                          <p className="font-semibold" style={accentStyle}>
                            {attendee.headline}
                          </p>
                        )}
                        {attendee.bio?.trim() && <p>{attendee.bio}</p>}
                        {attendee.signature?.trim() && (
                          <p
                            className="font-bigilla text-base"
                            style={accentStyle}
                          >
                            {attendee.signature}
                          </p>
                        )}
                      </div>
                    )}
                  </motion.li>
                );
              })}
            </motion.ul>

            {groupPhoto?.view_url && (
              <div className="mx-auto w-[90%] sm:w-[80%] md:w-[70%] lg:w-[600px] aspect-[5/2] bg-gray-100 rounded shadow-md overflow-hidden my-6">
                <ImageWithLoader
                  src={groupPhoto.view_url}
                  alt={groupPhoto.title || ""}
                />
              </div>
            )}

            <p
              className="font-bigilla font-semibold text-xl md:text-2xl"
              style={accentStyle}
            >
              {closing}
            </p>
          </motion.section>
        ) : (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Skeleton heading={heading} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
