import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { XfsCommand, XfsServiceClass } from '@atm/xfs-core';

/**
 * DTO for WS-inbound XFS command. Shape matches XfsCommand but adds runtime
 * validation via class-validator. Payload is intentionally loose (`unknown`)
 * because each command code has its own payload schema — devices handle their
 * own deeper validation.
 */
export class XfsCommandDto implements XfsCommand {
  @IsString()
  hService!: string;

  @IsEnum(XfsServiceClass)
  serviceClass!: XfsServiceClass;

  @IsString()
  commandCode!: string;

  @IsString()
  requestId!: string;

  @IsInt()
  @Min(0)
  @Max(120_000)
  timeoutMs!: number;

  payload!: unknown;

  @IsString()
  timestamp!: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}
