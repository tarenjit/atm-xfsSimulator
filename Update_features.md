# Update_features.md — ATMirror v2.1 Feature Updates

> **Companion to**: CLAUDE.md v2.0 (the main blueprint)
> **Purpose**: Updates and additions discovered from real ATMirage reference deployment at a Mandiri + Jalin setup
> **Last updated**: 24 April 2026
> **Read this BEFORE implementing Phase 6 (Test Studio) and Phase 8 (C++ DLL Bridge)**

---

## 1. Context

This document captures additional features, architectural details, and UI patterns discovered from observing a real ATMirage deployment used in a Mandiri (Bank Mandiri) + Jalin PoC. The deployment uses:

- **Ghost ATM VM**: Windows 10, Hyosung hardware profile, running Jalin ATM application at IP 10.131.128.18
- **Server**: Windows 11 running ATMirage backend (MySQL + Java + Tomcat)
- **Client access**: Browser (Chrome) on a laptop
- **Real host**: Jalin switch (production banking network)
- **Middleware**: Euronet MVS (multivendor middleware) on the ghost ATM VM

Everything in the original CLAUDE.md still applies. This file adds specifics we learned from seeing the real product in action.

---

## 2. Deployment Topology (Reference Architecture)

```
┌─────────────────────────┐    ┌─────────────────────────┐
│  Laptop                 │    │  JALIN HOST             │
│  Chrome browser         │    │  (Real production       │
│                         │    │   switch — not touched  │
│                         │    │   by simulator)         │
└───────────┬─────────────┘    └───────────▲─────────────┘
            │                              │
            │ HTTP :80, :8080              │ ISO 8583 over TCP
            │ WebRTC :3478                 │
            │                              │
┌───────────▼─────────────┐    ┌───────────┴─────────────┐
│  SERVER (Windows 11)    │    │  VIRTUAL ATM (Win 10)   │
│  - MySQL                │    │  - Bank's ATM App       │
│  - Java + Tomcat        │◄───┤    (Jalin / Mandiri)    │
│  - ATMirage backend     │    │  - Vendor middleware    │
│                         │    │    (Euronet MVS)        │
│  Ports: 80, 8080, 3478  │    │  - Hyosung XFS stack    │
└─────────────────────────┘    │  - Atmirage SP (DLL)    │
                                │                         │
                                │  Hardware profile:      │
                                │  Hyosung ATM            │
                                │  IP: 10.131.128.18      │
                                └─────────────────────────┘
         Ports 8080 + 3478 between Server and Virtual ATM
```

### Mapping to ATMirror

| ATMirage component | ATMirror equivalent | Notes |
|--------------------|---------------------|-------|
| Server (W11 + MySQL + Java + Tomcat) | Backend (Linux or Win + Postgres + NestJS + Next.js) | We use Postgres instead of MySQL, TS instead of Java |
| Laptop (Chrome) | Same — any modern browser | No change |
| Virtual ATM (W10 + Bank App + Middleware + SP DLL) | Same — customer's ghost VM + `ZegenXFS.dll` | No change |
| Port 80 (web UI) | Port 3000 (Next.js) | Can be proxied to :80 in production |
| Port 8080 (API + SP control) | Port 3001 (NestJS API) | |
| Port 3478 (WebRTC STUN) | **NEW — ADD THIS** | For ATM screen streaming back to browser (see Section 5) |
| JALIN HOST | Any real Indonesian switch: Jalin, ATM Bersama, Prima, BI-FAST | Unchanged |

### Critical architectural confirmation

**The simulator does NOT intercept ISO 8583 traffic.** The ghost ATM VM talks to the real banking host directly. Our simulator only replaces the XFS hardware layer — card reader, PIN pad, cash dispenser, printer, etc.

This means:

- The bank's ATM application runs unmodified
- Vendor middleware (Euronet MVS, APTRA, ProTopas) runs unmodified
- ISO 8583 messages go from ghost VM → real Jalin switch → real authorization
- Test transactions **hit the real host** unless the customer points the VM at a test host
- This is the customer's responsibility to configure appropriately

Document this prominently in the deployment guide. **A QA engineer can accidentally generate real transactions if the host URL isn't swapped to a test environment.**

---

## 3. UI Design Reference — The ATM Simulator Widget

Based on the real ATMirage UI, redesign the ATM frontend (`apps/atm-frontend/components/atm/AtmScreen.tsx` and siblings) to match this layout.

### 3.1 Top header bar

Contents (left to right):
- **Product logo + deployment name** (e.g., "ATMirror — Jalin" or "ATMirror — Bank BSI")
- **Action icons**:
  - Settings (gear) — device config
  - Edit (pencil) — enter edit/record mode
  - Display toggle (monitor icon) — show/hide ATM screen overlay
  - Keyboard toggle (keyboard icon) — show/hide virtual PIN pad
- **Session identifier**: `"{ATM name} ({IP}) {Vendor}/{Model}"` — e.g., `"Jalin Atm (10.131.128.18) Hyosung/ATM"`
- **Toggle switches** (right side):
  - Sound on/off
  - Keyboard overlay visible/hidden
  - Light/dark theme
