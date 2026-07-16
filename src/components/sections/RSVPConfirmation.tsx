"use client";

import {
  useEffect,
  useMemo,
  useState,
  lazy,
  Suspense,
  type CSSProperties,
} from "react";
import InvitationLoader, { type InvitationData } from "../InvitationDataLoader";
import ResourcesBySectionSingle, {
  type Section,
} from "../ResourcesBySectionSingle";
import ImageWithLoader from "../ImageWithLoader";
import { recordPublicRumMetric } from "../../lib/publicRum";
import { resourceAtPosition } from "../../lib/publicResources";
import type {
  SectionComponentProps,
  RSVPConfirmationConfig,
} from "../engine/types";
import { useToast } from "../../hooks/useToast";
import ToastList from "../common/Toast";
import { buildRsvpUrl } from "../../lib/apiUrls";
import { fetchApiData } from "../../lib/apiFetch";
import { normalizeEventsUrl } from "../../lib/eventsUrl";
import {
  buildRsvpThankYouMessage,
  cleanEventMessage,
} from "../../lib/eventMessages";
import {
  buildRsvpConfirmationRequest,
  mergeInvitationPayload,
} from "../../lib/invitationData";
import {
  publicAccessFetchInit,
  resolvePublicAccessParams,
} from "../../lib/publicPreview";

const RSVPConfirmationCard = lazy(() => import("../RSVPConfirmationCard"));

const missingRsvpTokenMessage =
  "Este enlace de RSVP necesita un token personal. Usa el enlace que recibiste por invitacion.";

type RSVPAnswer = "yes" | "no" | null;

function savedDietaryOption(value: string): string | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (
    normalized === "vegetariano" ||
    normalized === "vegano" ||
    normalized === "sin_gluten"
  ) {
    return normalized;
  }
  return null;
}

const themedHeadingStyle: CSSProperties = {
  color: "var(--eventi-color-heading, #07293A)",
  fontFamily:
    "var(--eventi-font-heading-effective, 'Astralaga SemiBold', serif)",
};

const themedBodyStyle: CSSProperties = {
  color: "var(--eventi-color-body, #07293A)",
  fontFamily: "var(--eventi-font-body-effective, Aloevera Display, sans-serif)",
};

const themedAccentTextStyle: CSSProperties = {
  color: "var(--eventi-color-accent, #8B5D3D)",
  fontFamily:
    "var(--eventi-font-accent-effective, Aloevera Display, sans-serif)",
};

const themedPanelStyle: CSSProperties = {
  ...themedBodyStyle,
  backgroundColor: "var(--eventi-color-surface, #ffffff)",
  borderColor: "var(--eventi-color-border, #C7A44C)",
};

const themedQuestionStyle: CSSProperties = {
  ...themedHeadingStyle,
  backgroundColor: "var(--eventi-color-surface, #ffffff)",
  borderColor: "var(--eventi-color-border, #C7A44C)",
};

const themedImageFrameStyle: CSSProperties = {
  borderColor: "var(--eventi-color-border, #C7A44C)",
};

const themedSelectedButtonStyle: CSSProperties = {
  color: "var(--eventi-color-heading, #07293A)",
  backgroundColor: "var(--eventi-color-accent, #C7A44C)",
  borderColor: "var(--eventi-color-border, #C7A44C)",
  fontFamily:
    "var(--eventi-font-accent-effective, Aloevera Display, sans-serif)",
};

const themedUnselectedButtonStyle: CSSProperties = {
  color: "var(--eventi-color-body, #07293A)",
  backgroundColor: "var(--eventi-color-surface, #ffffff)",
  borderColor: "var(--eventi-color-border, #C7A44C)",
  fontFamily: "var(--eventi-font-body-effective, Aloevera Display, sans-serif)",
};

const themedPrimaryButtonStyle: CSSProperties = {
  color: "var(--eventi-color-heading, #07293A)",
  backgroundColor: "var(--eventi-color-accent, #C7A44C)",
  fontFamily:
    "var(--eventi-font-heading-effective, 'Astralaga SemiBold', serif)",
};

