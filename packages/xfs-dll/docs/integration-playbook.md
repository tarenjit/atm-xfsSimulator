# Customer Ghost VM Onboarding Playbook

> Target audience: Zegen sales + integration team.
> Based on `Update_features.md §11`.

---

## Pre-engagement checklist

Before starting a PoC with Bank Mandiri, BSI, BTN, BNI, BRI, BCA, or any
Jalin member bank:

- [ ] Customer provides a **cloned** ghost ATM VM (never production).
- [ ] Which vendor middleware?
      - [ ] Euronet MVS
      - [ ] NCR APTRA Edge / Activate
      - [ ] Diebold Nixdorf Vynx / ProTopas
      - [ ] KAL Kalignite
      - [ ] Hyosung MoniPlus
      - [ ] Wincor ProClassic (legacy)
- [ ] Which hardware profile? (NCR Personas, DN Opteva, Wincor, Hyosung,
      Hitachi)
- [ ] Which banking host?
      - [ ] Jalin
      - [ ] ATM Bersama
      - [ ] Prima
      - [ ] Direct issuer
- [ ] **Test host available (NOT production switch)** for transaction
      testing. **Do not attach the simulator to a production switch
      without explicit customer signoff.**
- [ ] Customer IT provides: admin access to ghost VM, firewall rules
      allowing ghost VM → ATMirror backend on port 9101.
- [ ] Vendor middleware licensing is for development/test use only.

---

## Backend prep (one-time per PoC)

1. Deploy ATMirror (this repo) on a Linux host reachable from the ghost
   VM. Recommended: same hypervisor, private network.
2. Postgres + Redis per the main README.
3. `pnpm install && pnpm db:migrate && pnpm db:seed`.
4. Enable the ZXFS bridge:
   ```bash
   export ZXFS_BRIDGE_ENABLED=true
   export ZXFS_BRIDGE_HOST=10.131.128.1     # backend private IP
   export ZXFS_BRIDGE_PORT=9101
   pnpm dev
   ```
5. Confirm the bridge is listening:
   ```bash
   nc -zv 10.131.128.1 9101
   ```

---

## Ghost VM installation

1. Copy `ZegenXFS.dll` to `C:\Program Files\Zegen\ATMirror\ZegenXFS.dll`.
2. **Export the existing XFS registry** as a backup:
   ```powershell
   reg export HKLM\SOFTWARE\XFS C:\Zegen\backup\xfs-before-zegen.reg
   ```
3. Apply `register-spi.reg` (creates the `ZegenXFS_*` keys).
4. Create `C:\ProgramData\Zegen\ATMirror\ZegenXFS.ini`:
   ```ini
   [Bridge]
   Host = 10.131.128.1
   Port = 9101
   ```
5. (Optional, Phase 9+) Install Zegen Screen Agent for live streaming.
6. Restart the Windows XFS service (or reboot the VM).
7. Start the vendor ATM app.
8. Validate via the operator console:
   - `GET /api/v1/xfs/services` shows IDC30 / PIN30 / CDM30 / PTR30 with
     `state: open`.
9. Run the smoke-test macro: `Happy-path withdrawal (300,000)` from the
   `/operator` Macro Studio panel.

---

## Rollback

If something breaks:

1. Stop the Windows XFS service.
2. Re-import the pre-change registry backup:
   ```powershell
   reg import C:\Zegen\backup\xfs-before-zegen.reg
   ```
3. Uninstall `ZegenXFS.dll` (remove from `C:\Program Files\Zegen\ATMirror\`).
4. Restore the original vendor hardware SPI DLLs (should already be in
   the backup registry).
5. Restart the XFS service.

---

## Common issues

| Symptom                                     | Likely cause                              | Fix                                           |
| ------------------------------------------- | ----------------------------------------- | --------------------------------------------- |
| Vendor app shows "device not ready" on boot | `WFSOpen` failing — backend unreachable   | Check firewall, confirm `nc -zv HOST 9101`    |
| `WFS_ERR_UNSUPP_COMMAND` returned           | DLL doesn't implement the command yet     | Open an issue; add handler to xfs-server      |
| Card insert event not received by vendor app| Event delivery not wired to HWND          | Phase 8c.1 work — `event_router.cpp`          |
| PIN block rejected by host                  | Wrong TPK key or block format             | Check `TPK` matches host's key ceremony       |
| Cash dispense amount mismatch               | Mix differs from vendor expectation       | Use `mixType: 'CUSTOM'` with exact breakdown  |
| Vendor app crashes on `WFSGetInfo`          | Struct layout diverges from XFS 3.30 spec | Enable XFS trace tools, verify struct padding |
| Slow response on commands                   | Network latency too high                  | Colocate backend in same hypervisor as VM     |
| Bridge disconnects every ~60s               | Firewall idle timeout                     | Shorten keepalive interval in ZegenXFS.ini    |

---

## Support contact

Open a ticket in the Zegen internal tracker with:
- Ghost VM Windows build + vendor middleware name/version.
- ATMirror backend git SHA (`git rev-parse HEAD`).
- Last 500 lines of `ZegenXFS.log` from the ghost VM.
- Last 500 lines of the xfs-server log from the backend host.
- Reproduction steps as a macro JSON, if possible.