- **Right-most icons**: help (?), user profile, notifications

```typescript
// apps/atm-frontend/components/atm/HeaderBar.tsx
interface HeaderBarProps {
  deploymentName: string;      // "Jalin", "BSI", "BTN"
  atmName: string;              // "Jalin Atm"
  atmIp: string;                // "10.131.128.18"
  vendor: string;               // "Hyosung"
  model: string;                // "ATM"
  soundEnabled: boolean;
  keyboardVisible: boolean;
  darkMode: boolean;
  onSoundToggle: () => void;
  onKeyboardToggle: () => void;
  onThemeToggle: () => void;
}
```

### 3.2 ATM widget layout

The virtual ATM should look like a real ATM front panel. Organized top to bottom:

```
┌────────────────────────────────────────────┐
│  Blue screen area                          │
│  - Bank branding/logo at top               │
│  - Title text                              │
│  - Instruction subtext                     │
│  - 4 left options paired with 4 FDK btns   │
│  - 4 right options paired with 4 FDK btns  │
│                                            │
│  "serquo" watermark (replace with "zegen") │
└────────────────────────────────────────────┘
      [FDK-L1]              [FDK-R1]
      [FDK-L2]              [FDK-R2]
      [FDK-L3]              [FDK-R3]
      [FDK-L4]              [FDK-R4]

┌────────────────────────────────────────────┐
│  Card slot                                 │
│  (with animation for insert/eject)         │
└────────────────────────────────────────────┘

      [ 1 ] [ 2 ] [ 3 ] [ CANCEL ]
      [ 4 ] [ 5 ] [ 6 ] [ CLEAR  ]
      [ 7 ] [ 8 ] [ 9 ] [ ENTER  ]
      [   ] [ 0 ] [ . ] [ HELP   ]

┌────────────────────────────────────────────┐
│  Cash tray                                 │
└────────────────────────────────────────────┘

[Receipt slot] [Camera] [Speaker] [Other]

[Operator keypad 1-0]  [Status LEDs red/yellow/green]
```

### 3.3 FDK (Function Descriptor Key) buttons

Real ATMs have 4 buttons on each side of the screen. These are **not fixed** — the vendor ATM application decides which ones are active at each screen via XFS commands.

Our virtual PIN pad must support dynamic FDK layout:

```typescript
export interface FdkLayout {
  leftButtons: Array<{ fdkCode: string; enabled: boolean; highlighted?: boolean } | null>;
  rightButtons: Array<{ fdkCode: string; enabled: boolean; highlighted?: boolean } | null>;
}

// Standard FDK codes per CEN/XFS spec
export const FDK_CODES = {
  FDK_A: 'FDK01',  // Top-left
  FDK_B: 'FDK02',
  FDK_C: 'FDK03',
  FDK_D: 'FDK04',  // Bottom-left
  FDK_E: 'FDK05',  // Top-right
  FDK_F: 'FDK06',
  FDK_G: 'FDK07',
  FDK_H: 'FDK08',  // Bottom-right
} as const;
```

When the ATM app calls `WFS_CMD_PIN_GET_PIN` with `activeFDKs: ['FDK03', 'FDK04', 'FDK07']`, our virtual keypad must show those three buttons as active (clickable) and others as dimmed.

### 3.4 Screen content rendering

The blue ATM screen renders whatever the vendor app sends via `WFS_CMD_TTU_WRITE_FORM` or `WFS_CMD_UDM_DISPLAY_FORM`. In native mode, the ATMirror app renders its own screens directly. In multivendor mode (ghost ATM VM), the vendor app's screen output is captured and streamed back to our UI (see Section 5).

**Visible language requirement**: All default screens support Bahasa Indonesia (priority) and English. The UI strings shown in the reference (MENU UTAMA, PENARIKAN, UANG ELEKTRONIK, etc.) should be the default Indonesian string set.

---

## 4. Test Studio — Macro-based Test Builder

This is the biggest addition based on the reference. The right panel of the ATMirage UI shows a **macro editor** that's fundamentally different from our previous test model.

### 4.1 Macro concept

A **macro** is a named, reusable sequence of device actions. Each step is typed (categorized by device) and parameterized.

From the reference, visible step types:

```
Card: Select (Mandiri Only Tracks)     — pick which virtual card
Card: Checkpoint (Insert)              — validate state
Card: Insert                           — perform insert
Card: Checkpoint (ReadTracks-1-2-3)    — validate tracks read
Card: Checkpoint (ChipPower-On)        — validate chip powered
PinPad: KeyPressed (@F5)               — press function key
PinPad: KeyPressed (Card.pin (123456)) — enter PIN (variable)
```

Two important patterns here:

**Pattern 1: Action vs Checkpoint**
- Actions (`Card: Insert`, `PinPad: KeyPressed`) — execute a device operation
- Checkpoints (`Card: Checkpoint (Insert)`) — validate the resulting state without doing anything

