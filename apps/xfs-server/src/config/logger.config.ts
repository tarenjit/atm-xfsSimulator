import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Build nestjs-pino options with:
 *   - request ID propagation (uses `x-request-id` if provided, else generated)
 *   - sensitive-field redaction (headers, body fields)
 *   - pretty-print in dev, JSON in prod
 *   - optional file sink
 */
export function buildPinoOptions(): Params {
  const pretty = process.env.LOG_PRETTY === 'true';
  const level = process.env.LOG_LEVEL ?? 'info';
  const file = process.env.LOG_FILE;

  const transport = pretty
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,req,res,responseTime',
          singleLine: false,
          messageFormat: '{msg}',
        },
      }
    : file
      ? {
          targets: [
            { target: 'pino/file', options: { destination: 1 }, level }, // stdout
            {
              target: 'pino/file',
              options: { destination: file, mkdir: true },
              level,
            },
          ],
        }
      : undefined;

  return {
    pinoHttp: {
      level,
      transport,
      customProps: () => ({ context: 'HTTP' }),
      genReqId: (req: IncomingMessage) => {
        const headerId = req.headers['x-request-id'];
        if (typeof headerId === 'string' && headerId.length > 0) return headerId;
        // Lightweight request id (cheaper than UUID; http-only).
        return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      },
      serializers: {
        req: (req) => ({
          id: req.id,
          method: req.method,
          url: req.url,
          remoteAddress: req.remoteAddress,
        }),
        res: (res: ServerResponse) => ({
          statusCode: res.statusCode,
        }),
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.pin',
          'req.body.password',
          'req.body.pan',
          'req.body.track1',
          'req.body.track2',
          'req.body.track3',
          'req.body.chipData',
          'req.body.pinBlock',
          'req.body.cvv',
          'req.body.cvv2',
          '*.pin',
          '*.password',
          '*.pan',
          '*.track1',
          '*.track2',
          '*.track3',
          '*.chipData',
          '*.pinBlock',
          '*.cvv',
          '*.cvv2',
        ],
        censor: '[REDACTED]',
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    },
  };
}
