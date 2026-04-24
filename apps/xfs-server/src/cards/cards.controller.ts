import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { IsString, Matches, Length } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { hashPin } from '@atm/shared';
import { bigIntToString } from '@atm/shared';

class CreateCardDto {
  @IsString()
  @Matches(/^\d{12,19}$/)
  pan!: string;

  @IsString()
  cardholderName!: string;

  @IsString()
  @Matches(/^\d{4}$/)
  expiryDate!: string;

  @IsString()
  @Length(4, 12)
  pin!: string;

  @IsString()
  accountId!: string;
}

@Controller({ path: 'cards', version: '1' })
export class CardsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const cards = await this.prisma.virtualCard.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        pan: true,
        cardholderName: true,
        expiryDate: true,
        status: true,
        issuer: true,
        failedPinCount: true,
      },
    });
    return { cards };
  }

  @Post()
  async create(@Body() body: CreateCardDto) {
    const card = await this.prisma.virtualCard.create({
      data: {
        pan: body.pan,
        cardholderName: body.cardholderName,
        expiryDate: body.expiryDate,
        pin: hashPin(body.pin),
        track1: `%B${body.pan}^${body.cardholderName}^${body.expiryDate}101100000000000000?`,
        track2: `;${body.pan}=${body.expiryDate}1011000000000?`,
        accountId: body.accountId,
      },
    });
    return bigIntToString(card);
  }

  @Delete(':pan')
  async remove(@Param('pan') pan: string) {
    await this.prisma.virtualCard.delete({ where: { pan } });
    return { deleted: pan };
  }
}
