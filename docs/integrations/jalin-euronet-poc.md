# Jalin + Euronet PoC integration playbook

> **Customer**: Jalin Pembayaran Indonesia (Jalin)
> **Vendor middleware**: Euronet MVS
> **Host switching**: Euronet (same vendor end-to-end on the operator side)
> **Use case**: Jalin runs Euronet MVS in member-bank ATMs across the Indonesian network. Our XFS simulator stands in for real ATM hardware so Jalin's QA team can exercise the full ATM application stack — including device error and recovery flows — inside a ghost VM, without dispatching a hardware tech to a live cabinet.
> **Status**: target customer for v3 Phase 13 (per `native/zegen-xfs-sp/ROADMAP.md` §Phase 13).

---

## 1. What Jalin needs (in their words, restated)

> "We have a virtual machine with one ghost ATM config already cloned from a real
> ATM. Inside that VM we want our ATM application (running on Euronet MVS) to
> see the XFS simulator like real hardware and use it to check device status.
> Our ATM-UI simulator should act as the visual ATM display for that ghost.
> When XFS reports a device error — say a card-dispense fault — we want to see
> exactly how the ATM behaves: does it offer Retry / Cancel? Does it retain the
> card? Does it display the right Indonesian-language error to the customer?"

That maps directly to **Architecture_v3.md Tier 2**:

```
[ Jalin ATM application ]                  ← unchanged, runs in the ghost
            │
            ▼  XFS API
[ Euronet MVS multivendor middleware ]      ← unchanged, vendor's binary
            │
            ▼  XFS SPI
[ Windows XFS Manager (msxfs.dll) ]         ← OS component
            │
            ▼  routes by registry to providers
[ ZegenXFS_SP.dll  ←—— this is us ]         ← in-VM, in-process
            │       (handles XFS calls in-process; sub-ms latency)
            │
            ▼  WebSocket :8080 (control plane only — logs / macros / evidence)
[ ATMirror Management Server ]              ← runs on a separate Linux/Windows host
            │
            └── browser UI (operator sees the ghost VM's screen + state)
```

Critical: **the real Jalin/Euronet host network does not see us at all**. The
ATM application's ISO 8583 traffic out to Jalin's switch goes via Euronet's
normal routing — we only replace the hardware layer. For dev/test the team can
optionally point the ghost at our **Phase 7.1 ISO 8583 TCP listener** (port
8583) to avoid hitting the live switch.

---

## 2. Phase mapping — what Jalin needs vs what we ship

