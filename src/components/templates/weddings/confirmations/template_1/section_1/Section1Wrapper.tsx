"use client";
import { useEffect, useState } from "react";
import InvitationLoader, { type InvitationData } from "../../../../../../components/InvitationDataLoader.tsx";
import ResourcesBySectionSingle, { type Section } from "@/components/ResourcesBySectionSingle.tsx";
import { Section1_1, Section1_2 } from "./Selection1Images";

export default function Section1Wrapper({ EVENTS_URL }: { EVENTS_URL: string }) {
    const [invData, setInvData] = useState<InvitationData | null>(null);
    const [invError, setInvError] = useState<string | null>(null); // ✅ nuevo estado error
    const [respuesta, setRespuesta] = useState<string | null>(null);
    const [numPersonas, setNumPersonas] = useState<number>(1);
    const [token, setToken] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const [sectionConfirmed, setSectionConfirmed] = useState<Section | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const t = params.get("token") ?? "";
        setToken(t);
    }, []);

    const handleConfirm = async () => {
        if (!invData || !respuesta) return;

        setLoading(true);
        setMessage(null);

        try {
            const res = await fetch(`${EVENTS_URL}api/invitations/rsvp`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "1",
                },
                body: JSON.stringify({
                    pretty_token: invData.prettyToken,
                    status: respuesta === "yes" ? "confirmed" : "declined",
                    method: "web",
                    guest_count: respuesta === "yes" ? numPersonas : 0,
                }),
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json.message || "Error en la confirmación");

            if (respuesta === "yes") {
                setMessage(
                    `Gracias por confirmar tu asistencia\nNos vemos el ${new Date(
                        invData.eventDate
                    ).toLocaleDateString("es-MX", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                    })}`
                );
            } else {
                setMessage("Lamentamos que no nos puedas acompañar esta vez");
            }
        } catch (err: any) {
            console.error("Error confirmando invitación:", err);
            setMessage(`❌ Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <section className="text-center space-y-6 pb-6 pt-10 relative z-10">
            {/* Loader con manejo de error */}
            <InvitationLoader
                token={token}
                EVENTS_URL={EVENTS_URL}
                onLoaded={setInvData}
                onError={() => setInvError("Invitación no encontrada")} // ✅ capturar error
            />

            <ResourcesBySectionSingle
                //sectionId="8c1600fd-f6d3-494c-9542-2dc4a0897954"
                sectionId="0eaa96d3-4959-4c06-8c85-a86675e6f78d"
                EVENTS_URL={EVENTS_URL}
                onLoaded={setSectionConfirmed}
            />

            {/* ✅ Si hay error en el loader */}
            {invError && (
                <p className="font-aloevera text-red-600 text-2xl mt-6">
                    {invError}
                </p>
            )}

            {/* ✅ Si no hay error pero aún no hay data */}
            {!invError && !invData && (
                <p className="font-aloevera">Cargando...</p>
            )}

            {/* ✅ Render normal cuando hay data */}
            {invData && !invError && (
                <>
                    {invData.rsvpStatus === "confirmed" ? (
                        <div className="flex flex-col items-center">
                            <p className="text-xl font-aloevera text-dark mb-4 border-2 border-dashed border-gold rounded-xl px-6 py-3 inline-block text-center">
                                Gracias por confirmar tu asistencia
                                <br />
                                Nos vemos el{" "}
                                {new Date(invData.eventDate).toLocaleDateString("es-MX", {
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric",
                                })}
                            </p>

                            {/* Imagen */}
                            <Section1_2 section={sectionConfirmed} />

                            {/* Texto y enlace de cancelación */}
                            <div className="mt-24 text-center px-4">
                                <p className="text-lg font-aloevera text-dark mb-2">
                                    O si necesitas cancelar por cualquier motivo da clic abajo:
                                </p>
                                <a
                                    href="#"
                                    onClick={async (e) => {
                                        e.preventDefault();
                                        if (!invData) return;

                                        try {
                                            // Ejecutar la cancelación directamente
                                            const res = await fetch(`${EVENTS_URL}api/invitations/rsvp`, {
                                                method: "POST",
                                                headers: {
                                                    "Content-Type": "application/json",
                                                    Authorization: "1",
                                                },
                                                body: JSON.stringify({
                                                    pretty_token: invData.prettyToken,
                                                    status: "declined",
                                                    method: "web",
                                                    guest_count: 0,
                                                }),
                                            });

                                            const json = await res.json();
                                            if (!res.ok) throw new Error(json.message || "Error al cancelar confirmación");

                                            setMessage("Tu confirmación fue cancelada correctamente");
                                        } catch (err: any) {
                                            console.error("Error cancelando:", err);
                                        } finally {
                                            setTimeout(() => window.location.reload(), 1000);
                                        }
                                    }}
                                    className="text-gold underline text-lg font-aloevera hover:text-dark transition-colors"
                                >
                                    Cancelar mi confirmación
                                </a>
                            </div>
                        </div>
                    ) : invData.rsvpStatus === "declined" ? (
                        <div>
                            <p className="text-xl font-aloevera text-dark mb-4 border-2 border-dashed border-gold rounded-xl px-6 py-3 inline-block">
                                Lamentamos que no nos puedas acompañar esta vez
                            </p>
                            <Section1_1 section={sectionConfirmed} />
                        </div>
                    ) : message ? (
                        <div>
                            <p className="text-xl font-aloevera text-dark whitespace-pre-line border-2 border-dashed border-gold rounded-xl px-6 py-3 inline-block">
                                {message}
                            </p>
                            {respuesta === "yes" && <Section1_2 section={sectionConfirmed} />}
                            {respuesta === "no" && <Section1_1 section={sectionConfirmed} />}
                        </div>
                    ) : (
                        <>
                            {/* Nombre invitado */}
                            <h3 className="text-4xl font-astralaga text-dark">
                                {invData.guestName}
                            </h3>
                            <p className="text-2xl font-aloevera text-gold">
                                No. personas:{" "}
                                <span className="font-aloevera font-semibold">
                                    {invData.maxGuests}
                                </span>
                            </p>

                            {/* Pregunta */}
                            <h2 className="text-3xl font-astralaga text-dark mt-4 border-2 border-dashed border-gold rounded-full px-8 py-2 inline-block">
                                ¿Nos acompañas?
                            </h2>

                            {/* Botones */}
                            <div className="flex flex-row justify-center gap-6 mt-6">
                                <button
                                    onClick={() => setRespuesta("yes")}
                                    className={`px-6 py-3 rounded-2xl font-aloevera border-2 border-dashed border-gold ${
                                        respuesta === "yes"
                                            ? "bg-gold text-dark"
                                            : "bg-white text-dark"
                                    }`}
                                >
                                    Claro, con gusto
                                </button>
                                <button
                                    onClick={() => setRespuesta("no")}
                                    className={`px-6 py-3 rounded-2xl font-aloevera border-2 border-dashed border-gold ${
                                        respuesta === "no"
                                            ? "bg-gold text-dark"
                                            : "bg-white text-dark"
                                    }`}
                                >
                                    No podré esta vez
                                </button>
                            </div>

                            {/* Dropdown inline */}
                            {respuesta === "yes" && (
                                <div className="mt-6 flex items-center justify-center gap-2">
                                    <p className="text-2xl font-aloevera text-gold">
                                        No. personas confirmadas:
                                    </p>
                                    <select
                                        value={numPersonas}
                                        onChange={(e) => setNumPersonas(Number(e.target.value))}
                                        className="border-2 border-dashed border-gold rounded px-3 py-1 font-aloevera text-dark text-xl"
                                    >
                                        {Array.from({ length: invData.maxGuests }, (_, i) => i + 1).map((n) => (
                                            <option key={n} value={n}>
                                                {n}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Botón enviar */}
                            <div className="mt-6">
                                <button
                                    onClick={handleConfirm}
                                    disabled={loading || !respuesta}
                                    className="bg-gold text-dark text-3xl px-12 py-3 rounded-full font-astralaga disabled:opacity-50"
                                >
                                    {loading ? "Enviando..." : "Enviar"}
                                </button>
                            </div>
                        </>
                    )}
                </>
            )}
        </section>
    );
}
