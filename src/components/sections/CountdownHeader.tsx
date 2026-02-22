"use client";

import { motion } from 'framer-motion';
import CountdownTimer from '../CountdownTimer';
import type { SectionComponentProps, CountdownHeaderConfig } from '../engine/types';

export default function CountdownHeader({ config }: SectionComponentProps) {
  const { heading, targetDate } = config as unknown as CountdownHeaderConfig;

  return (
    <motion.header
      className="py-2 text-center space-y-6 relative z-10 pt-10"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
    >
      <h1 className="text-3xl sm:text-4xl font-bold font-bigilla text-[#8B5D3D]">{heading}</h1>
      <div className="w-full flex flex-wrap justify-center gap-4 text-[#07293A]">
        <CountdownTimer targetDate={new Date(targetDate)} />
      </div>
    </motion.header>
  );
}
