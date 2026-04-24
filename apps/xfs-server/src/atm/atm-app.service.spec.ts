import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { hashPin } from '@atm/shared';
import {
  CdmDeviceService,
  IdcDeviceService,
  PinDeviceService,
  PtrDeviceService,
  VirtualCard,
} from '@atm/xfs-devices';
import { IsoResponseCode } from '@atm/iso8583';
import { XfsResult } from '@atm/xfs-core';
import { AtmAppService } from './atm-app.service';
import { HostEmulatorService } from '../host/host-emulator.service';
import { XfsManagerService } from '../xfs/xfs-manager.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Integration-style test of the ATM state machine.
 *
 * Strategy:
 *   - Real XFS manager + real devices (IDC, PIN, CDM, PTR).
 *   - Prisma + host are stubs.
 *   - Devices run with 0ms delay so tests complete in milliseconds.
 */

const sampleCard: VirtualCard = {
  pan: '4580123456787234',
  cardholderName: 'BAJWA/TESTING',
  expiryDate: '3012',
  track1: '%B4580123456787234^BAJWA/TESTING^3012101100000000000000?',
  track2: ';4580123456787234=30121011000000000?',
  pinHash: hashPin('1234'),
  issuer: 'ZEGEN',
};

describe('AtmAppService', () => {
  let moduleRef: TestingModule;
  let atm: AtmAppService;
  let pin: PinDeviceService;
  let host: jest.Mocked<HostEmulatorService>;
  let prisma: { atmSession: { create: jest.Mock; update: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      atmSession: {
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const hostStub: Partial<jest.Mocked<HostEmulatorService>> = {
      authenticate: jest.fn().mockResolvedValue({
        success: true,
        accountId: 'acc_1',
        responseCode: IsoResponseCode.APPROVED,
      }),
      verifyPin: jest.fn().mockResolvedValue({
        success: true,
        responseCode: IsoResponseCode.APPROVED,
      }),
      authorizeWithdrawal: jest.fn().mockResolvedValue({
        approved: true,
        responseCode: IsoResponseCode.APPROVED,
        authCode: '123456',
        stanNo: '000001',
        balanceAfter: 4_500_000,
      }),
      getBalance: jest.fn().mockResolvedValue({
        amount: 5_000_000,
        currency: 'IDR',
        responseCode: IsoResponseCode.APPROVED,
      }),
      reverseTransaction: jest.fn().mockResolvedValue(undefined),
      retainCard: jest.fn().mockResolvedValue(undefined),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        AtmAppService,
        XfsManagerService,
        IdcDeviceService,
        PinDeviceService,
        CdmDeviceService,
        PtrDeviceService,
        {
          provide: EventEmitter2,
          useValue: new EventEmitter2({ wildcard: false, maxListeners: 50 }),
        },
        { provide: HostEmulatorService, useValue: hostStub },
        { provide: PrismaService, useValue: { xfsCommandLog: { create: jest.fn() }, ...prisma } },
      ],
    }).compile();

    atm = moduleRef.get(AtmAppService);
    pin = moduleRef.get(PinDeviceService);
    host = moduleRef.get(HostEmulatorService) as jest.Mocked<HostEmulatorService>;

    // Auto-register devices as XfsModule would in production.
    const manager = moduleRef.get(XfsManagerService);
    manager.registerService(moduleRef.get(IdcDeviceService));
    manager.registerService(moduleRef.get(PinDeviceService));
    manager.registerService(moduleRef.get(CdmDeviceService));
    manager.registerService(moduleRef.get(PtrDeviceService));

    // Zero delays for fast tests.
    moduleRef.get(IdcDeviceService).setResponseDelay(0);
    moduleRef.get(PinDeviceService).setResponseDelay(0);
    moduleRef.get(CdmDeviceService).setResponseDelay(0);
    moduleRef.get(PtrDeviceService).setResponseDelay(0);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('happy path: insert → PIN → select WITHDRAWAL → amount → confirm → ENDED', async () => {
    const session = await atm.onCardInserted(sampleCard.pan, sampleCard);
    expect(session.state).toBe('PIN_ENTRY');

    const entry = atm.beginPinEntry();
    // Let promise chain kick off before sending keys.
    await Promise.resolve();
    for (const k of ['1', '2', '3', '4']) pin.pressKey(k);
    pin.pressKey('ENTER');
    const result = await entry;
    expect(result.verified).toBe(true);
    expect(atm.getSession()?.state).toBe('MAIN_MENU');

    await atm.selectTransaction('WITHDRAWAL');
    expect(atm.getSession()?.state).toBe('AMOUNT_ENTRY');

    await atm.submitAmount(200_000);
    expect(atm.getSession()?.state).toBe('CONFIRM');

    await atm.confirmTransaction();
    // Session cleared after completion.
    expect(atm.getSession()).toBeNull();
    expect(host.authorizeWithdrawal).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 200_000 }),
    );
    expect(prisma.atmSession.update).toHaveBeenCalled();
  });

  it('balance inquiry prints receipt and ejects', async () => {
    await atm.onCardInserted(sampleCard.pan, sampleCard);
    const entry = atm.beginPinEntry();
    await Promise.resolve();
    for (const k of ['1', '2', '3', '4']) pin.pressKey(k);
    pin.pressKey('ENTER');
    await entry;

    await atm.selectTransaction('BALANCE');
    expect(host.getBalance).toHaveBeenCalled();
    expect(atm.getSession()).toBeNull();
  });

  it('wrong PIN under 3 attempts keeps session in PIN_ENTRY', async () => {
    (host.verifyPin as jest.Mock).mockResolvedValueOnce({
      success: false,
      responseCode: IsoResponseCode.INCORRECT_PIN,
      reason: 'incorrect pin',
    });

    await atm.onCardInserted(sampleCard.pan, sampleCard);
    const entry = atm.beginPinEntry();
    await Promise.resolve();
    for (const k of ['0', '0', '0', '0']) pin.pressKey(k);
    pin.pressKey('ENTER');
    const result = await entry;
    expect(result.verified).toBe(false);
    expect(atm.getSession()?.state).toBe('PIN_ENTRY');
    expect(atm.getSession()?.failedPinAttempts).toBe(1);
  });

  it('3 wrong PINs retains the card', async () => {
    (host.verifyPin as jest.Mock).mockResolvedValue({
      success: false,
      responseCode: IsoResponseCode.INCORRECT_PIN,
      reason: 'incorrect pin',
    });

    await atm.onCardInserted(sampleCard.pan, sampleCard);
    for (let i = 0; i < 3; i++) {
      const entry = atm.beginPinEntry();
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
      for (const k of ['0', '0', '0', '0']) pin.pressKey(k);
      pin.pressKey('ENTER');
      // eslint-disable-next-line no-await-in-loop
      await entry;
    }
    expect(host.retainCard).toHaveBeenCalled();
    expect(atm.getSession()).toBeNull();
  });

  it('host decline on authorizeWithdrawal routes to ERROR', async () => {
    (host.authorizeWithdrawal as jest.Mock).mockResolvedValueOnce({
      approved: false,
      responseCode: IsoResponseCode.NOT_SUFFICIENT_FUNDS,
      stanNo: '000001',
      reason: 'insufficient funds',
    });

    await atm.onCardInserted(sampleCard.pan, sampleCard);
    const entry = atm.beginPinEntry();
    await Promise.resolve();
    for (const k of ['1', '2', '3', '4']) pin.pressKey(k);
    pin.pressKey('ENTER');
    await entry;

    await atm.selectTransaction('WITHDRAWAL');
    await atm.submitAmount(1_000_000);
    await atm.confirmTransaction();
    // Session ended with error.
    expect(atm.getSession()).toBeNull();
  });

  it('dispense failure triggers host reversal', async () => {
    await atm.onCardInserted(sampleCard.pan, sampleCard);
    const entry = atm.beginPinEntry();
    await Promise.resolve();
    for (const k of ['1', '2', '3', '4']) pin.pressKey(k);
    pin.pressKey('ENTER');
    await entry;

    // Inject a CDM hardware failure before dispense.
    const cdm = moduleRef.get(CdmDeviceService);
    cdm.injectError(XfsResult.ERR_HARDWARE_ERROR);

    await atm.selectTransaction('WITHDRAWAL');
    await atm.submitAmount(200_000);
    await atm.confirmTransaction();

    expect(host.reverseTransaction).toHaveBeenCalled();
  });

  it('cancel during AMOUNT_ENTRY ejects and ends session', async () => {
    await atm.onCardInserted(sampleCard.pan, sampleCard);
    const entry = atm.beginPinEntry();
    await Promise.resolve();
    for (const k of ['1', '2', '3', '4']) pin.pressKey(k);
    pin.pressKey('ENTER');
    await entry;

    await atm.selectTransaction('WITHDRAWAL');
    await atm.cancelTransaction('changed my mind');
    expect(atm.getSession()).toBeNull();
  });

  it('submitAmount rejects non-multiple of 20000', async () => {
    await atm.onCardInserted(sampleCard.pan, sampleCard);
    const entry = atm.beginPinEntry();
    await Promise.resolve();
    for (const k of ['1', '2', '3', '4']) pin.pressKey(k);
    pin.pressKey('ENTER');
    await entry;

    await atm.selectTransaction('WITHDRAWAL');
    await expect(atm.submitAmount(10_000)).rejects.toThrow('multiple of 20000');
  });

  it('blocked card on authenticate routes to ERROR and ejects', async () => {
    (host.authenticate as jest.Mock).mockResolvedValueOnce({
      success: false,
      responseCode: IsoResponseCode.CARD_BLOCKED,
      reason: 'card blocked',
    });

    await atm.onCardInserted(sampleCard.pan, sampleCard);
    expect(atm.getSession()).toBeNull();
  });
});
