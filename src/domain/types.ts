// Entity types. Plain, readonly objects: services return new objects rather than mutating.

export type Day = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri';

export const DAYS: readonly Day[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/** A block of time a worker can be on the desk. Times are 'HH:MM' (24h) at the edges; see R9. */
export interface Window {
  readonly day: Day;
  readonly start: string;
  readonly end: string;
}

export interface Worker {
  readonly id: string;
  readonly name: string;
  readonly maxHoursPerWeek: number;
  readonly availability: readonly Window[];
}

export type RequiredStaff = 1 | 2;

/** One cell of the standing grid. The grid is the same every week. */
export interface Shift {
  readonly id: string;
  readonly day: Day;
  readonly start: string;
  readonly end: string;
  readonly requiredStaff: RequiredStaff;
}

export type AssignmentSource = 'auto' | 'manual' | 'swap';

export interface Assignment {
  readonly shiftId: string;
  readonly workerId: string;
  /** The Monday of the week, 'YYYY-MM-DD'. Weeks are independent of each other. */
  readonly weekOf: string;
  readonly source: AssignmentSource;
}

export type SwapStatus = 'pending' | 'accepted' | 'declined';

export interface SwapRequest {
  readonly id: string;
  readonly weekOf: string;
  readonly shiftId: string;
  readonly fromWorkerId: string;
  readonly toWorkerId: string;
  readonly status: SwapStatus;
}

/** Everything the system knows, in one object. This is also the shape of the JSON file. */
export interface Snapshot {
  readonly workers: readonly Worker[];
  readonly shifts: readonly Shift[];
  readonly assignments: readonly Assignment[];
  readonly swaps: readonly SwapRequest[];
}
