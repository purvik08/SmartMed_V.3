# SmartMed

> **Offline-first medicine-access prototype for supervised dispensing.**

SmartMed is a local-network prototype that connects an Android application, a clinical review workflow, pharmacy operations, and a medicine-dispensing machine. It explores how essential over-the-counter (OTC), prescription, and time-sensitive emergency medicine workflows could be coordinated where reliable internet access is limited or unavailable.

The project runs on a laptop and a private Wi-Fi network or phone hotspot. It does not require cloud hosting, Docker, an external database, SMS, map services, or installed Node packages at runtime.

## Important safety and scope notice

SmartMed is a **demonstration prototype**, not a medical device, pharmacy system, emergency service, payment product, or clinical decision-support system. It must not be used to diagnose, prescribe, dispense, or administer real medicines. Use sealed empty boxes or placebos only during demonstrations.

Its seeded medicine catalogue, prices, dosage text, age limits, allergy tags, and emergency formulary are illustrative. Any real deployment would require clinical governance, licensed pharmacy participation, pharmacist and physician review, regulatory approval, validated hardware, security testing, accessibility assessment, real authentication and payment integrations, and local legal compliance.

## Contents

- [Project goals](#project-goals)
- [What is included](#what-is-included)
- [System architecture](#system-architecture)
- [End-to-end workflows](#end-to-end-workflows)
- [Safety, controls, and data handling](#safety-controls-and-data-handling)
- [Applications and social impact](#applications-and-social-impact)
- [Technology stack](#technology-stack)
- [Getting started](#getting-started)
- [Demo accounts and scenarios](#demo-accounts-and-scenarios)
- [Machine integration contract](#machine-integration-contract)
- [Testing and operational checks](#testing-and-operational-checks)
- [Repository guide](#repository-guide)
- [Current limitations and roadmap](#current-limitations-and-roadmap)

## Project goals

SmartMed demonstrates a controlled last-mile medicine-access model with five goals:

1. **Local resilience** — keep the essential workflow available over a local network when public internet connectivity is unreliable.
2. **Appropriate access** — distinguish routine OTC access from prescription-only and emergency pathways.
3. **Human clinical oversight** — route prescription and emergency decisions through a verified doctor role in the prototype.
4. **Traceable dispensing** — record the order, payment state, stock lane, dispensing event, refund outcome, and audit event.
5. **Operational readiness** — give a worker role tools to inspect lanes, refill stock with batch/expiry information, and register machines.

## What is included

### Patient Android app

- Offline-local login with a demo OTP.
- Profile capture for date of birth, allergies, conditions, and current medicines.
- Medicine search, tier awareness, basket, machine selection, and mock payment.
- QR-based collection from a selected machine.
- Emergency request creation and live status tracking.
- Emergency-pass application with supporting document upload.
- Use of an approved emergency pass when declared red-flag symptoms match its conditions.

### Doctor Android app

- Availability control and an emergency-case queue.
- Case acceptance, patient-context review, approval or rejection of emergency packs, and follow-up marking.
- Prescription issuance for Tier 2 medicines.
- Review, issuance, rejection, and revocation of patient emergency passes.
- Backup-panel escalation after an unanswered emergency request has waited for 60 seconds.

### Worker Android app

- Machine and lane visibility.
- Lane refills with medicine, quantity, batch, and expiry data.
- New-machine registration with six initial lanes and a generated machine API key.

### Local backend and machine views

- Node.js HTTP API and file-backed SQLite database.
- Built-in 2D dispenser interface and connected 3D cabinet simulation.
- Machine heartbeats, short-lived QR sessions, command polling, dispense-result reporting, and simulated jams.
- Automatic stock restoration, refund record creation, and support-ticket creation when a dispense fails or times out.

## System architecture

```text
                         private Wi-Fi / phone hotspot

 ┌────────────────┐        REST API         ┌────────────────────────────┐
 │ Android app    │ ◄─────────────────────► │ SmartMed local server       │
 │ Patient        │                          │ Node.js + built-in SQLite  │
 │ Doctor         │                          │ rules engine + audit trail  │
 │ Worker         │                          └──────────────┬─────────────┘
 └────────────────┘                                         │
                                                           HTTP
                                                            │
                                             ┌──────────────▼─────────────┐
                                             │ Machine interface           │
                                             │ 2D simulator / 3D model /   │
                                             │ future ESP32-class device   │
                                             └────────────────────────────┘
```

The server is the source of truth. The Android app is a client interface, while the machine interface executes only a server-issued command for its authenticated machine ID. Eligibility and stock are checked again immediately before dispensing rather than relying on an earlier client-side decision.

### Core records

The local SQLite database stores users and roles, medicine catalogue entries, machines and lanes, QR sessions, orders, payments, dispense events, refunds, support tickets, emergency requests, prescriptions, emergency passes, uploaded documents, reminders, and audit records. The audit table is protected by database triggers that reject updates and deletes, making it append-only within this prototype.

## End-to-end workflows

### 1. Standard OTC purchase

```text
Patient profile → Browse Tier 1 medicine → Select an online machine
→ Create order → Mock payment → Scan machine QR → Server validates again
→ Lane command → Sensor/simulator result → Dispensed or refunded
```

Tier 1 medicines are intended for OTC access in the prototype. The server checks the customer profile, age rule, allergy tags, per-order limits, machine availability, lane stock, and expiry before an order is created. It repeats relevant checks at payment and collection time.

### 2. Prescription medicine purchase

```text
Doctor issues Tier 2 e-prescription → Patient selects covered medicine
→ Server verifies prescription, validity, quantities, and one-time use
→ Payment and QR collection → Successful dispense marks prescription used
```

Tier 2 items require a valid, unused prescription belonging to the patient. An order may not combine medicine tiers; prescription medicines remain separate from OTC and emergency orders.

### 3. Live emergency request

```text
Patient requests an emergency pack and describes the situation
→ Doctor queue receives the case → Doctor accepts and decides
→ Patient pays → Patient scans machine QR → Machine dispenses
→ Follow-up reminder is created
```

Tier 3 emergency packs require a live doctor approval or an active emergency pass. A doctor approval is valid for one hour. The prototype limits emergency/pass dispensing to one completed or in-progress order per patient in 24 hours. If no clinician responds within five minutes, the patient is instructed to call emergency services; the app prominently offers 108 and 112 dial actions. This is a workflow demonstration and does not replace emergency care.

### 4. Pre-authorised emergency pass

```text
Patient uploads report/prescription → Applies for pass → Doctor reviews
→ Doctor issues a time-limited, limited-use pass with symptom triggers
→ Patient declares matching red flags → QR collection → Usage is logged
```

A pass may contain only Tier 3 emergency items. It has a doctor-selected validity period (up to 90 days), one or two uses, item quantity limits, and required red-flag symptom keys. Doctors can reject or revoke a pass, and successful use generates patient and clinician follow-up reminders.

### 5. Dispense failure and recovery

```text
Paid order → QR redeemed → Stock reserved → Command sent to machine
→ success report: complete order
→ failure or no report within 60 seconds: restore stock, refund, ticket
```

The machine page can simulate a jam. A failed or unconfirmed dispense is handled idempotently: the pending command is closed, reserved stock is returned to its lane, the mock captured payment becomes refunded, a refund record is written, and a support ticket is created. This model is designed to make the physical hand-off explicit rather than assuming a paid order was fulfilled.

### 6. Inventory operations

```text
Worker signs in → Opens machine/lane → Records refill quantity, batch, expiry
→ Server updates lane → Orders select non-expired stock, earliest expiry first
```

The inventory planner blocks offline machines and selects a lane only when the required quantity is available and the expiry date has not passed. Where multiple suitable lanes exist, it selects the earliest-expiring one first.

## Safety, controls, and data handling

| Control | Prototype behaviour |
|---|---|
| Role separation | Patient, doctor, and worker roles expose separate API paths and app experiences. |
| Profile safeguards | Age and recorded allergy checks are enforced server-side. |
| Medicine tiers | Tier 1 = OTC, Tier 2 = prescription, Tier 3 = emergency. Tiers cannot be mixed in one order. |
| Emergency controls | Live approval or active pass, approval expiry, red-flag match, quantity limits, and a 24-hour limit are checked by the server. |
| QR collection | A QR contains a machine ID and a single-use token that expires after 60 seconds. |
| Machine availability | Machines heartbeat every 15 seconds; a machine is treated as offline after two minutes without a heartbeat. |
| Inventory | Quantity is reserved atomically before a command; expired lanes are excluded; failed dispenses restore stock. |
| Traceability | Orders, payments, commands, dispense events, refunds, tickets, and audit events are persisted locally. |
| Document access | Patient documents are stored locally and may be retrieved only by their owner or an authorised doctor with a relevant case/pass relationship. |

### Security boundaries

This implementation is intentionally suitable only for a controlled demonstration network. It uses HTTP cleartext traffic, a fixed demo OTP (`123456`), locally persisted bearer tokens, mock payment capture, and per-machine API keys passed in a request header. These are not production authentication, encryption, key management, payment, or privacy controls.

For real use, replace these mechanisms with TLS/mTLS, secure device identity and key rotation, an audited identity provider and OTP service, encrypted storage, least-privilege access controls, session expiry/revocation, secure hardware firmware, payment-provider callbacks, monitoring, backups, incident response, and jurisdiction-specific health-data governance.

## Applications and social impact

### Potential applications

- **Transport hubs and highway stops:** improve access to basic supplies during travel, subject to pharmacy and clinical oversight.
- **Rural and low-connectivity settings:** explore local-first workflows that do not depend on continuous public internet access.
- **Hospital peripheries and campuses:** model supervised collection points for approved, prepacked items.
- **Disaster-relief or temporary clinics:** demonstrate a resilient local coordination flow where connectivity is constrained.
- **Healthcare operations training:** simulate the interaction between patient, clinician, inventory worker, and dispenser without handling real medicines.

### Potential positive impact

The model could reduce travel burden for routine access, make stock and expiry information more visible, create a verifiable chain from clinical decision to physical dispensing, and preserve continuity on local networks. The pass workflow also illustrates how a clinician-approved plan could reduce delay for narrowly defined, previously assessed emergency needs.

### Equity, ethical, and safety considerations

Technology must not shift clinical responsibility onto users or create an unsafe substitute for urgent care. A deployment would need inclusive language and accessibility design, transparent consent, clear emergency escalation, affordability review, bias evaluation, pharmacy accountability, robust medicine quality controls, community engagement, and independent clinical and regulatory review. The system should complement—not replace—clinicians, pharmacists, ambulance services, and public health infrastructure.

## Technology stack

| Layer | Implementation |
|---|---|
| Mobile app | Kotlin, Jetpack Compose, Android SDK 24+ |
| QR scanning | ZXing Android Embedded |
| Backend | Node.js 22.13+ using only built-in modules |
| Database | Node built-in SQLite (`node:sqlite`) in WAL mode |
| API | Local REST-style HTTP JSON service on port `8080` |
| Machine demo | Browser-based 2D machine page and Three.js 3D simulation |
| Runtime model | Laptop server plus devices on the same Wi-Fi/hotspot |

## Getting started

### Prerequisites

- Node.js **22.13 or newer** for the local server.
- Android Studio Koala or newer, a physical Android device, or an emulator to run the app.
- A shared Wi-Fi network or phone hotspot for a physical phone and laptop. Internet access is not required after Android dependencies have been downloaded once.

### 1. Start the local server

From the repository root:

```powershell
cd server
node --no-warnings server.mjs
```

On Windows, you can instead double-click [`start-medivend.bat`](./start-medivend.bat). It starts the server when port `8080` is free and opens the M1 3D simulation. On first start, the server creates `server/data/medivend.db` and seeds sample users, machines, lanes, and medicines.

Allow Node.js through the Windows firewall on **Private** networks when prompted so a phone can reach the laptop. The startup output displays usable LAN addresses.

To reset the demonstration data, stop the server and remove the generated `server/data/medivend.db` plus its associated SQLite WAL/SHM files. This deletes all local demo records and uploaded documents.

### 2. Open a machine interface

Keep one machine interface open for the machine you intend to use. It supplies the heartbeat, fresh QR code, command polling, and dispense result.

| Interface | M1 URL |
|---|---|
| 2D machine screen | `http://localhost:8080/machine/M1?key=demo-key-1` |
| Connected 3D simulation | `http://localhost:8080/simulation/M1?key=demo-key-1` |

M2 uses `key=demo-key-2` and M3 uses `key=demo-key-3`. Do not leave the 2D and 3D views open for the same machine simultaneously, because both represent that machine and can poll its command queue.

### 3. Build and run the Android app

1. Open the [`android`](./android) folder in Android Studio.
2. Allow Gradle to sync. The initial dependency download requires internet access; subsequent work can use Gradle Offline mode.
3. Run the app on an emulator or Android device.
4. At login, configure the server address:
   - Android Emulator: `10.0.2.2:8080`
   - Physical phone: the `LAN-IP:8080` address printed by the server, with the phone and laptop on the same local network.
5. Sign in using a demo account and OTP `123456`.
6. For age-restricted catalogue items, enter date of birth in the patient profile before ordering.

For an emulator, the camera may not be able to scan the QR displayed on the same computer. Copy the QR text shown beneath the browser machine QR into the app's collection screen and select **Start dispensing**.

## Demo accounts and scenarios

All demonstration accounts use OTP `123456`.

| Role | Phone number | Purpose |
|---|---:|---|
| Patient | `9000000001` | Primary patient workflow |
| Patient | `9000000002` | Second patient / multi-device demonstrations |
| Doctor | `9000000011` | Standard clinical queue and prescriptions |
| Backup doctor | `9000000012` | Emergency escalation queue after 60 seconds |
| Worker | `9000000021` | Refill and machine administration |

Suggested walkthroughs:

1. **OTC:** Search for ORS, add it to the basket, choose an online machine, use mock payment, scan the machine QR, and observe the dispense completion.
2. **Prescription:** Sign in as the doctor and issue an Amoxicillin prescription to a patient. As that patient, select machine M2, purchase the covered item, and collect it. The prescription becomes one-time used after successful dispensing.
3. **Emergency:** Submit an emergency request from a patient account. On a doctor device, accept and approve it; return to the patient to pay and collect. Use the backup doctor after 60 seconds to demonstrate escalation.
4. **Pass:** Upload a sample document, apply for an emergency pass, issue it from the doctor account, then use the pass from the patient account with a matching declared red flag.
5. **Recovery:** Activate **Simulate jam** on a machine view before collection. The server should restore reserved stock and create refund and support-ticket records after the failed result.
6. **Operations:** Sign in as the worker, update a lane with a batch and expiry date, and register a new machine.

## Machine integration contract

A future hardware controller can use the same endpoint as the browser simulation:

```text
POST /api/machine
Header: x-machine-key: <machine API key>
Body: { "machine_id": "M1", "action": "..." }
```

| Action | Purpose | Key response / request fields |
|---|---|---|
| `heartbeat` | Announce that the machine is reachable. | `{ ok: true }` |
| `session` | Request a fresh collection QR session. | Returns QR text and expiry information. |
| `poll` | Read a pending dispense command for that machine. | Returns `command` with `order_id` and lane/quantity items, when available. |
| `report` | Confirm the physical result of a command. | Include `order_id`, `result: "success" | "fail"`, and an optional `reason`. |

A real controller should poll or use a secured event channel, actuate only the lane/quantity command received for its own authenticated ID, validate its sensors, and report an unambiguous result. It must be engineered with mechanical interlocks, tamper resistance, secure firmware updates, offline-safe retry behavior, inventory reconciliation, and regulated validation; the web simulator does not provide these properties.

## Testing and operational checks

Run the backend smoke suite from the `server` directory:

```powershell
node test/smoke.mjs
```

The suite exercises the primary API workflow, including authentication, order eligibility, machine interaction, and recovery behavior. It uses demonstration data and does not constitute clinical, hardware, penetration, performance, accessibility, or regulatory validation.

Before a demonstration, confirm that:

- the server is running and the intended machine view is open;
- the app points at the correct local server address;
- the selected machine is marked online;
- the patient profile includes a date of birth when needed;
- only one browser machine view is active per machine; and
- the demo uses placebos or empty sealed packages rather than real medicines.

## Repository guide

```text
SmartMed_V.3/
├── android/                         Android Studio project
│   └── app/src/main/java/com/medivend/app/
│       ├── PatientScreens.kt         Patient catalogue, basket, profile, guide
│       ├── DoctorScreens.kt          Clinical queue, passes, prescriptions
│       ├── WorkerScreens.kt          Refills and machine registration
│       ├── EmergencyScreens.kt       Emergency and collection workflows
│       ├── Api.kt                    Local API client and local preferences
│       └── MainActivity.kt           App entry point and navigation root
├── server/
│   ├── server.mjs                    HTTP routes and domain operations
│   ├── rules.mjs                     Eligibility, safety, and stock rules
│   ├── lib.mjs                       SQLite schema, seed data, shared helpers
│   ├── machine.html                  Connected 2D machine simulator
│   ├── 1_3D_Model/                   Connected Three.js machine model
│   └── test/smoke.mjs                Backend smoke checks
├── start-medivend.bat                Windows convenience launcher
└── README.md                         Project documentation
```

Runtime data is generated under `server/data/` and is intentionally excluded from source control. It contains the SQLite database and locally uploaded demonstration documents.

## Current limitations and roadmap

### Known limitations

- The Android app has been compiled, installed, and tested. Keep the Android SDK, JDK, and Gradle versions aligned with the project configuration when rebuilding it on another machine.
- The authentication OTP and payment flow are deliberately mocked.
- Data, uploads, API traffic, and tokens are local-prototype implementations and are not production-secure.
- The 2D/3D machine pages simulate a dispenser; no ESP32 firmware, certified sensors, or production hardware control is included.
- No admin dashboard, multilingual UI, video consultation, notification delivery, or real map/routing service is implemented.
- Reminder rows are recorded but no reminder-delivery service is included.
- The medicine catalogue and clinical rules are demo data only and are not medical advice.

### Recommended next steps

1. Validate the Android build on target devices and add automated mobile tests.
2. Co-design the formulary, escalation rules, and user experience with licensed clinicians, pharmacists, patients, and regulators.
3. Replace demo identity, payments, and cleartext local HTTP with production-grade security and privacy controls.
4. Implement and test a secured hardware controller with sensor reconciliation, interlocks, diagnostics, and remote maintenance processes.
5. Add role administration, inventory reconciliation, audit export, backups, observability, accessibility support, and multilingual content.
6. Conduct threat modelling, clinical safety analysis, usability testing, hardware reliability testing, and formal regulatory review before any real-world trial.

## License and contribution

No license file is currently included. Until a license is added by the project owner, treat the source as **all rights reserved** and request permission before reuse or redistribution.

When contributing, keep safety-critical rules on the server, add tests for changed workflow logic, avoid committing generated `server/data/` files or secrets, and document any change that affects clinical review, medication eligibility, stock accounting, or hardware behavior.
