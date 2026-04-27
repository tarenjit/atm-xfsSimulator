#!/usr/bin/env python3
"""
probe-host-transports.py

End-to-end smoke probe for the Phase 7.1 host-transport layer.

Assumes:
  - xfs-server running on http://localhost:3001  (start with `pnpm --filter @atm/xfs-server start`)
  - Postgres seeded (run `pnpm db:seed` if needed)

What this does:
  1. Lists all configured transports via REST           [in-process / REST API]
  2. Activates the ISO 8583 TCP listener                [Jalin profile, default :8583]
  3. Activates the ISO 20022 HTTP listener              [BI-FAST profile, default :8443]
  4. Probes ISO 8583 TCP:    echo (0800), auth (0100), withdrawal (0200)
  5. Probes ISO 20022 HTTP:  /health, pacs.008 approve, pacs.008 decline
  6. Final summary table

Run:
  python scripts/probe-host-transports.py
  python scripts/probe-host-transports.py --backend http://10.0.0.5:3001  # remote backend
  python scripts/probe-host-transports.py --pan 4580555500001111          # blocked card decline
"""

from __future__ import annotations

import argparse
import http.client
import json
import socket
import struct
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Optional

DEFAULT_BACKEND = "http://localhost:3001"
DEFAULT_PAN = "4580123456787234"  # Mandiri-anchored, Rp 5.75M starting balance
DEFAULT_AMOUNT = 100_000