**Pattern 2: Variable binding**
- `Card.pin (123456)` means "use the PIN attribute of the currently selected card, which happens to be 123456"
- Tests are **card-agnostic**: swap the card, the PIN changes, the test still works

### 4.2 Updated data model

Replace the flat `TestStep` in CLAUDE.md Section 12 with this richer model:

```typescript
// packages/test-engine/src/macro.types.ts

export type MacroStepKind =
  | 'ACTION'       // performs something
  | 'CHECKPOINT'   // validates state, takes no action
  | 'ASSERTION'    // evaluates a condition, fails if false
  | 'WAIT'         // wait for time or event
  | 'VARIABLE'     // set or compute a variable
  | 'CALL_MACRO';  // invoke another macro

export type MacroDevice =
  | 'Card'         // IDC operations
  | 'PinPad'       // PIN operations
  | 'Cash'         // CDM operations
  | 'Receipt'      // PTR operations
  | 'Screen'       // display validation
  | 'Sensor'       // SIU operations
  | 'Chip'         // EMV operations
  | 'System';      // session / app level

export interface MacroStep {
  id: string;
  order: number;
  kind: MacroStepKind;
  device: MacroDevice;
  operation: string;            // e.g., "Insert", "Select", "Checkpoint", "KeyPressed"
  parameters: MacroParameter[];
  enabled: boolean;             // checkbox in UI to skip during run
  notes?: string;
  timeoutMs?: number;
}

export interface MacroParameter {
  name: string;                 // "tracks", "pin", "fdkCode"
  type: 'string' | 'number' | 'boolean' | 'enum' | 'variable' | 'expression';
  value: string;                // literal or variable reference like "Card.pin"
  displayLabel?: string;        // how to show in UI: "Mandiri Only Tracks"
}

export interface Macro {
  id: string;
  name: string;                 // "Login with Mandiri card"
  folder?: string;              // for organization: "Logins/", "Withdrawals/"
  description?: string;
  tags: string[];
  steps: MacroStep[];
  variables: Record<string, unknown>;  // macro-local variables
  profileId?: string;           // which ATM profile to use
  createdAt: Date;
  updatedAt: Date;
}

export interface MacroCheckpointDef {
  device: MacroDevice;
  operation: string;
  expectedState: Record<string, unknown>;
  onFail: 'STOP' | 'WARN' | 'CONTINUE';
}
```

### 4.3 Step catalog — minimum ops to implement in Phase 6

**Card device:**
- `Card: Select(profile)` — pick a virtual card by name or PAN
- `Card: Insert()` — trigger insert event
- `Card: Eject()` / `Card: Retain()` — forced eject or retain
- `Card: Remove()` — user takes card
- `Card: Checkpoint(Insert)` — assert card is in reader
- `Card: Checkpoint(ReadTracks-1-2-3)` — assert tracks were read
- `Card: Checkpoint(ChipPower-On)` — assert chip is powered
- `Card: Checkpoint(Ejected)` — assert card was ejected
- `Card: Checkpoint(Retained)` — assert card was retained

**PinPad device:**
- `PinPad: KeyPressed(@F1...@F12)` — press function key / FDK
- `PinPad: KeyPressed(digit)` — press digit
- `PinPad: KeyPressed(Card.pin)` — enter the selected card's PIN
- `PinPad: KeyPressed(ENTER/CANCEL/CLEAR)` — press control key
- `PinPad: EnterAmount(value)` — shortcut for numeric entry + Enter
- `PinPad: Checkpoint(PinEntered)` — assert PIN was captured

**Cash device (CDM):**
- `Cash: Checkpoint(Dispensed, amount)` — assert specific amount dispensed
- `Cash: Checkpoint(NotesPresented)` — assert cash is in tray
- `Cash: Take()` — user takes the cash
- `Cash: Checkpoint(Retracted)` — assert cash was retracted

**Receipt device (PTR):**
- `Receipt: Checkpoint(Printed)` — assert receipt printed
- `Receipt: Checkpoint(Contains, text)` — assert receipt text contains string
- `Receipt: Take()` — user takes receipt

**Screen device:**
- `Screen: Checkpoint(Contains, text)` — assert screen shows text
- `Screen: Checkpoint(Matches, regex)` — regex match
- `Screen: Checkpoint(ScreenId, name)` — vendor-app-specific screen ID
- `Screen: Capture()` — save screenshot as evidence

**System:**
- `System: Wait(ms)` — pause
- `System: WaitFor(event)` — wait for specific XFS event
- `System: SetVariable(name, value)`
- `System: CallMacro(macroId)` — reusable composition

### 4.4 Macro editor UI (`/studio/macros/[id]/edit`)

Three-panel layout matching the reference:

