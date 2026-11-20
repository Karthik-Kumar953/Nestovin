import pino from 'pino';

/**
 * Structured logger. Sensitive values are redacted at the logger level so a
 * careless log line cannot leak them (PRD 16.7: no secrets/OTPs/tokens in logs).
 */
export function createLogger(level: string, pretty: boolean) {
  return pino({
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.otp',
        '*.token',
        '*.accessToken',
        '*.refreshToken',
        '*.serviceRoleKey',
        '*.phone',
      ],
      censor: '[redacted]',
    },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
  });
}

export type Logger = ReturnType<typeof createLogger>;
