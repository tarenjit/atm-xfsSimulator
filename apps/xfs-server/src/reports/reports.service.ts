import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';

/**
 * PDF report generator.
 *
 * Architecture_v3.md §10 Phase 6 calls for "PDF reports (Puppeteer)".
 * pdfkit is used here instead of Puppeteer to avoid the ~170MB chromium
 * download — this delivers the same end-user value (PDF download for a
 * macro run / suite run / monthly executive summary) with a much smaller
 * dependency footprint. A future Puppeteer-rendered HTML upgrade is
 * tracked in docs/ROADMAP.md.
 *
 * Two report types ship in MVP:
 *   - macro-run report:  per-run technical detail with steps + evidence
 *   - executive summary: monthly aggregate (pass/fail rates, durations,
 *                        top-failing macros)
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Per macro-run technical report.
  // -------------------------------------------------------------------------

  async generateMacroRunPdf(macroRunId: string): Promise<Buffer> {
    const run = await this.prisma.macroRun.findUnique({
      where: { id: macroRunId },
      include: { macro: true },
    });
    if (!run) {
      throw new NotFoundException(`Macro run ${macroRunId} not found`);
    }

    return this.renderPdf((doc) => {
      this.title(doc, 'ATMirror — Macro Run Report');
      this.kv(doc, 'Macro', run.macro.name);
      this.kv(doc, 'Run ID', run.id);
      this.kv(doc, 'Status', run.status);
      this.kv(doc, 'Started', run.startedAt.toISOString());
      if (run.completedAt) this.kv(doc, 'Completed', run.completedAt.toISOString());
      if (run.durationMs !== null && run.durationMs !== undefined) {
        this.kv(doc, 'Duration', `${run.durationMs} ms`);
      }
      if (run.macro.folder) this.kv(doc, 'Folder', run.macro.folder);
      doc.moveDown();

      const steps = Array.isArray(run.macro.steps) ? (run.macro.steps as unknown[]) : [];
      const stepResults = Array.isArray(run.stepResults)
        ? (run.stepResults as Array<Record<string, unknown>>)
        : [];

      this.section(doc, `Steps (${steps.length})`);
      steps.forEach((step, idx) => {
        const r = stepResults[idx] ?? {};
        const s = step as Record<string, unknown>;
        const status = (r.status as string) ?? 'PENDING';
        const symbol = status === 'PASS' ? '[OK]' : status === 'FAIL' ? '[X]' : '[-]';
        doc
          .font('Helvetica')
          .fontSize(10)
          .text(
            `${symbol} ${idx + 1}. ${String(s.device ?? '?')}: ${String(s.operation ?? '?')} (${status})`,
          );
        if (r.error) {
          doc.font('Helvetica-Oblique').fontSize(9).text(`     error: ${String(r.error)}`);
          doc.font('Helvetica').fontSize(10);
        }
      });

      if (run.evidence && typeof run.evidence === 'object') {
        doc.moveDown();
        this.section(doc, 'Evidence');
        const ev = run.evidence as Record<string, unknown>;
        this.kv(doc, 'Screenshots', String(Array.isArray(ev.screenshots) ? ev.screenshots.length : 0));
        this.kv(doc, 'Receipts', String(Array.isArray(ev.receipts) ? ev.receipts.length : 0));
        this.kv(doc, 'Command log entries', String(Array.isArray(ev.commandLog) ? ev.commandLog.length : 0));
      }

      this.footer(doc);
    });
  }

  // -------------------------------------------------------------------------
  // Monthly executive summary across all runs in a YYYY-MM window.
  // -------------------------------------------------------------------------

  async generateExecutivePdf(month: string): Promise<Buffer> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new NotFoundException(`Invalid month format: "${month}" (expected YYYY-MM)`);
    }
    const [yearStr, monthStr] = month.split('-');
    const year = Number(yearStr);
    const monthIdx = Number(monthStr) - 1; // JS months are 0-indexed
    const start = new Date(Date.UTC(year, monthIdx, 1));
    const end = new Date(Date.UTC(year, monthIdx + 1, 1));

    const runs = await this.prisma.macroRun.findMany({
      where: { startedAt: { gte: start, lt: end } },
      include: { macro: true },
      orderBy: { startedAt: 'desc' },
    });

    const total = runs.length;
    const passed = runs.filter((r) => r.status === 'PASSED').length;
    const failed = runs.filter((r) => r.status === 'FAILED').length;
    const aborted = runs.filter((r) => r.status === 'ABORTED').length;
    const running = runs.filter((r) => r.status === 'RUNNING').length;

    const completedDurations = runs
      .map((r) => r.durationMs)
      .filter((d): d is number => typeof d === 'number');
    const avgMs = completedDurations.length
      ? Math.round(completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length)
      : 0;

    // Top failing macros by failure count.
    const failByMacro = new Map<string, { name: string; count: number }>();
    for (const r of runs) {
      if (r.status !== 'FAILED') continue;
      const key = r.macroId;
      const existing = failByMacro.get(key);
      if (existing) existing.count += 1;
      else failByMacro.set(key, { name: r.macro.name, count: 1 });
    }
    const topFailing = [...failByMacro.values()].sort((a, b) => b.count - a.count).slice(0, 5);

    return this.renderPdf((doc) => {
      this.title(doc, `ATMirror — Executive Summary (${month})`);
      this.kv(doc, 'Window', `${start.toISOString()} → ${end.toISOString()}`);
      this.kv(doc, 'Total runs', String(total));
      this.kv(doc, 'Passed', String(passed));
      this.kv(doc, 'Failed', String(failed));
      this.kv(doc, 'Aborted', String(aborted));
      this.kv(doc, 'In flight', String(running));
      const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '—';
      this.kv(doc, 'Pass rate', `${passRate}%`);
      this.kv(doc, 'Avg duration', `${avgMs} ms`);
      doc.moveDown();

      this.section(doc, 'Top failing macros');
      if (topFailing.length === 0) {
        doc.font('Helvetica').fontSize(10).text('  (no failures recorded)');
      } else {
        for (const f of topFailing) {
          doc.font('Helvetica').fontSize(10).text(`  ${f.count.toString().padStart(3)} × ${f.name}`);
        }
      }

      this.footer(doc);
    });
  }

  // -------------------------------------------------------------------------
  // Helpers.
  // -------------------------------------------------------------------------

  private renderPdf(build: (doc: InstanceType<typeof PDFDocument>) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      try {
        build(doc);
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private title(doc: InstanceType<typeof PDFDocument>, text: string): void {
    doc.font('Helvetica-Bold').fontSize(18).text(text);
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(10).fillColor('gray')
      .text(`Generated ${new Date().toISOString()}`);
    doc.fillColor('black');
    doc.moveDown();
  }

  private section(doc: InstanceType<typeof PDFDocument>, text: string): void {
    doc.font('Helvetica-Bold').fontSize(12).text(text);
    doc.moveDown(0.3);
  }

  private kv(doc: InstanceType<typeof PDFDocument>, key: string, value: string): void {
    doc.font('Helvetica-Bold').fontSize(10).text(`${key}: `, { continued: true });
    doc.font('Helvetica').text(value);
  }

  private footer(doc: InstanceType<typeof PDFDocument>): void {
    doc.moveDown(2);
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('gray')
      .text('PT Zegen Solusi Mandiri · ATMirror Simulator', { align: 'center' });
    doc.fillColor('black');
  }
}
