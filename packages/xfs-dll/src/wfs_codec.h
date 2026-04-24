// wfs_codec.h — WFS command-code mapping + struct↔JSON serialization.
//
// The vendor ATM application calls WFSExecute(hService, dwCommand, lpCmdData, …)
// where dwCommand is a numeric command constant (WFS_CMD_IDC_READ_TRACK = 103,
// etc.) and lpCmdData points to a C struct whose layout depends on the command.
// Our DLL has to:
//   1. Turn dwCommand into the string command-code the backend expects
//      ("WFS_CMD_IDC_READ_TRACK").
//   2. Turn lpCmdData into a JSON payload the backend can parse.
//   3. On the response path, turn the backend's JSON response back into the
//      appropriate result struct the vendor app expects.
//
// This header + wfs_codec.cpp stub out the command-code map and the codec
// entry points. The per-command struct layouts live in CEN/XFS SDK headers
// (xfsidc.h, xfspin.h, xfscdm.h, xfsptr.h) which we can't include here
// (customer-provided). Phase 8c.2 fills in the per-command marshalling.

#pragma once

#include <cstdint>
#include <string>

namespace zegen::wfs {

/**
 * Map a dwCommand constant to the WFS_CMD_* string our backend expects.
 * Returns empty string for unknown commands.
 *
 * Per CEN/XFS 3.30 spec, commands are grouped by service class with
 * disjoint numeric ranges:
 *   IDC: 100–199   PIN: 200–299   CDM: 300–399   PTR: 400–499
 */
std::string command_code_for(const std::string& service, uint32_t dw_command);

/**
 * Serialize a command payload struct to JSON.
 *
 * Given a service class string ("IDC" / "PIN" / "CDM" / "PTR") and a
 * dwCommand, marshals the typed struct at `cmd_data` into JSON.
 * Returns "{}" for commands whose payload is empty or unknown.
 *
 * Phase 8c.2 fills in the per-command marshallers:
 *   WFS_CMD_IDC_READ_TRACK → { tracks: [1, 2] }
 *   WFS_CMD_PIN_GET_PIN    → { minLen, maxLen, autoEnd, activeKeys, … }
 *   WFS_CMD_CDM_DISPENSE   → { amount, currency, mixType, customMix?, present }
 *   WFS_CMD_PTR_PRINT_FORM → { formName, mediaType, cut, fields }
 */
std::string payload_to_json(const std::string& service,
                            uint32_t dw_command,
                            const void* cmd_data);

/**
 * Parse a response JSON and populate the caller's result struct.
 * Returns true on success.
 *
 * The caller owns the memory for the result struct and must pass a
 * pointer of the correct type for the command. Layouts mirror the
 * CEN/XFS SDK WFSRESULT variant type.
 */
bool response_from_json(const std::string& service,
                        uint32_t dw_command,
                        const std::string& json,
                        void* out_struct);

} // namespace zegen::wfs
