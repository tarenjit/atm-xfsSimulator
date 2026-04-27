import { Logger } from '@nestjs/common';
import * as http from 'node:http';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import type { IsoSwitchId } from '@atm/iso8583';
import { getSwitchById } from '@atm/iso8583';
import type { HostEmulatorService } from '../host/host-emulator.service';
import {
  HostTransportError,
  type HostTransportRuntimeStatus,
  type IHostTransport,
} from './host-transport.types';

/**
 * ISO 20022 HTTP transport.
 *
 * Accepts a simplified pacs.008 (FI to FI Customer Credit Transfer) message
 * over POST /pacs.008 and returns a pacs.002 status response. This is the
 * BI-FAST style — the actual BI-FAST spec layers a richer envelope on top
 * (BIM headers, signing, TLS-MA), but this MVP demonstrates the wire shape
 * + the operator-toggle works end-to-end.
 *
 * Endpoint: POST <bind>:<port>/pacs.008  Content-Type: application/xml
 *
 *   <Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.13">
 *     <FIToFICstmrCdtTrf>
 *       <CdtTrfTxInf>
 *         <PmtId><EndToEndId>E2E-1</EndToEndId></PmtId>
 *         <IntrBkSttlmAmt Ccy="IDR">300000</IntrBkSttlmAmt>
 *         <Dbtr><Nm>BAJWA TESTING</Nm></Dbtr>
 *         <DbtrAcct><Id><Othr><Id>4580123456787234</Id></Othr></Id></DbtrAcct>
 *       </CdtTrfTxInf>
 *     </FIToFICstmrCdtTrf>
 *   </Document>
 *
 * Health endpoint: GET /health → 200 OK with switch metadata.
 */