```
┌──────────────────────┬────────────────────────────────┐
│  ATM Widget (live)   │  Macro Editor                   │
│  - Blue screen       │                                 │
│  - FDK buttons       │  Macros/                        │
│  - PIN pad           │   ├─ Logins/                   │
│  - Card slot         │   │  ├─ Mandiri Card Login     │
│  - Cash tray         │   │  └─ BSI Card Login         │
│                      │   ├─ Withdrawals/              │
│                      │   └─ Edge Cases/               │
│                      │                                 │
│                      │  Current macro:                 │
│                      │  "Login with Mandiri card"      │
│                      │                                 │
│                      │  Steps:                         │
│                      │  ▶ [ ] Card: Select(Mandiri)   │
│                      │  ▶ [ ] Card: Checkpoint(Insert)│
│                      │  ▶ [ ] Card: Insert            │
│                      │  ▶ [ ] Card: Checkpoint(Read..)│
│                      │  ▶ [ ] PinPad: KeyPressed(@F5) │
│                      │  ▶ [ ] PinPad: KeyPressed(Pin) │
│                      │                                 │
│                      │  [Play ▶] [Step ▶|] [Record ●] │
└──────────────────────┴────────────────────────────────┘
```

Required controls:
- **Step toolbar** (top of right panel): new step, delete, duplicate, move up/down, indent, bookmark, debug-break
- **Checkbox per step** — toggle whether step runs
- **Expand arrows** — view step parameters inline
- **Drag handles** — reorder steps
- **Play button (big center)** — run the macro
- **Step-through button** — run one step, pause
- **Record button** — enter record mode; user actions on the ATM widget get captured as steps
- **Folder tree** (left side of right panel) — organize macros hierarchically

### 4.5 Visual design notes

From the reference:
- Step rows show: device icon (colored), step kind badge, operation name (bold), parameters (normal text, parameters in highlighted pill if bound to variables)
- Checkpoint steps have a distinct visual marker (❌ or ✓ icon)
- Parameter variables (like `Card.pin (123456)`) show the variable name + resolved value in a yellow highlight pill
- Keyboard shortcuts: space to toggle a step, delete to remove, arrow keys to navigate

### 4.6 Updated database schema

Add to `prisma/schema.prisma`:

