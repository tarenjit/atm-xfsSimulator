'use client';

import { cn } from '@/lib/cn';
import type { AtmSession, BankTheme, VirtualCardSummary } from '@/types/atm';

interface Props {
  primaryColor: string;
  accentColor: string;
  theme: BankTheme | null;
  session: AtmSession | null;
  cards: VirtualCardSummary[];
  selectedPan: string | null;
  onPickCard: (pan: string) => void;
  pinDigits: number;
  customAmount: string;
  onCustomAmountChange: (v: string) => void;
  /** Which MAIN_MENU view to render: 'MAIN' = withdrawals, 'SUB' = MENU LAINNYA. */
  menuView?: 'MAIN' | 'SUB';
  /** Modal overlay text. Newlines render as <br>. null = no overlay. */
  overlayMsg?: string | null;
  /** Called when user clicks anywhere outside the overlay or presses dismiss. */
  onDismissOverlay?: () => void;
}

/**
 * The blue bank screen — renders state-specific menus and prompts.
 * Mandiri-style: bank logo top-right, Bahasa Indonesia copy by default,
 * FDK labels are owned by the parent and pointed at via arrows.
 */
export function BankScreen({
  primaryColor,
  accentColor,
  theme,
  session,
  pinDigits,
  menuView = 'MAIN',
  overlayMsg = null,
  onDismissOverlay,
}: Props) {
  const state = session?.state ?? 'IDLE';

  return (
    <div
      className="flex-1 rounded-lg p-6 relative shadow-inner text-white min-h-[280px]"
      style={{ background: primaryColor, color: accentColor }}
    >
      {/* Bank logo corner */}
      <div className="absolute top-3 right-4 text-sm opacity-90 italic">
        {theme?.name ?? 'Bank Zegen'}
      </div>

      {state === 'IDLE' && (
        <div className="h-full flex flex-col items-center justify-center text-center">
          <div className="text-2xl font-semibold tracking-wide">SELAMAT DATANG</div>
          <div className="text-sm opacity-80 mt-3">Silakan masukkan kartu Anda</div>
          <div className="text-xs opacity-50 mt-6">({theme?.name ?? 'Bank Zegen'} · simulator)</div>
        </div>
      )}

      {state === 'CARD_INSERTED' && (
        <div className="h-full flex flex-col items-center justify-center">
          <div className="text-lg">MEMBACA KARTU…</div>
        </div>
      )}

      {state === 'PIN_ENTRY' && (
        <div className="h-full flex flex-col items-center justify-center">
          <div className="text-lg font-semibold mb-2">MASUKKAN PIN ANDA</div>
          <div className="text-xs opacity-70 mb-5">Tekan ENTER setelah selesai</div>
          <div className="flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'w-6 h-6 rounded-full border-2 border-white/80',
                  i < pinDigits && 'bg-white',
                )}
              />
            ))}
          </div>
        </div>
      )}

      {state === 'MAIN_MENU' && menuView === 'MAIN' && (
        <div className="h-full flex flex-col">
          <div className="text-center font-semibold tracking-wider mb-1">MENU UTAMA</div>
          <div className="text-center text-xs opacity-85">
            PILIH &quot;PENARIKAN JUMLAH LAIN&quot; JIKA INGIN CETAK RESI
          </div>
          <div className="text-center text-xs opacity-70 mb-4">TEKAN CANCEL UNTUK KELUAR</div>
          <div className="flex-1 grid grid-cols-2 gap-x-10 gap-y-2 text-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span>▶</span>
                <span>300.000</span>
              </div>
              <div className="flex items-center gap-2">
                <span>▶</span>
                <span>500.000</span>
              </div>
              <div className="flex items-center gap-2">
                <span>▶</span>
                <span>UANG ELEKTRONIK</span>
              </div>
              <div />
            </div>
            <div className="space-y-2 text-right">
              <div className="flex items-center justify-end gap-2">
                <span>1.000.000</span>
                <span>◀</span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <span>2.000.000</span>
                <span>◀</span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <span>PENARIKAN JUMLAH LAIN</span>
                <span>◀</span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <span>MENU LAINNYA</span>
                <span>◀</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {state === 'MAIN_MENU' && menuView === 'SUB' && (
        <div className="h-full flex flex-col">
          <div className="text-center font-semibold tracking-wider mb-1">MENU LAINNYA</div>
          <div className="text-center text-xs opacity-70 mb-4">
            PILIH LAYANAN ATAU TEKAN KEMBALI
          </div>
          <div className="flex-1 grid grid-cols-2 gap-x-10 gap-y-2 text-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span>▶</span>
                <span>CEK SALDO</span>
              </div>
              <div className="flex items-center gap-2">
                <span>▶</span>
                <span>TRANSFER</span>
              </div>
              <div className="flex items-center gap-2">
                <span>▶</span>
                <span>SETOR TUNAI</span>
              </div>
              <div />
            </div>
            <div className="space-y-2 text-right">
              <div className="flex items-center justify-end gap-2">
                <span>PEMBAYARAN</span>
                <span>◀</span>
              </div>
              <div />
              <div />
              <div className="flex items-center justify-end gap-2">
                <span>KEMBALI</span>
                <span>◀</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {state === 'AMOUNT_ENTRY' && (
        <div className="h-full flex flex-col items-center justify-center text-center">
          <div className="text-lg font-semibold mb-2">MASUKKAN JUMLAH PENARIKAN</div>
          <div className="text-xs opacity-80">Kelipatan Rp 20.000</div>
          <div className="text-xs opacity-60 mt-4">Gunakan panel di kanan</div>
        </div>
      )}

      {state === 'CONFIRM' && session?.amount !== undefined && (
        <div className="h-full flex flex-col items-center justify-center text-center">
          <div className="text-sm opacity-80 mb-2">ANDA AKAN MENARIK</div>
          <div className="text-4xl font-semibold tracking-wide">
            Rp {session.amount.toLocaleString('id-ID')}
          </div>
          <div className="text-xs opacity-70 mt-6">TEKAN ENTER UNTUK KONFIRMASI</div>
        </div>
      )}

      {state === 'PROCESSING' && (
        <div className="h-full flex flex-col items-center justify-center">
          <div className="text-lg">SEDANG MEMPROSES…</div>
          <div className="text-xs opacity-70 mt-2">Mohon tunggu</div>
        </div>
      )}

      {state === 'DISPENSING' && (
        <div className="h-full flex flex-col items-center justify-center">
          <div className="text-lg">SILAKAN AMBIL UANG ANDA</div>
        </div>
      )}

      {state === 'PRINTING' && (
        <div className="h-full flex flex-col items-center justify-center">
          <div className="text-lg">MENCETAK STRUK…</div>
        </div>
      )}

      {state === 'EJECTING' && (
        <div className="h-full flex flex-col items-center justify-center">
          <div className="text-lg">SILAKAN AMBIL KARTU ANDA</div>
        </div>
      )}

      {state === 'ERROR' && (
        <div className="h-full flex flex-col items-center justify-center text-center">
          <div className="text-lg">TRANSAKSI GAGAL</div>
          <div className="text-sm opacity-85 mt-2 max-w-xs">
            {session?.errorMessage ?? 'Silakan coba lagi'}
          </div>
        </div>
      )}

      {state === 'ENDED' && (
        <div className="h-full flex flex-col items-center justify-center">
          <div className="text-lg">TERIMA KASIH</div>
          <div className="text-xs opacity-70 mt-2">Selamat jalan</div>
        </div>
      )}

      {/* Modal overlay (UANG ELEKTRONIK / coming-soon stubs) */}
      {overlayMsg && (
        <button
          type="button"
          aria-label="Dismiss overlay"
          onClick={onDismissOverlay}
          data-testid="bank-screen-overlay"
          className="absolute inset-0 rounded-lg flex items-center justify-center cursor-pointer
                     bg-black/70 backdrop-blur-sm transition-opacity"
        >
          <div className="max-w-md mx-6 px-6 py-5 rounded-xl bg-slate-900/95 border border-cyan-400/40
                          text-center text-white whitespace-pre-line text-sm leading-relaxed shadow-2xl">
            {overlayMsg}
            <div className="mt-4 text-[11px] opacity-60 uppercase tracking-widest">
              Tekan layar untuk menutup
            </div>
          </div>
        </button>
      )}

      {/* Small watermark at bottom, matching reference */}
      <div className="absolute bottom-2 left-4 right-4 text-center text-[10px] opacity-40 uppercase tracking-[0.2em]">
        zegen
      </div>
    </div>
  );
}
