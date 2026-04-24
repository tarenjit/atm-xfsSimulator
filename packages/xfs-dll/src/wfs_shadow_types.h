// wfs_shadow_types.h — shadow copies of CEN/XFS 3.30 struct layouts.
//
// WHY: the real header files (xfsapi.h, xfsidc.h, xfspin.h, xfscdm.h,
// xfsptr.h) are customer/vendor-provided. This file gives us the exact
// struct layouts per the CEN/XFS 3.30 specification so the codec can
// be compiled and reviewed before the real SDK is dropped in.
//
// WHEN THE REAL SDK ARRIVES, the user deletes this file and replaces the
// `#include "wfs_shadow_types.h"` in wfs_codec.cpp with:
//
//     #include <xfsapi.h>
//     #include <xfsidc.h>
//     #include <xfspin.h>
//     #include <xfscdm.h>
//     #include <xfsptr.h>
//
// The marshallers compile against the real types without change — the
// layouts here track the spec's published fields + ordering. If the SDK
// deviates (Hyosung or APTRA sometimes pad for alignment), the marshaller
// will still compile but a field read may return a garbage value; the
// playbook is to diff the real header against this shadow and add any
// missing fields to the JSON contract.
//
// Spec reference: CEN/XFS 3.30 published March 2015 (CWA 16926).
// See https://www.cencenelec.eu/areas-of-work/xfs_cwa16926_330_release/
// for the authoritative PDFs + installer.

#pragma once

#include <cstdint>

#ifdef _WIN32
#include <windows.h>  // LPSTR, HWND, DWORD, etc.
using HSERVICE = uint16_t;
#else
// Non-Windows: shadow typedefs so the file parses on macOS/Linux for IDE tooling.
using LPSTR   = char*;
using LPCSTR  = const char*;
using LPWSTR  = wchar_t*;
using DWORD   = uint32_t;
using WORD    = uint16_t;
using BYTE    = uint8_t;
using USHORT  = uint16_t;
using BOOL    = int;
using CHAR    = char;
using ULONG   = uint32_t;
using LPULONG = uint32_t*;
using LPUSHORT = uint16_t*;
using HWND    = void*;
using HSERVICE = uint16_t;
using HRESULT = int32_t;
using LPVOID  = void*;
#endif

