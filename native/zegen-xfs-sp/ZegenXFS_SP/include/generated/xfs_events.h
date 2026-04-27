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

namespace zegen::xfs::events {

/// XFS event class identifier (per CEN/XFS 3.30 §A.4).
enum class EventClass {
  ServiceEvent,  // SRVE
  UserEvent,     // USRE
  ExecuteEvent,  // EXEE
  SystemEvent,   // SYSE
};

// IDC — Identification Card (card reader). Motor / DIP / contactless.
namespace idc {
constexpr std::string_view MEDIA_INSERTED = "WFS_SRVE_IDC_MEDIAINSERTED";
constexpr EventClass MEDIA_INSERTED_CLASS = EventClass::ServiceEvent;
constexpr std::string_view MEDIA_REMOVED = "WFS_SRVE_IDC_MEDIAREMOVED";
constexpr EventClass MEDIA_REMOVED_CLASS = EventClass::ServiceEvent;
constexpr std::string_view MEDIA_RETAINED = "WFS_SRVE_IDC_MEDIARETAINED";
constexpr EventClass MEDIA_RETAINED_CLASS = EventClass::ServiceEvent;
constexpr std::string_view INVALID_TRACK_DATA = "WFS_EXEE_IDC_INVALIDTRACKDATA";
constexpr EventClass INVALID_TRACK_DATA_CLASS = EventClass::ExecuteEvent;
constexpr std::string_view INVALID_MEDIA = "WFS_EXEE_IDC_INVALIDMEDIA";
constexpr EventClass INVALID_MEDIA_CLASS = EventClass::ExecuteEvent;
}  // namespace idc

// PIN — PIN Pad / Encrypting PIN Pad (EPP). Captures PINs, derives PIN blocks.
namespace pin {
constexpr std::string_view KEY = "WFS_EXEE_PIN_KEY";
constexpr EventClass KEY_CLASS = EventClass::ExecuteEvent;
constexpr std::string_view ENTER_DATA = "WFS_EXEE_PIN_ENTERDATA";
constexpr EventClass ENTER_DATA_CLASS = EventClass::ExecuteEvent;
constexpr std::string_view DATA_READY = "WFS_EXEE_PIN_DATAREADY";
constexpr EventClass DATA_READY_CLASS = EventClass::ExecuteEvent;
}  // namespace pin

// CDM — Cash Dispenser Module. Cassettes, denomination mix, present/retract.
namespace cdm {
constexpr std::string_view CASH_UNIT_THRESHOLD = "WFS_SRVE_CDM_CASHUNITTHRESHOLD";
constexpr EventClass CASH_UNIT_THRESHOLD_CLASS = EventClass::ServiceEvent;
constexpr std::string_view SAFE_DOOR_OPEN = "WFS_SRVE_CDM_SAFEDOOROPEN";
constexpr EventClass SAFE_DOOR_OPEN_CLASS = EventClass::ServiceEvent;
constexpr std::string_view SAFE_DOOR_CLOSED = "WFS_SRVE_CDM_SAFEDOORCLOSED";
constexpr EventClass SAFE_DOOR_CLOSED_CLASS = EventClass::ServiceEvent;
constexpr std::string_view NOTES_PRESENTED = "WFS_EXEE_CDM_NOTESPRESENTED";
constexpr EventClass NOTES_PRESENTED_CLASS = EventClass::ExecuteEvent;
constexpr std::string_view NOTES_TAKEN = "WFS_SRVE_CDM_ITEMSTAKEN";
constexpr EventClass NOTES_TAKEN_CLASS = EventClass::ServiceEvent;
constexpr std::string_view JAM = "WFS_SRVE_CDM_MEDIADETECTED";
constexpr EventClass JAM_CLASS = EventClass::ServiceEvent;
constexpr std::string_view EXCHANGE_STATE_CHANGED = "WFS_SRVE_CDM_EXCHANGESTATECHANGED";
constexpr EventClass EXCHANGE_STATE_CHANGED_CLASS = EventClass::ServiceEvent;
}  // namespace cdm

// PTR — Printer (receipt + journal). Thermal / inkjet / impact.
namespace ptr {
constexpr std::string_view PAPER_THRESHOLD = "WFS_SRVE_PTR_PAPERTHRESHOLD";
constexpr EventClass PAPER_THRESHOLD_CLASS = EventClass::ServiceEvent;
constexpr std::string_view MEDIA_PRESENTED = "WFS_SRVE_PTR_MEDIAPRESENTED";
constexpr EventClass MEDIA_PRESENTED_CLASS = EventClass::ServiceEvent;
constexpr std::string_view MEDIA_TAKEN = "WFS_SRVE_PTR_MEDIATAKEN";
constexpr EventClass MEDIA_TAKEN_CLASS = EventClass::ServiceEvent;
}  // namespace ptr

// SIU — Sensors & Indicators Unit. Cabinet/safe doors, tamper, LEDs, supervisor key.
namespace siu {
constexpr std::string_view PORT_STATUS = "WFS_SRVE_SIU_PORT_STATUS";
constexpr EventClass PORT_STATUS_CLASS = EventClass::ServiceEvent;
constexpr std::string_view CABINET_STATUS = "WFS_USRE_SIU_CABINET_STATUS";
constexpr EventClass CABINET_STATUS_CLASS = EventClass::UserEvent;
constexpr std::string_view SAFE_DOOR = "WFS_USRE_SIU_SAFE_DOOR";
constexpr EventClass SAFE_DOOR_CLASS = EventClass::UserEvent;
constexpr std::string_view TAMPER_SENSOR = "WFS_USRE_SIU_TAMPER_SENSOR";
constexpr EventClass TAMPER_SENSOR_CLASS = EventClass::UserEvent;
constexpr std::string_view OPERATOR_SWITCH = "WFS_USRE_SIU_OPERATOR_SWITCH";
constexpr EventClass OPERATOR_SWITCH_CLASS = EventClass::UserEvent;
}  // namespace siu

}  // namespace zegen::xfs::events
