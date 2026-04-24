import { Body, Controller, Get, NotFoundException, Post } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { PinDeviceService } from '@atm/xfs-devices';
import type { VirtualCard } from '@atm/xfs-devices';
import { AtmAppService } from '../atm/atm-app.service';
import { PrismaService } from '../prisma/prisma.service';

class InsertCardDto {
  @IsString()
  @Matches(/^\d{12,19}$/, { message: 'pan must be 12–19 digits' })
  pan!: string;
}

class SubmitAmountDto {
  @IsInt()
  @Min(20_000)
  @Max(10_000_000)
  amount!: number;
}

class SelectTransactionDto {
  @IsString()
  @Matches(/^(WITHDRAWAL|BALANCE|TRANSFER|DEPOSIT)$/)
  txnType!: string;
}

class PressKeyDto {
  @IsString()
  key!: string;
}

class CancelDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

@Controller({ path: 'sessions', version: '1' })
export class SessionsController {
  constructor(
    private readonly atm: AtmAppService,
    private readonly prisma: PrismaService,
    private readonly pin: PinDeviceService,
  ) {}

  @Get('current')
  current() {
    return { session: this.atm.getSession() };
  }

  @Post('insert-card')
  async insertCard(@Body() body: InsertCardDto) {
    const card = await this.prisma.virtualCard.findUnique({ where: { pan: body.pan } });
    if (!card) {
      throw new NotFoundException(`no virtual card with pan ${body.pan}`);
    }

    const virtualCard: VirtualCard = {
      pan: card.pan,
      cardholderName: card.cardholderName,
      expiryDate: card.expiryDate,
      track1: card.track1,
      track2: card.track2,
      pinHash: card.pin,
      issuer: card.issuer,
    };

    const session = await this.atm.onCardInserted(body.pan, virtualCard);
    return { session };
  }

  @Post('press-key')
  pressKey(@Body() body: PressKeyDto) {
    this.pin.pressKey(body.key);
    return { ok: true };
  }

  @Post('begin-pin')
  async beginPin() {
    return this.atm.beginPinEntry();
  }

  @Post('select-transaction')
  async selectTransaction(@Body() body: SelectTransactionDto) {
    await this.atm.selectTransaction(body.txnType as never);
    return { session: this.atm.getSession() };
  }

  @Post('submit-amount')
  async submitAmount(@Body() body: SubmitAmountDto) {
    await this.atm.submitAmount(body.amount);
    return { session: this.atm.getSession() };
  }

  @Post('confirm')
  async confirm() {
    await this.atm.confirmTransaction();
    return { session: this.atm.getSession() };
  }

  @Post('cancel')
  async cancel(@Body() body: CancelDto) {
    await this.atm.cancelTransaction(body.reason);
    return { ok: true };
  }
}
