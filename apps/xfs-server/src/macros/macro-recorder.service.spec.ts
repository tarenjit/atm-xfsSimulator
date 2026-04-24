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
import { AtmAppService } from '../atm/atm-app.service';
import { HostEmulatorService } from '../host/host-emulator.service';
import { XfsManagerService } from '../xfs/xfs-manager.service';
import { PrismaService } from '../prisma/prisma.service';
import { MacroRecorderService } from './macro-recorder.service';
import type { MacroStep } from './macro.types';

const sampleCard: VirtualCard = {
  pan: '4580123456787234',
  cardholderName: 'BAJWA/TESTING',
  expiryDate: '3012',
  track1: '%B4580123456787234^BAJWA/TESTING^3012101100000000000000?',
  track2: ';4580123456787234=30121011000000000?',
  pinHash: hashPin('111111'),
  issuer: 'ZEGEN',
};

/**
 * Integration test for the Update_features.md §9 recorder.
 * Uses real XFS manager + real devices, stubbed prisma + host.
 */
describe('MacroRecorderService', () => {
  let moduleRef: TestingModule;
  let recorder: MacroRecorderService;
  let atm: AtmAppService;
  let pin: PinDeviceService;
  let savedSteps: MacroStep[] | null = null;

  beforeEach(async () => {
    savedSteps = null;
    const macroId = 'macro_test_1';

    const prismaStub = {
      atmSession: {
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      xfsCommandLog: { create: jest.fn().mockResolvedValue({}) },
      macro: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          if (where.id === macroId) {
            return Promise.resolve({ id: macroId, steps: [] });
          }
          return Promise.resolve(null);
        }),
        update: jest.fn().mockImplementation(({ data }: { data: { steps: MacroStep[] } }) => {
          savedSteps = data.steps;
          return Promise.resolve({ id: macroId });
        }),
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
        MacroRecorderService,
        {
          provide: EventEmitter2,
          useValue: new EventEmitter2({ wildcard: false, maxListeners: 50 }),
        },
        { provide: HostEmulatorService, useValue: hostStub },
        { provide: PrismaService, useValue: prismaStub },
      ],
    }).compile();

    recorder = moduleRef.get(MacroRecorderService);
    atm = moduleRef.get(AtmAppService);
    pin = moduleRef.get(PinDeviceService);

    const manager = moduleRef.get(XfsManagerService);
    manager.registerService(moduleRef.get(IdcDeviceService));
    manager.registerService(moduleRef.get(PinDeviceService));
    manager.registerService(moduleRef.get(CdmDeviceService));
    manager.registerService(moduleRef.get(PtrDeviceService));

    moduleRef.get(IdcDeviceService).setResponseDelay(0);
    moduleRef.get(PinDeviceService).setResponseDelay(0);
    moduleRef.get(CdmDeviceService).setResponseDelay(0);
    moduleRef.get(PtrDeviceService).setResponseDelay(0);

    // Wire OnEvent handlers — Jest Testing doesn't auto-hook nestjs-event-emitter
    // decorators; we attach manually.
    const events = moduleRef.get(EventEmitter2);
    events.on('atm.userAction', (e) => recorder.onUserAction(e));
    events.on('xfs.event', (e) => recorder.onXfsEvent(e));
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('records a full withdrawal session and produces replayable steps', async () => {
    const result = await recorder.startRecording('macro_test_1');
    expect(result.macroId).toBe('macro_test_1');

    // Drive a full happy-path withdrawal session. ATM actions emit
    // userAction automatically; PIN keypresses emit via the REST
    // controller in production, so for the test we emit them inline
    // to mirror that path.
    const events = moduleRef.get(EventEmitter2);
    const emitKey = (key: string) => {
      pin.pressKey(key);
      events.emit('atm.userAction', {
        kind: 'KEY_PRESS',
        key,
        timestamp: new Date().toISOString(),
      });
    };

    await atm.onCardInserted(sampleCard.pan, sampleCard);
    const entry = atm.beginPinEntry();
    await Promise.resolve();
    for (const k of ['1', '1', '1', '1', '1', '1']) emitKey(k);
    emitKey('ENTER');
    await entry;

    await atm.selectTransaction('WITHDRAWAL');
    await atm.submitAmount(200_000);
    await atm.confirmTransaction();

    const stopped = await recorder.stopRecording();
    expect(stopped).not.toBeNull();
    expect(savedSteps).not.toBeNull();

    // Sort and extract the sequence that matters.
    const steps = (stopped?.steps ?? []).map((s) => ({
      device: s.device,
      operation: s.operation,
      kind: s.kind,
      params: s.parameters.map((p) => ({ name: p.name, type: p.type, value: p.value })),
    }));

    // Must include Card.Select + Card.Insert first.
    expect(steps[0]).toMatchObject({ device: 'Card', operation: 'Select' });
    expect(steps[1]).toMatchObject({ device: 'Card', operation: 'Insert' });

    // Must include a checkpoint for MEDIAINSERTED.
    expect(steps.some((s) => s.device === 'Card' && s.operation === 'Checkpoint(Insert)')).toBe(
      true,
    );

    // A 4–12 digit run collapses into ONE PinPad:EnterPin(Card.pin) step
    // and the subsequent ENTER keypress is absorbed so replay doesn't
    // double-press ENTER.
    const enterPin = steps.find((s) => s.device === 'PinPad' && s.operation === 'EnterPin');
    expect(enterPin).toBeDefined();
    expect(enterPin?.params[0]).toMatchObject({
      name: 'pin',
      type: 'variable',
      value: 'Card.pin',
    });
    const strayEnter = steps.find(
      (s) =>
        s.device === 'PinPad' &&
        s.operation === 'KeyPressed' &&
        s.params.some((p) => p.value === 'ENTER'),
    );
    expect(strayEnter).toBeUndefined();

    // Must include SelectTransaction(WITHDRAWAL), SubmitAmount(200000), Confirm.
    expect(
      steps.some(
        (s) =>
          s.device === 'System' &&
          s.operation === 'SelectTransaction' &&
          s.params.some((p) => p.name === 'txnType' && p.value === 'WITHDRAWAL'),
      ),
    ).toBe(true);
    expect(
      steps.some(
        (s) =>
          s.device === 'System' &&
          s.operation === 'SubmitAmount' &&
          s.params.some((p) => p.name === 'amount' && p.value === 200_000),
      ),
    ).toBe(true);
    expect(steps.some((s) => s.device === 'System' && s.operation === 'Confirm')).toBe(true);
  });

  it('refuses a second concurrent recording', async () => {
    await recorder.startRecording('macro_test_1');
    await expect(recorder.startRecording('macro_test_1')).rejects.toThrow('already recording');
  });

  it('status reports recording state', async () => {
    expect(recorder.status().recording).toBe(false);
    await recorder.startRecording('macro_test_1');
    expect(recorder.status().recording).toBe(true);
    expect(recorder.status().macroId).toBe('macro_test_1');
    await recorder.stopRecording();
    expect(recorder.status().recording).toBe(false);
  });

  it('stopRecording with nothing active returns null', async () => {
    const r = await recorder.stopRecording();
    expect(r).toBeNull();
  });
});
