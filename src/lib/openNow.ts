import { BusinessHour, DayOfWeek } from "@prisma/client";

const DAY_NAMES: DayOfWeek[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

// Huye, Rwanda sits in Africa/Kigali which is UTC+2 year-round (no DST), so
// a fixed offset is safe — no tz database dependency needed server-side.
const KIGALI_OFFSET_MS = 2 * 60 * 60 * 1000;

/**
 * Is this place open right now?
 *
 * Returns `null` when we genuinely can't know (no hours entered for the
 * place, or today's row has no open/close times). Callers must hide the
 * badge in that case rather than guess.
 *
 * Handles overnight hours (e.g. a bar open 18:00 → 02:00): open when the
 * current time is past the open time OR before the close time.
 */
export function computeIsOpenNow(
  hours: BusinessHour[] | undefined | null,
): boolean | null {
  if (!hours || hours.length === 0) return null;

  const kigali = new Date(Date.now() + KIGALI_OFFSET_MS);
  const day = DAY_NAMES[kigali.getUTCDay()];
  const minutes = kigali.getUTCHours() * 60 + kigali.getUTCMinutes();

  const today = hours.find((h) => h.dayOfWeek === day);
  if (!today) return null;
  if (today.isClosed) return false;
  if (!today.openTime || !today.closeTime) return null;

  const [openHour, openMin] = today.openTime.split(":").map(Number);
  const [closeHour, closeMin] = today.closeTime.split(":").map(Number);
  if (
    Number.isNaN(openHour) ||
    Number.isNaN(openMin) ||
    Number.isNaN(closeHour) ||
    Number.isNaN(closeMin)
  ) {
    return null;
  }

  const open = openHour * 60 + openMin;
  const close = closeHour * 60 + closeMin;

  if (close < open) return minutes >= open || minutes < close;
  return minutes >= open && minutes < close;
}