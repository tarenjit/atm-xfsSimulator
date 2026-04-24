import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-3xl w-full space-y-10">
        <header>
          <div className="text-xs uppercase tracking-widest text-zegen-accent mb-2">
            PT Zegen Solusi Mandiri
          </div>
          <h1 className="text-4xl font-semibold">ATM + XFS Virtual Simulator</h1>
          <p className="text-slate-400 mt-3 max-w-prose">
            A production-grade virtual ATM simulator with an XFS-compliant device emulation layer.
            Choose a view to begin — the ATM screen drives transactions, the operator console
            manages devices and inspects logs.
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-4">
          <Link
            href="/atm"
            className="block p-6 rounded-xl border border-slate-700 hover:border-zegen-accent transition-colors"
          >
            <div className="text-zegen-accent font-mono text-xs mb-2">/atm</div>
            <h2 className="text-xl font-medium mb-1">ATM Screen</h2>
            <p className="text-sm text-slate-400">
              Card reader, PIN pad, cash dispenser, receipt printer — the customer-facing view.
            </p>
          </Link>

          <Link
            href="/operator"
            className="block p-6 rounded-xl border border-slate-700 hover:border-zegen-accent transition-colors"
          >
            <div className="text-zegen-accent font-mono text-xs mb-2">/operator</div>
            <h2 className="text-xl font-medium mb-1">Operator Console</h2>
            <p className="text-sm text-slate-400">
              Device status, card manager, cassette manager, error injection, and XFS log stream.
            </p>
          </Link>
        </div>

        <footer className="text-xs text-slate-500 border-t border-slate-800 pt-4">
          Phase 1 scaffold. Full UI lands in Phase 4 (ATM screen) and Phase 5 (operator console).
        </footer>
      </div>
    </main>
  );
}
