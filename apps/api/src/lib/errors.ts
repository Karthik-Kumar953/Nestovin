import type { ErrorCode, FieldError } from '@nestovin/contracts';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  MFA_REQUIRED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  VERSION_CONFLICT: 409,
  RATE_LIMITED: 429,
  BUSINESS_RULE_VIOLATION: 422,
  INTERNAL: 500,
};

/** An error that is safe to show to the client. Anything else becomes a generic 500. */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: FieldError[],
  ) {
    super(message);
    this.name = 'AppError';
    this.status = STATUS_BY_CODE[code];
  }
}

export const unauthenticated = (message = 'Sign in to continue') => new AppError('UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have permission to do this') => new AppError('FORBIDDEN', message);
/** Also used for records outside the caller's scope, so their existence is never revealed. */
export const notFound = (what = 'Record') => new AppError('NOT_FOUND', `${what} not found`);
export const conflict = (message: string, fields?: FieldError[]) => new AppError('CONFLICT', message, fields);
export const versionConflict = () =>
  new AppError('VERSION_CONFLICT', 'This record was changed by someone else. Reload and try again.');
export const businessRule = (message: string) => new AppError('BUSINESS_RULE_VIOLATION', message);
export const validationFailed = (fields: FieldError[]) =>
  new AppError('VALIDATION_FAILED', 'Some fields need attention', fields);

/** Map well-known Postgres errors raised by constraints/triggers to safe client errors. */
export function fromPgError(err: unknown, uniqueMessages: Record<string, FieldError> = {}): AppError | undefined {
  if (!err || typeof err !== 'object' || !('code' in err)) return undefined;
  const pg = err as { code?: string; constraint?: string; message?: string };
  switch (pg.code) {
    case '23505': {
      const field = pg.constraint ? uniqueMessages[pg.constraint] : undefined;
      return conflict(field?.message ?? 'A record with these details already exists', field ? [field] : undefined);
    }
    case '23503':
      return businessRule('A related record does not exist or is still in use');
    case '23514':
      // check_violation, also raised by guard triggers with a readable message
      return businessRule(pg.message?.startsWith('Cannot') ? pg.message : 'The change breaks a data rule');
    case '42501':
      return forbidden();
    default:
      return undefined;
  }
}
