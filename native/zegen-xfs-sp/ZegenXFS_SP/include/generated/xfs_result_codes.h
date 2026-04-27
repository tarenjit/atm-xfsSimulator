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

namespace zegen::xfs::result_codes {

/// XFS Service Provider return codes. Negative = error.
constexpr std::int32_t SUCCESS = 0;
constexpr std::int32_t ERR_CANCEL = -1;
constexpr std::int32_t ERR_DEV_NOT_READY = -2;
constexpr std::int32_t ERR_HARDWARE_ERROR = -3;
constexpr std::int32_t ERR_INVALID_HSERVICE = -4;
constexpr std::int32_t ERR_INTERNAL_ERROR = -5;
constexpr std::int32_t ERR_TIMEOUT = -6;
constexpr std::int32_t ERR_USER_ERROR = -7;
constexpr std::int32_t ERR_UNSUPP_COMMAND = -8;
constexpr std::int32_t ERR_SERVICE_NOT_FOUND = -9;
constexpr std::int32_t ERR_LOCKED = -10;
constexpr std::int32_t ERR_NOT_STARTED = -11;

}  // namespace zegen::xfs::result_codes
