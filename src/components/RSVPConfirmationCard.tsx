"use client";

import { useRef, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import type { InvitationData } from './InvitationDataLoader';

// Dynamic imports — only loaded after RSVP confirm (code splitting)
const QRCodeSVG = lazy(() =>
  import('qrcode.react').then(m => ({ default: m.QRCodeSVG }))
);

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
      const dataUrl = await toPng(cardRef.current, { quality: 0.95, pixelRatio: 2 });
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
    `¡Confirmé mi asistencia! 🎉\n${eventName ? `${eventName}\n` : ''}${formattedDate}\n\nMi invitación: ${eventUrl}`
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="flex flex-col items-center gap-4 mt-8"
    >
      {/* Card — captured by html-to-image */}
      <div
        ref={cardRef}
        className="w-72 rounded-3xl p-6 flex flex-col items-center gap-4 text-center"
        style={{ background: '#fff', border: '2px dashed #C7A44C' }}
      >
        <div>
          <p
            className="text-xs uppercase tracking-widest font-aloevera"
            style={{ color: '#8B5D3D' }}
          >
            Confirmación de asistencia
          </p>
          {eventName && (
            <h3 className="text-xl font-astralaga mt-1" style={{ color: '#07293A' }}>
              {eventName}
            </h3>
          )}
        </div>

        <div className="w-12 h-px" style={{ backgroundColor: '#C7A44C' }} />

        <p className="text-2xl font-astralaga" style={{ color: '#07293A' }}>
          {invData.guestName}
        </p>

        <p className="text-sm font-aloevera capitalize" style={{ color: '#8B5D3D' }}>
          {formattedDate}
        </p>

        {/* QR Code */}
        <div className="p-3 rounded-xl" style={{ border: '1px solid #e5e7eb' }}>
          <Suspense
            fallback={<div className="w-24 h-24 bg-gray-100 animate-pulse rounded" />}
          >
            <QRCodeSVG
              value={eventUrl}
              size={96}
              fgColor="#07293A"
              bgColor="#ffffff"
              level="M"
            />
          </Suspense>
        </div>

        <p className="text-xs font-aloevera" style={{ color: '#9ca3af' }}>
          Presenta este QR en la entrada
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 w-72">
        <a
          href={`https://wa.me/?text=${whatsappText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-aloevera text-sm"
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
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-aloevera text-sm border-2 border-dashed"
          style={{ borderColor: '#C7A44C', color: '#8B5D3D' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Guardar
        </button>
      </div>
    </motion.div>
  );
}
