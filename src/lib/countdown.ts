export interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const ZERO_TIME_LEFT: TimeLeft = {
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
};

function readTargetDate(targetDate: string | Date): Date | null {
  const date =
    targetDate instanceof Date ? targetDate : new Date(targetDate.trim());
  return Number.isNaN(date.getTime()) ? null : date;
}

export function calculateCountdownTimeLeft(
  targetDate: string | Date,
  now = new Date(),
): TimeLeft {
  const target = readTargetDate(targetDate);
  const nowTime = now.getTime();
  if (!target || Number.isNaN(nowTime)) return ZERO_TIME_LEFT;

  const difference = target.getTime() - nowTime;
  if (difference <= 0) return ZERO_TIME_LEFT;

  return {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / 1000 / 60) % 60),
    seconds: Math.floor((difference / 1000) % 60),
  };
}
