import { io, Socket } from 'socket.io-client';
import type { XfsCommand, XfsEvent, XfsResponse } from '@atm/xfs-core';

/**
 * Thin wrapper around socket.io-client exposing a typed XFS RPC surface.
 * Single long-lived connection; reconnect handled by socket.io automatically.
 */
export class XfsClient {
  private socket: Socket;
  private readonly eventHandlers = new Set<(e: XfsEvent) => void>();

  constructor(url: string = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001') {
    this.socket = io(`${url}/xfs`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
    });
    this.socket.on('xfs.event', (e: XfsEvent) => {
      this.eventHandlers.forEach((h) => h(e));
    });
  }

  async execute<T = unknown>(command: XfsCommand): Promise<XfsResponse<T>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`xfs.execute timeout after ${command.timeoutMs + 1000}ms`)),
        command.timeoutMs + 1_000,
      );
      this.socket.emit('xfs.execute', command, (response: XfsResponse<T>) => {
        clearTimeout(timer);
        resolve(response);
      });
    });
  }

  onEvent(handler: (e: XfsEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  disconnect(): void {
    this.socket.disconnect();
  }
}