export default function RSVPConfirmation({
  sectionId,
  config,
  EVENTS_URL,
  publicAccess,
}: SectionComponentProps) {
  const eventsUrl = normalizeEventsUrl(EVENTS_URL);
  const cfg = config as unknown as RSVPConfirmationConfig;
  const welcomeMessage = cleanEventMessage(cfg.welcome_message);
  const thankYouMessage = cleanEventMessage(cfg.thank_you_message);
  const guestSignatureTitle = cleanEventMessage(cfg.guest_signature_title);
  const [invData, setInvData] = useState<InvitationData | null>(null);
  const [invError, setInvError] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState<string | null>(null);
  const [numPersonas, setNumPersonas] = useState<number>(1);
  const [dietary, setDietary] = useState<string>("none");
  const [dietaryOther, setDietaryOther] = useState<string>("");
  const [guestNote, setGuestNote] = useState<string>("");
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showCard, setShowCard] = useState(false);
  const [sectionImages, setSectionImages] = useState<Section | null>(null);
  const { toasts, addToast, removeToast } = useToast();
  const rsvpUrl = buildRsvpUrl(eventsUrl);
  const accessParams = useMemo(
    () => resolvePublicAccessParams(publicAccess),
    [
      publicAccess?.accessToken,
      publicAccess?.cacheKey,
      publicAccess?.sendCacheKey,
      publicAccess?.invitationToken,
      publicAccess?.previewToken,
    ],
  );

  const reopenRsvpForm = (initialAnswer: RSVPAnswer = null) => {
    if (initialAnswer === "yes" && invData) {
      const guestCount =
        invData.rsvpGuestCount && invData.rsvpGuestCount > 0
          ? invData.rsvpGuestCount
          : numPersonas;
      setNumPersonas(Math.min(Math.max(guestCount, 1), invData.maxGuests));
      const savedDietary = invData.dietaryRestrictions?.trim() ?? "";
      const savedOption = savedDietaryOption(savedDietary);
      if (!savedDietary) {
        setDietary("none");
        setDietaryOther("");
      } else if (savedOption) {
        setDietary(savedOption);
        setDietaryOther("");
      } else {
        setDietary("other");
        setDietaryOther(savedDietary);
      }
      setGuestNote(invData.rsvpNotes ?? "");
    } else {
      setDietary("none");
      setDietaryOther("");
      setGuestNote("");
    }

    setInvData((prev) => (prev ? { ...prev, rsvpStatus: "pending" } : prev));
    setRespuesta(initialAnswer);
    setMessage(null);
    setShowCard(false);
  };

  useEffect(() => {
    const nextToken = accessParams.invitationToken;
    setToken(nextToken);
    if (!nextToken) {
      setInvError(missingRsvpTokenMessage);
      return;
    }
    setInvError((current) =>
      current === missingRsvpTokenMessage ? null : current,
    );
  }, [accessParams.invitationToken]);

  const handleConfirm = async () => {
    if (!invData || !respuesta) return;
    setLoading(true);
    setMessage(null);

    const dietaryNote =
      dietary === "none"
        ? ""
        : dietary === "other"
          ? dietaryOther.trim()
          : dietary;
    const cleanGuestNote = guestNote.trim();
    const nextStatus = respuesta === "yes" ? "confirmed" : "declined";
    const nextGuestCount = respuesta === "yes" ? numPersonas : 0;

    const submitStartedAt = performance.now();
    try {
      const confirmationPayload = await fetchApiData<unknown>(
        rsvpUrl,
        publicAccessFetchInit(
          {
            ...accessParams,
            invitationToken: token ?? accessParams.invitationToken,
          },
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              buildRsvpConfirmationRequest(
                invData,
                token,
                nextStatus,
                nextGuestCount,
                cleanGuestNote,
                dietaryNote,
              ),
            ),
          },
        ),
        "Error en la confirmación",
      );

      setInvData((prev) =>
        prev
          ? mergeInvitationPayload(prev, confirmationPayload, {
              rsvpStatus: nextStatus,
              rsvpMethod: "web",
              rsvpGuestCount: nextGuestCount,
              dietaryRestrictions: dietaryNote,
              rsvpNotes: cleanGuestNote,
            })
          : prev,
      );
      setMessage(
        respuesta === "yes"
          ? buildRsvpThankYouMessage(
              invData.eventDate,
              thankYouMessage,
              invData.eventTimezone,
            )
          : "Lamentamos que no nos puedas acompañar esta vez",
      );
      if (respuesta === "yes") setShowCard(true);
      addToast(
        respuesta === "yes"
          ? "¡Asistencia confirmada!"
          : "Respuesta registrada",
        "success",
      );
      recordPublicRumMetric("rsvp_submit_ms", performance.now() - submitStartedAt);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error en la confirmación";
      console.error("Error confirmando invitación:", err);
      addToast(`Error: ${msg}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!invData) return;
    const confirmed = window.confirm(
      "¿Quieres cancelar tu confirmación? Podrás responder de nuevo desde esta misma invitación.",
    );
    if (!confirmed) return;
    try {
      const confirmationPayload = await fetchApiData<unknown>(
        rsvpUrl,
        publicAccessFetchInit(
          {
            ...accessParams,
            invitationToken: token ?? accessParams.invitationToken,
          },
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              buildRsvpConfirmationRequest(
                invData,
                token,
                "declined",
                0,
                "",
                "",
              ),
            ),
          },
        ),
        "Error al cancelar confirmación",
      );
      setInvData((prev) =>
        prev
          ? mergeInvitationPayload(prev, confirmationPayload, {
              rsvpStatus: "declined",
              rsvpMethod: "web",
              rsvpGuestCount: 0,
              dietaryRestrictions: "",
              rsvpNotes: "",
            })
          : prev,
      );
      setMessage(null);
      setRespuesta("no");
      setShowCard(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al cancelar";
      console.error("Error cancelando:", err);
      addToast(`Error: ${msg}`, "error");
    }
  };

  const imgNo = resourceAtPosition(sectionImages?.sectionResources, 0);
  const imgSi = resourceAtPosition(sectionImages?.sectionResources, 1);

  return (
    <section className="text-center space-y-6 pb-6 pt-10 relative z-10">
      {token && (
        <InvitationLoader
          token={token}
          EVENTS_URL={eventsUrl}
          publicAccess={accessParams}
          onLoaded={setInvData}
          onError={(msg) => setInvError(msg)}
        />
      )}
      <ResourcesBySectionSingle
        sectionId={sectionId}
        EVENTS_URL={eventsUrl}
        publicAccess={accessParams}
        onLoaded={setSectionImages}
      />

      {invError && (
        <p className="font-aloevera text-red-600 text-lg sm:text-2xl mt-6">
          {invError}
        </p>
      )}

      {!invError && token && !invData && (
        <p className="font-aloevera" style={themedBodyStyle}>
          Cargando...
        </p>
      )}

      {invData && !invError && (
        <>
          {invData.rsvpStatus === "confirmed" ? (
            <div className="flex flex-col items-center">
              <p
                className="text-base sm:text-xl font-aloevera mb-4 border-2 border-dashed rounded-xl px-4 sm:px-6 py-3 inline-block text-center whitespace-pre-line"
                style={themedPanelStyle}
              >
                {buildRsvpThankYouMessage(
                  invData.eventDate,
                  thankYouMessage,
                  invData.eventTimezone,
                )}
              </p>
              {imgSi?.view_url && (
                <div
                  className="w-32 sm:w-40 md:w-52 lg:w-60 xl:w-64 rounded-3xl border-2 border-dashed shadow-lg overflow-hidden"
                  style={themedImageFrameStyle}
                >
                  <ImageWithLoader
                    src={imgSi.view_url}
                    alt={imgSi.title || ""}
                  />
                </div>
              )}
              {invData && (
                <Suspense fallback={null}>
                  <RSVPConfirmationCard
                    invData={invData}
                    token={invData.prettyToken}
                  />
                </Suspense>
              )}
              <div className="mt-8 rounded-3xl border border-black/5 bg-white/45 px-5 py-5 text-center shadow-sm backdrop-blur-sm">
                <p
                  className="mb-3 text-sm font-aloevera"
                  style={themedBodyStyle}
                >
                  ¿Necesitas hacer un cambio?
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => reopenRsvpForm("yes")}
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-current/15 px-4 py-2 text-sm font-semibold font-aloevera transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/30"
                    style={themedAccentTextStyle}
                  >
                    Cambiar mi respuesta
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-sm font-medium font-aloevera opacity-70 transition hover:bg-black/5 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/30"
                    style={themedAccentTextStyle}
                  >
                    Cancelar mi confirmación
                  </button>
                </div>
              </div>
            </div>
          ) : invData.rsvpStatus === "declined" ? (
            <div>
              <p
                className="text-base sm:text-xl font-aloevera mb-4 border-2 border-dashed rounded-xl px-4 sm:px-6 py-3 inline-block"
                style={themedPanelStyle}
              >
                Lamentamos que no nos puedas acompañar esta vez
              </p>
              {imgNo?.view_url && (
                <div
                  className="w-32 sm:w-40 md:w-52 lg:w-60 xl:w-64 rounded-3xl border-2 border-dashed shadow-lg overflow-hidden mx-auto"
                  style={themedImageFrameStyle}
                >
                  <ImageWithLoader
                    src={imgNo.view_url}
                    alt={imgNo.title || ""}
                  />
                </div>
              )}
              <div className="mt-8 text-center px-4">
                <p
                  className="text-lg font-aloevera mb-2"
                  style={themedBodyStyle}
                >
                  Si tus planes cambiaron puedes actualizar tu RSVP.
                </p>
                <button
                  type="button"
                  onClick={() => reopenRsvpForm()}
                  className="underline text-lg font-aloevera transition-opacity hover:opacity-80"
                  style={themedAccentTextStyle}
                >
                  Cambiar mi respuesta
                </button>
              </div>
            </div>
          ) : message ? (
            <div>
              <p
                className="text-base sm:text-xl font-aloevera whitespace-pre-line border-2 border-dashed rounded-xl px-4 sm:px-6 py-3 inline-block"
                style={themedPanelStyle}
              >
                {message}
              </p>
              {respuesta === "yes" && imgSi?.view_url && (
                <div
                  className="w-32 sm:w-40 md:w-52 lg:w-60 xl:w-64 rounded-3xl border-2 border-dashed shadow-lg overflow-hidden mx-auto mt-4"
                  style={themedImageFrameStyle}
                >
                  <ImageWithLoader
                    src={imgSi.view_url}
                    alt={imgSi.title || ""}
                  />
                </div>
              )}
              {respuesta === "no" && imgNo?.view_url && (
                <div
                  className="w-32 sm:w-40 md:w-52 lg:w-60 xl:w-64 rounded-3xl border-2 border-dashed shadow-lg overflow-hidden mx-auto mt-4"
                  style={themedImageFrameStyle}
                >
                  <ImageWithLoader
                    src={imgNo.view_url}
                    alt={imgNo.title || ""}
                  />
                </div>
              )}
              {showCard && invData && (
                <Suspense fallback={null}>
                  <RSVPConfirmationCard
                    invData={invData}
                    token={invData.prettyToken}
                  />
                </Suspense>
              )}
            </div>
          ) : (
            <>
              <h3
                className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-astralaga"
                style={themedHeadingStyle}
              >
                {invData.guestName}
              </h3>
              {welcomeMessage && (
                <p
                  className="max-w-xl mx-auto text-base sm:text-xl font-aloevera whitespace-pre-line"
                  style={themedBodyStyle}
                >
                  {welcomeMessage}
                </p>
              )}
              <p
                className="text-lg sm:text-2xl font-aloevera"
                style={themedAccentTextStyle}
              >
                No. personas:{" "}
                <span className="font-semibold">{invData.maxGuests}</span>
              </p>

              <h2
                id={`rsvp-question-${sectionId}`}
                className="text-2xl sm:text-3xl font-astralaga mt-4 border-2 border-dashed rounded-full px-5 sm:px-8 py-2 inline-block"
                style={themedQuestionStyle}
              >
                ¿Nos acompañas?
              </h2>

              <div
                className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-6 mt-6 px-4 sm:px-0"
                role="group"
                aria-labelledby={`rsvp-question-${sectionId}`}
              >
                <button
                  type="button"
                  aria-pressed={respuesta === "yes"}
                  onClick={() => setRespuesta("yes")}
                  className="px-5 sm:px-6 py-3 rounded-2xl font-aloevera border-2 border-dashed text-sm sm:text-base transition-opacity hover:opacity-90"
                  style={
                    respuesta === "yes"
                      ? themedSelectedButtonStyle
                      : themedUnselectedButtonStyle
                  }
                >
                  Claro, con gusto
                </button>
                <button
                  type="button"
                  aria-pressed={respuesta === "no"}
                  onClick={() => setRespuesta("no")}
                  className="px-5 sm:px-6 py-3 rounded-2xl font-aloevera border-2 border-dashed text-sm sm:text-base transition-opacity hover:opacity-90"
                  style={
                    respuesta === "no"
                      ? themedSelectedButtonStyle
                      : themedUnselectedButtonStyle
                  }
                >
                  No podré esta vez
                </button>
              </div>

              {respuesta === "yes" && (
                <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2">
                  <label
                    htmlFor={`rsvp-guests-${sectionId}`}
                    className="text-lg sm:text-2xl font-aloevera"
                    style={themedAccentTextStyle}
                  >
                    No. personas confirmadas:
                  </label>
                  <select
                    id={`rsvp-guests-${sectionId}`}
                    value={numPersonas}
                    onChange={(e) => setNumPersonas(Number(e.target.value))}
                    className="border-2 border-dashed rounded px-3 py-2 font-aloevera text-base sm:text-xl"
                    style={themedPanelStyle}
                  >
                    {Array.from(
                      { length: invData.maxGuests },
                      (_, i) => i + 1,
                    ).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {respuesta === "yes" && (
                <div className="mt-4 flex flex-col items-center gap-3">
                  <p
                    className="text-base sm:text-xl font-aloevera"
                    style={themedBodyStyle}
                  >
                    ¿Alguna restricción alimentaria?
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {(
                      [
                        { value: "none", label: "Ninguna" },
                        { value: "vegetariano", label: "Vegetariano" },
                        { value: "vegano", label: "Vegano" },
                        { value: "sin_gluten", label: "Sin gluten" },
                        { value: "other", label: "Otra" },
                      ] as const
                    ).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={dietary === value}
                        onClick={() => setDietary(value)}
                        className="px-4 py-2 rounded-xl font-aloevera text-sm border-2 border-dashed transition-opacity hover:opacity-90"
                        style={
                          dietary === value
                            ? themedSelectedButtonStyle
                            : themedUnselectedButtonStyle
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {dietary === "other" && (
                    <input
                      type="text"
                      value={dietaryOther}
                      onChange={(e) => setDietaryOther(e.target.value)}
                      placeholder="Escribe tu restricción..."
                      className="border-2 border-dashed rounded-xl px-4 py-2 font-aloevera text-sm w-full max-w-xs text-center"
                      style={themedPanelStyle}
                      aria-label="Especifica tu restricción alimentaria"
                    />
                  )}
                  {guestSignatureTitle && (
                    <textarea
                      value={guestNote}
                      onChange={(e) => setGuestNote(e.target.value)}
                      placeholder={guestSignatureTitle}
                      aria-label={guestSignatureTitle}
                      maxLength={180}
                      rows={2}
                      className="border-2 border-dashed rounded-xl px-4 py-2 font-aloevera text-sm w-full max-w-xs text-center resize-none"
                      style={themedPanelStyle}
                    />
                  )}
                </div>
              )}

              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={loading || !respuesta}
                  className="text-xl sm:text-3xl px-8 sm:px-12 py-3 rounded-full font-astralaga disabled:opacity-50 transition-opacity hover:opacity-90"
                  style={themedPrimaryButtonStyle}
                >
                  {loading ? "Enviando..." : "Enviar"}
                </button>
              </div>
            </>
          )}
        </>
      )}

      <ToastList toasts={toasts} onRemove={removeToast} />
    </section>
  );
}
