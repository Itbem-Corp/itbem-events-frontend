"use client";

import { motion } from "framer-motion";
import type { LegacyTextConfig, SectionComponentProps } from "../engine/types";

const headingStyle = {
  color: "var(--eventi-color-heading, #07293a)",
  fontFamily: "var(--eventi-font-heading-effective, Bigilla, serif)",
};

const bodyStyle = {
  color: "var(--eventi-color-body, #27485a)",
};

export default function LegacyText({ config }: SectionComponentProps) {
  const { title, content } = config as unknown as LegacyTextConfig;

  if (!title && !content) return null;

  return (
    <motion.section
      className="relative z-10 mx-auto max-w-2xl space-y-4 px-2 py-8 text-center"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      {title && (
        <h2 className="font-bigilla text-3xl font-semibold sm:text-4xl" style={headingStyle}>
          {title}
        </h2>
      )}
      {content && (
        <p className="whitespace-pre-line font-quicksand text-base leading-8" style={bodyStyle}>
          {content}
        </p>
      )}
    </motion.section>
  );
}
