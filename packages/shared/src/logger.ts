import pino, { Logger, LoggerOptions, DestinationStream } from 'pino';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface CreateLoggerOptions {
  name: string;
  level?: LogLevel;
  pretty?: boolean;
  file?: string;
  /** Extra bindings attached to every log line (e.g., { service: 'xfs-server' }) */
  bindings?: Record<string, unknown>;
}

/**
 * Create a structured pino logger.
 *
 * WHY pino: lowest overhead JSON logger on Node.js. XFS command volume can
 * be high; we need stable perf. Pretty-print is opt-in for dev ergonomics.
 */
export function createLogger(options: CreateLoggerOptions): Logger {
  const level = options.level ?? 'info';

  const baseOptions: LoggerOptions = {
    name: options.name,
    level,
    base: {
      service: options.name,
      pid: process.pid,
      ...(options.bindings ?? {}),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    redact: {
      paths: [
        // Auth secrets
        'payload.pin',
        'payload.password',
        'payload.cardholderPin',
        'payload.pinBlock',
        // Card data (PCI)
        'payload.pan',
        'payload.track1',
        'payload.track2',
        'payload.track3',
        'payload.chipData',
        'payload.cvv',
        'payload.cvv2',
        // Nested wildcards — picks up XfsCommand.payload.{pan,...} and any
        // transaction-log objects that contain these fields.
        '*.pin',
        '*.password',
        '*.pinBlock',
        '*.pan',
        '*.track1',
        '*.track2',
        '*.track3',
        '*.chipData',
        '*.cvv',
        '*.cvv2',
        // HTTP
        'headers.authorization',
        'headers.cookie',
      ],
      censor: '[REDACTED]',
    },
  };

  // Pretty-print for local dev only. Stream to stderr so JSON stdout is clean
  // for log ingestion pipelines in non-pretty mode.
  if (options.pretty) {
    const transport = pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname,service',
        messageFormat: '[{service}] {msg}',
        singleLine: false,
      },
    });
    return pino(baseOptions, transport);
  }

  // Production JSON output, optionally tee'd to a file.
  if (options.file) {
    const streams: Array<{ level?: LogLevel; stream: DestinationStream }> = [
      { stream: process.stdout },
      { stream: pino.destination({ dest: options.file, sync: false, mkdir: true }) },
    ];
    return pino(baseOptions, pino.multistream(streams));
  }

  return pino(baseOptions);
}

export type { Logger } from 'pino';
