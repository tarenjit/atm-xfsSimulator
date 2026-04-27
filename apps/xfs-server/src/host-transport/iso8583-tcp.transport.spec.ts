import * as net from 'node:net';
import { Iso8583TcpTransport } from './iso8583-tcp.transport';
import type { HostEmulatorService } from '../host/host-emulator.service';

function makeFakeHost(): jest.Mocked<HostEmulatorService> {
  return {
    authenticate: jest.fn().mockResolvedValue({ success: true, responseCode: '00' }),
    authorizeWithdrawal: jest.fn().mockResolvedValue({
      approved: true,
      responseCode: '00',
      stanNo: '000123',
      authCode: 'AUTH99',
      switchId: 'JALIN',
      switchName: 'Jalin',
    }),
    verifyPin: jest.fn(),
    getBalance: jest.fn(),
  } as unknown as jest.Mocked<HostEmulatorService>;
}

function frame(body: string): Buffer {
  const buf = Buffer.from(body, 'ascii');
  const hdr = Buffer.alloc(2);
  hdr.writeUInt16BE(buf.length);
  return Buffer.concat([hdr, buf]);
}

function sendAndReceive(port: number, body: string, timeoutMs = 2000): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: '127.0.0.1', port }, () => {
      sock.write(frame(body));
    });
    let buf = Buffer.alloc(0);
    const t = setTimeout(() => {
      sock.destroy();
      reject(new Error('timeout'));
    }, timeoutMs);
    sock.on('data', (c) => {
      buf = Buffer.concat([buf, c]);
      if (buf.length >= 2) {
        const len = buf.readUInt16BE(0);
        if (buf.length >= 2 + len) {
          clearTimeout(t);
          const s = buf.subarray(2, 2 + len).toString('ascii');
          sock.end();
          resolve(s);
        }
      }
    });
    sock.on('error', (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (typeof addr === 'object' && addr) {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close();
        reject(new Error('no port'));
      }
    });
  });
}

describe('Iso8583TcpTransport', () => {
  let host: jest.Mocked<HostEmulatorService>;
  let transport: Iso8583TcpTransport;
  let port: number;

  beforeEach(async () => {
    host = makeFakeHost();
    port = await freePort();
    transport = new Iso8583TcpTransport('cfg-1', '127.0.0.1', port, 'JALIN', host);
    await transport.start();
  });

  afterEach(async () => {
    await transport.stop();
  });

  it('reports listening status with correct bind + switch', () => {
    const s = transport.status();
    expect(s.listening).toBe(true);
    expect(s.kind).toBe('ISO8583_TCP');
    expect(s.port).toBe(port);
    expect(s.bindAddress).toBe('127.0.0.1');
    expect(s.switchProfile).toBe('JALIN');
  });

  it('handles MTI 0800 echo and returns 0810 with response code 00', async () => {
    const reply = await sendAndReceive(port, '0800');
    expect(reply.startsWith('0810|39=00|switch=JALIN|alive=true')).toBe(true);
  });

  it('handles MTI 0100 authentication and dispatches into HostEmulator', async () => {
    const reply = await sendAndReceive(port, '0100|2=4580123456787234');
    expect(host.authenticate).toHaveBeenCalledWith('4580123456787234');
    expect(reply).toContain('0110|39=00|switch=JALIN');
  });

  it('handles MTI 0200 financial request and returns the host stan + authCode', async () => {
    const reply = await sendAndReceive(port, '0200|2=4580123456787234|4=300000|session=tcp-test');
    expect(host.authorizeWithdrawal).toHaveBeenCalledWith({
      pan: '4580123456787234',
      amount: 300000,
      sessionId: 'tcp-test',
    });
    expect(reply).toContain('0210|39=00|stan=000123|auth=AUTH99|switch=JALIN');
  });

  it('rejects unsupported MTI with response code 12', async () => {
    const reply = await sendAndReceive(port, '0600');
    expect(reply).toContain('39=12');
  });

  it('totalRequests counter advances per request', async () => {
    expect(transport.status().totalRequests).toBe(0);
    await sendAndReceive(port, '0800');
    await sendAndReceive(port, '0800');
    await new Promise((r) => setTimeout(r, 50));
    expect(transport.status().totalRequests).toBe(2);
  });
});
