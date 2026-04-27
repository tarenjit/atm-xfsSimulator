# Operator host-switching guide

> **Purpose**: walk an operator through the act of pointing the ATM at a different host wire-protocol — in-process (default), ISO 8583 over TCP, or ISO 20022 (BI-FAST) XML over HTTP — entirely from the browser operator console at `/operator`.
>
> **Audience**: QA engineer, support engineer, sales-engineer doing a customer demo. No code changes required.
>
> **Prerequisites**: backend + frontend both running. Easiest one-liner:
> ```bash
> pnpm --filter @atm/xfs-server start &  # backend on :3001
> pnpm --filter @atm/atm-frontend start  # frontend on :3000
> ```

---

## What "host transport" means here

The XFS simulator has a built-in mock host that acts as the bank/switch (Jalin / ATM Bersama / Prima / BI-FAST). By default it's **in-process** — the ATM state machine calls it via direct method calls inside the same Node.js process. No network involved. Perfect for quick demos and unit tests.

For real-world scenarios you sometimes want the host to live behind an actual network port — so vendor middleware (Euronet MVS, NCR APTRA, Diebold ProTopas, Hyosung MoniPlus) can connect to it the same way they'd connect to a real switch. The simulator ships with two wire-protocol listeners:

| Mode | Wire | Default port | Used by |
|---|---|---|---|
| **In-process** | direct method call | — | Current default; native browser ATM, unit tests, demos |
| **ISO 8583 TCP** | 2-byte length-prefixed ASCII frames | 8583 | Real Indonesian middleware (Euronet MVS etc.). Jalin / ATM Bersama / Prima switches |
| **ISO 20022 HTTP** | `POST /pacs.008` → `pacs.002` over HTTP | 8443 | BI-FAST style real-time payments. Modern host integrations |

**All three transports dispatch into the same `HostEmulatorService` underneath** — so business logic (auth, balance check, daily-limit, decline path, reversal) is identical. Only the wire format changes.

---

## 1. Where to find the toggle

Open `http://localhost:3000/operator` in a browser.

The **HOST TRANSPORT** panel sits below the bank-theme tiles, above the Macro Test Studio. It looks like this:

```
HOST TRANSPORT
Toggle how the simulated host receives ATM messages. In-process is the default;
flip to ISO 8583 TCP or ISO 20022 XML to match the wire protocol the customer's
middleware expects.

  ●  In-Process (default) [PRIMARY]
     In-process (default) — — switch=JALIN
     Direct method call from ATM state machine — no network. Default for native mode.
     listening · 0 active conn · 0 total reqs
     [Stop]

  ●  Jalin ISO 8583 TCP
     ISO 8583 over TCP · 127.0.0.1:8583 · switch=JALIN
     2-byte length-prefixed ASCII frames. Mandiri-anchored BIN ranges.
     stopped
     [Activate (radio)]  [Start]

  ●  BI-FAST ISO 20022 HTTP
     ISO 20022 XML over HTTP · 127.0.0.1:8443 · switch=BIFAST
     POST /pacs.008 — pacs.002 status report. BI-FAST style.
     stopped
     [Activate (radio)]  [Start]
```

The colored dot is a live status:
- **Green** — listening + accepting connections
- **Amber** — config marked enabled but no recent traffic
- **Grey** — stopped

The panel polls every 5 seconds, so connections + request counts update live.

---

## 2. Switching to ISO 8583 TCP

### Use case
Customer's vendor middleware (most likely Euronet MVS in Jalin's case) speaks ISO 8583 over TCP. You want to test the full multivendor flow without actually plugging into the production Jalin switch.

### Steps in the operator console

1. **Find the row** "Jalin ISO 8583 TCP".
2. Click **Start** to spin up the listener on `127.0.0.1:8583`.
3. The dot turns green; status shows `listening · 0 active conn`.
4. (Optional) Click **Activate (radio)** instead of Start — same effect, but it also stops any other ISO 8583 TCP listener that might be running. Useful if you have multiple TCP transports configured for different switches.

### How to test the listener works

From any tool that can speak TCP framed messages — here's a quick Python probe:

