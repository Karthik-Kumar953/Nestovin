import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ErrorEnvelope } from '@nestovin/contracts';
import { AppError, fromPgError } from '../lib/errors';
import type { Logger } from '../lib/logger';

export function notFoundHandler(): RequestHandler {
  return (req, res) => {
    const body: ErrorEnvelope = {
      error: { code: 'NOT_FOUND', message: 'Route not found', requestId: req.requestId },
    };
    res.status(404).json(body);
  };
}

/**
 * Converts every error into the standard envelope. Unknown errors are logged
 * with full detail server-side but returned as a generic message, so database
 * internals and stack traces never reach the client.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    // Malformed JSON body from express.json()
    if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.parse.failed') {
      err = new AppError('VALIDATION_FAILED', 'Request body is not valid JSON');
    }
    if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
      err = new AppError('VALIDATION_FAILED', 'Request body is too large');
    }

    const appError = err instanceof AppError ? err : fromPgError(err);
    if (appError) {
      if (appError.status >= 500) logger.error({ err, requestId: req.requestId }, 'request failed');
      const body: ErrorEnvelope = {
        error: {
          code: appError.code,
          message: appError.message,
          ...(appError.fields ? { fields: appError.fields } : {}),
          requestId: req.requestId,
        },
      };
      res.status(appError.status).json(body);
      return;
    }

    logger.error({ err, requestId: req.requestId }, 'unhandled error');
    const body: ErrorEnvelope = {
      error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.', requestId: req.requestId },
    };
    res.status(500).json(body);
  };
}
