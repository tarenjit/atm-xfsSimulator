// wfs_codec.cpp — WFS command-code mapping implementation.
//
// Phase 8c.1 provides the command-code mapping (enough for the bridge
// to route every common ATM command). Per-command struct marshalling
// is a set of stubs that return "{}" — Phase 8c.2 fills them in with
// real field reads once we have the CEN/XFS SDK headers on the build
// machine.

#include "wfs_codec.h"
#include <unordered_map>
#include <string>

namespace zegen::wfs {

namespace {

// CEN/XFS 3.30 command code constants. These are the numeric values
// msxfs.dll passes via dwCommand. The full list is in the SDK's
// xfs*.h headers; we include the subset the backend implements.
// Values below follow the canonical spec numbering.

// IDC — Identification Card / card reader
constexpr uint32_t WFS_CMD_IDC_READ_RAW_DATA  = 101;
constexpr uint32_t WFS_CMD_IDC_WRITE_TRACK    = 102;
constexpr uint32_t WFS_CMD_IDC_EJECT_CARD     = 103;
constexpr uint32_t WFS_CMD_IDC_RETAIN_CARD    = 104;
constexpr uint32_t WFS_CMD_IDC_RESET_COUNT    = 105;
constexpr uint32_t WFS_CMD_IDC_RESET          = 106;
constexpr uint32_t WFS_CMD_IDC_CHIP_IO        = 107;
constexpr uint32_t WFS_CMD_IDC_CHIP_POWER     = 108;
// Our backend also exposes a higher-level READ_TRACK that isn't in the
// stock XFS numbering — we give it an internal id in the IDC range.
constexpr uint32_t WFS_CMD_IDC_READ_TRACK     = 120;

// PIN — PIN Pad / EPP
constexpr uint32_t WFS_CMD_PIN_GET_PIN        = 201;
constexpr uint32_t WFS_CMD_PIN_GET_PINBLOCK   = 202;
constexpr uint32_t WFS_CMD_PIN_GET_DATA       = 203;
constexpr uint32_t WFS_CMD_PIN_RESET          = 204;
constexpr uint32_t WFS_CMD_PIN_IMPORT_KEY     = 205;
constexpr uint32_t WFS_CMD_PIN_GET_KEY_DETAIL = 206;

// CDM — Cash Dispenser Module
constexpr uint32_t WFS_CMD_CDM_DISPENSE       = 301;
constexpr uint32_t WFS_CMD_CDM_PRESENT        = 302;
constexpr uint32_t WFS_CMD_CDM_REJECT         = 303;
constexpr uint32_t WFS_CMD_CDM_RETRACT        = 304;
constexpr uint32_t WFS_CMD_CDM_COUNT          = 305;
constexpr uint32_t WFS_CMD_CDM_CASH_UNIT_INFO = 306;
constexpr uint32_t WFS_CMD_CDM_START_EXCHANGE = 307;
constexpr uint32_t WFS_CMD_CDM_END_EXCHANGE   = 308;
constexpr uint32_t WFS_CMD_CDM_RESET          = 309;

// PTR — Printer
constexpr uint32_t WFS_CMD_PTR_PRINT_FORM     = 401;
constexpr uint32_t WFS_CMD_PTR_RAW_DATA       = 402;
constexpr uint32_t WFS_CMD_PTR_CUT_PAPER      = 403;
constexpr uint32_t WFS_CMD_PTR_RESET          = 404;

// Single flat map keyed by "SERVICE:NUM" so we don't pay a nested lookup.
const std::unordered_map<std::string, std::string>& codes() {
    static const std::unordered_map<std::string, std::string> m{
        {"IDC:101", "WFS_CMD_IDC_READ_RAW_DATA"},
        {"IDC:102", "WFS_CMD_IDC_WRITE_TRACK"},
        {"IDC:103", "WFS_CMD_IDC_EJECT_CARD"},
        {"IDC:104", "WFS_CMD_IDC_RETAIN_CARD"},
        {"IDC:105", "WFS_CMD_IDC_RESET_COUNT"},
        {"IDC:106", "WFS_CMD_IDC_RESET"},
        {"IDC:107", "WFS_CMD_IDC_CHIP_IO"},
        {"IDC:108", "WFS_CMD_IDC_CHIP_POWER"},
        {"IDC:120", "WFS_CMD_IDC_READ_TRACK"},

        {"PIN:201", "WFS_CMD_PIN_GET_PIN"},
        {"PIN:202", "WFS_CMD_PIN_GET_PINBLOCK"},
        {"PIN:203", "WFS_CMD_PIN_GET_DATA"},
        {"PIN:204", "WFS_CMD_PIN_RESET"},
        {"PIN:205", "WFS_CMD_PIN_IMPORT_KEY"},
        {"PIN:206", "WFS_CMD_PIN_GET_KEY_DETAIL"},

        {"CDM:301", "WFS_CMD_CDM_DISPENSE"},
        {"CDM:302", "WFS_CMD_CDM_PRESENT"},
        {"CDM:303", "WFS_CMD_CDM_REJECT"},
        {"CDM:304", "WFS_CMD_CDM_RETRACT"},
        {"CDM:305", "WFS_CMD_CDM_COUNT"},
        {"CDM:306", "WFS_CMD_CDM_CASH_UNIT_INFO"},
        {"CDM:307", "WFS_CMD_CDM_START_EXCHANGE"},
        {"CDM:308", "WFS_CMD_CDM_END_EXCHANGE"},
        {"CDM:309", "WFS_CMD_CDM_RESET"},

        {"PTR:401", "WFS_CMD_PTR_PRINT_FORM"},
        {"PTR:402", "WFS_CMD_PTR_RAW_DATA"},
        {"PTR:403", "WFS_CMD_PTR_CUT_PAPER"},
        {"PTR:404", "WFS_CMD_PTR_RESET"},
    };
    return m;
}

} // namespace

std::string command_code_for(const std::string& service, uint32_t dw_command) {
    const auto& m = codes();
    auto it = m.find(service + ":" + std::to_string(dw_command));
    if (it == m.end()) return {};
    return it->second;
}

//
// ---- Payload → JSON stubs ----
//
// Per-command marshalling lands in Phase 8c.2 once we have the CEN/XFS
// SDK headers (WFSIDCREADRAWDATA, WFSPINGETPIN, WFSCDMDISPENSE, etc.)
// on the build machine. For now each returns "{}" so an un-typed
// command still round-trips through the bridge (the backend ignores
// extra fields and the vendor app's struct stays untouched).

std::string payload_to_json(const std::string& service,
                            uint32_t dw_command,
                            const void* /*cmd_data*/) {
    // A real implementation picks the right marshaller by (service,
    // dw_command) and reads fields from cmd_data. Shown here as a
    // table-driven dispatch for clarity.
    (void)service;
    (void)dw_command;
    // TODO(phase-8c.2):
    //   IDC:120 (READ_TRACK)     → { "tracks": [1, 2] }
    //   IDC:103 (EJECT_CARD)     → {}
    //   IDC:104 (RETAIN_CARD)    → {}
    //   IDC:107 (CHIP_IO)        → { "apdu": "<hex>" }
    //   PIN:201 (GET_PIN)        → { "minLen", "maxLen", "autoEnd",
    //                                "activeKeys": [...],
    //                                "activeFDKs": [...],
    //                                "terminateKeys": [...] }
    //   PIN:202 (GET_PINBLOCK)   → { "keyName", "format", "pan" }
    //   CDM:301 (DISPENSE)       → { "amount", "currency",
    //                                "mixType",
    //                                "customMix"?: { "100000": 3, ... },
    //                                "present": bool }
    //   CDM:302 (PRESENT)        → {}
    //   CDM:306 (CASH_UNIT_INFO) → {}
    //   PTR:401 (PRINT_FORM)     → { "formName", "mediaType", "cut",
    //                                "fields": { … } }
    //   PTR:402 (RAW_DATA)       → { "data": "<base64>" }
    // Each struct layout comes from the CEN/XFS SDK; Phase 8c.2 writes
    // a small header-generator that turns the xfs*.h typedefs into
    // fold-through marshallers.
    return "{}";
}

bool response_from_json(const std::string& service,
                        uint32_t dw_command,
                        const std::string& /*json*/,
                        void* /*out_struct*/) {
    (void)service;
    (void)dw_command;
    // Phase 8c.2 populates this. For now return true so the vendor
    // app's result buffer is left untouched and the result code alone
    // propagates — safe, but loses any typed output data until the
    // per-command parsers are in place.
    return true;
}

} // namespace zegen::wfs
