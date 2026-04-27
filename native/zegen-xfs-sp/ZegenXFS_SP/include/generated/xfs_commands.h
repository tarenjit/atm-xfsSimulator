// =============================================================================
// GENERATED FILE — DO NOT EDIT.
// Source: spec/xfs-contract.yaml
// Regenerate via: pnpm codegen
// CI fails if this file is out of date with the spec.
//
// Per Architecture_v3.md §4.4 — single source of truth for TS + C++ contracts.
// =============================================================================

#pragma once

#include <string_view>

namespace zegen::xfs::commands {

// IDC — Identification Card (card reader). Motor / DIP / contactless.
namespace idc {
constexpr std::string_view READ_RAW_DATA = "WFS_CMD_IDC_READ_RAW_DATA";
constexpr std::string_view READ_TRACK = "WFS_CMD_IDC_READ_TRACK";
constexpr std::string_view WRITE_TRACK = "WFS_CMD_IDC_WRITE_TRACK";
constexpr std::string_view EJECT_CARD = "WFS_CMD_IDC_EJECT_CARD";
constexpr std::string_view RETAIN_CARD = "WFS_CMD_IDC_RETAIN_CARD";
constexpr std::string_view RESET_COUNT = "WFS_CMD_IDC_RESET_COUNT";
constexpr std::string_view RESET = "WFS_CMD_IDC_RESET";
constexpr std::string_view CHIP_IO = "WFS_CMD_IDC_CHIP_IO";
constexpr std::string_view CHIP_POWER = "WFS_CMD_IDC_CHIP_POWER";
}  // namespace idc

// PIN — PIN Pad / Encrypting PIN Pad (EPP). Captures PINs, derives PIN blocks.
namespace pin {
constexpr std::string_view GET_PIN = "WFS_CMD_PIN_GET_PIN";
constexpr std::string_view GET_PINBLOCK = "WFS_CMD_PIN_GET_PINBLOCK";
constexpr std::string_view GET_DATA = "WFS_CMD_PIN_GET_DATA";
constexpr std::string_view RESET = "WFS_CMD_PIN_RESET";
constexpr std::string_view IMPORT_KEY = "WFS_CMD_PIN_IMPORT_KEY";
constexpr std::string_view GET_KEY_DETAIL = "WFS_CMD_PIN_GET_KEY_DETAIL";
}  // namespace pin

// CDM — Cash Dispenser Module. Cassettes, denomination mix, present/retract.
namespace cdm {
constexpr std::string_view DISPENSE = "WFS_CMD_CDM_DISPENSE";
constexpr std::string_view PRESENT = "WFS_CMD_CDM_PRESENT";
constexpr std::string_view REJECT = "WFS_CMD_CDM_REJECT";
constexpr std::string_view RETRACT = "WFS_CMD_CDM_RETRACT";
constexpr std::string_view COUNT = "WFS_CMD_CDM_COUNT";
constexpr std::string_view CASH_UNIT_INFO = "WFS_CMD_CDM_CASH_UNIT_INFO";
constexpr std::string_view START_EXCHANGE = "WFS_CMD_CDM_START_EXCHANGE";
constexpr std::string_view END_EXCHANGE = "WFS_CMD_CDM_END_EXCHANGE";
constexpr std::string_view RESET = "WFS_CMD_CDM_RESET";
}  // namespace cdm

// PTR — Printer (receipt + journal). Thermal / inkjet / impact.
namespace ptr {
constexpr std::string_view PRINT_FORM = "WFS_CMD_PTR_PRINT_FORM";
constexpr std::string_view RAW_DATA = "WFS_CMD_PTR_RAW_DATA";
constexpr std::string_view CUT_PAPER = "WFS_CMD_PTR_CUT_PAPER";
constexpr std::string_view RESET = "WFS_CMD_PTR_RESET";
}  // namespace ptr

// SIU — Sensors & Indicators Unit. Cabinet/safe doors, tamper, LEDs, supervisor key.
namespace siu {
constexpr std::string_view ENABLE_EVENTS = "WFS_CMD_SIU_ENABLE_EVENTS";
constexpr std::string_view DISABLE_EVENTS = "WFS_CMD_SIU_DISABLE_EVENTS";
constexpr std::string_view SET_INDICATOR = "WFS_CMD_SIU_SET_INDICATOR";
constexpr std::string_view GET_SENSOR_STATUS = "WFS_CMD_SIU_GET_SENSOR_STATUS";
constexpr std::string_view RESET = "WFS_CMD_SIU_RESET";
}  // namespace siu

}  // namespace zegen::xfs::commands