export class Iso20022HttpTransport implements IHostTransport {
  readonly kind = 'ISO20022_HTTP' as const;
  private readonly logger = new Logger('HostTransport:ISO20022_HTTP');
  private server: http.Server | null = null;
  private startedAt: string | null = null;
  private activeConnections = 0;
  private totalRequests = 0;
  private lastError: string | null = null;
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
  });
  private readonly builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
  });

  constructor(
    public readonly configId: string,
    private readonly bindAddress: string,
    private readonly port: number,
    private readonly switchProfile: IsoSwitchId,
    private readonly host: HostEmulatorService,
  ) {}

  async start(): Promise<void> {
    if (this.server) return;
    const profile = getSwitchById(this.switchProfile);

    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.server.on('connection', (socket) => {
      this.activeConnections++;
      socket.on('close', () => { this.activeConnections--; });
    });
    this.server.on('error', (err) => {
      this.lastError = err.message;
      this.logger.error(`server error: ${err.message}`);
    });

    return new Promise((resolve, reject) => {
      const onError = (err: Error) => {
        this.server = null;
        reject(new HostTransportError(`failed to bind ${this.bindAddress}:${this.port}: ${err.message}`, this.kind, err));
      };
      this.server!.once('error', onError);
      this.server!.listen(this.port, this.bindAddress, () => {
        this.server!.removeListener('error', onError);
        this.startedAt = new Date().toISOString();
        this.logger.log(
          `listening on http://${this.bindAddress}:${this.port} (switch=${profile.name}, ISO 20022)`,
        );
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server!.close(() => {
        this.startedAt = null;
        this.server = null;
        this.activeConnections = 0;
        this.logger.log('stopped');
        resolve();
      });
    });
  }

  status(): HostTransportRuntimeStatus {
    return {
      kind: this.kind,
      configId: this.configId,
      listening: this.server !== null && this.startedAt !== null,
      bindAddress: this.bindAddress,
      port: this.port,
      switchProfile: this.switchProfile,
      activeConnections: this.activeConnections,
      totalRequests: this.totalRequests,
      startedAt: this.startedAt,
      lastError: this.lastError,
    };
  }

  // ---- HTTP handling ----------------------------------------------------

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', switch: this.switchProfile, kind: this.kind }));
      return;
    }
    if (req.method === 'POST' && (req.url === '/pacs.008' || req.url === '/')) {
      this.totalRequests++;
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        this.handlePacs008(body)
          .then((xml) => {
            res.writeHead(200, { 'Content-Type': 'application/xml' });
            res.end(xml);
          })
          .catch((err) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: (err as Error).message }));
          });
      });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Use POST /pacs.008 or GET /health' }));
  }

  private async handlePacs008(xml: string): Promise<string> {
    const parsed = this.parser.parse(xml) as Record<string, unknown>;
    const cdtInfo = pickCdtTrfTxInf(parsed);
    if (!cdtInfo) {
      return this.buildPacs002({
        endToEndId: 'unknown',
        status: 'RJCT',
        statusReason: 'NARR',
        statusReasonText: 'Unable to locate CdtTrfTxInf in pacs.008',
      });
    }

    const endToEndId = nestedString(cdtInfo, ['PmtId', 'EndToEndId']) ?? `e2e-${Date.now()}`;
    const amountRaw = nestedString(cdtInfo, ['IntrBkSttlmAmt']);
    const amount = Number(amountRaw ?? 0);
    const pan = nestedString(cdtInfo, ['DbtrAcct', 'Id', 'Othr', 'Id']) ?? '';

    if (!pan) {
      return this.buildPacs002({
        endToEndId,
        status: 'RJCT',
        statusReason: 'AC01',
        statusReasonText: 'Debtor account missing',
      });
    }

    const sessionId = `pacs008-${endToEndId}`;
    const switchProfile = getSwitchById(this.switchProfile);
    const result = await this.host.authorizeWithdrawal({ pan, amount, sessionId, switchProfile });

    return this.buildPacs002({
      endToEndId,
      status: result.approved ? 'ACSC' : 'RJCT',
      statusReason: result.approved ? undefined : mapResponseCodeToReason(result.responseCode),
      statusReasonText: result.approved
        ? `Authorized via ${result.switchName} stan=${result.stanNo} auth=${result.authCode ?? ''}`
        : `Declined via ${result.switchName} (responseCode=${result.responseCode}): ${result.reason ?? 'unknown'}`,
    });
  }

  private buildPacs002(opts: {
    endToEndId: string;
    status: 'ACSC' | 'RJCT' | 'PDNG';
    statusReason?: string;
    statusReasonText: string;
  }): string {
    const ns = 'urn:iso:std:iso:20022:tech:xsd:pacs.002.001.15';
    const body = {
      '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
      Document: {
        '@_xmlns': ns,
        FIToFIPmtStsRpt: {
          GrpHdr: {
            MsgId: `STS-${Date.now()}`,
            CreDtTm: new Date().toISOString(),
          },
          TxInfAndSts: {
            OrgnlEndToEndId: opts.endToEndId,
            TxSts: opts.status,
            ...(opts.statusReason
              ? { StsRsnInf: { Rsn: { Cd: opts.statusReason }, AddtlInf: opts.statusReasonText } }
              : { StsRsnInf: { AddtlInf: opts.statusReasonText } }),
          },
        },
      },
    };
    return this.builder.build(body);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickCdtTrfTxInf(parsed: Record<string, unknown>): Record<string, unknown> | null {
  const doc = parsed['Document'] as Record<string, unknown> | undefined;
  if (!doc) return null;
  const fi = doc['FIToFICstmrCdtTrf'] as Record<string, unknown> | undefined;
  if (!fi) return null;
  const cdt = fi['CdtTrfTxInf'];
  if (!cdt || typeof cdt !== 'object') return null;
  // pacs.008 allows multiple CdtTrfTxInf — take the first.
  if (Array.isArray(cdt)) return (cdt[0] as Record<string, unknown>) ?? null;
  return cdt as Record<string, unknown>;
}

function nestedString(obj: unknown, path: string[]): string | undefined {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  if (cur === undefined || cur === null) return undefined;
  if (typeof cur === 'string') return cur;
  if (typeof cur === 'number') return String(cur);
  // Element with attributes returns { '#text': value, '@_Ccy': 'IDR' }
  if (typeof cur === 'object' && '#text' in (cur as Record<string, unknown>)) {
    const t = (cur as Record<string, unknown>)['#text'];
    if (typeof t === 'string' || typeof t === 'number') return String(t);
  }
  return undefined;
}

function mapResponseCodeToReason(code: string): string {
  switch (code) {
    case '14': return 'AC01';   // Invalid debtor account
    case '51': return 'AM04';   // Insufficient funds
    case '54': return 'AC04';   // Account closed (used as expired stand-in)
    case '55': return 'AM05';   // Wrong PIN
    case '61': return 'AM01';   // Daily limit exceeded
    case '62': return 'AC06';   // Card blocked
    case '91': return 'AGNT';   // Issuer unavailable
    default:   return 'NARR';   // Narrative
  }
}
