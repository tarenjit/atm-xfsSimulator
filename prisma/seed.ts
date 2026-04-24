/**
 * Seed data for local development.
 *
 * Creates 4 test cards covering the fixture scenarios used by integration
 * tests and QA:
 *   1. HAPPY_PATH   — active, funded, normal daily limit
 *   2. LOW_BALANCE  — active, underfunded (for insufficient-funds tests)
 *   3. BLOCKED      — ACTIVE account but BLOCKED card (CARD_BLOCKED error)
 *   4. EXPIRED      — expiry date in the past (EXPIRED_CARD error)
 *
 * PINs are stored as salted SHA-256 hashes via @atm/shared's hashPin(). Phase
 * 2 device code MUST go through verifyPin() — never compare pin strings.
 */
import { PrismaClient } from '@prisma/client';
import { hashPin } from '@atm/shared';

const prisma = new PrismaClient();

async function main() {
  // Wipe in child → parent order for idempotent re-seed.
  await prisma.transaction.deleteMany();
  await prisma.xfsCommandLog.deleteMany();
  await prisma.xfsEventLog.deleteMany();
  await prisma.atmSession.deleteMany();
  await prisma.virtualCard.deleteMany();
  await prisma.account.deleteMany();
  await prisma.cashUnit.deleteMany();
  await prisma.bankTheme.deleteMany();

  // --- Accounts ---
  const happyAccount = await prisma.account.create({
    data: {
      accountNumber: '1234567890',
      holderName: 'BAJWA TESTING',
      balance: 5_750_000n,
      dailyLimit: 10_000_000n,
    },
  });

  const lowAccount = await prisma.account.create({
    data: {
      accountNumber: '9876543210',
      holderName: 'LOW BALANCE USER',
      balance: 150_000n,
      dailyLimit: 5_000_000n,
    },
  });

  const blockedAccount = await prisma.account.create({
    data: {
      accountNumber: '5555000011',
      holderName: 'BLOCKED CARD USER',
      balance: 2_000_000n,
      dailyLimit: 5_000_000n,
    },
  });

  const expiredAccount = await prisma.account.create({
    data: {
      accountNumber: '4444333322',
      holderName: 'EXPIRED CARD USER',
      balance: 3_000_000n,
      dailyLimit: 5_000_000n,
    },
  });

  // --- Virtual cards ---
  await prisma.virtualCard.createMany({
    data: [
      {
        pan: '4580123456787234',
        cardholderName: 'BAJWA/TESTING',
        expiryDate: '2812',
        pin: hashPin('1234'),
        track1: '%B4580123456787234^BAJWA/TESTING^2812101100000000000000?',
        track2: ';4580123456787234=28121011000000000?',
        accountId: happyAccount.id,
        status: 'ACTIVE',
      },
      {
        pan: '4580111122223333',
        cardholderName: 'TEST/LOW BAL',
        expiryDate: '2612',
        pin: hashPin('0000'),
        track1: '%B4580111122223333^TEST/LOW BAL^2612101100000000000000?',
        track2: ';4580111122223333=26121011000000000?',
        accountId: lowAccount.id,
        status: 'ACTIVE',
      },
      {
        pan: '4580555500001111',
        cardholderName: 'BLOCKED/USER',
        expiryDate: '2712',
        pin: hashPin('9999'),
        track1: '%B4580555500001111^BLOCKED/USER^2712101100000000000000?',
        track2: ';4580555500001111=27121011000000000?',
        accountId: blockedAccount.id,
        status: 'BLOCKED',
      },
      {
        pan: '4580444433332222',
        cardholderName: 'EXPIRED/USER',
        expiryDate: '2001', // Jan 2020 — well in the past
        pin: hashPin('5678'),
        track1: '%B4580444433332222^EXPIRED/USER^2001101100000000000000?',
        track2: ';4580444433332222=20011011000000000?',
        accountId: expiredAccount.id,
        status: 'EXPIRED',
      },
    ],
  });

  // --- Cash units (initial cassette configuration) ---
  await prisma.cashUnit.createMany({
    data: [
      {
        unitId: 'CASS1',
        denomination: 100_000,
        count: 500,
        initialCount: 500,
        maximum: 2500,
        minimum: 50,
      },
      {
        unitId: 'CASS2',
        denomination: 50_000,
        count: 1000,
        initialCount: 1000,
        maximum: 2500,
        minimum: 100,
      },
      {
        unitId: 'CASS3',
        denomination: 20_000,
        count: 500,
        initialCount: 500,
        maximum: 2500,
        minimum: 50,
      },
      {
        unitId: 'REJECT',
        denomination: 0,
        count: 0,
        initialCount: 0,
        maximum: 300,
        minimum: 0,
      },
    ],
  });

  // --- Bank themes (Update_features.md §8) ---
  const receiptTpl = (bank: string) =>
    `\n====================================\n    ${bank}\n====================================\n{{date}}\nATM:   {{atmId}}\nTrace: {{traceNo}}\n\nTransaction: {{txnType}}\nCard:        ****{{cardLast4}}\n\nAmount:      Rp {{amount}}\nTotal:       Rp {{total}}\nBalance:     Rp {{balance}}\n\nTerima kasih.\n====================================\n`.trim();

  await prisma.bankTheme.createMany({
    data: [
      {
        code: 'mandiri',
        name: 'Bank Mandiri',
        primaryColor: '#003D79',
        secondaryColor: '#FFCC29',
        accentColor: '#FFFFFF',
        receiptTemplate: receiptTpl('BANK MANDIRI'),
        isDefault: true,
      },
      {
        code: 'bsi',
        name: 'Bank Syariah Indonesia',
        primaryColor: '#00754A',
        secondaryColor: '#C9B47B',
        accentColor: '#FFFFFF',
        receiptTemplate: receiptTpl('BANK SYARIAH INDONESIA'),
      },
      {
        code: 'btn',
        name: 'Bank BTN',
        primaryColor: '#F47920',
        secondaryColor: '#002A6C',
        accentColor: '#FFFFFF',
        receiptTemplate: receiptTpl('BANK BTN'),
      },
      {
        code: 'bni',
        name: 'Bank BNI',
        primaryColor: '#006B3F',
        secondaryColor: '#F7941D',
        accentColor: '#FFFFFF',
        receiptTemplate: receiptTpl('BANK BNI'),
      },
      {
        code: 'bri',
        name: 'Bank BRI',
        primaryColor: '#00529C',
        secondaryColor: '#F7941D',
        accentColor: '#FFFFFF',
        receiptTemplate: receiptTpl('BANK BRI'),
      },
      {
        code: 'bca',
        name: 'Bank BCA',
        primaryColor: '#0066CC',
        secondaryColor: '#FFFFFF',
        accentColor: '#F7941D',
        receiptTemplate: receiptTpl('BANK BCA'),
      },
      {
        code: 'zegen',
        name: 'Bank Zegen',
        primaryColor: '#0F172A',
        secondaryColor: '#22D3EE',
        accentColor: '#FFFFFF',
        receiptTemplate: receiptTpl('BANK ZEGEN'),
      },
    ],
  });

  // eslint-disable-next-line no-console
  console.log('[seed] Seed complete:');
  // eslint-disable-next-line no-console
  console.log(`  - 4 accounts, 4 virtual cards (HAPPY, LOW, BLOCKED, EXPIRED)`);
  // eslint-disable-next-line no-console
  console.log(`  - 4 cash units (CASS1=100k, CASS2=50k, CASS3=20k, REJECT)`);
  // eslint-disable-next-line no-console
  console.log(`  - 7 bank themes (mandiri default)`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seed] Failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
