// The featured round (docs/01 Home, 2026-11-11): the one or two dishes a city's home page leads
// with, and the day voting for the round's results closes. Only the line about the date closes:
// the ranking itself never does. Pure helpers, shared by the home, city and dish pages and the admin.
import { formatPkDay } from "@/lib/format";

/** "Voting for the winter results closes Sun 20 Dec", or null once the day has passed or none is set. */
export function votingClosesLine(closesAt: Date | null, round: string | null, now: Date) {
  if (!closesAt || closesAt.getTime() <= now.getTime()) return null;
  const day = formatPkDay(closesAt);
  return round ? `Voting for the ${round} closes ${day}` : `Voting closes ${day}`;
}

/** The admin's "closes on" day (YYYY-MM-DD) as the end of that day in Pakistan. */
export const endOfPakistanDay = (day: string) => new Date(`${day}T23:59:59+05:00`);

/** The day in Pakistan a date falls on, as YYYY-MM-DD, for the admin form's field. */
export const pakistanDayOf = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
