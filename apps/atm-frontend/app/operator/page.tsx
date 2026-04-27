import { DeviceStatus } from '@/components/operator/DeviceStatus';
import { CassetteManager } from '@/components/operator/CassetteManager';
import { CardManager } from '@/components/operator/CardManager';
import { LogStream } from '@/components/operator/LogStream';
import { TransactionList } from '@/components/operator/TransactionList';
import { SessionHistory } from '@/components/operator/SessionHistory';
import { ThemeSwitcher } from '@/components/operator/ThemeSwitcher';
import { MacroStudio } from '@/components/operator/MacroStudio';
import { SuitePanel } from '@/components/operator/SuitePanel';
import { HostTransportPanel } from '@/components/operator/HostTransportPanel';
import { ReportsPanel } from '@/components/operator/ReportsPanel';

export default function OperatorPage() {
  return (
    <main className="min-h-screen p-6 chrome-bg">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex items-end justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-zegen-accent">
              Operator Console
            </div>
            <h1 className="text-3xl font-semibold chrome-text">Zegen ATM Simulator</h1>
          </div>
          <div className="text-xs chrome-dim">
            Dashboard, themes, macros, devices, cassettes, cards, logs, replay.
          </div>
        </header>

        <ThemeSwitcher />

        <HostTransportPanel />

        <MacroStudio />

        <SuitePanel />

        <ReportsPanel />

        <div className="grid lg:grid-cols-2 gap-8">
          <DeviceStatus />
          <CassetteManager />
          <LogStream />
          <TransactionList />
        </div>

        <SessionHistory />

        <CardManager />

        <footer className="text-xs chrome-dim border-t chrome-border pt-4">
          Phase 8b — Macro Test Studio live. Click ▶ Play on a macro to run it against the current
          ATM.
        </footer>
      </div>
    </main>
  );
}
