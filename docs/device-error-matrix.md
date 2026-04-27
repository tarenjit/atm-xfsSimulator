# XFS device error → ATM behaviour matrix

> **Purpose**: answer the recurring customer question — *"if X device fails, will the ATM continue or cancel?"* — with a single table the QA engineer, the bank's app developer, and the support engineer can all agree on.
>
> **Scope**: covers the XFS error codes our simulator produces (and that real CEN/XFS hardware would also produce), what the **typical** vendor ATM application (Euronet MVS, NCR APTRA, Diebold ProTopas, Hyosung MoniPlus) does in response, and what the customer should see on screen.
>
> **Authoritative for**: simulator behaviour. The **app's response** column is the *typical* behaviour and may differ in your specific vendor app — verify with the vendor before treating any column as ground truth.
>
> **Bahasa Indonesia messages**: based on the standard ATM string set used across Indonesian banks.

---

## How to read this matrix

Each row covers one fault scenario. Columns:

- **Trigger** — what causes it (real-world or operator-injected via `/api/v1/xfs/services/:hService/inject-error`).
- **XFS code(s)** — the values our simulator produces; matches what real hardware emits.
- **Vendor middleware reaction** — what Euronet MVS / NCR APTRA / DN ProTopas typically do.
- **ATM app response** — typical bank-app handling. Differs per vendor app — confirm with the customer.
- **What the customer sees (Bahasa)** — the screen message a real ATM customer would read.
- **Recovery path** — automatic recovery, customer action, or operator intervention.

---

## 1. IDC (Card reader) errors

| Trigger | XFS code(s) | Vendor middleware reaction | ATM app response | What customer sees (Bahasa) | Recovery path |
|---|---|---|---|---|---|
| Card insert OK | event `WFS_SRVE_IDC_MEDIAINSERTED` (no error) | Reads tracks via `WFS_CMD_IDC_READ_TRACK` | Proceeds to PIN entry | "Masukkan PIN Anda" | normal flow |
| Track 1/2 read failed | `WFS_EXEE_IDC_INVALIDTRACKDATA` | Retries READ_TRACK once, then ejects | Show "Kartu tidak terbaca" | "Kartu tidak dapat dibaca. Silakan coba lagi." | Auto-eject; customer re-inserts |
| Invalid card (non-spec layout) | `WFS_EXEE_IDC_INVALIDMEDIA` | Calls `WFS_CMD_IDC_EJECT_CARD` immediately | Show "Kartu tidak valid" | "Kartu tidak dikenali. Silakan hubungi bank Anda." | Auto-eject |
| Chip power-on failed | `WFS_ERR_HARDWARE_ERROR` on `WFS_CMD_IDC_CHIP_POWER` | Falls back to magstripe if `serviceCode` allows | If fallback OK, continue; otherwise eject | "Chip kartu bermasalah. Mencoba pita magnetik..." | Magstripe fallback OR eject |
| 3 wrong PIN (PIN_TRIES_EXCEEDED) | `WFS_CMD_IDC_RETAIN_CARD` issued | Retains card to retain bin | Card retained screen | "Kartu Anda telah ditahan. Silakan hubungi bank penerbit." | **Operator action** — supervisor unlocks retain bin |
| Card stuck during eject | `WFS_ERR_HARDWARE_ERROR` on `WFS_CMD_IDC_EJECT_CARD` | Logs FAULT, escalates to supervisor mode | Show "Hubungi bank" + halt | "Mesin sementara tidak dapat melayani. Hubungi bank." | **Operator action** — manual cabinet open |
| Card removed mid-transaction | `WFS_SRVE_IDC_MEDIAREMOVED` during PIN_ENTRY | Reverses any pending host auth | "Transaksi dibatalkan" | "Transaksi dibatalkan." | Returns to idle |
| Reader timeout (no card after prompt) | `WFS_ERR_TIMEOUT` | Returns to idle screen | Idle screen | (back to welcome) | Normal — no fault |

