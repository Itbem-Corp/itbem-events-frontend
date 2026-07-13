"use client";

import { motion } from 'framer-motion';
import CountdownTimer from '../CountdownTimer';
import type { SectionComponentProps, CountdownHeaderConfig } from '../engine/types';

const headingStyle = {
  color: 'var(--eventi-color-accent, #8B5D3D)',
  fontFamily: 'var(--eventi-font-heading-effective, Bigilla, serif)',
};

export default function CountdownHeader({ config }: SectionComponentProps) {
  const { heading, targetDate } = config as unknown as CountdownHeaderConfig;

  return (
    <motion.header
      className="py-2 text-center space-y-6 relative z-10 pt-10"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
    >
      <h1 className="text-3xl sm:text-4xl font-bold font-bigilla" style={headingStyle}>{heading}</h1>
      <div className="w-full flex flex-wrap justify-center gap-4">
        <CountdownTimer targetDate={targetDate} />
      </div>
    </motion.header>
  );
}