```bash
python -c "
import socket, struct
s = socket.create_connection(('127.0.0.1', 8583))
def f(b):
    bs = b.encode()
    s.sendall(struct.pack('>H', len(bs)) + bs)
    n = struct.unpack('>H', s.recv(2))[0]
    return s.recv(n).decode()

print('echo (MTI 0800):', f('0800'))
print('auth (MTI 0100):', f('0100|2=4580123456787234'))
print('withdraw 100k (MTI 0200):', f('0200|2=4580123456787234|4=100000|session=demo'))
"
```

Expected output:
```
echo (MTI 0800): 0810|39=00|switch=JALIN|alive=true
auth (MTI 0100): 0110|39=00|switch=JALIN
withdraw 100k (MTI 0200): 0210|39=00|stan=000001|auth=234920|switch=JALIN
```

The simulator prints in the operator console's **Live XFS log panel** what came in over the wire. Active connection count goes up.

### Real customer use

Have the vendor middleware point its host endpoint at `tcp://<your-server-ip>:8583`. Most middleware will accept this through their own config — usually a single line in their ATM-config file or a connection setting in their admin console.

The `switch=JALIN` tag on every reply tells the customer's ops team that your simulator is the responder (vs the real Jalin switch).

### Stopping the listener

Click **Stop**. The dot goes grey. Anything currently connected gets disconnected.

---

## 3. Switching to ISO 20022 (BI-FAST) HTTP XML

### Use case
Customer's app supports BI-FAST or any modern ISO 20022-based payment system. You want to validate the XML envelope handling.

### Steps in the operator console

1. Find the row "BI-FAST ISO 20022 HTTP".
2. Click **Start** to spin up the HTTP listener on `127.0.0.1:8443`.
3. The dot turns green; status shows `listening · 0 active conn`.

### How to test the listener works

```bash
# Health check first
curl -s http://127.0.0.1:8443/health
# → {"status":"ok","switch":"BIFAST","kind":"ISO20022_HTTP"}

# Approved transfer (small amount within BI-FAST cap)
curl -X POST http://127.0.0.1:8443/pacs.008 \
     -H "Content-Type: application/xml" \
     -d '<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.13">
  <FIToFICstmrCdtTrf>
    <CdtTrfTxInf>
      <PmtId><EndToEndId>DEMO-001</EndToEndId></PmtId>
      <IntrBkSttlmAmt Ccy="IDR">100000</IntrBkSttlmAmt>
      <Dbtr><Nm>BAJWA TESTING</Nm></Dbtr>
      <DbtrAcct><Id><Othr><Id>4580123456787234</Id></Othr></Id></DbtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>'
```

Expected reply (pacs.002 status report):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.002.001.15">
  <FIToFIPmtStsRpt>
    <GrpHdr>
      <MsgId>STS-1777269870265</MsgId>
      <CreDtTm>2026-04-27T...</CreDtTm>
    </GrpHdr>
    <TxInfAndSts>
      <OrgnlEndToEndId>DEMO-001</OrgnlEndToEndId>
      <TxSts>ACSC</TxSts>
      <StsRsnInf>
        <AddtlInf>Authorized via BI-FAST stan=000002 auth=620090</AddtlInf>
      </StsRsnInf>
    </TxInfAndSts>
  </FIToFIPmtStsRpt>
</Document>
```

`<TxSts>ACSC</TxSts>` = AcceptedSettlementCompleted (the success code in ISO 20022 vocabulary).

### Decline path

Send the same payload with an oversize amount (over the per-transaction cap or the account balance):

```bash
curl -X POST http://127.0.0.1:8443/pacs.008 \
     -H "Content-Type: application/xml" \
     -d '<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.13">
  <FIToFICstmrCdtTrf>
    <CdtTrfTxInf>
      <PmtId><EndToEndId>DEMO-DECLINE</EndToEndId></PmtId>
      <IntrBkSttlmAmt Ccy="IDR">999999999</IntrBkSttlmAmt>
      <Dbtr><Nm>BAJWA</Nm></Dbtr>
      <DbtrAcct><Id><Othr><Id>4580123456787234</Id></Othr></Id></DbtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>'
```

Expected reply:
```xml
<TxSts>RJCT</TxSts>
<StsRsnInf>
  <Rsn><Cd>AM01</Cd></Rsn>
  <AddtlInf>Declined via BI-FAST (responseCode=61): BIFAST per-transaction cap (250000000) exceeded</AddtlInf>
