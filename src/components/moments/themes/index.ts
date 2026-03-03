export interface MomentsTheme {
  headingFont: string
  bodyFont: string
  heroBg: string
  /** Always-light hero gradient — safe for dark text regardless of event type. */
  heroLightBg: string
  /** CSS color value for aurora blob 1 (used with filter:blur + low opacity). */
  blobColor1: string
  /** CSS color value for aurora blob 2. */
  blobColor2: string
  accent: string
  accentSoft: string
  decorationType: 'botanical' | 'confetti' | 'geometric' | 'sparkles' | 'minimal'
  footerMessage: string
  lightboxBg: string
  statsIconColor: string
  cardOverlay: string
  microIcon: string
  cardGradient: string
  cardBorder: string
  cardTextColor: string
}

const WEDDING: MomentsTheme = {
  headingFont: 'font-bigilla',
  bodyFont: 'font-quicksand',
  heroBg: 'bg-gradient-to-br from-amber-50 via-yellow-50/80 to-orange-50/60',
  heroLightBg: 'bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50',
  blobColor1: '#fbbf24',
  blobColor2: '#fb923c',
  accent: 'text-amber-700',
  accentSoft: 'bg-amber-100/80',
  decorationType: 'botanical',
  footerMessage: 'Gracias por ser parte de este día tan especial',
  lightboxBg: 'bg-black/90',
  statsIconColor: 'text-amber-600',
  cardOverlay: 'bg-gradient-to-t from-black/60 via-black/20 to-transparent',
  microIcon: '🌿',
  cardGradient: 'from-amber-50 to-orange-50',
  cardBorder: 'border-amber-200/40',
  cardTextColor: 'text-amber-900',
}

const GRADUATION: MomentsTheme = {
  headingFont: 'font-quicksand font-bold',
  bodyFont: 'font-quicksand',
  heroBg: 'bg-gradient-to-br from-blue-950 via-indigo-950 to-slate-900',
  heroLightBg: 'bg-gradient-to-br from-blue-50 via-indigo-50 to-slate-100',
  blobColor1: '#818cf8',
  blobColor2: '#38bdf8',
  accent: 'text-blue-400',
  accentSoft: 'bg-blue-500/10',
  decorationType: 'confetti',
  footerMessage: 'Felicidades por este gran logro',
  lightboxBg: 'bg-black/90',
  statsIconColor: 'text-blue-400',
  cardOverlay: 'bg-gradient-to-t from-black/60 via-black/20 to-transparent',
  microIcon: '🎓',
  cardGradient: 'from-blue-50 to-indigo-50',
  cardBorder: 'border-blue-200/40',
  cardTextColor: 'text-blue-900',
}

const BIRTHDAY: MomentsTheme = {
  headingFont: 'font-quicksand font-bold',
  bodyFont: 'font-quicksand',
  heroBg: 'bg-gradient-to-br from-fuchsia-50 via-pink-50 to-orange-50',
  heroLightBg: 'bg-gradient-to-br from-fuchsia-50 via-pink-50 to-orange-50',
  blobColor1: '#e879f9',
  blobColor2: '#fb923c',
  accent: 'text-fuchsia-600',
  accentSoft: 'bg-fuchsia-100/80',
  decorationType: 'confetti',
  footerMessage: 'Gracias por celebrar con nosotros',
  lightboxBg: 'bg-black/90',
  statsIconColor: 'text-fuchsia-500',
  cardOverlay: 'bg-gradient-to-t from-black/60 via-black/20 to-transparent',
  microIcon: '🎉',
  cardGradient: 'from-fuchsia-50 to-orange-50',
  cardBorder: 'border-fuchsia-200/40',
  cardTextColor: 'text-fuchsia-900',
}

const QUINCEANERA: MomentsTheme = {
  headingFont: 'font-astralaga',
  bodyFont: 'font-quicksand',
  heroBg: 'bg-gradient-to-br from-pink-50 via-rose-50/80 to-amber-50/60',
  heroLightBg: 'bg-gradient-to-br from-pink-50 via-rose-50 to-amber-50',
  blobColor1: '#fb7185',
  blobColor2: '#f472b6',
  accent: 'text-rose-600',
  accentSoft: 'bg-rose-100/80',
  decorationType: 'sparkles',
  footerMessage: 'Gracias por acompañarnos en esta noche tan especial',
  lightboxBg: 'bg-black/90',
  statsIconColor: 'text-rose-500',
  cardOverlay: 'bg-gradient-to-t from-black/60 via-black/20 to-transparent',
  microIcon: '✦',
  cardGradient: 'from-rose-50 to-pink-50',
  cardBorder: 'border-rose-200/40',
  cardTextColor: 'text-rose-900',
}

const CORPORATE: MomentsTheme = {
  headingFont: 'font-quicksand font-semibold',
  bodyFont: 'font-quicksand',
  heroBg: 'bg-gradient-to-br from-slate-50 via-gray-50 to-zinc-100',
  heroLightBg: 'bg-gradient-to-br from-slate-50 via-gray-50 to-zinc-100',
  blobColor1: '#94a3b8',
  blobColor2: '#e2e8f0',
  accent: 'text-slate-700',
  accentSoft: 'bg-slate-100',
  decorationType: 'geometric',
  footerMessage: 'Gracias por ser parte de este evento',
  lightboxBg: 'bg-black/90',
  statsIconColor: 'text-slate-600',
  cardOverlay: 'bg-gradient-to-t from-black/60 via-black/20 to-transparent',
  microIcon: '◆',
  cardGradient: 'from-slate-50 to-gray-50',
  cardBorder: 'border-slate-200/40',
  cardTextColor: 'text-slate-800',
}

const DEFAULT_THEME: MomentsTheme = {
  headingFont: 'font-quicksand font-bold',
  bodyFont: 'font-quicksand',
  heroBg: 'bg-gradient-to-br from-violet-50 via-indigo-50/80 to-sky-50/60',
  heroLightBg: 'bg-gradient-to-br from-violet-50 via-indigo-50 to-sky-50',
  blobColor1: '#a78bfa',
  blobColor2: '#67e8f9',
  accent: 'text-indigo-600',
  accentSoft: 'bg-indigo-100/80',
  decorationType: 'minimal',
  footerMessage: 'Gracias por compartir estos momentos',
  lightboxBg: 'bg-black/90',
  statsIconColor: 'text-indigo-500',
  cardOverlay: 'bg-gradient-to-t from-black/60 via-black/20 to-transparent',
  microIcon: '✦',
  cardGradient: 'from-violet-50 to-sky-50',
  cardBorder: 'border-violet-200/40',
  cardTextColor: 'text-violet-900',
}

const THEME_MAP: Record<string, MomentsTheme> = {
  wedding: WEDDING,
  boda: WEDDING,
  graduation: GRADUATION,
  graduacion: GRADUATION,
  birthday: BIRTHDAY,
  cumpleanos: BIRTHDAY,
  quinceanera: QUINCEANERA,
  'quinceañera': QUINCEANERA,
  corporate: CORPORATE,
  corporativo: CORPORATE,
  conference: CORPORATE,
  conferencia: CORPORATE,
}

export function getTheme(eventType?: string): MomentsTheme {
  if (!eventType) return DEFAULT_THEME
  return THEME_MAP[eventType.toLowerCase().trim()] ?? DEFAULT_THEME
}