## 2. PIN pad / EPP errors

| Trigger | XFS code(s) | Vendor middleware reaction | ATM app response | What customer sees (Bahasa) | Recovery path |
|---|---|---|---|---|---|
| PIN entered OK | `WFS_CMD_PIN_GET_PIN` returns `pinLength` | Calls `GET_PINBLOCK` to encrypt | Sends to host for verify | "Memproses..." | normal |
| Customer cancels at PIN prompt | `WFS_ERR_CANCEL` | Cancels pending PIN | Returns to MAIN_MENU or ejects | "Transaksi dibatalkan." | Eject card or back to menu |
| PIN entry timeout (60s no input) | `WFS_ERR_TIMEOUT` | Cancels PIN, ejects card | Show timeout message | "Waktu habis. Kartu Anda dikembalikan." | Auto-eject |
| EPP tamper detected | `WFS_ERR_HARDWARE_ERROR` on any PIN command + `WFS_USRE_SIU_TAMPER_SENSOR` event | Locks PIN device, calls service | Show out-of-service screen | "Mesin tidak dapat melayani. Hubungi bank." | **Operator action** — physical inspection |
| Wrong PIN (host returns response code 55) | XFS commands all return SUCCESS — error is at host level | Increments local fail counter; if < 3, prompt re-entry | "PIN salah, silakan coba lagi" | "PIN salah. Silakan coba lagi." | Customer re-enters |
| 3rd wrong PIN | Host returns response code 38 (`PIN_TRIES_EXCEEDED`) | Calls `WFS_CMD_IDC_RETAIN_CARD` | Card retain flow (see §1) | "Kartu Anda telah ditahan." | Operator action |
| Key load failed (TPK/TMK) | `WFS_ERR_HARDWARE_ERROR` on `WFS_CMD_PIN_IMPORT_KEY` | Aborts PIN device init | Out-of-service | "Mesin tidak dapat melayani." | **Operator action** — re-load keys |

## 3. CDM (Cash dispenser) errors

This is the section Jalin asked about specifically.

| Trigger | XFS code(s) | Vendor middleware reaction | ATM app response | What customer sees (Bahasa) | Recovery path |
|---|---|---|---|---|---|
| Dispense OK | `WFS_CMD_CDM_DISPENSE` returns mix; event `WFS_EXEE_CDM_NOTESPRESENTED` | Calls `PRESENT` then waits for `WFS_SRVE_CDM_ITEMSTAKEN` | Print receipt + eject | "Silakan ambil uang Anda" → "Silakan ambil struk" → "Silakan ambil kartu" | Normal |
| Cash not taken (timeout) | `WFS_ERR_TIMEOUT` then `WFS_CMD_CDM_RETRACT` | Auto-retracts to reject bin; logs uncollected-cash transaction | Continue (assume customer left) | (no message — auto-retract is silent) | Normal — `rejectCount` ↑ |
| **Cassette empty (CASS3 / Rp 20k drained)** | `WFS_CMD_CDM_DISPENSE` returns mix-fail (status `WFS_CDM_CUSEMPTY`) | Vendor middleware reports back to ATM app: "this denom not available" | Either: re-mix without that denom, OR show "denomination not available" | "Maaf, jumlah ini tidak dapat dilayani saat ini" — or app re-mixes silently | App-dependent — usually transparent |
| **Hardware error during dispense (jam)** | `WFS_ERR_HARDWARE_ERROR` on `WFS_CMD_CDM_DISPENSE` + event `WFS_SRVE_CDM_MEDIADETECTED` | **Most critical scenario.** Vendor middleware MUST trigger ISO 8583 reversal (MTI 0400) so customer is not debited for cash they didn't get | Show "Transaksi gagal" + reverse host auth + offer Retry or Cancel | "Maaf, transaksi tidak dapat diselesaikan. Saldo Anda tidak terdebet." | **Critical**: app must reverse + log incident; operator gets paged |
| Notes presented but jam during retract | `WFS_ERR_HARDWARE_ERROR` on `WFS_CMD_CDM_RETRACT` after notes already counted | Vendor calls `WFS_CMD_CDM_RESET`, escalates to ops | Out-of-service | "Mesin sementara tidak dapat melayani." | **Operator action** — physically clear, recount |
| Shutter won't open | `WFS_ERR_SHUTTER_NOT_CLOSED` on `WFS_CMD_CDM_PRESENT` | Vendor retries 2x, then reverses + escalates | Reverse + out-of-service | "Transaksi tidak dapat diselesaikan. Saldo tidak terdebet." | Operator action |
| All cassettes empty | `WFS_CMD_CDM_DISPENSE` returns insufficient | App offers menu of available services minus cash | "Layanan penarikan sementara tidak tersedia" | "Penarikan tunai tidak tersedia. Coba layanan lain." | **Operator** — replenish |
| Operator-injected `ERR_HARDWARE_ERROR` (one-shot) | XFS code -3 on next CDM call | Same as real jam — reverses + recovers | Same as real jam | Same | Test-only — clears after one call |

