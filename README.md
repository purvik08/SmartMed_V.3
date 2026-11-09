# SmartMed

> **Internet-Connected Autonomous Medicine Dispensing & Telemedicine Ecosystem**  
> *Featuring a Fully Functional Offline Prototype & Local Validation Testbed*

SmartMed is a next-generation healthcare technology ecosystem designed to bridge the last-mile medicine access gap. It pairs an IoT-enabled smart physical dispensing kiosk with a cloud-connected telemedicine and clinical governance platform. Connected via high-speed cellular IoT (4G/5G) and cloud microservices, SmartMed provides round-the-clock, supervised access to essential over-the-counter (OTC) medicines, verified physician-prescribed drugs, and time-critical emergency treatments.

### Architecture Evolution: Main Product vs. Local Prototype
- **The Main Commercial Product:** Designed as a nationwide, internet-connected healthcare network. Smart physical kiosks connect over 4G/5G cellular IoT and MQTT over TLS to cloud microservices (AWS/GCP), live teleconsultation pools with verified doctors, online UPI/card payment gateways, centralized pharmacy inventory management, optical drop-verification sensors, and national health mission frameworks (ABDM / ABHA).
- **This Repository (Offline Prototype Testbed):** This codebase contains the **fully functional, verified offline-first prototype and simulation testbed**. It runs on a local computer and a private Wi-Fi network or phone hotspot, requiring zero external cloud dependencies, Docker, external databases, SMS costs, or runtime npm packages. It validates the exact mechanical state machine, multi-tier clinical safety rules, two-phase QR authentication, and jam recovery workflows locally before mass IoT hardware deployment.

## Important safety and scope notice

SmartMed is currently implemented here as a **demonstration prototype and testing testbed**, not a certified medical device, pharmacy system, emergency service, payment product, or clinical decision-support system. It must not be used to diagnose, prescribe, dispense, or administer real medicines. Use sealed empty boxes or placebos only during demonstrations.

Its seeded medicine catalogue, prices, dosage text, age limits, allergy tags, and emergency formulary are illustrative. Any commercial deployment will require clinical governance, licensed pharmacy participation, pharmacist and physician review, regulatory approval, validated hardware, security testing, accessibility assessment, real authentication and payment integrations, and local legal compliance.

## Contents

