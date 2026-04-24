# @atm/xfs-dll (ZegenXFS.dll)

> **Status:** Phase 8c.2 — marshallers + event router + INI loader in place.
> Builds on Windows only.
> **Tooling:** Visual Studio 2022 (v143 toolset), Windows SDK 10.0.22621.
> **CEN/XFS SDK 3.30 headers:** free download from [CEN-CENELEC](https://www.cencenelec.eu/areas-of-work/xfs_cwa16926_330_release/)
> (installer zip on that page). Practical GitHub mirrors with the same headers:
> [becrux/xfspp](https://github.com/becrux/xfspp) (MIT),
> [sergiofst/wosa-xfs-spi-base-framework](https://github.com/sergiofst/wosa-xfs-spi-base-framework),
> [vallejocc/PoC-Fake-Msxfs](https://github.com/vallejocc/PoC-Fake-Msxfs).
> Drop the headers into `third_party/cen-xfs-3.30/` on the build host and
> delete `src/wfs_shadow_types.h` — the marshallers compile against the
> real typedefs without change.

The Windows Service Provider DLL that a customer's ghost ATM VM loads
through the Windows XFS Manager in place of a vendor-provided hardware
SPI. All `WFS*` calls from the vendor ATM app are proxied over TCP to
the ATMirror backend (`xfs-server`) running on the shared Linux host.

---

## Files

| Path                          | Purpose                                     |
| ----------------------------- | ------------------------------------------- |
| `src/dllmain.cpp`             | DLL entry points + WFP* export surface      |
| `src/bridge_client.{h,cpp}`   | TCP client + ZXFS framing                   |
| `src/wfs_codec.{h,cpp}`       | Command-code map + per-command marshallers |
| `src/wfs_shadow_types.h`      | CEN/XFS 3.30 shadow structs (remove when SDK is on the build host) |
| `src/mini_json.h`             | Header-only JSON builder + minimal reader  |
| `src/event_router.{h,cpp}`    | Translates ZXFS events → `WFMPostMessage`   |
| `src/ini_config.{h,cpp}`      | `ZegenXFS.ini` loader                       |
| `include/zegen_xfs.h`         | Public C API                                |
| `ZegenXFS.ini.example`        | Sample config with defaults                 |
| `ZegenXFS.vcxproj`            | MSBuild project file (to be added)          |
| `register-spi.reg`            | Windows SPI registry hook (to be added)     |
| `ZXFS_PROTOCOL.md`            | Network protocol spec (frozen)              |

---

## Build (Windows)

```powershell
cd packages\xfs-dll
msbuild ZegenXFS.vcxproj /p:Configuration=Release /p:Platform=x64
# Output: bin\x64\Release\ZegenXFS.dll
```

WiX installer lands in Phase 8c.2.

---

## Registration

The Windows XFS Manager locates service providers via registry. Writing
the following keys points vendor middleware at ZegenXFS.dll:

```
HKLM\SOFTWARE\XFS\SERVICE_PROVIDERS\ZegenXFS_IDC
  (Default)    REG_SZ  IDC
  dllname      REG_SZ  C:\Program Files\Zegen\ATMirror\ZegenXFS.dll
  vendor_name  REG_SZ  Zegen Solusi Mandiri
  version      REG_SZ  1.0.0

... same for ZegenXFS_PIN, ZegenXFS_CDM, ZegenXFS_PTR
```

Full registry script: `register-spi.reg`. **Always back up the existing
SPI registry keys before applying** (a `.reg` export of
`HKLM\SOFTWARE\XFS`). Rollback = re-import the backup.

---

## Configuration

`C:\ProgramData\Zegen\ATMirror\ZegenXFS.ini`:

```ini
[Bridge]
Host = 10.131.128.1     ; xfs-server IP
Port = 9101
ReconnectDelayMs = 500
ReconnectMaxMs   = 10000

[Logging]
File     = C:\ProgramData\Zegen\ATMirror\logs\ZegenXFS.log
Level    = info          ; trace | debug | info | warn | error
RotateMB = 50
```

---

## Integration test plan

Per `Update_features.md §6.3`:

1. `WFSStartUp` succeeds.
2. `WFSOpen` succeeds for IDC, PIN, CDM, PTR.
3. `WFSGetInfo` returns a struct the middleware accepts.
4. Card insert event triggers `WFS_SRVE_IDC_MEDIAINSERTED`.
5. `WFS_CMD_IDC_READ_TRACK` returns track data the middleware parses.
6. `WFS_CMD_PIN_GET_PIN` captures a PIN.
7. `WFS_CMD_PIN_GET_PINBLOCK` returns an encrypted block the host accepts.
8. `WFS_CMD_CDM_DISPENSE` dispenses the correct mix.
9. `WFS_CMD_CDM_PRESENT` + `ITEMSTAKEN` sequence works.
10. `WFS_CMD_PTR_PRINT_FORM` prints a receipt.
11. `WFS_CMD_IDC_EJECT_CARD` works.
12. Full end-to-end withdrawal through the middleware completes.

Target middleware in Tier 1:
- Euronet MVS
- NCR APTRA Edge / APTRA Activate
- Diebold Nixdorf Vynx / ProTopas
- Hyosung MoniPlus

---

## Protocol

See `ZXFS_PROTOCOL.md` in this directory.

---

## Rollback

If something breaks in a customer ghost VM:

1. Stop the Windows XFS service.
2. Import the pre-change registry backup.
3. Uninstall `ZegenXFS.dll`.
4. Restore the original vendor SPI DLLs to registry.
5. Restart the XFS service.

Also documented in `docs/integration-playbook.md` (Phase 8c.3).
