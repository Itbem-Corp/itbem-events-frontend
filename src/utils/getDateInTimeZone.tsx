export function getDateInTimeZone(timeZone: string): Date {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const values: Record<string, string> = {};

    parts.forEach(({ type, value }) => {
        if (type !== "literal") values[type] = value;
    });

    return new Date(
        `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`
    );
}