namespace zegen::wfs::shadow {

// =============================================================================
// IDC — Identification Card (card reader). CEN/XFS 3.30 Part IDC.
// =============================================================================

// WFSIDCCARDDATA — per-track result used by WFSIDCREADDATA (§IDC.6.3).
// lpbData is a raw byte buffer; ulDataLength is its size. The track is
// identified by wDataSource (WFS_IDC_TRACK1 = 0x0001, WFS_IDC_TRACK2 =
// 0x0002, WFS_IDC_TRACK3 = 0x0004, WFS_IDC_CHIP = 0x0008, …).
struct WFSIDCCARDDATA {
    WORD   wDataSource;      // WFS_IDC_TRACK1 / _TRACK2 / _TRACK3 / _CHIP / ...
    WORD   wStatus;          // WFS_IDC_DATAOK / _DATAMISSING / _DATAINVALID / ...
    ULONG  ulDataLength;     // byte count
    LPVOID lpbData;          // raw bytes (ISO 7813 track text, or chip APDU)
};

// WFS_CMD_IDC_READ_RAW_DATA input: bit-mask of tracks to read.
// The Service Provider returns a NULL-terminated array of
// WFSIDCCARDDATA* on success.
struct WFSIDCREADRAWDATA_REQUEST {
    WORD fwDataSource;        // OR of WFS_IDC_TRACK1/2/3/CHIP/...
};

// WFS_CMD_IDC_EJECT_CARD / RETAIN_CARD take no input.
// WFS_CMD_IDC_CHIP_IO:
struct WFSIDCCHIPIO_REQUEST {
    WORD   wChipProtocol;    // WFS_IDC_CHIPT0 / _CHIPT1 / _CHIPPROTNOTREQ
    ULONG  ulChipDataLength;
    LPVOID lpbChipData;
};
struct WFSIDCCHIPIO_RESPONSE {
    WORD   wChipProtocol;
    ULONG  ulChipDataLength;
    LPVOID lpbChipData;
};

// IDC bit-mask constants per CEN/XFS 3.30 §IDC.
constexpr WORD WFS_IDC_TRACK1   = 0x0001;
constexpr WORD WFS_IDC_TRACK2   = 0x0002;
constexpr WORD WFS_IDC_TRACK3   = 0x0004;
constexpr WORD WFS_IDC_CHIP     = 0x0008;
constexpr WORD WFS_IDC_FRONT    = 0x0010;

// =============================================================================
// PIN — PIN Pad / Encrypting PIN Pad. CEN/XFS 3.30 Part PIN.
// =============================================================================

// WFS_CMD_PIN_GET_PIN input (§PIN.5.2):
struct WFSPINGETPIN_REQUEST {
    USHORT usMinLen;                     // typically 4
    USHORT usMaxLen;                     // typically 12
    BOOL   bAutoEnd;                     // terminate at MaxLen w/o ENTER
    CHAR   cEcho;                        // character to echo (0 = no echo)
    ULONG  ulActiveFDKs;                 // bitmap of FDKs that are active
    ULONG  ulActiveKeys;                 // bitmap of active numeric/function keys
    ULONG  ulTerminateFDKs;              // bitmap of FDKs that terminate entry
    ULONG  ulTerminateKeys;              // bitmap of function keys that terminate
};

// Response: WFSPINENTRY (§PIN.5.2) — the entered PIN length (digits NEVER
// returned in clear).
struct WFSPINENTRY {
    USHORT usDigits;                     // PIN length entered
    WORD   wCompletion;                  // WFS_PIN_COMPAUTO / _COMPENTER / _COMPCANCEL
    WORD   wCompletionKey;
};

// WFS_CMD_PIN_GET_PINBLOCK input (§PIN.5.3):
struct WFSPINBLOCKREQUEST {
    LPSTR lpsCustomerData;               // PAN (as ASCII)
    LPSTR lpsXORData;                    // optional XOR string
    BYTE  bPadding;                      // PIN block padding char
    WORD  wFormat;                       // WFS_PIN_FORMISO0 / _FORMISO1 / _FORMISO3 / ...
    LPSTR lpsKey;                        // key name (e.g. "TPK")
    LPSTR lpsKeyEncKey;                  // optional key-encryption key
};

// Response: WFSXDATA — raw encrypted PIN block.
struct WFSXDATA {
    USHORT usLength;
    LPVOID lpbData;
};

// PIN wFormat constants per §PIN.4.7.
constexpr WORD WFS_PIN_FORMISO0 = 0x0001;
constexpr WORD WFS_PIN_FORMISO1 = 0x0002;
constexpr WORD WFS_PIN_FORMISO3 = 0x0008;
constexpr WORD WFS_PIN_FORMANSI = 0x0010;

// =============================================================================
// CDM — Cash Dispenser Module. CEN/XFS 3.30 Part CDM.
// =============================================================================

// WFSCDMDENOMINATION (§CDM.4.2): per-denomination count map.
// NB: the spec flavour for DISPENSE does not carry a usFunction code —
// that field only appears on the RESULT shape (WFSCDMDENOMINATION_RESULT).
struct WFSCDMDENOMINATION {
    CHAR     cCurrencyID[3];             // ISO 4217, e.g. "IDR"
    ULONG    ulAmount;                   // requested amount in minor units
    USHORT   usCount;                    // length of lpusNoteNumber array
    LPUSHORT lpusNoteNumber;             // [usCount] — note counts per cassette slot
    ULONG    ulCashBox;                  // vendor-specific — usually 0
};

// WFS_CMD_CDM_DISPENSE input (§CDM.5.3):
struct WFSCDMDISPENSE_REQUEST {
    USHORT usTellerID;                   // 0 for self-service
    USHORT usMixNumber;                  // WFS_CDM_INDIVIDUAL / _MIN_NOTES / _MAX_NOTES / _CUSTOM
    BOOL   bPresent;                     // auto-present after dispense
    WFSCDMDENOMINATION denomination;     // amount + optional cassette mix
};

// WFS_CMD_CDM_PRESENT / REJECT / RETRACT take no input.
// WFS_CMD_CDM_CASH_UNIT_INFO response is an array of WFSCDMCASHUNIT (see spec).

struct WFSCDMCASHUNIT {
    USHORT usNumber;                     // cassette index (1-based)
    WORD   wType;                        // WFS_CDM_TYPEBILLCASSETTE / _TYPECOINCYLINDER / ...
    LPSTR  lpszCashUnitName;             // display name
    CHAR   cCurrencyID[3];
    ULONG  ulValues;                     // face value
    ULONG  ulCount;
    ULONG  ulMaximum;
    ULONG  ulMinimum;
    USHORT usStatus;                     // WFS_CDM_STATCUOK / _STATCULOW / _STATCUEMPTY / _STATCUJAMMED
};

// CDM usMixNumber constants per §CDM.4.6.
constexpr USHORT WFS_CDM_INDIVIDUAL = 0;
constexpr USHORT WFS_CDM_MIN_NOTES  = 1;
constexpr USHORT WFS_CDM_MAX_NOTES  = 2;
constexpr USHORT WFS_CDM_CUSTOM     = 3;

// =============================================================================
// PTR — Printer. CEN/XFS 3.30 Part PTR.
// =============================================================================

// WFS_CMD_PTR_PRINT_FORM input (§PTR.5.1):
// Note: the spec has two flavours — one for FORM (template-driven) and
// one for RAW_DATA. This is the FORM variant.
struct WFSPTRPRINTFORM_REQUEST {
    LPSTR  lpszFormName;
    LPSTR  lpszMediaName;
    WORD   wAlignment;                   // WFS_PTR_ALNDEFAULT / _ALNTOPRIGHT / ...
    WORD   wOffsetX;
    WORD   wOffsetY;
    WORD   wResolution;
    WORD   wMediaControl;                // WFS_PTR_CTRLEJECT / _CTRLCUT / ...
    WORD   wPaperSource;
    LPSTR  lpszFields;                   // newline-separated "KEY=value" pairs
};

// WFS_CMD_PTR_RAW_DATA input:
struct WFSPTRRAWDATA_REQUEST {
    WORD   wInputData;                   // WFS_PTR_READFORM / PTR_NOTREQUIRED
    ULONG  ulSize;                       // byte count
    LPVOID lpbData;                      // raw print data
};

// PTR wMediaControl bit-mask constants per §PTR.4.7.
constexpr WORD WFS_PTR_CTRLEJECT = 0x0001;
constexpr WORD WFS_PTR_CTRLPERF  = 0x0002;
constexpr WORD WFS_PTR_CTRLCUT   = 0x0004;
constexpr WORD WFS_PTR_CTRLSKIP  = 0x0008;
constexpr WORD WFS_PTR_CTRLFLUSH = 0x0010;
constexpr WORD WFS_PTR_CTRLRETRACT = 0x0020;
constexpr WORD WFS_PTR_CTRLSTACK = 0x0040;
constexpr WORD WFS_PTR_CTRLPARTIALCUT = 0x0080;

} // namespace zegen::wfs::shadow
