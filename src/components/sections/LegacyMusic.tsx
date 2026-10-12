"use client";

import MusicWidget from "../MusicWidget";
import type { SectionComponentProps } from "../engine/types";
import { readConfigText } from "../../lib/sectionConfig";

export default function LegacyMusic({ config }: SectionComponentProps) {
  const { musicUrl, audioUrl, url } = readConfigText(config, ["musicUrl", "audioUrl", "url"]);
  const src = musicUrl || audioUrl || url;

  if (!src) return null;

  return <MusicWidget audioUrl={src} volume={0.3} />;
}
