export const WEEKDAYS = ["Mon", "Tues", "Wed", "Thurs", "Fri"] as const;

const ALL_DAYS = ["Sun", "Mon", "Tues", "Wed", "Thurs", "Fri", "Sat"] as const;

export function lagosToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(now);
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00+01:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(value);
}

export function weekdayKey(date: string) {
  const value = new Date(`${date}T12:00:00+01:00`);
  return ALL_DAYS[value.getUTCDay()];
}

export function previousWeekday(target: (typeof ALL_DAYS)[number]) {
  const today = lagosToday();
  const current = ALL_DAYS.indexOf(weekdayKey(today));
  const wanted = ALL_DAYS.indexOf(target);
  let delta = (current - wanted + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(today, -delta);
}

export function lagosInstant(date: string, hhmm: string) {
  return new Date(`${date}T${hhmm}:00+01:00`).toISOString();
}

export function formatClock(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  }).format(new Date(iso));
}

export function formatLongDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Lagos",
  }).format(new Date(`${date}T12:00:00+01:00`));
}

export function greeting(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Africa/Lagos",
    })
      .formatToParts(now)
      .find((part) => part.type === "hour")?.value ?? "0",
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
