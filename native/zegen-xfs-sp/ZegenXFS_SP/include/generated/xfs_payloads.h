// =============================================================================
// GENERATED FILE — DO NOT EDIT.
// Source: spec/xfs-contract.yaml
// Regenerate via: pnpm codegen
// CI fails if this file is out of date with the spec.
//
// Per Architecture_v3.md §4.4 — single source of truth for TS + C++ contracts.
// =============================================================================

#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace zegen::xfs::payloads {

// Phase 8a: skeleton structs only. Phase 9-11 populate member fields
// per docs/Architecture_v3.md §10 + spec/xfs-contract.yaml extensions.

// IDC — Identification Card (card reader). Motor / DIP / contactless.
namespace idc {
struct ReadRawDataPayload {};
struct ReadRawDataResult {};
struct ReadTrackPayload {};
struct ReadTrackResult {};
struct WriteTrackPayload {};
struct WriteTrackResult {};
struct EjectCardPayload {};
struct EjectCardResult {};
struct RetainCardPayload {};
struct RetainCardResult {};
struct ResetCountPayload {};
struct ResetCountResult {};
struct ResetPayload {};
struct ResetResult {};
struct ChipIoPayload {};
struct ChipIoResult {};
struct ChipPowerPayload {};
struct ChipPowerResult {};
struct MediaInsertedEventPayload {};
struct MediaRemovedEventPayload {};
struct MediaRetainedEventPayload {};
struct InvalidTrackDataEventPayload {};
struct InvalidMediaEventPayload {};
}  // namespace idc

// PIN — PIN Pad / Encrypting PIN Pad (EPP). Captures PINs, derives PIN blocks.
namespace pin {
struct GetPinPayload {};
struct GetPinResult {};
struct GetPinblockPayload {};
struct GetPinblockResult {};
struct GetDataPayload {};
struct GetDataResult {};
struct ResetPayload {};
struct ResetResult {};
struct ImportKeyPayload {};
struct ImportKeyResult {};
struct GetKeyDetailPayload {};
struct GetKeyDetailResult {};
struct KeyEventPayload {};
struct EnterDataEventPayload {};
struct DataReadyEventPayload {};
}  // namespace pin

// CDM — Cash Dispenser Module. Cassettes, denomination mix, present/retract.
namespace cdm {
struct DispensePayload {};
struct DispenseResult {};
struct PresentPayload {};
struct PresentResult {};
struct RejectPayload {};
struct RejectResult {};
struct RetractPayload {};
struct RetractResult {};
struct CountPayload {};
struct CountResult {};
struct CashUnitInfoPayload {};
struct CashUnitInfoResult {};
struct StartExchangePayload {};
struct StartExchangeResult {};
struct EndExchangePayload {};
struct EndExchangeResult {};
struct ResetPayload {};
struct ResetResult {};
struct CashUnitThresholdEventPayload {};
struct SafeDoorOpenEventPayload {};
struct SafeDoorClosedEventPayload {};
struct NotesPresentedEventPayload {};
struct NotesTakenEventPayload {};
struct JamEventPayload {};
struct ExchangeStateChangedEventPayload {};
}  // namespace cdm

// PTR — Printer (receipt + journal). Thermal / inkjet / impact.
namespace ptr {
struct PrintFormPayload {};
struct PrintFormResult {};
struct RawDataPayload {};
struct RawDataResult {};
struct CutPaperPayload {};
struct CutPaperResult {};
struct ResetPayload {};
struct ResetResult {};
struct PaperThresholdEventPayload {};
struct MediaPresentedEventPayload {};
struct MediaTakenEventPayload {};
}  // namespace ptr

// SIU — Sensors & Indicators Unit. Cabinet/safe doors, tamper, LEDs, supervisor key.
namespace siu {
struct EnableEventsPayload {};
struct EnableEventsResult {};
struct DisableEventsPayload {};
struct DisableEventsResult {};
struct SetIndicatorPayload {};
struct SetIndicatorResult {};
struct GetSensorStatusPayload {};
struct GetSensorStatusResult {};
struct ResetPayload {};
struct ResetResult {};
struct PortStatusEventPayload {};
struct CabinetStatusEventPayload {};
struct SafeDoorEventPayload {};
struct TamperSensorEventPayload {};
struct OperatorSwitchEventPayload {};
}  // namespace siu

}  // namespace zegen::xfs::payloads
