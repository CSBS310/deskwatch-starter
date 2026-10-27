// One error class for every rule violation. The CLI prints `message` and exits non-zero;
// tests match on `code` so wording can change without breaking them.

export type ErrorCode =
  | 'WORKER_NOT_FOUND'
  | 'SHIFT_NOT_FOUND'
  | 'SWAP_NOT_FOUND'
  | 'DUPLICATE_WORKER'
  | 'INVALID_TIME'
  | 'INVALID_WINDOW'
  | 'INVALID_WEEK'
  | 'NOT_AVAILABLE'
  | 'OVERLAPPING_SHIFT'
  | 'OVER_CAP'
  | 'ALREADY_ASSIGNED'
  | 'NOT_ASSIGNED'
  | 'SHIFT_FULL'
  | 'SWAP_NOT_PENDING';

export class DomainError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
