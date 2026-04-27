# BUILD.md — ZegenXFS_SP Windows build setup

Target environment for development and customer ghost VM deployment:

- **Windows 10 22H2** or **Windows 11 Pro** (matches the customer ghost ATM OS baseline)
- **Visual Studio 2022 Community** with the "Desktop development with C++" workload + **MSVC v143** toolset + **Windows SDK 10.0.22621**
- **vcpkg** for non-XFS dependencies (auto-restored by VS)
- **CEN/XFS 3.30 SDK headers** — the one dependency vcpkg can't supply

---

## 1. One-time machine setup

```powershell
# Install Visual Studio Build Tools 2022 with the C++ workload
winget install Microsoft.VisualStudio.2022.BuildTools `
  --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools `
              --add Microsoft.VisualStudio.Component.Windows11SDK.22621"

# Install vcpkg (vendored under the repo so devs share the same toolchain)
git clone https://github.com/microsoft/vcpkg.git C:\vcpkg
C:\vcpkg\bootstrap-vcpkg.bat
[Environment]::SetEnvironmentVariable('VCPKG_ROOT', 'C:\vcpkg', 'User')
```

---

## 2. CEN/XFS 3.30 SDK headers

vcpkg cannot supply these — they ship as a free download from CEN-CENELEC under [the XFS CWA 16926 v3.30 release page](https://www.cencenelec.eu/areas-of-work/xfs_cwa16926_330_release/).

After downloading the release zip:

```powershell
# Extract just the INCLUDE folder; place it at:
native\zegen-xfs-sp\ZegenXFS_SP\include\third_party\cen-xfs-3.30\
```

The headers we touch in Phase 8b+ are: `xfsapi.h`, `xfsspi.h`, `xfsidc.h`, `xfspin.h`, `xfscdm.h`, `xfsptr.h`, `xfssiu.h`, `xfsadmin.h`.

Practical GitHub mirrors carry the same headers if the official site is slow:
- [becrux/xfspp](https://github.com/becrux/xfspp) (MIT)
- [sergiofst/wosa-xfs-spi-base-framework](https://github.com/sergiofst/wosa-xfs-spi-base-framework)
- [vallejocc/PoC-Fake-Msxfs](https://github.com/vallejocc/PoC-Fake-Msxfs)

---

## 3. Build

```powershell
cd native\zegen-xfs-sp

# Restore vcpkg deps (one time per checkout)
vcpkg install --triplet x64-windows --x-manifest-root=.

# Build
msbuild ZegenXFS_SP\ZegenXFS_SP.vcxproj `
        /p:Configuration=Release `
        /p:Platform=x64 `
        /p:VcpkgEnableManifest=true

# Output:
#   ZegenXFS_SP\bin\x64\Release\ZegenXFS_SP.dll
#   ZegenXFS_SP\bin\x64\Release\ZegenXFS_SP.pdb
```

Phase 8a.1 lands `ZegenXFS_SP.sln` + `ZegenXFS_SP.vcxproj`. Until then this section is a contract for what the project will look like — not yet runnable.

---

## 4. Code-signing

For production deployment to bank ghost VMs, the DLL **must** be Authenticode-signed. Most banks reject unsigned drivers. Cost: ~USD 400/year for an EV cert from DigiCert or Sectigo (4-6 weeks lead time — order in Phase 11 at the latest).

```powershell
signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 `
              /a ZegenXFS_SP\bin\x64\Release\ZegenXFS_SP.dll
```

Procedure documented in Phase 14 deliverables.

---

## 5. CI

Phase 8a does not include a Windows CI leg. Phase 8a.1 adds a GitHub Actions workflow on `windows-latest` that:

1. Restores vcpkg deps with caching
2. Compiles `ZegenXFS_SP.dll` for x64
3. Runs the GoogleTest suite (no real XFS Manager — that needs the integration leg)
4. Surfaces compile warnings as errors (`/W4 /WX`)

---

## 6. Local smoke test (without a ghost VM)

The CEN release ships `xfstest.exe` — a minimal harness that calls `WFSStartUp → WFSOpen → WFSExecute → WFSClose → WFSCleanUp` against a registered service. Once `register-spi.reg` (Phase 13 installer) is imported on a dev box:

```powershell
xfstest.exe IDC30
# Expected: WFSStartUp 0 → WFSOpen 0 → ...
# Phase 8b smoke target: WFSOpen returns 0 with our SP registered.
```