```prisma
model Macro {
  id          String   @id @default(cuid())
  name        String
  folder      String?
  description String?
  tags        String[]
  steps       Json     // MacroStep[]
  variables   Json     // Record<string, unknown>
  profileId   String?
  createdBy   String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  runs        MacroRun[]

  @@index([folder])
  @@index([name])
}

model MacroRun {
  id          String   @id @default(cuid())
  macroId     String
  macro       Macro    @relation(fields: [macroId], references: [id])
  status      String   // RUNNING, PASSED, FAILED, ABORTED
  currentStep Int?
  stepResults Json     // { order, status, duration, error?, evidence? }[]
  evidence    Json?    // { screenshots: [], commandLog: [], receipts: [] }
  startedAt   DateTime
  completedAt DateTime?
  durationMs  Int?

  @@index([macroId])
  @@index([status])
  @@index([startedAt])
}

model MacroSuite {
  id         String   @id @default(cuid())
  name       String   @unique
  macroIds   String[]
  schedule   String?  // cron expression
  profileId  String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

This **supersedes** the older `TestRun` / `TestResult` / `TestSuite` models in the original CLAUDE.md. Rename those tables in a migration, or deprecate them.

---

## 5. Screen Streaming from Ghost ATM VM (NEW)

### 5.1 Why

In multivendor mode, the vendor ATM app (Jalin/Mandiri/BSI app) displays its own screens on the Windows ghost VM. Our web UI needs to **show those screens** to the QA engineer running the test — they can't connect via RDP for every session.

ATMirage uses **WebRTC (port 3478)** for this. A small agent on the ghost VM captures the screen and streams it to the backend, which relays it to the browser.

### 5.2 Architecture

```
Ghost VM (Windows)                      Backend                    Browser
┌────────────────────┐                  ┌──────────┐              ┌──────┐
│ Zegen Screen Agent │◄──── WebRTC ────►│ Relay    │◄──── WS ────►│ ATM  │
│ - DXGI capture     │   (port 9101)    │ Server   │              │ view │
│ - H.264 encode     │                  │          │              │      │
│ - Low bitrate      │                  │          │              │      │
└────────────────────┘                  └──────────┘              └──────┘
```

### 5.3 Implementation approach

**Agent (Windows C++)**:
- Small executable bundled with `ZegenXFS.dll` installer
- Uses Windows **Desktop Duplication API** (DXGI) for low-overhead screen capture
- Encodes to H.264 using Media Foundation
- Streams via WebRTC to the backend
- Low frame rate (5-10 fps) — enough for validation, not gaming

**Backend relay**:
- Uses `@roamhq/wrtc` or `mediasoup` (NestJS-compatible WebRTC libs)
- Relays video stream to connected browsers
- Captures keyframes as screenshots for test evidence

**Browser consumer**:
- WebRTC client in React
- Displays in an inset frame on the ATM widget ("Live ghost ATM screen")
- Can overlay or replace the blue mock screen when in multivendor mode

### 5.4 Phase assignment

This is a **Phase 9 enhancement** (hardening phase), not critical for initial launch. But the DLL installer project in Phase 8 should be structured to **allow adding the agent later as a side-by-side executable**.

Minimum for Phase 8: just screenshot capture triggered on checkpoint (synchronous, one-off), no live streaming. That's enough for test evidence.

Full WebRTC streaming is Phase 9+.

### 5.5 Alternative (simpler) approach

If WebRTC proves too complex:
- Agent takes periodic screenshots (1-2 per second during active test)
- Uploads to backend as JPEG over HTTP
- Backend pushes to browser via WebSocket as base64 frames
- Works well enough for most test cases; no real-time streaming needed

Start here, upgrade to WebRTC only if customers demand smoother playback.

---

## 6. Multivendor Middleware Compatibility Matrix

From the reference, Euronet MVS was used. Based on Indonesian market, these are the middleware products we should plan to support.

### 6.1 Tier 1 — Must work for launch

- **Euronet MVS** (Indonesia: common for outsourced ATM fleets)
- **NCR APTRA Edge / APTRA Activate** (Indonesia: BCA, Mandiri use NCR hardware)
- **Diebold Nixdorf Vynx / ProTopas** (Indonesia: BRI, BNI use DN hardware)

### 6.2 Tier 2 — Should work, test post-launch

- **KAL Kalignite** (regional SEA presence)
- **Hyosung MoniPlus** (Hyosung hardware, common in Indonesia — from the reference)
- **Wincor ProClassic** (older, some legacy banks)

### 6.3 Integration notes per middleware

**Euronet MVS**:
- Uses standard CEN/XFS SPI registration
- Our DLL registers at `HKLM\SOFTWARE\XFS\SERVICE_PROVIDERS\ZegenXFS_*`
- No special Euronet-specific hooks needed
- Known commands heavily used: `WFS_CMD_IDC_READ_TRACK`, `WFS_CMD_PIN_GET_PIN`, `WFS_CMD_CDM_DISPENSE`, `WFS_CMD_PTR_PRINT_FORM`, standard set

**NCR APTRA**:
- Uses both CEN/XFS and NCR-proprietary extensions
- Most commands via standard XFS; some display via NCR-proprietary API (DDC)
- For pure XFS support, works out of the box
- For DDC extensions, future work

**Hyosung**:
- Reference shows `Hyosung/ATM` profile
- Uses standard CEN/XFS
- Specific FDK layout (8 keys around display)
- Card reader is motor-driven DIP

**Compatibility testing checklist**:
- [ ] `WFSStartUp` succeeds
- [ ] `WFSOpen` succeeds for IDC, PIN, CDM, PTR
- [ ] `WFSGetInfo` returns capabilities struct that the middleware accepts
- [ ] Card insert event triggers `WFS_SRVE_IDC_MEDIAINSERTED`
- [ ] `WFS_CMD_IDC_READ_TRACK` returns track data the middleware parses correctly
- [ ] `WFS_CMD_PIN_GET_PIN` can capture PIN and return length
- [ ] `WFS_CMD_PIN_GET_PINBLOCK` returns encrypted block the host accepts
- [ ] `WFS_CMD_CDM_DISPENSE` dispenses the correct mix
- [ ] `WFS_CMD_CDM_PRESENT` + `ITEMSTAKEN` event sequence works
- [ ] `WFS_CMD_PTR_PRINT_FORM` prints receipt template
- [ ] `WFS_CMD_IDC_EJECT_CARD` works
- [ ] Full end-to-end withdrawal completes through the middleware

---

## 7. ATM Profile: Hyosung Reference

Based on the observed deployment, add this ATM profile as a seed:

```typescript
export const HYOSUNG_ATM_PROFILE: AtmProfile = {
  id: 'hyosung-standard',
  name: 'Hyosung Standard ATM',
  vendor: 'HYOSUNG',
  devices: {
    idc: {
      readerType: 'MOTOR',
      emvLevel2: true,
      contactless: true,
      chipProtocols: ['T0', 'T1', 'EMV'],
    },
    pin: {
      type: 'EPP',
      fdkCount: 8,              // 4 left, 4 right
      keyLayout: 'HYOSUNG',     // specific layout
      supportedPinFormats: ['ISO0', 'ISO1', 'ISO3'],
    },
    cdm: {
      cassetteCount: 4,
      cassettes: [
        { unitId: 'CASS1', denomination: 100000, capacity: 2500 },
        { unitId: 'CASS2', denomination: 50000, capacity: 2500 },
        { unitId: 'CASS3', denomination: 20000, capacity: 2500 },
        { unitId: 'REJECT', denomination: 0, capacity: 300 },
      ],
      maxDispensePerTxn: 5000000,  // Rp 5M per transaction
      shutterBehavior: 'AUTO',
    },
    ptr: {
      type: 'THERMAL',
      width: 80,
      canCut: true,
      hasJournal: true,
    },
    siu: {
      sensors: ['CABINET_DOOR', 'SAFE_DOOR', 'TAMPER'],
      indicators: ['POWER', 'READY', 'FAULT', 'SERVICE'],
    },
  },
  theme: {
    screenBackground: '#0039A6',    // Indonesian bank blue
    primaryColor: '#FFFFFF',
    logo: '/profiles/hyosung/logo.png',
    wallpaper: '/profiles/hyosung/wallpaper.jpg',
  },
  language: 'id',
};
```

Add similar profiles for **NCR Personas** and **Diebold Opteva** as seeds. Bank branding (Mandiri blue, BSI green, BTN orange) lives in separate theme overrides on top of the hardware profile.

---

## 8. Bank Branding System

From the reference, the ATM screen showed "mandiri" branding with specific colors. Branding should be separate from hardware profile.

### 8.1 Data model

```prisma
model BankTheme {
  id              String   @id @default(cuid())
  name            String   @unique    // "Bank Mandiri", "Bank BSI", "BTN"
  logoUrl         String
  primaryColor    String              // hex
  secondaryColor  String
  accentColor     String
  fontFamily      String?             // custom font
  screenLayouts   Json                // screen templates with placeholders
  receiptTemplate String              // Handlebars template
  defaultLanguage String   @default("id")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

### 8.2 Pre-seeded Indonesian bank themes

Seed data for major Indonesian banks:

- Bank Mandiri (blue #003D79)
- Bank BSI / Bank Syariah Indonesia (teal #00754A)
- Bank BTN (orange #F47920)
- Bank BNI (orange #006B3F)
- Bank BRI (blue #00529C)
- Bank BCA (blue #0066CC)
- Bank DKI (red #C8102E)
- Bank Jatim (red + yellow, #E31E24)

Each theme ships with:
- Logo (place in `public/themes/{bank}/logo.png`)
- Receipt template in Bahasa Indonesia
- Standard screen layouts matching their production ATM UI style
- Idle screen wallpaper

### 8.3 Usage

```typescript
// User selects bank theme in operator console
await setActiveTheme('bank-mandiri');

// Virtual ATM re-renders with Mandiri branding
// Receipt templates use Mandiri logo and format
// Idle screen shows Mandiri welcome
```

This is mostly a marketing/demo feature for sales pitches to each bank. "Here's your own ATM running in simulation."

---

## 9. Macro Recording Mode (Implementation Detail)

From the reference, the red circle ● button next to the play button suggests a record-then-replay workflow. Here's how to implement it.

### 9.1 Recording session

```typescript
@Injectable()
export class MacroRecorderService {
  private recordingMacroId: string | null = null;
  private recordedSteps: MacroStep[] = [];
  private stepCounter = 0;

  startRecording(macroId: string) {
    this.recordingMacroId = macroId;
    this.recordedSteps = [];
    this.stepCounter = 0;
    this.logger.log(`Started recording macro ${macroId}`);
  }

  @OnEvent('atm.userAction')
  onUserAction(action: UserAction) {
    if (!this.recordingMacroId) return;

    const step = this.convertActionToStep(action);
    if (step) {
      step.order = this.stepCounter++;
      this.recordedSteps.push(step);
    }
  }

  @OnEvent('xfs.event')
  onXfsEvent(event: XfsEvent) {
    if (!this.recordingMacroId) return;

    // Auto-insert checkpoints for significant events
    const checkpoint = this.eventToCheckpoint(event);
    if (checkpoint) {
      checkpoint.order = this.stepCounter++;
      this.recordedSteps.push(checkpoint);
    }
  }

  async stopRecording(): Promise<Macro> {
    const macro = await this.prisma.macro.update({
      where: { id: this.recordingMacroId! },
      data: { steps: this.recordedSteps as never },
    });
    this.recordingMacroId = null;
    return macro;
  }

  private convertActionToStep(action: UserAction): MacroStep | null {
    switch (action.kind) {
      case 'CARD_INSERT':
        return {
          id: randomUUID(),
          order: 0,
          kind: 'ACTION',
          device: 'Card',
          operation: 'Insert',
          parameters: [{ name: 'cardId', type: 'variable', value: action.cardId, displayLabel: action.cardName }],
          enabled: true,
        };
      case 'KEY_PRESS':
        return {
          id: randomUUID(),
          order: 0,
          kind: 'ACTION',
          device: 'PinPad',
          operation: 'KeyPressed',
          parameters: [{ name: 'key', type: 'string', value: action.key }],
          enabled: true,
        };
      // ... other action types
    }
    return null;
  }

  private eventToCheckpoint(event: XfsEvent): MacroStep | null {
    const checkpointMap: Record<string, { device: MacroDevice; op: string }> = {
      'WFS_SRVE_IDC_MEDIAINSERTED': { device: 'Card', op: 'Checkpoint(Insert)' },
      'WFS_SRVE_IDC_MEDIAREMOVED':  { device: 'Card', op: 'Checkpoint(Ejected)' },
      'WFS_SRVE_IDC_MEDIARETAINED': { device: 'Card', op: 'Checkpoint(Retained)' },
      'WFS_EXEE_CDM_NOTESPRESENTED':{ device: 'Cash', op: 'Checkpoint(NotesPresented)' },
      'WFS_SRVE_CDM_ITEMSTAKEN':    { device: 'Cash', op: 'Checkpoint(Taken)' },
      'WFS_SRVE_PTR_MEDIAPRESENTED':{ device: 'Receipt', op: 'Checkpoint(Printed)' },
    };

    const mapped = checkpointMap[event.eventCode];
    if (!mapped) return null;

    return {
      id: randomUUID(),
      order: 0,
      kind: 'CHECKPOINT',
      device: mapped.device,
      operation: mapped.op,
      parameters: [],
      enabled: true,
    };
  }
}
```

### 9.2 Record mode UI behavior

When red ● is pressed:
- Button turns solid red, pulsing
- Status bar shows "RECORDING"
- Every user click/keypress on the virtual ATM appends a step
- Every significant XFS event appends a checkpoint
- Steps appear live in the right panel
- Press ● again to stop; macro is saved

When Play ▶ is pressed on a saved macro:
- Steps execute in order
- Checkpoints validate
- Failed checkpoints highlight in red with evidence
- Passed checkpoints show green
- Can step through one at a time (||▶ button)

---

## 10. Updated Build Phases

Override the phase plan in CLAUDE.md v2.0 Section 18 with this revision:

### Phase 1 — Foundation (Week 1)
Unchanged from v2.0

### Phase 2 — Core XFS Devices (Week 2)
Unchanged from v2.0

### Phase 3 — ATM Application + Host (Week 3)
Unchanged from v2.0

### Phase 4 — Frontend ATM Screen (Week 4) — REVISED
- Build ATM widget matching ATMirage reference layout (Section 3 of this doc)
- Header bar with deployment info
- Blue screen area with FDK buttons (4 left + 4 right)
- PIN pad below
- Card slot, cash tray, receipt slot
- Operator controls panel at bottom
- Bank theme system (Section 8)
- Pre-seed Indonesian bank themes (Mandiri, BSI, BTN as launch set)

### Phase 5 — Operator Console (Week 5)
Unchanged from v2.0

### Phase 6 — Test Studio with Macros (Week 6-8) — MAJOR REVISION
- **3 weeks instead of 2** — this is the differentiator feature
- Implement Macro data model (Section 4 of this doc)
- Macro editor UI (3-panel layout)
- Macro recorder service
- Macro runner service with checkpoint validation
- Variable binding system (`Card.pin`, etc.)
- Folder organization
- Suite scheduling (BullMQ cron)
- Evidence capture on failures (screenshots, command log, receipts)
- PDF report generation

### Phase 7 — EMV L2 + Multi-language + Polish (Week 9)
- EMV L2 simulator package (as v2.0)
- Full Bahasa Indonesia + English screen coverage
- ISO 8583 encoding package
- Bug fixes
- Hyosung ATM profile + NCR + Diebold profiles (Section 7 of this doc)

### Phase 8 — C++ SPI DLL Bridge (Week 10-12) — EXTENDED
- **3 weeks instead of 3** — no change in duration, but expanded scope
- Core DLL: `WFPOpen`, `WFPClose`, `WFPExecute`, `WFPGetInfo` for IDC, PIN, CDM, PTR
- Extend to TTU/UDM for screen rendering (critical for vendor app UI passthrough)
- Key management commands for vendor crypto setup
- Dynamic FDK layout support
- TCP client with auto-reconnect
- WiX installer
- Screenshot capture on checkpoint (no WebRTC yet)
- Euronet MVS compatibility testing
- Hyosung middleware compatibility testing
- Integration playbook doc (for onboarding customer ghost VMs)

### Phase 9 — Hardening + Appliance Packaging (Week 13-14) — NEW
- OVA build pipeline using Packer + Ubuntu cloud-init
- Systemd services for all ATMirror components
- Nginx reverse proxy config
- First-boot configuration wizard
- Multi-hypervisor support (VMware OVA, Hyper-V VHDX, VirtualBox OVA)
- Load test: 50 sessions + 5 bridge clients
- Security review
- WebRTC screen streaming from ghost VM (upgrade from screenshots)
- Customer docs, video tutorials
- Commercial launch package

Total project: **14 weeks** (was 12 weeks in v2.0). Extended by 2 weeks for revised Test Studio scope and VM appliance packaging.

---

## 11. Integration Playbook — Customer Ghost VM Onboarding

New section for the sales + integration team, not Claude Code to build. But Claude Code should ensure the product supports this flow.

### 11.1 Pre-engagement checklist

Before starting a PoC with a customer like Bank Mandiri or a Jalin member bank:

- [ ] Customer provides **cloned** ghost ATM VM (not production)
- [ ] Clarify: which vendor middleware? (Euronet MVS, APTRA, ProTopas, Kalignite, MoniPlus)
- [ ] Clarify: which hardware profile? (NCR, DN, Wincor, Hyosung, Hitachi)
- [ ] Clarify: which banking host? (Jalin / ATM Bersama / Prima / direct)
- [ ] Verify test host available (NOT production switch) for transaction testing
- [ ] Customer IT provides: admin access to ghost VM, network rules for ATMirror backend
- [ ] Confirm vendor middleware licensing is for development/test use

### 11.2 Installation steps (in ghost VM)

1. Install `ZegenXFS.dll` to `C:\Program Files\Zegen\ATMirror\ZegenXFS.dll`
2. Apply registry changes from `register-spi.reg` — note: this replaces existing hardware SPI registrations
3. Configure `ZegenXFS.ini` or registry with backend IP, port, auth token
4. (Optional Phase 9+) Install Zegen Screen Agent for live streaming
5. Restart Windows XFS service (or reboot VM)
6. Start vendor ATM app
7. Validate via operator console: services appear in XFS Manager view
8. Run smoke test macro: insert card → PIN → cancel → eject

### 11.3 Rollback steps

If something breaks:
1. Import the pre-change registry backup (always take one first!)
2. Uninstall `ZegenXFS.dll`
3. Restore original hardware SPI DLLs to registry

### 11.4 Common issues checklist

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Vendor app shows "device not ready" on startup | `WFSOpen` failing — backend unreachable | Check network, firewall, backend running |
| `WFS_ERR_UNSUPP_COMMAND` returned | DLL doesn't implement command | Log it, add implementation, iterate |
| Card insert event not received by vendor app | Event delivery not wired to host window | Fix `WFMPostMessage` routing |
| PIN block rejected by host | Wrong key or PIN block format | Check `TPK` key matches host config |
| Cash dispense amount mismatch | Denomination mix different from expected | Use CUSTOM mix type matching vendor's expectations |
| Vendor app crashes on `WFSGetInfo` | Returned struct layout doesn't match spec | Debug with XFS trace tools; verify struct padding |
| Slow response on commands | Network latency too high | Move backend closer to ghost VM (same hypervisor) |

---

## 12. What Remains Unchanged

Everything NOT mentioned in this update file stays as documented in CLAUDE.md v2.0:

- Monorepo structure
- Tech stack (NestJS + Next.js + Postgres + Redis + pnpm + Turborepo)
- No Docker — native installs for Postgres + Redis
- XFS core types and command codes
- Virtual device service architecture (VirtualDeviceBase pattern)
- Error injection API
- Host emulator (for native mode)
- ISO 8583 package
- EMV L2 package
- TCP bridge protocol (ZXFS framing)
- Most REST API endpoints
- Coding standards
- Claude Code working instructions

---

## 13. Claude Code Reading Order

When starting this project, Claude Code should:

1. **First read**: `CLAUDE.md` v2.0 (the main blueprint)
2. **Then read**: `Update_features.md` (this file)
3. **Apply both**: Updates in this file OVERRIDE any conflicts with v2.0

Conflicts to resolve:
- Test studio model: use Section 4 of THIS file, not CLAUDE.md Section 12
- Phase plan: use Section 10 of THIS file, not CLAUDE.md Section 18
- Frontend ATM widget layout: use Section 3 of THIS file as visual reference
- Database schema: add Macro/MacroRun/MacroSuite/BankTheme models; deprecate older TestRun tables

Do NOT implement screen streaming (Section 5 full WebRTC) in Phase 8; defer to Phase 9.

---

## 14. Reference Images

Screenshots observed during this planning session:

1. **Deployment architecture diagram** — shows 3-VM topology: Server (W11), Laptop, Virtual ATM (W10), plus external Jalin Host. Ports 80, 8080, 3478 between components.

2. **ATMirage main UI screenshot** — shows the working simulator with:
   - Hyosung ATM profile
   - Mandiri bank theme (blue screen)
   - Bahasa Indonesia menu (MENU UTAMA, PENARIKAN, UANG ELEKTRONIK)
   - Standard Hyosung FDK layout (4 left + 4 right)
   - Numeric PIN pad with CANCEL/CLEAR/ENTER/HELP
   - Macro editor on right with Card/PinPad steps
   - Variable binding (`Card.pin (123456)`)
   - Checkpoint vs Action step distinction

Store these references in `docs/reference/` in the project for design review.

---

**Document version**: 2.1 (companion to CLAUDE.md v2.0)
**Last updated**: 24 April 2026
**Maintainer**: Mr. Bajwa (PT Zegen Solusi Mandiri)
**Summary of changes from v2.0**:
- Real deployment topology documented (Server + Laptop + Ghost VM + Real Host)
- ATM widget UI redesigned to match ATMirage reference
- Dynamic FDK layout (8 buttons) supported
- Test model restructured around **Macros** (actions + checkpoints + variable binding)
- Macro recorder feature added
- Screen streaming concept introduced (deferred to Phase 9)
- Hyosung + NCR + Diebold hardware profiles added
- Bank theme system (Mandiri, BSI, BTN, BNI, BRI, BCA, DKI, Jatim)
- Integration playbook for customer ghost VM onboarding
- Extended project timeline to 14 weeks
