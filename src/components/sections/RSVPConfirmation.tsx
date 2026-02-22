"use client";

import { useEffect, useState, lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import InvitationLoader, { type InvitationData } from '../InvitationDataLoader';
import ResourcesBySectionSingle, { type Section } from '../ResourcesBySectionSingle';
import ImageWithLoader from '../ImageWithLoader';
import type { SectionComponentProps } from '../engine/types';
import { useToast } from '../../hooks/useToast';
import ToastList from '../common/Toast';

const RSVPConfirmationCard = lazy(() => import('../RSVPConfirmationCard'));

export default function RSVPConfirmation({ sectionId, EVENTS_URL }: SectionComponentProps) {
  const [invData, setInvData] = useState<InvitationData | null>(null);
  const [invError, setInvError] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState<string | null>(null);
  const [numPersonas, setNumPersonas] = useState<number>(1);
  const [dietary, setDietary] = useState<string>('none');
  const [dietaryOther, setDietaryOther] = useState<string>('');
  const [token, setToken] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showCard, setShowCard] = useState(false);
  const [sectionImages, setSectionImages] = useState<Section | null>(null);
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token') ?? '');
  }, []);

  const handleConfirm = async () => {
    if (!invData || !respuesta) return;
    setLoading(true);
    setMessage(null);

    const dietaryNote =
      dietary === 'none'
        ? ''
        : dietary === 'other'
        ? dietaryOther.trim()
        : dietary;

    try {
      const res = await fetch(`${EVENTS_URL}api/invitations/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pretty_token: invData.prettyToken,
          status: respuesta === 'yes' ? 'confirmed' : 'declined',
          method: 'web',
          guest_count: respuesta === 'yes' ? numPersonas : 0,
          ...(dietaryNote ? { notes: dietaryNote } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error en la confirmación');

      setMessage(
        respuesta === 'yes'
          ? `Gracias por confirmar tu asistencia\nNos vemos el ${new Date(invData.eventDate).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}`
          : 'Lamentamos que no nos puedas acompañar esta vez',
      );
      if (respuesta === 'yes') setShowCard(true);
      addToast(
        respuesta === 'yes' ? '¡Asistencia confirmada! 🎉' : 'Respuesta registrada',
        'success',
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error en la confirmación';
      console.error('Error confirmando invitación:', err);
      addToast(`Error: ${msg}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!invData) return;
    try {
      const res = await fetch(`${EVENTS_URL}api/invitations/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pretty_token: invData.prettyToken, status: 'declined', method: 'web', guest_count: 0 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error al cancelar confirmación');
      setInvData(prev => prev ? { ...prev, rsvpStatus: 'declined' } : prev);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cancelar';
      console.error('Error cancelando:', err);
      addToast(`Error: ${msg}`, 'error');
    }
  };

  const imgNo = sectionImages?.sectionResources[0];
  const imgSi = sectionImages?.sectionResources[1];

  return (
    <section className="text-center space-y-6 pb-6 pt-10 relative z-10">
      <InvitationLoader
        token={token}
        EVENTS_URL={EVENTS_URL}
        onLoaded={setInvData}
        onError={msg => setInvError(msg)}
      />
      <ResourcesBySectionSingle
        sectionId={sectionId}
        EVENTS_URL={EVENTS_URL}
        onLoaded={setSectionImages}
      />

      {invError && (
        <p className="font-aloevera text-red-600 text-2xl mt-6">{invError}</p>
      )}

      {!invError && !invData && (
        <p className="font-aloevera">Cargando...</p>
      )}

      {invData && !invError && (
        <>
          {invData.rsvpStatus === 'confirmed' ? (
            <div className="flex flex-col items-center">
              <p className="text-xl font-aloevera text-dark mb-4 border-2 border-dashed border-gold rounded-xl px-6 py-3 inline-block text-center">
                Gracias por confirmar tu asistencia
                <br />
                Nos vemos el{' '}
                {new Date(invData.eventDate).toLocaleDateString('es-MX', {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              </p>
              {imgSi?.view_url && (
                <div className="w-40 md:w-52 lg:w-60 xl:w-64 rounded-3xl border-2 border-dashed border-gold shadow-lg overflow-hidden">
                  <ImageWithLoader src={imgSi.view_url} alt={imgSi.title || ''} />
                </div>
              )}
              <div className="mt-24 text-center px-4">
                <p className="text-lg font-aloevera text-dark mb-2">
                  O si necesitas cancelar por cualquier motivo da clic abajo:
                </p>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="text-gold underline text-lg font-aloevera hover:text-dark transition-colors"
                >
                  Cancelar mi confirmación
                </button>
              </div>
              {invData && (
                <Suspense fallback={null}>
                  <RSVPConfirmationCard
                    invData={invData}
                    token={invData.prettyToken}
                    EVENTS_URL={EVENTS_URL}
                  />
                </Suspense>
              )}
            </div>
          ) : invData.rsvpStatus === 'declined' ? (
            <div>
              <p className="text-xl font-aloevera text-dark mb-4 border-2 border-dashed border-gold rounded-xl px-6 py-3 inline-block">
                Lamentamos que no nos puedas acompañar esta vez
              </p>
              {imgNo?.view_url && (
                <div className="w-40 md:w-52 lg:w-60 xl:w-64 rounded-3xl border-2 border-dashed border-gold shadow-lg overflow-hidden mx-auto">
                  <ImageWithLoader src={imgNo.view_url} alt={imgNo.title || ''} />
                </div>
              )}
            </div>
          ) : message ? (
            <div>
              <p className="text-xl font-aloevera text-dark whitespace-pre-line border-2 border-dashed border-gold rounded-xl px-6 py-3 inline-block">
                {message}
              </p>
              {respuesta === 'yes' && imgSi?.view_url && (
                <div className="w-40 md:w-52 lg:w-60 xl:w-64 rounded-3xl border-2 border-dashed border-gold shadow-lg overflow-hidden mx-auto mt-4">
                  <ImageWithLoader src={imgSi.view_url} alt={imgSi.title || ''} />
                </div>
              )}
              {respuesta === 'no' && imgNo?.view_url && (
                <div className="w-40 md:w-52 lg:w-60 xl:w-64 rounded-3xl border-2 border-dashed border-gold shadow-lg overflow-hidden mx-auto mt-4">
                  <ImageWithLoader src={imgNo.view_url} alt={imgNo.title || ''} />
                </div>
              )}
              {showCard && invData && (
                <Suspense fallback={null}>
                  <RSVPConfirmationCard
                    invData={invData}
                    token={invData.prettyToken}
                    EVENTS_URL={EVENTS_URL}
                  />
                </Suspense>
              )}
            </div>
          ) : (
            <>
              <h3 className="text-2xl sm:text-3xl md:text-4xl font-astralaga text-dark">{invData.guestName}</h3>
              <p className="text-2xl font-aloevera text-gold">
                No. personas: <span className="font-semibold">{invData.maxGuests}</span>
              </p>

              <h2 className="text-3xl font-astralaga text-dark mt-4 border-2 border-dashed border-gold rounded-full px-8 py-2 inline-block">
                ¿Nos acompañas?
              </h2>

              <div className="flex flex-row justify-center gap-6 mt-6">
                <button
                  type="button"
                  onClick={() => setRespuesta('yes')}
                  className={cn(
                    'px-6 py-3 rounded-2xl font-aloevera border-2 border-dashed border-gold',
                    respuesta === 'yes' ? 'bg-gold text-dark' : 'bg-white text-dark',
                  )}
                >
                  Claro, con gusto
                </button>
                <button
                  type="button"
                  onClick={() => setRespuesta('no')}
                  className={cn(
                    'px-6 py-3 rounded-2xl font-aloevera border-2 border-dashed border-gold',
                    respuesta === 'no' ? 'bg-gold text-dark' : 'bg-white text-dark',
                  )}
                >
                  No podré esta vez
                </button>
              </div>

              {respuesta === 'yes' && (
                <div className="mt-6 flex items-center justify-center gap-2">
                  <p className="text-2xl font-aloevera text-gold">No. personas confirmadas:</p>
                  <select
                    value={numPersonas}
                    onChange={e => setNumPersonas(Number(e.target.value))}
                    className="border-2 border-dashed border-gold rounded px-3 py-2 font-aloevera text-dark text-xl"
                  >
                    {Array.from({ length: invData.maxGuests }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              )}

              {respuesta === 'yes' && (
                <div className="mt-4 flex flex-col items-center gap-3">
                  <p className="text-xl font-aloevera text-dark">¿Alguna restricción alimentaria?</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {([
                      { value: 'none', label: 'Ninguna' },
                      { value: 'vegetariano', label: 'Vegetariano' },
                      { value: 'vegano', label: 'Vegano' },
                      { value: 'sin_gluten', label: 'Sin gluten' },
                      { value: 'other', label: 'Otra' },
                    ] as const).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setDietary(value)}
                        className={cn(
                          'px-4 py-2 rounded-xl font-aloevera text-sm border-2 border-dashed border-gold transition-colors',
                          dietary === value ? 'bg-gold text-dark' : 'bg-white text-dark',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {dietary === 'other' && (
                    <input
                      type="text"
                      value={dietaryOther}
                      onChange={(e) => setDietaryOther(e.target.value)}
                      placeholder="Escribe tu restricción..."
                      className="border-2 border-dashed border-gold rounded-xl px-4 py-2 font-aloevera text-dark text-sm w-full max-w-xs text-center"
                      aria-label="Especifica tu restricción alimentaria"
                    />
                  )}
                </div>
              )}

              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={loading || !respuesta}
                  className="bg-gold text-dark text-3xl px-12 py-3 rounded-full font-astralaga disabled:opacity-50"
                >
                  {loading ? 'Enviando...' : 'Enviar'}
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
