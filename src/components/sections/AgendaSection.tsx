"use client";

import { motion } from 'framer-motion';
import type { SectionComponentProps, AgendaConfig, AgendaItem } from '../engine/types';

const ICONS: Record<string, string> = {
  ceremony:  '💍',
  reception: '🥂',
  dinner:    '🍽️',
  party:     '🎉',
  music:     '🎵',
  photo:     '📸',
  default:   '✨',
}

function getIcon(item: AgendaItem): string {
  return ICONS[item.icon ?? 'default'] ?? '✨'
}

function AgendaSkeleton() {
  return (
    <section className="py-16 px-4 animate-pulse">
      <div className="max-w-lg mx-auto space-y-8">
        <div className="h-8 bg-gray-200 rounded w-48 mx-auto" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="h-10 w-14 bg-gray-200 rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-gray-200 rounded w-32" />
              <div className="h-4 bg-gray-100 rounded w-48" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

interface AgendaItemRowProps {
  item: AgendaItem
  index: number
  isLast: boolean
}

function AgendaItemRow({ item, index, isLast }: AgendaItemRowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1, ease: 'easeOut' }}
      className="flex gap-0 relative"
    >
      {/* Time column */}
      <div className="w-16 flex-shrink-0 pt-1 text-right pr-4">
        <span
          className="text-sm font-aloevera font-semibold"
          style={{ color: '#C7A44C' }}
        >
          {item.time}
        </span>
      </div>

      {/* Center: dot + line */}
      <div className="flex flex-col items-center w-8 flex-shrink-0">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-lg flex-shrink-0 border-2 border-dashed"
          style={{ borderColor: '#C7A44C', backgroundColor: '#fff' }}
        >
          {getIcon(item)}
        </div>
        {!isLast && (
          <div
            className="w-px flex-1 mt-1"
            style={{ backgroundColor: '#C7A44C', opacity: 0.3, minHeight: 32 }}
          />
        )}
      </div>

      {/* Content column */}
      <div className="flex-1 pl-4 pb-8">
        <p
          className="text-lg font-astralaga leading-tight"
          style={{ color: '#07293A' }}
        >
          {item.title}
        </p>
        {item.location && (
          <p className="text-sm font-aloevera mt-0.5" style={{ color: '#8B5D3D' }}>
            📍 {item.location}
          </p>
        )}
        {item.description && (
          <p className="text-sm font-aloevera mt-1" style={{ color: '#555' }}>
            {item.description}
          </p>
        )}
      </div>
    </motion.div>
  )
}

export default function AgendaSection({ config }: SectionComponentProps) {
  const { title = 'Programa del día', subtitle, items = [] } = config as unknown as AgendaConfig;

  if (!items || items.length === 0) return <AgendaSkeleton />

  return (
    <section className="py-16 px-4 relative z-10">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl font-astralaga" style={{ color: '#07293A' }}>
            {title}
          </h2>
          {subtitle && (
            <p className="mt-2 text-lg font-aloevera" style={{ color: '#8B5D3D' }}>
              {subtitle}
            </p>
          )}
          <div className="mt-4 mx-auto w-16 h-px" style={{ backgroundColor: '#C7A44C' }} />
        </motion.div>

        {/* Timeline items */}
        <div>
          {items.map((item, i) => (
            <AgendaItemRow
              key={i}
              item={item}
              index={i}
              isLast={i === items.length - 1}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