</StsRsnInf>
```

Standard ISO 20022 reason codes are mapped from internal response codes:
- `AM01` — Daily / per-tx limit exceeded
- `AM04` — Insufficient funds
- `AM05` — Wrong PIN
- `AC01` — Invalid debtor account
- `AC04` — Account closed (used as expired stand-in)
- `AC06` — Card blocked
- `AGNT` — Issuer / agent unavailable
- `NARR` — Anything else (look at the AddtlInf prose for detail)

---

## 4. Running multiple transports at once

You can run all three transports simultaneously on different ports (in-process is "always running" + the two listeners). Each one tags its responses with its configured switch profile, so the transaction logs make it clear which transport handled each request.

Use case: dual-vendor regression. Run a Euronet MVS test against `:8583` (Jalin profile) AND a BI-FAST test against `:8443` (BI-FAST profile) in parallel.

---

## 5. Adding a new listener for a different switch

Click **+ NEW** at the top of the host-transport panel (or POST to `/api/v1/host-transport`):

```bash
# Add an ATM Bersama TCP listener on a different port
curl -X POST http://localhost:3001/api/v1/host-transport \
     -H "Content-Type: application/json" \
     -d '{
       "name": "ATM Bersama TCP",
       "kind": "ISO8583_TCP",
       "bindAddress": "0.0.0.0",
       "port": 8584,
       "switchProfile": "ATM_BERSAMA"
     }'
```

The new row appears in the operator console immediately (within the 5s poll interval). Click Start to bring it up.

Editing requires the listener to be stopped first — change config via PATCH `/api/v1/host-transport/:id`, then start again.

---

## 6. Operator workflow for a typical Jalin/Euronet QA day

1. Open browser: `http://localhost:3000/operator`
2. **Theme**: pick Bank Mandiri (or whichever bank's branding the test calls for)
3. **Host transport**: click **Start** on "Jalin ISO 8583 TCP" — Euronet MVS in the ghost VM connects to it
4. **Cassettes**: replenish if any are below threshold from the previous day
5. **Macros**: open the Macro Test Studio, run the regression suite (Happy-path, Insufficient funds, CDM dispense fault, Blocked card, Expired card, Maximum withdrawal, Cek Saldo)
6. **Logs**: watch the live XFS event stream as macros execute
7. **Reports**: at end of day, fetch `/api/v1/reports/executive?month=2026-04` for a PDF summary

For a customer demo, do steps 1-3 then run the demo Happy-path macro. Customer sees the ATM screen react in real time, the operator console fill with XFS commands, and the transaction land in the database.

---

## 7. Programmatic + scripted use

If you'd rather drive the whole thing from a script (CI, automated regression), the same flows work via REST:

- `GET /api/v1/host-transport` → list with live status
- `POST /api/v1/host-transport/:id/start` → start
- `POST /api/v1/host-transport/:id/stop` → stop
- `POST /api/v1/host-transport/:id/activate` → radio-toggle (stop same-kind peers + start this)

The `scripts/probe-host-transports.py` script bundled in the repo automates a full smoke test (10 probes) end-to-end. Run from the repo root:

```bash
python scripts/probe-host-transports.py
```

Output includes a pass/fail line per probe and a final tally.

---

## 8. Troubleshooting

**The listener won't start — port already in use.**
Some other process holds the port. On Windows: `Get-NetTCPConnection -LocalPort 8583`. On Linux: `lsof -i :8583`. Kill the holder or change the port via PATCH.

**My middleware connects but gets no response.**
Check the `Live XFS log` panel and the xfs-server console output. If you see the inbound frame in the server log but no response, your middleware probably sent a malformed frame. Try the python probe first to verify the listener works in isolation.

**Tests pass alone but fail when run together.**
Known limitation in the macro orchestrator: the PIN device sometimes doesn't fully release between back-to-back macros. Add 2 seconds between macros in your test runner (or run them via the operator console one at a time, which uses the same code path but with manual pacing).

**The HTTP response says "Declined via JALIN" but I configured the BI-FAST listener.**
Fixed in commit `f2d714b` — make sure you're on `main` at or after that point. Earlier versions routed by PAN BIN regardless of the listener's configured switch.
