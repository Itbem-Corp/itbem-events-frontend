"use client";

import { useRef, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import type { InvitationData } from './InvitationDataLoader';

// Dynamic imports — only loaded after RSVP confirm (code splitting)
const QRCodeSVG = lazy(() =>
  import('qrcode.react').then(m => ({ default: m.QRCodeSVG }))
);

/* ── Catalyst logomark (icon only) ──────────────────────────────────── */
function EventiAppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 26 22" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.999.5L6.57.743.57 10.743v.514l6 10 .429.243H19l.353-.854L16.853 18.146 16.499 18H9.274L4.841 11l4.433-7H16.499l.354-.146 2.5-2.5L19 .5H6.999Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M20.793 4.219l-2.427 2.427-.069.621 2.364 3.732-2.364 3.733.069.621 2.427 2.427.783-.096 3.856-6.427v-.514l-3.856-6.427-.783-.097Z"
      />
    </svg>
  );
}

interface Props {
  invData: InvitationData;
  token: string;
  EVENTS_URL: string;
}

export default function RSVPConfirmationCard({ invData, token, EVENTS_URL }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Build the invitation URL — QR points back to the event page with token
  const origin = typeof window !== 'undefined' ? window.location.origin : EVENTS_URL.replace(/\/$/, '');
  const eventUrl = `${origin}/evento?token=${token}`;

  const formattedDate = new Date(invData.eventDate).toLocaleDateString('es-MX', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handleSaveImage = async () => {
    if (!cardRef.current) return;
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(cardRef.current, { quality: 0.95, pixelRatio: 3 });
      const link = document.createElement('a');
      link.download = `confirmacion-${invData.guestName.replace(/\s+/g, '-').toLowerCase()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error('[RSVPCard] save image error', e);
    }
  };

  // InvitationData does not include eventName — cast to extended type for future-proofing
  const eventName = (invData as InvitationData & { eventName?: string }).eventName;

  const whatsappText = encodeURIComponent(
    `¡Confirme mi asistencia! 🎉\n${eventName ? `${eventName}\n` : ''}${formattedDate}\n\nMi invitacion: ${eventUrl}`
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="flex flex-col items-center gap-5 mt-8"
    >
      {/* Card — captured by html-to-image */}
      <div
        ref={cardRef}
        className="w-80 rounded-3xl overflow-hidden flex flex-col items-center text-center"
        style={{ background: '#ffffff', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}
      >
        {/* Gold accent bar */}
        <div className="w-full h-1.5" style={{ background: 'linear-gradient(90deg, #C7A44C, #E8D5A0, #C7A44C)' }} />

        <div className="px-8 py-7 flex flex-col items-center gap-4 w-full">
          {/* Brand mark */}
          <div className="flex items-center gap-1.5">
            <EventiAppMark className="h-3.5 w-auto text-[#C7A44C]" />
            <span
              className="text-[10px] uppercase tracking-[0.2em] font-aloevera font-medium"
              style={{ color: '#C7A44C' }}
            >
              eventiapp
            </span>
          </div>

          {/* Header */}
          <div>
            <p
              className="text-xs uppercase tracking-[0.15em] font-aloevera"
              style={{ color: '#8B5D3D' }}
            >
              Confirmacion de asistencia
            </p>
            {eventName && (
              <h3 className="text-xl font-astralaga mt-1.5" style={{ color: '#07293A' }}>
                {eventName}
              </h3>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 w-full px-4">
            <div className="flex-1 h-px" style={{ backgroundColor: '#E8D5A0' }} />
            <div className="w-1.5 h-1.5 rotate-45" style={{ backgroundColor: '#C7A44C' }} />
            <div className="flex-1 h-px" style={{ backgroundColor: '#E8D5A0' }} />
          </div>

          {/* Guest name */}
          <p className="text-2xl font-astralaga leading-tight" style={{ color: '#07293A' }}>
            {invData.guestName}
          </p>

          {/* Date */}
          <p className="text-sm font-aloevera capitalize" style={{ color: '#8B5D3D' }}>
            {formattedDate}
          </p>

          {/* QR Code with branded frame */}
          <div
            className="p-4 rounded-2xl mt-1"
            style={{
              background: '#FAFAF8',
              border: '1.5px solid #E8D5A0',
            }}
          >
            <Suspense
              fallback={<div className="w-28 h-28 bg-gray-100 animate-pulse rounded-lg" />}
            >
              <QRCodeSVG
                value={eventUrl}
                size={112}
                fgColor="#07293A"
                bgColor="#FAFAF8"
                level="M"
                imageSettings={{
                  src: 'data:image/svg+xml,' + encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 22" fill="%23C7A44C"><path fill-rule="evenodd" clip-rule="evenodd" d="M6.999.5L6.57.743.57 10.743v.514l6 10 .429.243H19l.353-.854L16.853 18.146 16.499 18H9.274L4.841 11l4.433-7H16.499l.354-.146 2.5-2.5L19 .5H6.999Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M20.793 4.219l-2.427 2.427-.069.621 2.364 3.732-2.364 3.733.069.621 2.427 2.427.783-.096 3.856-6.427v-.514l-3.856-6.427-.783-.097Z"/></svg>'
                  ),
                  height: 16,
                  width: 20,
                  excavate: true,
                }}
              />
            </Suspense>
          </div>

          {/* Hint */}
          <p className="text-[11px] font-aloevera" style={{ color: '#9ca3af' }}>
            Presenta este codigo QR en la entrada
          </p>
        </div>

        {/* Bottom gold accent */}
        <div className="w-full h-1" style={{ background: 'linear-gradient(90deg, #C7A44C, #E8D5A0, #C7A44C)' }} />
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 w-80">
        <a
          href={`https://wa.me/?text=${whatsappText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-aloevera text-sm shadow-sm"
          style={{ backgroundColor: '#25D366', color: '#fff' }}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.528 5.852L0 24l6.335-1.652A11.96 11.96 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.797 9.797 0 01-5.002-1.366l-.359-.213-3.722.976.994-3.624-.234-.372A9.79 9.79 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z"/>
          </svg>
          Compartir
        </a>

        <button
          type="button"
          onClick={handleSaveImage}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-aloevera text-sm shadow-sm transition-colors"
          style={{
            background: 'linear-gradient(135deg, #07293A, #0D3D56)',
            color: '#E8D5A0',
          }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Guardar imagen
        </button>
      </div>
    </motion.div>
  );
}
