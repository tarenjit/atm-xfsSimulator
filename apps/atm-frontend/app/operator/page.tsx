import { DeviceStatus } from '@/components/operator/DeviceStatus';
import { CassetteManager } from '@/components/operator/CassetteManager';
import { CardManager } from '@/components/operator/CardManager';
import { LogStream } from '@/components/operator/LogStream';
import { TransactionList } from '@/components/operator/TransactionList';
import { SessionHistory } from '@/components/operator/SessionHistory';

export default function OperatorPage() {
  return (
    <main className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex items-end justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-zegen-accent">
              Operator Console
            </div>
            <h1 className="text-3xl font-semibold">Zegen ATM Simulator</h1>
          </div>
          <div className="text-xs text-slate-500">
            Dashboard, devices, cassettes, cards, logs, replay.
          </div>
        </header>

        <div className="grid lg:grid-cols-2 gap-8">
          <DeviceStatus />
          <CassetteManager />
          <LogStream />
          <TransactionList />
        </div>

        <SessionHistory />

        <CardManager />

        <footer className="text-xs text-slate-600 border-t border-slate-800 pt-4">
          Phase 7 — click any session to open the replay modal.
        </footer>
      </div>
    </main>
  );
}
