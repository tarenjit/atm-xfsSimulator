import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { XfsEvent } from '@atm/xfs-core';
import { XfsManagerService } from './xfs-manager.service';
import { XfsCommandDto } from './dto/xfs-command.dto';

/**
 * CORS origins resolved at decorator-eval time from CORS_ORIGINS. The env is
 * validated at bootstrap BEFORE Nest loads modules, so reading process.env
 * here is safe. We refuse wildcard silently — an unset var falls back to
 * localhost:3000 only (matches .env.example default).
 */
function resolveWsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS ?? 'http://localhost:3000';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * WebSocket gateway for XFS command RPC + event broadcast.
 *
 * Clients (ATM screen, operator console) connect to `/xfs`:
 *   emit 'xfs.execute' with an XfsCommand → ack with XfsResponse
 *   listen for 'xfs.event' for push events (device async signals)
 */
@WebSocketGateway({
  namespace: '/xfs',
  cors: { origin: resolveWsOrigins(), credentials: true },
  transports: ['websocket', 'polling'],
})
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class XfsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(XfsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly manager: XfsManagerService) {}

  handleConnection(client: Socket) {
    this.logger.log(`client connected: ${client.id} (${client.handshake.address})`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`client disconnected: ${client.id}`);
  }

  @SubscribeMessage('xfs.execute')
  async onExecute(@MessageBody() command: XfsCommandDto, @ConnectedSocket() client: Socket) {
    this.logger.debug(
      `exec from ${client.id}: ${command.commandCode} → ${command.hService} (req=${command.requestId})`,
    );
    return this.manager.execute(command);
  }

  @SubscribeMessage('xfs.getInfo')
  onGetInfo(@MessageBody() payload: { hService: string }) {
    return this.manager.getInfo(payload.hService);
  }

  @SubscribeMessage('xfs.listServices')
  onListServices() {
    return this.manager.listServices();
  }

  @OnEvent('xfs.event')
  broadcastEvent(event: XfsEvent) {
    this.server.emit('xfs.event', event);
    this.logger.debug(`broadcast event: ${event.eventCode} from ${event.hService}`);
  }

  @OnEvent('atm.stateChanged')
  broadcastAtmState(event: unknown) {
    this.server.emit('atm.stateChanged', event);
  }

  @OnEvent('atm.sessionEnded')
  broadcastAtmEnded(event: unknown) {
    this.server.emit('atm.sessionEnded', event);
  }
}