- [Project goals](#project-goals)
- [What is included](#what-is-included)
- [System architecture](#system-architecture)
- [End-to-end workflows](#end-to-end-workflows)
- [Safety, controls, and data handling](#safety-controls-and-data-handling)
- [Applications and social impact](#applications-and-social-impact)
- [Technology stack](#technology-stack)
- [Getting started](#getting-started)
- [Local accounts and scenarios](#local-accounts-and-scenarios)
- [Machine integration contract](#machine-integration-contract)
- [Testing and operational checks](#testing-and-operational-checks)
- [Repository guide](#repository-guide)
- [Current limitations and roadmap](#current-limitations-and-roadmap)

## Project goals

SmartMed demonstrates a controlled last-mile medicine-access model with five goals:

1. **Seamless Healthcare Access** — provide 24/7 access to essential medicines and remote doctor consultations in rural areas, transit hubs, and corporate/academic campuses.
2. **Appropriate Multi-Tier Access** — distinguish routine OTC access from prescription-only and emergency pathways with strict regulatory isolation.
3. **Human Clinical Oversight** — route prescription and emergency decisions through a verified doctor role with automatic 60-second backup clinician escalation.
4. **Traceable Dispensing & Physical Safety** — record the order, payment state, stock lane, dispensing event, refund outcome, and append-only audit event.
5. **Operational & Edge Resilience** — prove that critical safety rules, stock reservation, and jam recovery function reliably on local edge devices even during transient network outages.

## What is included

### Patient Android app

- Any 10-digit mobile number can register on the local server after OTP verification and choose a patient, doctor, or worker role.
- Profile capture for date of birth, allergies, conditions, and current medicines.
- Three access paths: offline Q&A assistance, direct medicine-name search, or a machine-display-assisted order.
- Order-bound payment QR confirmation followed by a separate machine-identity QR for collection.
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

### 1. Main Product Architecture (Internet & Cloud Connected)

```text
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │                              SMARTMED CLOUD PLATFORM                                   │
 │  • Scalable Microservices Architecture (REST / WebSockets) • Distributed Cloud DB      │
 │  • Real-Time Clinical Rules Engine • Telemedicine Gateway • UPI / Card Payment Webhooks│
 │  • Central Fleet & Inventory Management • Trigger-Protected Append-Only Audit Trail    │
 └────────────────────────────▲──────────────────────────────▲───────────────────────────┘
                              │ HTTPS / WSS                  │ MQTT over TLS / Cellular
                              │                              │
 ┌────────────────────────────▼──────────────┐ ┌─────────────▼────────────────────────────┐
 │ MULTI-ROLE MOBILE APP SUITE               │ │ SMARTMED IOT DISPENSING KIOSK            │
 │ • Patient App: AI triage, calls, payments │ │ • Industrial ESP32-S3 IoT Controller     │
 │ • Doctor Portal: Queue, Rx & Pass issuance│ │ • 4G/5G Cellular & Wi-Fi Redundancy      │
 │ • Worker App: Replenishment & diagnostics │ │ • Touch SPI TFT Display & User Camera    │
 └───────────────────────────────────────────┘ │ • Modular 6+ Spiral Lanes & BO Motors   │
                                               │ • Dual IR Break-Beam Drop Verification   │
                                               │ • Thermal & Tamper Monitoring Sensors    │
                                               └──────────────────────────────────────────┘
```

### 2. Local Prototype Testbed Architecture (This Repository)

```text
                         private Wi-Fi / phone hotspot

 ┌────────────────┐        REST API         ┌────────────────────────────┐
 │ Android app    │ ◄─────────────────────► │ SmartMed local server       │
 │ Patient        │                          │ Node.js + built-in SQLite  │
 │ Doctor         │                          │ rules engine + audit trail │
 │ Worker         │                          └──────────────┬─────────────┘
 └────────────────┘                                         │
                                                           HTTP
                                                            │
                                             ┌──────────────▼─────────────┐
                                             │ Machine interface          │
                                             │ 2D simulator / 3D model /  │
                                             │ ESP32 test controller      │
                                             └────────────────────────────┘
```

The server is the source of truth. The Android app is a client interface, while the machine interface executes only a server-issued command for its authenticated machine ID. Eligibility and stock are checked again immediately before dispensing rather than relying on an earlier client-side decision.

### Core records

The local SQLite database stores users and roles, medicine catalogue entries, machines and lanes, QR sessions, orders, payments, dispense events, refunds, support tickets, emergency requests, prescriptions, emergency passes, uploaded documents, reminders, and audit records. The audit table is protected by database triggers that reject updates and deletes, making it append-only within this prototype.

## End-to-end workflows

### 1. Standard OTC purchase

```text
Patient profile → Browse Tier 1 medicine → Select an online machine
→ Create order → Scan order-bound payment QR → Scan machine-identity QR
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

The machine page can simulate a jam. A failed or unconfirmed dispense is handled idempotently: the pending command is closed, reserved stock is returned to its lane, the locally confirmed payment becomes refunded, a refund record is written, and a support ticket is created. This model is designed to make the physical hand-off explicit rather than assuming a paid order was fulfilled.

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
| Payment and collection QR codes | An order-bound payment QR expires after five minutes. A distinct machine-identity QR carries only the machine ID and a single-use 60-second collection token. |
| Machine availability | Machines heartbeat every 15 seconds; a machine is treated as offline after two minutes without a heartbeat. |
| Inventory | Quantity is reserved atomically before a command; expired lanes are excluded; failed dispenses restore stock. |
| Traceability | Orders, payments, commands, dispense events, refunds, tickets, and audit events are persisted locally. |
| Document access | Patient documents are stored locally and may be retrieved only by their owner or an authorised doctor with a relevant case/pass relationship. |

### Security boundaries

This implementation is intentionally suitable only for a controlled local network. It uses HTTP cleartext traffic, a fixed local-development OTP (`123456`), locally persisted bearer tokens, local QR payment confirmation, and per-machine API keys passed in a request header. These are not production authentication, encryption, key management, payment, or privacy controls.

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

### Comparison: Main Commercial Product vs. Prototype Testbed

| Layer / Subsystem | Main Commercial Product (Target) | Prototype Testbed (This Repository) |
|---|---|---|
| **Mobile Application** | Kotlin, Jetpack Compose, Material 3 (Android SDK 24+) with video calling, push notifications, and UPI deep-linking. | Kotlin, Jetpack Compose, Material 3 (Android SDK 24+) with multi-role support (Patient, Doctor, Worker). |
| **QR Code Engine** | ZXing Android Embedded for scanning dynamic single-use session tokens. | ZXing Android Embedded with copy-paste fallback for emulator testing. |
| **Backend & Cloud** | High-availability cloud microservices (Node.js/Go) on AWS/GCP with automated scaling and load balancers. | Node.js 22.13+ using native modules only (`node:http`, `node:crypto`, `node:fs`, `node:path`) on local port `8080`. |
| **Database & Persistence** | Distributed PostgreSQL / Supabase with read-replicas, HIPAA/ABDM compliance, and automated backups. | Node built-in SQLite (`node:sqlite`) in WAL mode with trigger-enforced append-only audit tables. |
| **Machine Telemetry & IoT** | 4G/5G Cellular IoT with **MQTT over TLS** for push commands, telemetry, and heartbeats. | Local REST-style HTTP JSON service (`POST /api/machine`) with machine API keys and 15s heartbeats. |
| **Hardware Controller** | Industrial ESP32-S3 microcontroller, dual optical IR break-beam drop sensors, and load cells. | Connected browser-based 2D machine interface (`/machine/M1`) and interactive 3D Three.js simulation (`/simulation/M1`). |
| **Identity & Payments** | Carrier SMS OTP, Aadhaar/ABHA ID, and integrated UPI payment gateways (Razorpay/PayTM). | Local-development OTP (`123456`) and order-bound QR payment confirmation simulation. |
| **Runtime Model** | Cloud-hosted platform with distributed field kiosks connected via cellular internet. | Laptop/mini-PC local server plus Android devices on the same private Wi-Fi/hotspot. |

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
5. Enter any 10-digit mobile number, use local-development OTP `123456`, then choose a role the first time that number registers on the server.
6. For age-restricted catalogue items, enter date of birth in the patient profile before ordering.

For an emulator, the camera may not be able to scan the QR displayed on the same computer. Copy the payment or machine QR text shown beneath the browser display into the corresponding app screen. Payment and collection QR values are intentionally different.

## Local accounts and scenarios

Any 10-digit number can register with local-development OTP `123456` and select a role. The following seeded accounts remain available for guided multi-device demonstrations.

| Role | Phone number | Purpose |
|---|---:|---|
| Patient | `9000000001` | Primary patient workflow |
| Patient | `9000000002` | Second patient / multi-device demonstrations |
| Doctor | `9000000011` | Standard clinical queue and prescriptions |
| Backup doctor | `9000000012` | Emergency escalation queue after 60 seconds |
| Worker | `9000000021` | Refill and machine administration |

Suggested walkthroughs:

1. **OTC:** Ask the Q&A assistant or search for ORS, add it to the basket, choose an online machine, request the machine payment QR, then scan the distinct machine collection QR and observe the dispense completion.
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
- OTP delivery and QR payment confirmation are local-development implementations; production requires independently verified identity and payment-provider integrations.
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