| Jalin requirement | Where it lives | Status |
|---|---|---|
| Vendor middleware sees us as a real SP | C++ DLL: `native/zegen-xfs-sp/ZegenXFS_SP.dll` | scaffold ready (Phase 8a); needs Phases 8b-11 to ship |
| All standard XFS commands (IDC, PIN, CDM, PTR, SIU) handled | TS reference in `packages/xfs-devices/`; C++ port per ROADMAP §Phases 9-10 | TS ✅; C++ pending |
| Realistic device errors injectable from operator | XFS admin endpoints + operator console (live now) | ✅ |
| ATM application sees error → makes Retry/Cancel/Retain decision | The bank app's logic — we just propagate the XFS error code per spec; reference matrix in `docs/device-error-matrix.md` | ✅ ref matrix; behaviour = vendor app's responsibility |
| Optional fake host (avoid hitting prod Jalin switch) | `Phase 7.1` ISO 8583 TCP listener with JALIN profile | ✅ live |
| Visual replay (operator sees what's happening) | Operator console + macro recorder + session replay; WebRTC screen streaming for full fidelity | ✅ basic; WebRTC = Phase 14 |

---

## 3. Pre-engagement checklist (Jalin / Zegen joint)

Before kicking off the install on Jalin's ghost VM:

- [ ] **Cloned ghost VM, NOT the live one.** This is non-negotiable. Re-cloning is much cheaper than restoring a corrupted production image.
- [ ] **Confirm Euronet MVS version.** We need the major.minor (and patch if known). Different MVS versions probe slightly different XFS structs.
- [ ] **Confirm hardware profile the ghost emulates.** The seed has `hyosung-standard`, `ncr-personas-86`, `diebold-opteva-520`. Pick one (or send us the real ATM model so we can add a profile).
- [ ] **Confirm Indonesian-language string set.** The ATM-app runs in Bahasa Indonesia by default (per Update_features.md §3.4). If Jalin's app uses different terminology for "saldo tidak cukup" / "kartu tertahan" etc., we adjust the bank-theme receipt template + any UI overlays.
- [ ] **Decide: dev-mode hosts or production switch?** For the first 2-4 weeks of testing, point the ghost at our Phase 7.1 ISO 8583 TCP listener. Only flip to production Jalin switch when behaviour is locked in.
- [ ] **Network plan**: ghost VM and management server need bidirectional access on port 8080 (WebSocket) + 3478 (WebRTC, when Phase 14 lands). All other Jalin traffic stays unchanged.
- [ ] **Backup `HKLM\SOFTWARE\XFS` registry tree on the ghost** before any `register-spi.reg` import. Documented step; cannot be skipped.
- [ ] **Auth token issued** for the ghost VM by the management server (per Architecture_v3.md §12.1).
- [ ] **Code-signed build of ZegenXFS_SP.dll** (Authenticode, EV cert). Many production ghost images reject unsigned DLLs.

---

## 4. Installation order on the Jalin ghost VM (Phase 13 deliverable)

The MSI installer (Phase 13 work item) automates all of this. Manual steps for the early PoC:

1. **Stop Euronet MVS** and the Windows XFS service:
   ```powershell
   net stop "Euronet MVS Service"   # exact name varies — confirm with their ops
   net stop XFS_Service
   ```
2. **Back up the existing SPI registry**:
   ```powershell
   reg export HKLM\SOFTWARE\XFS C:\zegen-rollback\xfs-backup.reg
   ```
3. **Copy the DLL + INI**:
   ```powershell
   New-Item -ItemType Directory -Force "C:\Program Files\Zegen\ATMirror"
   Copy-Item ZegenXFS_SP.dll "C:\Program Files\Zegen\ATMirror\"
   Copy-Item ZegenXFS.ini.example "C:\ProgramData\Zegen\ATMirror\ZegenXFS.ini"
   notepad "C:\ProgramData\Zegen\ATMirror\ZegenXFS.ini"
   # Edit: BackendUrl, AuthToken, VmId
   ```
4. **Apply registry binding** (this re-routes Windows XFS Manager to our DLL for IDC / PIN / CDM / PTR / SIU):
   ```powershell
   regedit /s register-spi.reg
   ```
5. **Restart**:
   ```powershell
   net start XFS_Service
   net start "Euronet MVS Service"
   ```
6. **Smoke test from the Jalin ATM app** — insert virtual card, enter PIN, withdraw small amount. Verify:
   - The ATM screen shows the right state transitions
   - The operator console (browser, on management server) shows the live XFS log streaming in
   - The transaction lands in `XfsCommandLog` + `Transaction` tables

7. **Rollback recipe** (if anything goes wrong):
   ```powershell
   net stop "Euronet MVS Service"; net stop XFS_Service
   regedit /s C:\zegen-rollback\xfs-backup.reg
   net start XFS_Service; net start "Euronet MVS Service"
   ```

---

## 5. The "device error → ATM behaviour" question Jalin asked

Their specific question: *"if card dispense error, is it gonna be ok to use or
it will cancel the process? And make display ATM error like that."*

The full reference matrix lives in [`docs/device-error-matrix.md`](../device-error-matrix.md). The
short answer is: **the simulator does not decide that — the ATM application
does.** What we provide is:

1. **Faithful XFS error propagation.** When the operator injects (or the
   simulator naturally produces) a `WFS_ERR_HARDWARE_ERROR`, `WFS_ERR_TIMEOUT`,
   `WFS_ERR_CDM_NOTESPRESENTED`, etc., the value reaches the vendor middleware
   exactly as a real device would surface it.
2. **Realistic event sequencing.** Cassette jam → `WFS_SRVE_CDM_MEDIADETECTED`
   followed by `WFS_ERR_HARDWARE_ERROR` on the next dispense, etc.
3. **A reference matrix** of "for this XFS error / event, the typical vendor
   ATM application takes action X (retry / cancel / retain card / show error
   screen Y)". Use this to verify Jalin's app is doing the right thing.

The simulator + macro studio together let Jalin's QA team script "inject this
error during dispense, then assert the ATM screen shows error 5006 and
auto-recovers in 30 seconds" as a regression test.

---

## 6. Acceptance criteria for the Jalin PoC

The PoC ends successfully when **all of these run on Jalin's ghost VM**:

1. **Smoke**: Card insert → PIN entry → balance enquiry → eject. Returns successfully through Euronet MVS.
2. **Withdrawal happy path**: Rp 100k via Jalin BIN, dispenses correctly, prints receipt, ejects card.
3. **Withdrawal insufficient funds**: Rp 999M attempt → app shows "Saldo tidak mencukupi" and offers menu return.
4. **Withdrawal then dispense error**: Inject CDM hardware error from operator console mid-dispense. Confirm app shows recoverable-error screen + reverses the host authorisation (no money debited from the test account).
5. **Withdrawal then card retain**: 3 wrong PIN attempts → card retained, app shows "Kartu Anda tertahan" screen.
6. **Cassette empty**: Drain CASS3 (Rp 20k) to zero via operator console, request Rp 60k, app falls back to mix of CASS2 (Rp 50k) + CASS1 (Rp 100k) — or refuses cleanly.
7. **Network outage simulation**: Inject host-emulator timeout, app shows network-error screen + retries per Euronet MVS configured policy.
8. **Operator-driven session replay**: After running 2-3, the QA engineer can replay any session from `/operator → Session History` and watch the same XFS commands again.
9. **Macro recording**: Record one of the above as a macro, save it, re-run it the next day, get the same outcome.

When the bank signs off on those 9 criteria, ship Tier 2 to them.

---

## 7. Known unknowns to clarify with Jalin / Euronet

These need a short call with the Euronet integration engineer before Phase 9 work starts:

1. **Exact Euronet MVS XFS bindings.** MVS sometimes uses NCR-style or DN-style proprietary extensions on top of CEN/XFS. Confirm whether their installation uses pure CEN/XFS 3.30 or has vendor extensions.
2. **PIN block format and key management.** Euronet's installations differ on TPK/TMK rotation cadence and ISO format (ISO0 / ISO1 / ISO3). Jalin's HSM config is the source of truth.
3. **Receipt template.** Jalin's branding + per-bank receipt overlays. Currently the seed has 7 generic bank themes; we'll need Jalin-specific receipt copy (header + footer + Bahasa Indonesia statutory wording).
4. **Cassette layout the ghost emulates.** Hyosung 4-cassette is the seed; Jalin fleet may run NCR or DN with different denominations.
5. **Indonesian network policy timeouts.** Jalin's per-transaction timeout; Euronet MVS's configured retry counts. We need to match the timing exactly so timeout/retry tests are realistic.
6. **First test bank.** Jalin spans many member banks. Pick one (their internal test bank, or a willing pilot like Bank DKI) for the initial integration.

---

## 8. Future-state — Jalin's own multivendor middleware (separate project)

Jalin has signaled a separate future project: building their own multivendor
middleware, possibly using the ATMirror simulator as the "fake real ATM" their
middleware tests against during development.

Architecturally this is straightforward — see
[`docs/integrations/external-multivendor-consumers.md`](external-multivendor-consumers.md)
for the full guide. The short version:

- Jalin's multivendor middleware loads **our SP DLL** instead of real hardware
  drivers, exactly as Euronet MVS does in this PoC. From their middleware's
  perspective there is no difference.
- This is the natural reference architecture for **building** a multivendor —
  every vendor needs to test against deterministic fake hardware before they
  can hand-off to real banks.
- We can spin up a dedicated repo or workspace for Jalin's multivendor that
  consumes `@atm/xfs-core` + `@atm/iso8583` as workspace deps so contracts
  stay perfectly aligned.

When that project starts, this current repo stays the SP + simulator; the
new repo is the multivendor middleware. They are peer projects connected by
the XFS contract.