PACS008_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.13">
  <FIToFICstmrCdtTrf>
    <CdtTrfTxInf>
      <PmtId><EndToEndId>{e2e}</EndToEndId></PmtId>
      <IntrBkSttlmAmt Ccy="IDR">{amount}</IntrBkSttlmAmt>
      <Dbtr><Nm>{name}</Nm></Dbtr>
      <DbtrAcct><Id><Othr><Id>{pan}</Id></Othr></Id></DbtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>""".strip()


@dataclass
class ProbeResult:
    name: str
    ok: bool
    detail: str
    response_excerpt: str = ""


@dataclass
class Summary:
    results: list[ProbeResult] = field(default_factory=list)

    def add(self, r: ProbeResult) -> None:
        self.results.append(r)
        mark = "[ OK ]" if r.ok else "[FAIL]"
        print(f"  {mark} {r.name}  {r.detail}")
        if r.response_excerpt:
            print(f"           response: {r.response_excerpt}")

    def passed(self) -> int:
        return sum(1 for r in self.results if r.ok)

    def total(self) -> int:
        return len(self.results)


# ---------------------------------------------------------------------------
# REST helpers (talk to xfs-server)
# ---------------------------------------------------------------------------

def rest_get(backend: str, path: str) -> Any:
    with urllib.request.urlopen(f"{backend}{path}", timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def rest_post(backend: str, path: str, body: dict[str, Any] | None = None) -> Any:
    data = json.dumps(body or {}).encode("utf-8")
    req = urllib.request.Request(
        f"{backend}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        body_bytes = resp.read()
        if not body_bytes:
            return {}
        return json.loads(body_bytes.decode("utf-8"))


# ---------------------------------------------------------------------------
# ISO 8583 TCP probe
# ---------------------------------------------------------------------------

def iso8583_send(host: str, port: int, body: str, timeout: float = 5.0) -> str:
    sock = socket.create_connection((host, port), timeout=timeout)
    try:
        payload = body.encode("ascii")
        sock.sendall(struct.pack(">H", len(payload)) + payload)
        hdr = sock.recv(2)
        if len(hdr) < 2:
            raise RuntimeError("short read on length header")
        n = struct.unpack(">H", hdr)[0]
        chunks: list[bytes] = []
        remaining = n
        while remaining > 0:
            piece = sock.recv(remaining)
            if not piece:
                raise RuntimeError("connection closed mid-frame")
            chunks.append(piece)
            remaining -= len(piece)
        return b"".join(chunks).decode("ascii")
    finally:
        sock.close()


# ---------------------------------------------------------------------------
# ISO 20022 HTTP probe
# ---------------------------------------------------------------------------

def http_get(host: str, port: int, path: str, timeout: float = 5.0) -> tuple[int, str]:
    conn = http.client.HTTPConnection(host, port, timeout=timeout)
    try:
        conn.request("GET", path)
        resp = conn.getresponse()
        return resp.status, resp.read().decode("utf-8")
    finally:
        conn.close()


def http_post_xml(host: str, port: int, path: str, xml: str, timeout: float = 10.0) -> tuple[int, str]:
    conn = http.client.HTTPConnection(host, port, timeout=timeout)
    try:
        conn.request(
            "POST",
            path,
            body=xml.encode("utf-8"),
            headers={"Content-Type": "application/xml"},
        )
        resp = conn.getresponse()
        return resp.status, resp.read().decode("utf-8")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="Probe ATMirror host transports end-to-end.")
    parser.add_argument("--backend", default=DEFAULT_BACKEND, help=f"xfs-server URL (default: {DEFAULT_BACKEND})")
    parser.add_argument("--pan", default=DEFAULT_PAN, help=f"Card PAN to use (default: {DEFAULT_PAN})")
    parser.add_argument("--amount", type=int, default=DEFAULT_AMOUNT, help=f"Withdrawal amount in IDR (default: {DEFAULT_AMOUNT})")
    parser.add_argument("--cardholder", default="BAJWA TESTING", help="Debtor name in pacs.008")
    args = parser.parse_args()

    backend = args.backend.rstrip("/")
    print(f"[probe] backend={backend} pan={args.pan} amount=Rp {args.amount:,}")
    print()

    summary = Summary()

    # 1. List transports + verify backend health
    print("=== Step 1: backend reachable + transport inventory ===")
    try:
        health = rest_get(backend, "/api/v1/health")
        summary.add(ProbeResult("Backend health", True, health.get("status", "?")))
    except Exception as e:
        summary.add(ProbeResult("Backend health", False, str(e)))
        return 1

    try:
        listing = rest_get(backend, "/api/v1/host-transport")
        transports = listing["transports"]
        summary.add(ProbeResult(
            "List host transports",
            True,
            f"{len(transports)} configured ({', '.join(t['kind'] for t in transports)})",
        ))
    except Exception as e:
        summary.add(ProbeResult("List host transports", False, str(e)))
        return 1

    by_kind: dict[str, dict[str, Any]] = {t["kind"]: t for t in transports}

    # 2. Activate ISO 8583 TCP
    print()
    print("=== Step 2: activate ISO 8583 TCP listener ===")
    tcp = by_kind.get("ISO8583_TCP")
    if not tcp:
        summary.add(ProbeResult("Activate ISO8583_TCP", False, "no ISO8583_TCP config seeded"))
    else:
        try:
            r = rest_post(backend, f"/api/v1/host-transport/{tcp['id']}/start")
            summary.add(ProbeResult(
                "Activate ISO8583_TCP",
                r["status"]["listening"],
                f"{r['bindAddress']}:{r['port']} switch={r['switchProfile']}",
            ))
            tcp = r
        except Exception as e:
            err = str(e)
            # Already running is fine
            if "already" in err.lower() or "EADDRINUSE" in err:
                summary.add(ProbeResult("Activate ISO8583_TCP", True, "already listening"))
            else:
                summary.add(ProbeResult("Activate ISO8583_TCP", False, err))

    # 3. Activate ISO 20022 HTTP
    print()
    print("=== Step 3: activate ISO 20022 HTTP listener ===")
    xml = by_kind.get("ISO20022_HTTP")
    if not xml:
        summary.add(ProbeResult("Activate ISO20022_HTTP", False, "no ISO20022_HTTP config seeded"))
    else:
        try:
            r = rest_post(backend, f"/api/v1/host-transport/{xml['id']}/start")
            summary.add(ProbeResult(
                "Activate ISO20022_HTTP",
                r["status"]["listening"],
                f"http://{r['bindAddress']}:{r['port']} switch={r['switchProfile']}",
            ))
            xml = r
        except Exception as e:
            err = str(e)
            if "already" in err.lower() or "EADDRINUSE" in err:
                summary.add(ProbeResult("Activate ISO20022_HTTP", True, "already listening"))
            else:
                summary.add(ProbeResult("Activate ISO20022_HTTP", False, err))

    # Brief settle time so listeners are accepting
    time.sleep(0.3)

    # 4. ISO 8583 TCP probes
    print()
    print("=== Step 4: ISO 8583 TCP probes ===")
    if tcp and tcp.get("status", {}).get("listening"):
        host = tcp["bindAddress"]
        port = tcp["port"]
        # 4.1 Echo
        try:
            r = iso8583_send(host, port, "0800")
            ok = r.startswith("0810") and "39=00" in r
            summary.add(ProbeResult("TCP echo (0800)", ok, "expected 0810 with code 00", r))
        except Exception as e:
            summary.add(ProbeResult("TCP echo (0800)", False, str(e)))
        # 4.2 Authentication
        try:
            r = iso8583_send(host, port, f"0100|2={args.pan}")
            ok = r.startswith("0110")
            summary.add(ProbeResult("TCP auth (0100)", ok, "expected 0110", r))
        except Exception as e:
            summary.add(ProbeResult("TCP auth (0100)", False, str(e)))
        # 4.3 Withdrawal (financial request)
        try:
            r = iso8583_send(
                host, port,
                f"0200|2={args.pan}|4={args.amount}|session=probe-tcp-{int(time.time())}",
            )
            ok = r.startswith("0210") and "39=00" in r and "stan=" in r
            summary.add(ProbeResult(
                f"TCP withdrawal (0200) Rp {args.amount:,}",
                ok,
                "expected 0210 with code 00 + stan",
                r,
            ))
        except Exception as e:
            summary.add(ProbeResult("TCP withdrawal (0200)", False, str(e)))
    else:
        summary.add(ProbeResult("TCP probes", False, "ISO8583_TCP not listening"))

    # 5. ISO 20022 HTTP probes
    print()
    print("=== Step 5: ISO 20022 HTTP probes ===")
    if xml and xml.get("status", {}).get("listening"):
        host = xml["bindAddress"]
        port = xml["port"]
        # 5.1 Health
        try:
            status, body = http_get(host, port, "/health")
            ok = status == 200 and '"status"' in body
            summary.add(ProbeResult("HTTP /health", ok, f"HTTP {status}", body[:120]))
        except Exception as e:
            summary.add(ProbeResult("HTTP /health", False, str(e)))
        # 5.2 pacs.008 approve
        try:
            xml_body = PACS008_TEMPLATE.format(
                e2e=f"PROBE-OK-{int(time.time())}",
                amount=args.amount,
                name=args.cardholder,
                pan=args.pan,
            )
            status, body = http_post_xml(host, port, "/pacs.008", xml_body)
            ok = status == 200 and "<TxSts>ACSC</TxSts>" in body
            summary.add(ProbeResult(
                f"pacs.008 approve Rp {args.amount:,}",
                ok,
                "expected TxSts ACSC",
                _excerpt_pacs002(body),
            ))
        except Exception as e:
            summary.add(ProbeResult("pacs.008 approve", False, str(e)))
        # 5.3 pacs.008 decline (way over per-tx cap)
        try:
            decline_amount = 999_999_999  # > Jalin/ATMB caps and likely > balance
            xml_body = PACS008_TEMPLATE.format(
                e2e=f"PROBE-DECLINE-{int(time.time())}",
                amount=decline_amount,
                name=args.cardholder,
                pan=args.pan,
            )
            status, body = http_post_xml(host, port, "/pacs.008", xml_body)
            ok = status == 200 and "<TxSts>RJCT</TxSts>" in body
            summary.add(ProbeResult(
                "pacs.008 decline (oversize)",
                ok,
                "expected TxSts RJCT with reason code",
                _excerpt_pacs002(body),
            ))
        except Exception as e:
            summary.add(ProbeResult("pacs.008 decline", False, str(e)))
    else:
        summary.add(ProbeResult("HTTP probes", False, "ISO20022_HTTP not listening"))

    # Final summary
    print()
    print("=" * 70)
    passed = summary.passed()
    total = summary.total()
    suffix = "ALL GREEN" if passed == total else f"{total - passed} FAILURES"
    print(f"RESULT: {passed}/{total} probes pass - {suffix}")
    print("=" * 70)
    return 0 if passed == total else 2


def _excerpt_pacs002(body: str) -> str:
    """One-line excerpt: <TxSts>...</TxSts> + first <Cd>...</Cd> if present."""
    import re
    m_sts = re.search(r"<TxSts>([^<]+)</TxSts>", body)
    m_cd = re.search(r"<Cd>([^<]+)</Cd>", body)
    bits = []
    if m_sts:
        bits.append(f"TxSts={m_sts.group(1)}")
    if m_cd:
        bits.append(f"Reason={m_cd.group(1)}")
    return " ".join(bits) if bits else body[:120].replace("\n", " ")


if __name__ == "__main__":
    sys.exit(main())
