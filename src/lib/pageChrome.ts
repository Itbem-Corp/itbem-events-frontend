interface PageChromeMeta {
  footerVisible?: boolean;
}

export function shouldRenderFooter(
  meta: PageChromeMeta | null | undefined,
): boolean {
  return meta?.footerVisible !== false;
}

interface EventSummaryInput extends PageChromeMeta {
  pageTitle?: string;
  eventDateTime?: string;
  eventDate?: string;
}

/**
 * PUB-36: with RSVP, countdown, wall and footer turned off, an invitation was
 * left with a lone title. When the footer is hidden and no section already
 * shows the event date (countdown or hero), the page adds a short summary:
 * event name and date. Flags hide optional blocks, not the event itself.
 */
export function shouldRenderEventSummary(
  meta: EventSummaryInput | null | undefined,
  hasDateSection: boolean,
): boolean {
  if (!meta || hasDateSection || shouldRenderFooter(meta)) return false;
  return Boolean(meta.pageTitle?.trim() || meta.eventDateTime || meta.eventDate);
}
