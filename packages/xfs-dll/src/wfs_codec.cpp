// wfs_codec.cpp — WFS command-code mapping + struct↔JSON marshalling.
//
// Phase 8c.2 implementation: per-command marshallers that take the
// vendor app's typed struct (layout per CEN/XFS 3.30) and build the
// exact JSON payload shape the backend devices expect.
//
// Struct layouts come from "wfs_shadow_types.h" today — when the real
// CEN/XFS SDK headers drop in, swap that include for `<xfsidc.h>` etc.
// and the marshallers compile without change (field names are the
// canonical spec names).

#include "wfs_codec.h"
#include "wfs_shadow_types.h"
#include "mini_json.h"
#include <unordered_map>
#include <string>
#include <cstring>
#include <cctype>

namespace zegen::wfs {

namespace {

using namespace zegen::wfs::shadow;

// CEN/XFS 3.30 command code constants. Numeric values follow the spec.
// The full list is in the SDK's xfs*.h headers; we include the subset
// the backend implements.

// IDC — Identification Card / card reader
constexpr uint32_t WFS_CMD_IDC_READ_RAW_DATA  = 101;
constexpr uint32_t WFS_CMD_IDC_WRITE_TRACK    = 102;
constexpr uint32_t WFS_CMD_IDC_EJECT_CARD     = 103;
constexpr uint32_t WFS_CMD_IDC_RETAIN_CARD    = 104;
constexpr uint32_t WFS_CMD_IDC_RESET_COUNT    = 105;
constexpr uint32_t WFS_CMD_IDC_RESET          = 106;
constexpr uint32_t WFS_CMD_IDC_CHIP_IO        = 107;
constexpr uint32_t WFS_CMD_IDC_CHIP_POWER     = 108;
// Higher-level READ_TRACK isn't in the stock XFS numbering — we give it
// an internal id in the IDC range.
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

// ---------- Small helpers ----------

// Safely read a NUL-terminated ANSI string pointer field. Returns ""
// for nullptr (the vendor app is allowed to leave optional strings null).
inline std::string cstr(const char* p) {
    return p ? std::string(p) : std::string{};
}

// ISO 4217 currency IDs in WFSCDMDENOMINATION are 3 ASCII characters
// NOT NUL-terminated — read exactly 3 bytes.
inline std::string currency3(const CHAR (&field)[3]) {
    return std::string(field, 3);
}

// Base64 encode a raw byte buffer — needed for IDC_CHIP_IO APDU and
// PTR_RAW_DATA print buffers. Standard alphabet, no URL variant.
std::string base64(const uint8_t* data, size_t len) {
    static const char tbl[] =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string out;
    out.reserve(((len + 2) / 3) * 4);
    for (size_t i = 0; i < len; i += 3) {
        uint32_t triple = (uint32_t)data[i] << 16;
        if (i + 1 < len) triple |= (uint32_t)data[i + 1] << 8;
        if (i + 2 < len) triple |= (uint32_t)data[i + 2];
        out += tbl[(triple >> 18) & 0x3F];
        out += tbl[(triple >> 12) & 0x3F];
        out += (i + 1 < len) ? tbl[(triple >> 6) & 0x3F] : '=';
        out += (i + 2 < len) ? tbl[triple & 0x3F] : '=';
    }
    return out;
}

// Hex encode for APDU payloads that the backend device expects as hex.
std::string hex(const uint8_t* data, size_t len) {
    static const char tbl[] = "0123456789ABCDEF";
    std::string out;
    out.reserve(len * 2);
    for (size_t i = 0; i < len; ++i) {
        out += tbl[(data[i] >> 4) & 0xF];
        out += tbl[data[i] & 0xF];
    }
    return out;
}

// ---------- Marshallers ----------
//
// Each function receives a typed pointer to the command struct and
// returns a JSON string shaped to the backend contract. Contracts live
// in packages/xfs-core/src/<svc>.ts — keep both sides in lockstep.

std::string marshal_idc_read_raw_data(const WFSIDCREADRAWDATA_REQUEST* req) {
    // Backend contract: {} (no input fields — the bit-mask maps to "read
    // all tracks" which is what the IDC device already does). We still
    // echo the mask under `tracks` so the backend can log intent.
    if (!req) return "{}";
    zegen::json::Writer w;
    w.begin_array();  // reopened as array below
    // Rebuild as a clean object: list the numeric track indexes requested.
    std::string tracks = "[";
    bool first = true;
    auto push = [&](int n) {
        if (!first) tracks += ",";
        tracks += std::to_string(n);
        first = false;
    };
    if (req->fwDataSource & WFS_IDC_TRACK1) push(1);
    if (req->fwDataSource & WFS_IDC_TRACK2) push(2);
    if (req->fwDataSource & WFS_IDC_TRACK3) push(3);
    if (req->fwDataSource & WFS_IDC_CHIP)   push(0);  // 0 ⇒ chip
    tracks += "]";

    zegen::json::Writer out;
    out.key("tracks").raw(tracks);
    return out.str();
}

std::string marshal_idc_chip_io(const WFSIDCCHIPIO_REQUEST* req) {
    if (!req) return "{}";
    zegen::json::Writer out;
    out.key("protocol").value(
        req->wChipProtocol == 0x0001 ? "T0" :
        req->wChipProtocol == 0x0002 ? "T1" : "OTHER");
    out.key("apdu").value(hex(
        static_cast<const uint8_t*>(req->lpbChipData),
        static_cast<size_t>(req->ulChipDataLength)));
    return out.str();
}

std::string marshal_pin_get_pin(const WFSPINGETPIN_REQUEST* req) {
    if (!req) return "{}";

    // Bitmap → string-list conversion for activeKeys / activeFDKs etc.
    // Real CEN/XFS spec: ulActiveFDKs bits map to FDK01..FDK08, ulActiveKeys
    // bits map to the numeric + ENTER/CLEAR/CANCEL keyset. We expose both
    // as string arrays matching PIN device contract in
    // packages/xfs-core/src/pin.ts (PinGetPinPayload).
    auto fdk_list = [](uint32_t bits) {
        std::string out = "[";
        bool first = true;
        for (int i = 0; i < 8; ++i) {
            if (bits & (1u << i)) {
                if (!first) out += ",";
                char buf[8];
                std::snprintf(buf, sizeof(buf), "\"FDK%02d\"", i + 1);
                out += buf;
                first = false;
            }
        }
        out += "]";
        return out;
    };

    auto key_list = [](uint32_t bits, bool terminate) {
        // Numeric keys bit 0..9 → "0".."9". Function keys follow in the
        // higher bits per spec §PIN.4.3. We emit the common terminators
        // ENTER/CLEAR/CANCEL when their bits are set.
        std::string out = "[";
        bool first = true;
        auto push = [&](const char* s) {
            if (!first) out += ",";
            out += "\"";
            out += s;
            out += "\"";
            first = false;
        };
        if (!terminate) {
            for (int d = 0; d <= 9; ++d) {
                if (bits & (1u << d)) {
                    char buf[2] = { static_cast<char>('0' + d), 0 };
                    push(buf);
                }
            }
        }
        // Common function-key bits per spec table §PIN.4.4. These bit
        // positions are the conventional layout — Hyosung/Wincor overlap.
        if (bits & 0x00010000) push("ENTER");
        if (bits & 0x00020000) push("CANCEL");
        if (bits & 0x00040000) push("CLEAR");
        if (bits & 0x00080000) push("BACKSPACE");
        out += "]";
        return out;
    };

    zegen::json::Writer out;
    out.key("minLen").value(static_cast<int32_t>(req->usMinLen));
    out.key("maxLen").value(static_cast<int32_t>(req->usMaxLen));
    out.key("autoEnd").value(static_cast<bool>(req->bAutoEnd != 0));
    out.key("activeKeys").raw(key_list(req->ulActiveKeys, false));
    out.key("activeFDKs").raw(fdk_list(req->ulActiveFDKs));
    out.key("terminateKeys").raw(key_list(req->ulTerminateKeys, true));
    return out.str();
}

std::string marshal_pin_get_pinblock(const WFSPINBLOCKREQUEST* req) {
    if (!req) return "{}";
    const char* fmt = "ISO0";
    switch (req->wFormat) {
        case WFS_PIN_FORMISO0: fmt = "ISO0"; break;
        case WFS_PIN_FORMISO1: fmt = "ISO1"; break;
        case WFS_PIN_FORMISO3: fmt = "ISO3"; break;
        case WFS_PIN_FORMANSI: fmt = "ANSI"; break;
        default:               fmt = "ISO0"; break;
    }
    zegen::json::Writer out;
    out.key("keyName").value(cstr(req->lpsKey));
    out.key("format").value(fmt);
    out.key("pan").value(cstr(req->lpsCustomerData));
    return out.str();
}

std::string marshal_cdm_dispense(const WFSCDMDISPENSE_REQUEST* req) {
    if (!req) return "{}";
    const char* mix = "MIN_NOTES";
    switch (req->usMixNumber) {
        case WFS_CDM_MIN_NOTES: mix = "MIN_NOTES"; break;
        case WFS_CDM_MAX_NOTES: mix = "MAX_NOTES"; break;
        case WFS_CDM_CUSTOM:    mix = "CUSTOM";    break;
        default:                mix = "MIN_NOTES"; break;
    }
    zegen::json::Writer out;
    out.key("amount").value(static_cast<int64_t>(req->denomination.ulAmount));
    out.key("currency").value(currency3(req->denomination.cCurrencyID));
    out.key("mixType").value(mix);
    out.key("present").value(static_cast<bool>(req->bPresent != 0));

    // customMix is only relevant when mixType=CUSTOM. The vendor
    // supplies a per-cassette count in lpusNoteNumber[]; we don't know
    // the denomination table here (lives in the backend), so we pass
    // the raw slot→count map under `noteCounts` and let the backend
    // resolve against its cassette table.
    if (req->usMixNumber == WFS_CDM_CUSTOM &&
        req->denomination.lpusNoteNumber &&
        req->denomination.usCount > 0) {
        std::string mixStr = "{";
        for (USHORT i = 0; i < req->denomination.usCount; ++i) {
            if (i > 0) mixStr += ",";
            char buf[32];
            std::snprintf(buf, sizeof(buf), "\"slot%u\":%u",
                          static_cast<unsigned>(i + 1),
                          static_cast<unsigned>(req->denomination.lpusNoteNumber[i]));
            mixStr += buf;
        }
        mixStr += "}";
        out.key("customMix").raw(mixStr);
    }

    return out.str();
}

std::string marshal_ptr_print_form(const WFSPTRPRINTFORM_REQUEST* req) {
    if (!req) return "{}";

    // lpszFields is a null-terminated CR/LF-delimited key=value list
    // per CEN/XFS 3.30 §PTR.5.1. Parse into a flat JSON object.
    std::string fields_json = "{";
    bool first = true;
    if (req->lpszFields) {
        const char* p = req->lpszFields;
        while (*p) {
            // Skip leading whitespace / separators.
            while (*p == '\r' || *p == '\n' || *p == ' ' || *p == '\t') ++p;
            if (!*p) break;

            const char* key_start = p;
            while (*p && *p != '=' && *p != '\r' && *p != '\n') ++p;
            std::string key(key_start, p - key_start);

            std::string val;
            if (*p == '=') {
                ++p;
                const char* val_start = p;
                while (*p && *p != '\r' && *p != '\n') ++p;
                val.assign(val_start, p - val_start);
            }

            if (!key.empty()) {
                if (!first) fields_json += ",";
                fields_json += "\"";
                for (char c : key) {
                    if (c == '"' || c == '\\') fields_json += '\\';
                    fields_json += c;
                }
                fields_json += "\":\"";
                for (char c : val) {
                    if (c == '"' || c == '\\') fields_json += '\\';
                    else if (c == '\n') { fields_json += "\\n"; continue; }
                    else if (c == '\r') { fields_json += "\\r"; continue; }
                    else if (c == '\t') { fields_json += "\\t"; continue; }
                    fields_json += c;
                }
                fields_json += "\"";
                first = false;
            }
        }
    }
    fields_json += "}";

    // Map formName: FORMS.RECEIPT → "RECEIPT" etc. The simulator accepts
    // the raw name, but we pre-strip the "FORMS." prefix some vendor
    // integrations send.
    std::string form = cstr(req->lpszFormName);
    if (form.rfind("FORMS.", 0) == 0) form = form.substr(6);

    // Map mediaType similarly — RECEIPT/JOURNAL are the two we model.
    std::string media = cstr(req->lpszMediaName);
    if (media.empty()) media = "RECEIPT";

    zegen::json::Writer out;
    out.key("formName").value(form);
    out.key("mediaType").value(media);
    out.key("cut").value(static_cast<bool>(
        (req->wMediaControl & WFS_PTR_CTRLCUT) != 0 ||
        (req->wMediaControl & WFS_PTR_CTRLPARTIALCUT) != 0));
    out.key("fields").raw(fields_json);
    return out.str();
}

std::string marshal_ptr_raw_data(const WFSPTRRAWDATA_REQUEST* req) {
    if (!req) return "{}";
    zegen::json::Writer out;
    // Backend PtrRawDataPayload wants `data: string` (the simulator
    // treats it as pre-formatted text). For truly binary data we send
    // base64 under `dataBase64` so the DLL remains transparent.
    const uint8_t* p = static_cast<const uint8_t*>(req->lpbData);
    bool printable = true;
    for (ULONG i = 0; i < req->ulSize; ++i) {
        uint8_t c = p[i];
        if (c != '\n' && c != '\r' && c != '\t' && (c < 0x20 || c > 0x7E)) {
            printable = false;
            break;
        }
    }
    if (printable) {
        out.key("data").value(std::string(reinterpret_cast<const char*>(p),
                                          static_cast<size_t>(req->ulSize)));
    } else {
        out.key("data").value("");
        out.key("dataBase64").value(base64(p, static_cast<size_t>(req->ulSize)));
    }
    return out.str();
}

// ---------- Response parsers ----------
//
// Each function reads the backend's JSON reply and writes into the
// caller's typed struct. Memory layout is exactly the spec's WFSRESULT
// variant: result code + typed payload. The DLL is responsible for
// allocating output buffers with the XFS manager's WFMAllocateBuffer
// (not done here — dllmain.cpp handles that, we only fill fields).

bool parse_pin_entry(const std::string& json, WFSPINENTRY* out) {
    if (!out) return false;
    zegen::json::Reader r(json);
    out->usDigits = static_cast<USHORT>(r.get_int("pinLength", 0));
    // wCompletion: if backend returned pinLength, treat as COMPENTER (2).
    // 1 = AUTO end-of-entry, 2 = ENTER pressed, 3 = CANCEL.
    out->wCompletion = out->usDigits > 0 ? 2 : 3;
    out->wCompletionKey = 0;
    return true;
}

bool parse_pin_block(const std::string& json, WFSXDATA* out) {
    if (!out) return false;
    zegen::json::Reader r(json);
    const std::string block = r.get_string("pinBlock");
    // NB: real DLL allocates via WFMAllocateBuffer; the marshaller just
    // populates the length field + placeholder pointer. dllmain owns
    // the allocation lifecycle.
    out->usLength = static_cast<USHORT>(block.size());
    out->lpbData = nullptr;  // dllmain copies `block` into a WFM-allocated buffer
    return true;
}

} // namespace

std::string command_code_for(const std::string& service, uint32_t dw_command) {
    const auto& m = codes();
    auto it = m.find(service + ":" + std::to_string(dw_command));
    if (it == m.end()) return {};
    return it->second;
}

std::string payload_to_json(const std::string& service,
                            uint32_t dw_command,
                            const void* cmd_data) {
    if (service == "IDC") {
        switch (dw_command) {
            case WFS_CMD_IDC_READ_TRACK:   return "{}";  // no payload
            case WFS_CMD_IDC_READ_RAW_DATA:
                return marshal_idc_read_raw_data(
                    static_cast<const WFSIDCREADRAWDATA_REQUEST*>(cmd_data));
            case WFS_CMD_IDC_EJECT_CARD:   return "{}";
            case WFS_CMD_IDC_RETAIN_CARD:  return "{}";
            case WFS_CMD_IDC_CHIP_IO:
            case WFS_CMD_IDC_CHIP_POWER:
                return marshal_idc_chip_io(
                    static_cast<const WFSIDCCHIPIO_REQUEST*>(cmd_data));
            case WFS_CMD_IDC_RESET:        return "{}";
            case WFS_CMD_IDC_RESET_COUNT:  return "{}";
            default: break;
        }
    } else if (service == "PIN") {
        switch (dw_command) {
            case WFS_CMD_PIN_GET_PIN:
            case WFS_CMD_PIN_GET_DATA:
                return marshal_pin_get_pin(
                    static_cast<const WFSPINGETPIN_REQUEST*>(cmd_data));
            case WFS_CMD_PIN_GET_PINBLOCK:
                return marshal_pin_get_pinblock(
                    static_cast<const WFSPINBLOCKREQUEST*>(cmd_data));
            case WFS_CMD_PIN_GET_KEY_DETAIL: return "{}";
            case WFS_CMD_PIN_RESET:          return "{}";
            default: break;
        }
    } else if (service == "CDM") {
        switch (dw_command) {
            case WFS_CMD_CDM_DISPENSE:
                return marshal_cdm_dispense(
                    static_cast<const WFSCDMDISPENSE_REQUEST*>(cmd_data));
            case WFS_CMD_CDM_PRESENT:        return "{}";
            case WFS_CMD_CDM_RETRACT:        return "{}";
            case WFS_CMD_CDM_REJECT:         return "{}";
            case WFS_CMD_CDM_CASH_UNIT_INFO: return "{}";
            case WFS_CMD_CDM_COUNT:          return "{}";
            case WFS_CMD_CDM_RESET:          return "{}";
            default: break;
        }
    } else if (service == "PTR") {
        switch (dw_command) {
            case WFS_CMD_PTR_PRINT_FORM:
                return marshal_ptr_print_form(
                    static_cast<const WFSPTRPRINTFORM_REQUEST*>(cmd_data));
            case WFS_CMD_PTR_RAW_DATA:
                return marshal_ptr_raw_data(
                    static_cast<const WFSPTRRAWDATA_REQUEST*>(cmd_data));
            case WFS_CMD_PTR_CUT_PAPER:      return "{}";
            case WFS_CMD_PTR_RESET:          return "{}";
            default: break;
        }
    }
    // Unknown (service, command) pair — pass through as empty payload so
    // the backend can still log the attempt and return ERR_UNSUPP_COMMAND.
    return "{}";
}

bool response_from_json(const std::string& service,
                        uint32_t dw_command,
                        const std::string& json,
                        void* out_struct) {
    if (!out_struct) return true;  // caller doesn't want typed output
    if (service == "PIN") {
        switch (dw_command) {
            case WFS_CMD_PIN_GET_PIN:
            case WFS_CMD_PIN_GET_DATA:
                return parse_pin_entry(json, static_cast<WFSPINENTRY*>(out_struct));
            case WFS_CMD_PIN_GET_PINBLOCK:
                return parse_pin_block(json, static_cast<WFSXDATA*>(out_struct));
            default: break;
        }
    }
    // Other commands either return no typed data (EJECT_CARD, PRESENT,
    // CUT_PAPER) or return large variable-length arrays (CASH_UNIT_INFO,
    // READ_RAW_DATA) that dllmain.cpp populates directly via
    // WFMAllocateBuffer so the memory can survive past this call.
    return true;
}

} // namespace zegen::wfs
