"use client";

import MusicWidget from "../MusicWidget";
import type { LegacyMusicConfig, SectionComponentProps } from "../engine/types";

export default function LegacyMusic({ config }: SectionComponentProps) {
  const { musicUrl, audioUrl, url } = config as unknown as LegacyMusicConfig;
  const src = musicUrl || audioUrl || url;

  if (!src) return null;

  return <MusicWidget audioUrl={src} volume={0.3} />;
}