## 4. PTR (Receipt printer) errors

Receipt-print failures are usually non-fatal — the transaction is already
authorised + cash dispensed. Vendor middleware logs the print fault and
continues so the customer isn't blocked at the cash tray.

| Trigger | XFS code(s) | Vendor middleware reaction | ATM app response | What customer sees (Bahasa) | Recovery path |
|---|---|---|---|---|---|
| Print OK | `WFS_CMD_PTR_PRINT_FORM` returns receiptId | App moves to eject | "Silakan ambil struk Anda" | Normal |
| Paper low | event `WFS_SRVE_PTR_PAPERTHRESHOLD` (status: low) | Prints anyway; logs warning | Continue | Normal | **Operator** — replenish at next visit |
| Paper out | `WFS_ERR_HARDWARE_ERROR` on `WFS_CMD_PTR_PRINT_FORM` | Skip receipt; record in journal anyway | Show "Kertas struk habis" + continue eject | "Maaf, struk tidak dapat dicetak. Transaksi berhasil." | **Operator** — replenish soon |
| Cutter jam | `WFS_ERR_HARDWARE_ERROR` on `WFS_CMD_PTR_CUT_PAPER` | Vendor moves printer offline; subsequent transactions skip print | Skip receipt | "Struk tidak tersedia." | Operator action |
| Receipt not taken | event `WFS_SRVE_PTR_MEDIATAKEN` never fires | Vendor retracts receipt; logs uncollected | (no UI change) | (silent) | Normal |

## 5. SIU (Sensors / indicators) errors

| Trigger | XFS code(s) | Vendor middleware reaction | ATM app response | What customer sees (Bahasa) | Recovery path |
|---|---|---|---|---|---|
| Cabinet door opened (operator) | event `WFS_USRE_SIU_CABINET_STATUS` (state=OPEN) | Vendor logs supervisor mode | Pause customer-facing UI; show service screen | "Mesin sedang dirawat." | Auto-resume on door close |
| Safe door opened | event `WFS_USRE_SIU_SAFE_DOOR` (state=OPEN) | Vendor pauses dispense capability | Reject any in-flight withdrawal | "Layanan sementara tidak tersedia." | Operator closes safe |
| Tamper detected | event `WFS_USRE_SIU_TAMPER_SENSOR` (state=TAMPERED) — latched | Vendor calls `WFS_CMD_PIN_RESET` (clears keys), logs critical | Out-of-service immediately | "Mesin tidak dapat melayani." | **Critical operator action** — security investigation |
| Operator switch to SUPERVISOR | event `WFS_USRE_SIU_OPERATOR_SWITCH` (state=OPEN, mode=SUPERVISOR) | Enters maintenance UI | Switch to operator menu | (operator menu) | Manual mode |

