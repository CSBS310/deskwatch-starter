// The desk's standing grid: Mon-Fri, five two-hour shifts from 08:00 to 18:00.
// The two midday shifts (10:00-12:00, 12:00-14:00) are the busy ones and take two people.
import { DAYS, type Day, type RequiredStaff, type Shift } from '../domain/types.js';
import { formatTime, parseTime } from '../time/minutes.js';

const OPEN = parseTime('08:00');
const CLOSE = parseTime('18:00');
const SHIFT_MINUTES = 120;
const BUSY_START = parseTime('10:00');
const BUSY_END = parseTime('14:00');

function staffFor(start: number): RequiredStaff {
  return start >= BUSY_START && start < BUSY_END ? 2 : 1;
}

/** Shift ids read like 'Tue-10', which is what the supervisor types on the command line. */
export function shiftId(day: Day, startMinutes: number): string {
  return `${day}-${formatTime(startMinutes).slice(0, 2)}`;
}

export function standardGrid(): Shift[] {
  const shifts: Shift[] = [];
  for (const day of DAYS) {
    for (let start = OPEN; start < CLOSE; start += SHIFT_MINUTES) {
      shifts.push({
        id: shiftId(day, start),
        day,
        start: formatTime(start),
        end: formatTime(start + SHIFT_MINUTES),
        requiredStaff: staffFor(start),
      });
    }
  }
  return shifts;
}
