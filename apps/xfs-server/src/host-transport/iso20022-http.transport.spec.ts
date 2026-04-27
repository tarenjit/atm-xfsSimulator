import * as http from 'node:http';
import * as net from 'node:net';
import { Iso20022HttpTransport } from './iso20022-http.transport';
import type { HostEmulatorService } from '../host/host-emulator.service';

function makeFakeHost(approve = true): jest.Mocked<HostEmulatorService> {
  return {
    authenticate: jest.fn().mockResolvedValue({ success: true, responseCode: '00' }),
    authorizeWithdrawal: jest.fn().mockResolvedValue({
      approved: approve,
      responseCode: approve ? '00' : '51',
      stanNo: '000456',
      authCode: approve ? 'BIFAUTH' : null,
      switchId: 'BIFAST',
      switchName: 'BI-FAST',
      reason: approve ? undefined : 'insufficient funds',
    }),
    verifyPin: jest.fn(),
    getBalance: jest.fn(),
  } as unknown as jest.Mocked<HostEmulatorService>;
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

function postXml(port: number, body: string, path = '/pacs.008'): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/xml', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf-8') }),
        );
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const PACS008 = (pan: string, amount: number, e2e = 'E2E-TEST-001') => `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.13">
  <FIToFICstmrCdtTrf>
    <CdtTrfTxInf>
      <PmtId><EndToEndId>${e2e}</EndToEndId></PmtId>
      <IntrBkSttlmAmt Ccy="IDR">${amount}</IntrBkSttlmAmt>
      <Dbtr><Nm>BAJWA TESTING</Nm></Dbtr>
      <DbtrAcct><Id><Othr><Id>${pan}</Id></Othr></Id></DbtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;

describe('Iso20022HttpTransport', () => {
  let host: jest.Mocked<HostEmulatorService>;
  let transport: Iso20022HttpTransport;
  let port: number;

  beforeEach(async () => {
    host = makeFakeHost(true);
    port = await freePort();
    transport = new Iso20022HttpTransport('cfg-x', '127.0.0.1', port, 'BIFAST', host);
    await transport.start();
  });

  afterEach(async () => {
    await transport.stop();
  });

  it('reports listening status', () => {
    const s = transport.status();
    expect(s.listening).toBe(true);
    expect(s.kind).toBe('ISO20022_HTTP');
    expect(s.switchProfile).toBe('BIFAST');
  });

  it('GET /health returns 200 with switch metadata', async () => {
    const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      http
        .get({ host: '127.0.0.1', port, path: '/health' }, (r) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () =>
            resolve({ status: r.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf-8') }),
          );
        })
        .on('error', reject);
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ status: 'ok', switch: 'BIFAST' });
  });

  it('POST /pacs.008 (approved) → pacs.002 with TxSts ACSC', async () => {
    const res = await postXml(port, PACS008('4580123456787234', 300000));
    expect(res.status).toBe(200);
    expect(res.body).toContain('<TxSts>ACSC</TxSts>');
    expect(res.body).toContain('<OrgnlEndToEndId>E2E-TEST-001</OrgnlEndToEndId>');
    expect(host.authorizeWithdrawal).toHaveBeenCalledWith(
      expect.objectContaining({
        pan: '4580123456787234',
        amount: 300000,
        sessionId: 'pacs008-E2E-TEST-001',
        // Transport overrides PAN-based BIN routing with its configured BI-FAST profile.
        switchProfile: expect.objectContaining({ id: 'BIFAST' }),
      }),
    );
  });

  it('POST /pacs.008 (declined) → pacs.002 with TxSts RJCT and reason code', async () => {
    host.authorizeWithdrawal.mockResolvedValueOnce({
      approved: false,
      responseCode: '51',
      stanNo: '000457',
      switchId: 'BIFAST',
      switchName: 'BI-FAST',
      reason: 'insufficient funds',
    } as never);
    const res = await postXml(port, PACS008('4580111122223333', 999_999_999));
    expect(res.status).toBe(200);
    expect(res.body).toContain('<TxSts>RJCT</TxSts>');
    expect(res.body).toContain('<Cd>AM04</Cd>'); // mapped from response code 51
  });

  it('POST /pacs.008 missing debtor account → RJCT AC01', async () => {
    const xml = `<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.13">
  <FIToFICstmrCdtTrf>
    <CdtTrfTxInf>
      <PmtId><EndToEndId>E2E-NOACCT</EndToEndId></PmtId>
      <IntrBkSttlmAmt Ccy="IDR">100000</IntrBkSttlmAmt>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;
    const res = await postXml(port, xml);
    expect(res.body).toContain('<TxSts>RJCT</TxSts>');
    expect(res.body).toContain('<Cd>AC01</Cd>');
  });

  it('GET / returns 404', async () => {
    const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      http
        .get({ host: '127.0.0.1', port, path: '/' }, (r) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () =>
            resolve({ status: r.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf-8') }),
          );
        })
        .on('error', reject);
    });
    expect(res.status).toBe(404);
  });
});
