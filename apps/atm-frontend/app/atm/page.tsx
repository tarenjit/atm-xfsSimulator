export default function AtmPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-xl w-full text-center space-y-4">
        <div className="text-xs uppercase tracking-widest text-zegen-accent">ATM Screen</div>
        <h1 className="text-3xl font-semibold">Idle — Please insert your card</h1>
        <p className="text-slate-400">
          Phase 1 scaffold — the full ATM screen with card slot, PIN pad, cash tray, and receipt
          preview arrives in Phase 4.
        </p>
      </div>
    </main>
  );
}
