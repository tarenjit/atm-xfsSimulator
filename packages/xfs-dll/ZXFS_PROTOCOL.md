# ZXFS TCP Bridge Protocol

> **Purpose:** transport between the Windows DLL (`ZegenXFS.dll`) on a
> customer's ghost ATM VM and the ATMirror `xfs-server` running on the
> shared backend host.
>
> **Status:** Phase 8c skeleton — the protocol is frozen, implementations
> are stubs on both ends. Full WFP* coverage lands in Phase 8c.1.

---

## 1. Transport

- TCP, port **9101** (configurable via `ZXFS_BRIDGE_PORT`).
- Length-prefixed JSON frames, little-endian:

  ```
  ┌─────────────┬──────────────────────────┐
  │ 4-byte LE   │  JSON body (UTF-8)       │
  │ body length │  … up to 1 MiB           │
  └─────────────┴──────────────────────────┘
  ```

- No TLS in the initial release. Deploy in a private subnet between
  backend host and ghost ATM VM; route over a VPN/IPSec tunnel for
  anything leaving the customer datacenter.
- Connection is **persistent**. DLL reconnects with exponential backoff
  on drop (start 500ms, cap 10s).

---

## 2. Frame envelope

Every frame (client→server and server→client) carries:

```json
{
  "type": "request" | "response" | "event" | "ping" | "pong",
  "id":   "string",              // correlation id; mirror on response
  "ts":   "2026-04-24T16:00:00.000Z"
}
```

Plus type-specific fields below.

---

## 3. Client → server

### 3.1 Request — `type: "request"`

Issued by the DLL when the vendor middleware (Euronet MVS, APTRA, etc.)
calls `WFSOpen` / `WFSExecute` / `WFSGetInfo` / `WFSClose` through the
Windows XFS Manager.

```json
{
  "type":    "request",
  "id":      "REQ_ABC123",
  "ts":      "…",
  "op":      "WFPOpen" | "WFPClose" | "WFPExecute" | "WFPGetInfo",
  "service": "IDC" | "PIN" | "CDM" | "PTR",
  "hService": "IDC30",             // populated after WFPOpen
  "commandCode": "WFS_CMD_IDC_READ_TRACK",  // WFPExecute only
  "payload":  { … }                // command-specific
}
```

### 3.2 Ping — `type: "ping"`

Every 10s while idle. Server must `pong` within 5s or the DLL will
reconnect.

---

## 4. Server → client

### 4.1 Response — `type: "response"`

```json
{
  "type":        "response",
  "id":          "REQ_ABC123",   // mirror client's id
  "ts":          "…",
  "result":      0,              // XfsResult — 0 = success, negative = error
  "payload":     { … } | null,   // matches the op's return type
  "errorDetail": "…"             // present when result !== 0
}
```

### 4.2 Event — `type: "event"`

Async device event (card inserted, notes taken, paper low, …).

```json
{
  "type":        "event",
  "id":          "evt_nanoid",
  "ts":          "…",
  "service":     "IDC",
  "hService":    "IDC30",
  "eventCode":   "WFS_SRVE_IDC_MEDIAINSERTED",
  "eventClass":  "SRVE" | "USRE" | "EXEE" | "SYSE",
  "payload":     { … }
}
```

The DLL translates events into `WFMPostMessage` calls targeting the
vendor app's HWND.

### 4.3 Pong — `type: "pong"`

Response to `ping`. `id` mirrors.

---

## 5. Lifecycle

```
 DLL                                    xfs-server (ZxfsBridgeService)
  │                                          │
  │   TCP connect :9101                      │
  │─────────────────────────────────────────▶│
  │                                          │
  │   request: WFPOpen service=IDC           │
  │─────────────────────────────────────────▶│
  │                                          │
  │   response: result=0 hService=IDC30      │
  │◀─────────────────────────────────────────│
  │                                          │
  │   event: WFS_SRVE_IDC_MEDIAINSERTED      │
  │◀─────────────────────────────────────────│
  │                                          │
  │   request: WFPExecute READ_TRACK         │
  │─────────────────────────────────────────▶│
  │                                          │
  │   response: { pan, track1, track2 }      │
  │◀─────────────────────────────────────────│
```

---

## 6. Error codes

Mirror `XfsResult`:

| Value | Name                    |
| ----- | ----------------------- |
|   0   | SUCCESS                 |
|  -1   | ERR_CANCEL              |
|  -2   | ERR_DEV_NOT_READY       |
|  -3   | ERR_HARDWARE_ERROR      |
|  -4   | ERR_INVALID_HSERVICE    |
|  -5   | ERR_INTERNAL_ERROR      |
|  -6   | ERR_TIMEOUT             |
|  -7   | ERR_USER_ERROR          |
|  -8   | ERR_UNSUPP_COMMAND      |
|  -9   | ERR_SERVICE_NOT_FOUND   |
|  -10  | ERR_LOCKED              |
|  -11  | ERR_NOT_STARTED         |

---

## 7. Security posture (launch)

- No auth in v1. Network isolation is the security boundary.
- Bridge is bound to `0.0.0.0:9101` by default — **change this in
  production deployments.** Set `ZXFS_BRIDGE_HOST=10.x.y.z` to bind to a
  private VLAN interface.
- Full MTLS lands in Phase 9 (hardening).

---

## 8. References

- CEN/XFS 3.30 specification (WOSA/XFS Service Provider Interface)
- CLAUDE.md §4 (XFS core types — these are the payload contracts)
- Update_features.md §10 Phase 8 (DLL scope)
- Update_features.md §11 (integration playbook)
