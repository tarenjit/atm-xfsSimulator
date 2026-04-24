export default function OperatorPage() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header>
          <div className="text-xs uppercase tracking-widest text-zegen-accent">
            Operator Console
          </div>
          <h1 className="text-3xl font-semibold">Device Dashboard</h1>
        </header>

        <div className="grid md:grid-cols-3 gap-4">
          {['IDC (card reader)', 'PIN (pin pad)', 'CDM (cash dispenser)', 'PTR (printer)'].map(
            (name) => (
              <div
                key={name}
                className="p-4 rounded-lg border border-slate-700 bg-slate-900/60"
              >
                <div className="text-sm text-slate-400">{name}</div>
                <div className="mt-2 text-xs text-slate-500">waiting for Phase 2 wiring…</div>
              </div>
            ),
          )}
        </div>

        <p className="text-xs text-slate-500 border-t border-slate-800 pt-4">
          Phase 1 scaffold — full operator console arrives in Phase 5.
        </p>
      </div>
    </main>
  );
}