## 6. Network / host errors (host emulator side)

These come from the host (Jalin / Euronet routing), not XFS. Listed for completeness.

| Trigger | ISO 8583 response code | Vendor middleware reaction | ATM app response | What customer sees (Bahasa) | Recovery path |
|---|---|---|---|---|---|
| Approved | 00 | Continue with dispense | "Memproses..." → cash | normal |
| Insufficient funds | 51 | Show error, return to MAIN_MENU | "Saldo tidak mencukupi." | Customer chooses lower amount or exits |
| Daily limit exceeded | 61 | Show error, return to MAIN_MENU | "Limit harian terlampaui." | Customer exits or tries tomorrow |
| Invalid PIN | 55 | Increment PIN counter (vendor middleware) | "PIN salah." | Re-prompt PIN |
| Card blocked | 62 | Retain card | "Kartu telah diblokir. Hubungi bank Anda." | Card retained → operator |
| Issuer unavailable | 91 | Vendor retries 2x, then fail | "Sistem sementara tidak tersedia. Coba lagi nanti." | Customer retries later |
| System malfunction | 96 | Reverse if mid-flight | "Transaksi tidak dapat diproses." | Returns card |
| BI-FAST private timeout | BF01 (mapped from `WFS` Phase 7.1 ISO 20022) | App-specific — usually retry once | "Sistem real-time sedang sibuk." | Retry |

---

## 7. How to test each row using ATMirror today

### From the operator console (browser, `/operator`)

1. Open the **XFS device status** panel — you'll see IDC30 / PIN30 / CDM30 / PTR30 listed.
2. Click **Inject Error** on a device → pick a result code (negative = error). Next call to that device returns it (one-shot).
3. Drive a withdrawal from the **ATM widget** (`/atm`) and watch the screen react.
4. Watch the **Live XFS Log** panel for the actual command stream.

### From the REST API (scriptable for regression)

```bash
# Inject CDM hardware error one-shot
curl -X POST http://localhost:3001/api/v1/xfs/services/CDM30/inject-error \
     -H "Content-Type: application/json" \
     -d '{"errorCode":-3}'

# Drive a withdrawal that will hit the injected error
# (see scripts/probe-host-transports.py for the full sequence)

# Check the transaction landed as REVERSED
curl http://localhost:3001/api/v1/logs/transactions?take=1
```

### From a macro (declarative regression)

Macros support a `INJECT_ERROR` step kind (per Update_features.md §4.3). Build
one per row in the matrix and you have an auto-running regression suite for
"every device error class". Schedule it nightly via the suite scheduler once
Memurai is up.

---

## 8. What the SIMULATOR does NOT model

Honest list — these are real-hardware behaviours we don't reproduce because the
ROI for simulator complexity wasn't there:

- **Note-quality classification** (counterfeit detection, soiled notes). Real CDMs do this; we always treat dispensed notes as fit.
- **EMV cryptogram verification by host.** Our simulator generates a deterministic-but-fake ARQC; a real issuer host would reject it. Our host emulator approves regardless. **For Jalin testing against the production switch this is fine — Jalin's switch sees the real cryptogram from the real chip card if you use one. For our virtual cards, the cryptogram is fake.**
- **Hardware self-test on boot** (`WFS_CMD_*_RESET` runs them on real boxes; we just clear state).
- **Power supply / thermal events.** Real ATMs report environmental conditions via SIU; our SIU only models the cabinet/safe/tamper sensors per Update_features.md §7.
- **Cash recycler logic** (deposit + dispense in one cassette). We model dispense-only CDM. CHK device class is documented as Phase 7+ optional in CLAUDE.md v2.0; not yet built.

If a Jalin scenario needs any of these, file an issue — extending the
simulator one device-behaviour at a time is straightforward; we just pick the
ones the customer's QA actually cares about.
