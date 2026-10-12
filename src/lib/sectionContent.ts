/**
 * "Has this section anything to show?" checks for sections whose content is
 * typed in Studio and uploaded as resources. A section that was added but
 * never filled renders nothing on the public page instead of grey image and
 * map frames (QA STU-25, EVT-71). Only called once the section's resources
 * have loaded; the loading skeleton is a separate state.
 */
import { configEmbedUrl, hasConfigText } from "./sectionConfig";

type Text = string | null | undefined;

export function venueSectionHasContent(input: {
  text?: Text;
  date?: Text;
  venueText?: Text;
  mapUrl?: Text;
  imageCount: number;
}): boolean {
  return (
    input.imageCount > 0 ||
    hasConfigText(input.text) ||
    hasConfigText(input.date) ||
    hasConfigText(input.venueText) ||
    configEmbedUrl(input.mapUrl) !== ""
  );
}

export function receptionSectionHasContent(input: {
  venueText?: Text;
  mapUrl?: Text;
  imageCount: number;
}): boolean {
  return venueSectionHasContent(input);
}

export function graduationHeroHasContent(input: {
  title?: Text;
  years?: Text;
  school?: Text;
  imageCount: number;
}): boolean {
  return (
    input.imageCount > 0 ||
    hasConfigText(input.title) ||
    hasConfigText(input.years) ||
    hasConfigText(input.school)
  );
}

export function attendeesSectionHasContent(input: {
  attendeeCount: number;
  closing?: Text;
  hasGroupPhoto: boolean;
}): boolean {
  return (
    input.attendeeCount > 0 || hasConfigText(input.closing) || input.hasGroupPhoto
  );
}
