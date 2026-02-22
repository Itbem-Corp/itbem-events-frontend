"use client";
import { useEffect, useRef } from "react";

export interface InvitationData {
    id: string;
    eventId: string;
    guestName: string;
    maxGuests: number;
    prettyToken: string;
    rsvpStatus: string;
    eventDate: string;
}

interface Props {
    token: string;
    EVENTS_URL: string;
    onLoaded: (data: InvitationData) => void;
    onError?: (message: string) => void;
}

export default function InvitationLoader({ token, EVENTS_URL, onLoaded, onError }: Props) {
    // Ref guard: prevents re-fetching if parent re-renders and recreates onLoaded/onError refs
    const loadedRef = useRef(false);

    useEffect(() => {
        if (!token || loadedRef.current) return;

        const controller = new AbortController();

        const loadInvitation = async () => {
            try {
                const res = await fetch(`${EVENTS_URL}api/invitations/ByToken/${token}`, {
                    signal: controller.signal,
                });

                if (!res.ok) throw new Error(`API error: ${res.status}`);

                const json = await res.json();
                const inv = json.data?.invitation;
                const guest = json.data?.guest;

                const data: InvitationData = {
                    id: inv?.ID ?? "",
                    eventId: inv?.EventID ?? "",
                    guestName: `${guest?.first_name ?? ""} ${guest?.last_name ?? ""}`.trim(),
                    maxGuests: inv?.max_guests ?? 1,
                    prettyToken: json.data?.pretty_token ?? "",
                    rsvpStatus: guest?.rsvp_status ?? "",
                    eventDate: inv?.Event?.EventDateTime ?? "",
                };

                loadedRef.current = true;
                onLoaded(data);
            } catch (err: unknown) {
                if (err instanceof Error && err.name === "AbortError") return;
                const message = err instanceof Error ? err.message : "Error cargando invitación";
                console.error("Error loading invitation:", err);
                onError?.(message);
            }
        };

        loadInvitation();

        // Cleanup: cancela la petición si el componente se desmonta antes de terminar
        return () => { controller.abort(); };
    }, [token, EVENTS_URL]); // onLoaded/onError excluidos: son estables (setter useState / handler inline)

    return null;
}
