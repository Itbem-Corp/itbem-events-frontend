"use client";
import { useEffect } from "react";

export interface InvitationData {
    id: string;
    eventId: string;
    guestName: string;
    maxGuests: number;
    prettyToken: string;
    rsvpStatus: string;   // ✅ nuevo
    eventDate: string;    // ✅ nuevo
}

interface Props {
    token: string;
    EVENTS_URL: string;
    onLoaded: (data: InvitationData) => void;
}

export default function InvitationLoader({ token, EVENTS_URL, onLoaded }: Props) {
    useEffect(() => {
        if (!token) return;

        const loadInvitation = async () => {
            try {
                const res = await fetch(`${EVENTS_URL}api/invitations/byToken/${token}`, {
                    headers: { Authorization: "1" },
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

                onLoaded(data);
            } catch (err) {
                console.error("Error loading invitation:", err);
            }
        };

        loadInvitation();
    }, [token, EVENTS_URL, onLoaded]);

    return null;
}
