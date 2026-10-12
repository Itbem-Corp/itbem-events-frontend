import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { configEmbedUrl } from "../../src/lib/sectionConfig";
import {
  attendeesSectionHasContent,
  graduationHeroHasContent,
  receptionSectionHasContent,
  venueSectionHasContent,
} from "../../src/lib/sectionContent";

// QA STU-25 / EVT-71: sections added in Studio but never filled left grey
// image/map frames and blank gaps on the public page.
describe("section content checks", () => {
  it("treats an untouched venue or reception as empty", () => {
    expect(venueSectionHasContent({ text: "  ", date: "", venueText: undefined, mapUrl: "", imageCount: 0 })).toBe(false);
    expect(receptionSectionHasContent({ venueText: "\n", mapUrl: "   ", imageCount: 0 })).toBe(false);
  });

  it("shows a venue as soon as one field has content", () => {
    expect(venueSectionHasContent({ date: "22 de junio", imageCount: 0 })).toBe(true);
    expect(venueSectionHasContent({ mapUrl: "https://maps.google.com/maps?q=x&output=embed", imageCount: 0 })).toBe(true);
    expect(receptionSectionHasContent({ imageCount: 1 })).toBe(true);
  });

  it("does not count a map URL that is not http(s)", () => {
    expect(configEmbedUrl("javascript:alert(1)")).toBe("");
    expect(configEmbedUrl("no es una url")).toBe("");
    expect(configEmbedUrl(" https://www.google.com/maps/embed?pb=1 ")).toBe("https://www.google.com/maps/embed?pb=1");
    expect(venueSectionHasContent({ mapUrl: "javascript:alert(1)", imageCount: 0 })).toBe(false);
  });

  it("graduation hero and attendees", () => {
    expect(graduationHeroHasContent({ title: "", years: " ", school: "", imageCount: 0 })).toBe(false);
    expect(graduationHeroHasContent({ title: "NOS GRADUAMOS", imageCount: 0 })).toBe(true);
    expect(graduationHeroHasContent({ imageCount: 1 })).toBe(true);
    expect(attendeesSectionHasContent({ attendeeCount: 0, closing: " ", hasGroupPhoto: false })).toBe(false);
    expect(attendeesSectionHasContent({ attendeeCount: 0, closing: "Celebremos", hasGroupPhoto: false })).toBe(true);
    expect(attendeesSectionHasContent({ attendeeCount: 2, hasGroupPhoto: false })).toBe(true);
  });
});

describe("empty sections leave no frame or gap", () => {
  const read = (path: string) =>
    readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

  it("the section wrapper collapses when the section renders nothing", () => {
    expect(read("src/components/engine/SectionRenderer.tsx")).toContain(
      'className="eventi-section scroll-mt-8 empty:hidden"',
    );
  });

  it("the graduation hero draws the photo frame only with a photo", () => {
    const source = read("src/components/sections/GraduationHero.tsx");
    const loaded = source.slice(source.indexOf('key="loaded"'));
    const frame = loaded.indexOf("aspect-[3/2] bg-gray-100");
    expect(loaded.lastIndexOf("{heroImage?.view_url && (", frame)).toBeGreaterThan(-1);
  });

  it("photo grids render nothing without photos once loaded", () => {
    expect(read("src/components/sections/PhotoGrid.tsx")).toContain(
      "section && topImages.length === 0 && bottomImages.length === 0 ? null",
    );
    expect(read("src/components/sections/LegacyGallery.tsx")).toContain(
      "section !== null && resources.length === 0",
    );
  });
});
