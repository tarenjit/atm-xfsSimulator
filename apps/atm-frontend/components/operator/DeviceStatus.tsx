'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface ServiceInfo {
  hService: string;
  serviceClass: string;
  state: string;
}

const ERROR_CODES: Array<{ code: number; label: string }> = [
  { code: -1, label: 'CANCEL' },
  { code: -2, label: 'DEV_NOT_READY' },
  { code: -3, label: 'HARDWARE_ERROR' },
  { code: -6, label: 'TIMEOUT' },
  { code: -10, label: 'LOCKED' },
];

export function DeviceStatus() {
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await api<{ services: ServiceInfo[] }>('/xfs/services');
      setServices(r.services);
    } catch (e) {
      setMsg(String(e));
    }
  };

  useEffect(() => {
    void load();
    const id = setInterval(load, 4_000);
    return () => clearInterval(id);
  }, []);

  const inject = async (hService: string, errorCode: number, label: string) => {
    try {
      await api(`/xfs/services/${hService}/inject-error`, {
        method: 'POST',
        body: JSON.stringify({ errorCode }),
      });
      setMsg(`${label} injected into ${hService}`);
    } catch (e) {
      setMsg(String(e));
    }
  };

  const reset = async (hService: string) => {
    try {
      await api(`/xfs/services/${hService}/reset`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setMsg(`${hService} reset`);
      void load();
    } catch (e) {
      setMsg(String(e));
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
        Devices
      </h2>
      <div className="grid md:grid-cols-2 gap-3">
        {services.map((s) => (
          <div
            key={s.hService}
            className="p-4 rounded-lg border border-slate-800 bg-slate-900/60 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-sm">{s.hService}</div>
                <div className="text-xs text-slate-500">{s.serviceClass}</div>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  s.state === 'open' ? 'bg-green-500/20 text-green-300' : 'bg-slate-700 text-slate-300'
                }`}
              >
                {s.state}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {ERROR_CODES.map((ec) => (
                <button
                  key={ec.code}
                  onClick={() => inject(s.hService, ec.code, ec.label)}
                  className="text-xs px-2 py-1 rounded bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
                >
                  {ec.label}
                </button>
              ))}
              <Button
                size="md"
                variant="ghost"
                className="text-xs"
                onClick={() => reset(s.hService)}
              >
                reset
              </Button>
            </div>
          </div>
        ))}
      </div>
      {msg && <div className="text-xs text-slate-500">{msg}</div>}
    </section>
  );
}
