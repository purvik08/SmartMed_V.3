# SmartMed — Presentation & Project Content

---

## Slide 1 — TITLE, PROBLEM STATEMENT & TEAM DETAILS

### Project Title
**SmartMed (SmartMed Dispatch / MediVend)**  
*Internet-Connected Autonomous Medicine Dispensing & Telemedicine Ecosystem*

### Problem Statement & Theme
- **Theme:** Healthcare & Biomedical Devices / MedTech / IoT & Smart Automation
- **Problem Statement:** Millions of citizens in rural communities, transit hubs, and semi-urban areas lack 24/7 access to licensed pharmacies and timely medical consultations. This results in delayed emergency treatment, unsafe self-medication, and over-reliance on congested hospital emergency rooms.

### Solution Vision
SmartMed is a cloud-connected, IoT-enabled automated medicine dispensing station combined with an integrated telemedicine platform. It delivers round-the-clock, legally governed access to over-the-counter (OTC) medicines, verified doctor-prescribed drugs, and life-saving emergency packs.

> **Implementation Status Note:**  
> While the commercial product is an **internet-connected cloud and IoT ecosystem**, a **fully functional offline prototype** has already been engineered and verified (featuring an Android mobile app, local rules engine, and interactive 3D digital twin) to prove core dispensing mechanics, safety algorithms, and fail-safe recovery.

### Team Information
- **Team Name:** *(To be filled by team)*
- **Team Leader:** *(To be filled by team)*
- **Team Members:** *(To be filled by team)*
- **Institute / Organization:** *(To be filled by team)*

---

## Slide 2 — IDEA TITLE & PROPOSED SOLUTION

### Idea Title
**SmartMed (SmartMed Dispatch / MediVend)**  
*Next-Generation IoT Medicine Dispensing Kiosk with Cloud Teleconsultation & Multi-Tier Clinical Governance*

---

### Proposed Solution
SmartMed is an end-to-end healthcare distribution system that unites a **smart physical dispensing kiosk** with a **cloud telemedicine and clinical verification platform**. 

Connected via high-speed cellular IoT (4G/5G) and cloud services, SmartMed allows patients to consult licensed physicians remotely, receive validated digital prescriptions, and immediately collect medications from an automated dispensing kiosk. The system guarantees patient safety through an automated clinical rules engine that prevents contraindications, enforces age checks, verifies allergies, and maintains an unalterable audit trail.

---

### The Four Operational Pathways of the Main Product

#### 1. Tier 1: AI-Assisted OTC Pathway (Over-The-Counter)
- **Intelligent Triage & Guided Search:** Patients interact with an AI triage assistant on the mobile app or kiosk touch interface to assess common, mild symptoms.
- **Automated Clinical Safety Check:** The cloud backend cross-references the selected medication against the patient's verified health profile—validating age restrictions (DOB) and flagging potential allergic reactions against ingredient databases.
- **Strict Dosage & Quantity Guardrails:** Maximum purchase limits per transaction prevent hoarding and abuse.
- **Red-Flag Escalation:** High-risk symptom indicators immediately halt OTC purchase and redirect the patient to live teleconsultation or emergency hotlines.

#### 2. Tier 2: Doctor-Authorized Prescription Pathway (Rx)
- **Live Remote Teleconsultation:** Patients connect with licensed physicians via integrated video/audio calls.
- **Digital E-Prescription Issuance:** Doctors issue cryptographically signed e-prescriptions conforming to national telemedicine guidelines, specifying exact quantities and validity periods.
- **Single-Use Cloud Tokenization:** Each prescription generates a unique, expiring, single-use token tied to the patient's identity. Once dispensed, the token is permanently invalidated in the central cloud database to prevent duplicate redemptions.
- **Tier Isolation:** Prescription orders remain strictly isolated from OTC items for uncompromising regulatory compliance.

#### 3. Tier 3: Emergency Response & Pre-Authorized Emergency Pass Pathway
- **24/7 Cloud Emergency Triage:**
  - In critical situations, patients initiate an urgent emergency request with automated symptom triage notes.
  - The case routes instantly to an active nationwide cloud doctor queue with a 1-hour approval window.
  - **Automated Backup Escalation:** If unanswered within 60 seconds, the request auto-escalates to an on-duty emergency backup clinician pool.
  - **Emergency Services Hand-off:** If unfulfilled within 5 minutes, the app automatically coordinates direct emergency calling (108 / 112) and provides GPS navigation to the nearest hospital.
  - Strict 24-hour rate limit per patient prevents misuse of controlled emergency formulations.
- **Pre-Authorized Emergency Pass:**
  - Designed for patients with diagnosed chronic/acute conditions (asthma flare-ups, severe anaphylaxis, diabetic hypoglycemia, angina).
  - Patients upload clinical records reviewed by a doctor, who issues a digital multi-day pass (up to 90 days, 1–2 uses) tied to specific red-flag symptom triggers.
  - In an acute episode, patients confirm matching symptoms to unlock immediate emergency medication at any SmartMed kiosk nationwide without waiting for teleconsultation latency.
  - Automatically triggers post-dispense check-in reminders for both patient and physician.

#### 4. Centralized Supply Chain & Field Operations Pathway (Worker Role)
- **Real-Time Cloud Telemetry:** Cloud dashboard monitors stock levels, temperature sensors, door status, and lane health across the nationwide kiosk fleet.
- **Traceable Replenishment:** Field personnel use a dedicated worker app to scan and log batch numbers, manufacturing details, and expiration dates during refills.
- **First-Expired-First-Out (FEFO) Dispatch:** The cloud engine routes dispensing commands exclusively to the earliest-expiring non-expired batch, automatically locking out expired lanes.
- **Automated Restock Logistics:** Connected pharmacy partners receive automated replenishment alerts when kiosk stock drops below safety thresholds.

---

### Innovation and Uniqueness

- **Integrated Telemedicine + Physical Fulfillment:** Closes the loop between virtual teleconsultations and instant, physical medication dispensing in minutes.
- **Multi-Tier Risk Governance:** Distinguishes between routine OTC (Tier 1), regulated prescription (Tier 2), and acute emergency (Tier 3) pathways with strict isolation.
- **Decoupled Two-Phase Handshake:** Uses a 5-minute order payment QR code followed by a dynamic, 60-second machine collection session token to eliminate fraud and QR interception.
- **Fail-Safe Physical Hand-Off:** Dispense commands reserve stock atomically; physical jams or timeout lapses trigger automatic stock rollback, instant payment refund webhooks, and technician dispatch tickets.
- **Tamper-Proof Audit Trail:** Append-only transaction logging provides an unalterable chain-of-custody for every pill dispensed, meeting rigorous healthcare compliance.
- **Proven Mechanical Reliability:** The core dispensing mechanics, safety algorithms, and recovery logic have been validated through a functional working prototype.

---

## Slide 3 — TECHNICAL APPROACH

### System Architecture of the Main Product

```text
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │                              SMARTMED CLOUD PLATFORM                                   │
 │  • Microservices Architecture (REST / WebSockets) • Scalable Relational Cloud DB       │
 │  • Real-Time Clinical Rules Engine • Telemedicine Gateway • UPI / Card Payment Webhooks│
 │  • Central Fleet & Inventory Management • Trigger-Protected Append-Only Audit Trail    │
 └────────────────────────────▲──────────────────────────────▲───────────────────────────┘
                              │ HTTPS / WSS                  │ MQTT over TLS / Cellular
                              │                              │
 ┌────────────────────────────▼──────────────┐ ┌─────────────▼────────────────────────────┐
 │ MOBILE APPLICATION SUITE                  │ │ SMARTMED IOT DISPENSING KIOSK            │
 │ • Patient App: AI triage, calls, payments │ │ • Industrial ESP32-S3 IoT Controller     │
 │ • Doctor Portal: Queue, Rx & Pass issuance│ │ • 4G/5G Cellular & Wi-Fi Redundancy      │
 │ • Worker App: Replenishment & diagnostics │ │ • Touch SPI TFT Display & User Camera    │
 └───────────────────────────────────────────┘ │ • Modular 6+ Spiral Lanes & BO Motors   │
                                               │ • Dual IR Break-Beam Drop Verification   │
                                               │ • Thermal & Tamper Monitoring Sensors    │
                                               └──────────────────────────────────────────┘
```

---

### Core Technologies of the Main Product

| Domain | Technology / Component | Function & Production Implementation |
|---|---|---|
| **Cloud Infrastructure** | Scalable Microservices (Node.js / Go) | High-concurrency backend hosted on secure cloud infrastructure (AWS/GCP/NIC) with automated load balancing. |
| **Central Database** | PostgreSQL / Supabase | Scalable relational storage for electronic health records, prescriptions, inventory, and append-only audit logs. |
| **IoT Connectivity** | 4G/5G Cellular IoT + MQTT over TLS | Ultra-low latency, bi-directional telemetry, heartbeat monitoring, and instant push commands between cloud and kiosks. |
| **Kiosk Controller** | Industrial ESP32-S3 Microcontroller | Embedded controller managing motor drivers, limit switches, drop sensors, thermal monitors, and display rendering. |
| **Dispensing Mechanism** | Modular Helical Coils & High-Torque Motors | Universal modular dispensing slots capable of handling blisters, sachets, strip packs, and medicine boxes. |
| **Physical Drop Verification** | Dual Optical IR Break-Beam Curtains | Independent sensor barrier in collection chute verifying actual packet fall before confirming order completion. |
| **Client Applications** | Kotlin, Jetpack Compose (Android) & Web | Role-based native mobile app for patients, doctors, and supply-chain workers with integrated video calling. |
| **Payments & Identity** | Live UPI (Razorpay/PayTM) & Aadhaar/ABHA | Seamless cashless payments via dynamic UPI QR codes; identity verification via SMS OTP and national ABHA health ID. |
| **Security & Privacy** | End-to-End TLS 1.3, AES-256, RBAC | Encrypted communications, secure boot on microcontrollers, and role-based access control complying with DPDP Act 2023. |

---

### Two-Phase Dispensing & Fail-Safe Recovery Workflow

```text
[Step 1: Order Validation]
Patient selects medicine ──► Cloud rules engine validates age, allergies, Rx token & FEFO stock ──► Order Created

[Step 2: Instant Payment]
Kiosk displays dynamic UPI QR ──► Patient scans via phone & pays ──► Payment Gateway webhook confirms order

[Step 3: Machine Identification]
Patient scans dynamic 60-second Kiosk Collection QR ──► Server validates session & binds order to machine

[Step 4: Atomic Stock Reservation]
Cloud reserves lane stock atomically ──► Sends encrypted MQTT dispense command to ESP32-S3

[Step 5: Dispensing Actuation]
ESP32 actuates motor & spiral ──► Limit switch tracks rotation cycle ──► Optical IR sensor detects falling packet

[Step 6A: Delivery Confirmed]
IR sensor confirms drop ──► Kiosk reports success ──► Order marked dispensed ──► Single-use token consumed

[Step 6B: Jam / Sensor Timeout Recovery]
No packet drop detected within 60s ──► Motor unjamming reverse pulse ──► Stock restored ──► Instant UPI refund issued ──► Maintenance ticket created
```

---

### Current Prototype Validation (Proof of Concept)
To validate the architecture before mass manufacturing, a **fully operational prototype** has already been engineered:
- **Local Embedded Node.js Server:** Employs built-in `node:sqlite` in WAL mode to run identical safety rules locally.
- **Physical Dispensing Hardware:** 6-slot modular mechanism powered by an ESP32 microcontroller with motor control and feedback switches.
- **Interactive 3D Digital Twin:** Real-time Three.js simulation (`/simulation/M1`) mirroring machine states and simulating hardware jams.
- **Automated Validation:** Verified with an automated smoke suite testing 21 core scenarios (auth, allergy rules, emergency queues, timeout refunds).

---

## Slide 4 — FEASIBILITY AND VIABILITY

### Commercial & Technical Feasibility

- **Affordable Unit Economics:** Leveraging modular off-the-shelf industrial components (ESP32-S3, high-torque geared motors, optical sensors, fabricated metal/PVC chassis) keeps manufacturing costs under **₹15,000–₹25,000 per 6-slot kiosk**—a fraction of imported multi-lakh commercial vending units.
- **Scalable Cloud Operations:** The centralized cloud and IoT architecture enables a single pharmacy partner or hospital network to oversee dozens of distributed kiosks with minimal operational overhead.
- **Sustainable Business Model:** 
  - Direct medicine sales margin via licensed pharmacy partnerships.
  - Franchise and operational licensing models for transit hubs, universities, and corporate tech parks.
  - CSR and government healthcare procurement under National Health Mission (NHM) and Smart Cities initiatives.

---

### Risk Analysis and Mitigation Strategies

| Challenge / Risk | Severity | SmartMed Production Mitigation Strategy |
|---|---|---|
| **Intermittent Internet Connectivity** | Medium | Dual-connectivity (4G/5G cellular + Wi-Fi failover) combined with local edge buffering that securely handles emergency workflows during transient drops. |
| **Mechanical Sachet Jamming** | High | Dual optical IR break-beam verification in collection chute; automated reverse-spin unjamming sequence; instant UPI refund and technician dispatch on failure. |
| **Counterfeit / Replay Fraud** | High | Dynamic, single-use 60-second QR tokens; encrypted MQTT payloads; server-enforced one-time prescription invalidation. |
| **Clinician Unavailability in Emergencies** | High | Centralized nationwide 24/7 tele-triage doctor pool; automated 60-second backup escalation; direct 108/112 ambulance dispatch fallback. |
| **Adverse Drug Reactions & Contraindications** | Critical | Cloud clinical decision engine cross-references patient allergies, age, and chronic conditions prior to permitting purchase. |
| **Dispensing Expired Medicines** | Critical | Cloud-enforced FEFO inventory logic locks out expired lanes; automated replenishment notices sent to pharmacy partners 30 days prior to expiry. |
| **Vandalism & Physical Security** | Medium | Ruggedized tamper-resistant enclosure, vibration and shock sensors, cloud door-open alerts, and security camera integration. |

---

### Viability & Deployment Models

SmartMed is engineered for widespread scalability across key environments:
1. **Rural Health Sub-Centres & Remote Villages:** Connects underserved populations to remote doctors, instantly dispensing essential treatments without requiring hours of travel to district hospitals.
2. **Highways & Transit Hubs (Airports, Railway & Metro Stations):** 24/7 automated access to emergency first aid, travel sickness remedies, pain relief, and hydration salts for travelers.
3. **University Campuses & Corporate Parks:** Low-cost automated wellness kiosks providing round-the-clock OTC and first-aid supplies to students and employees.
4. **Disaster-Relief Zones & Mobile Camps:** Rapidly deployable emergency medical stations operating with cellular or satellite uplinks to coordinate emergency pharmaceutical distribution.

---

## Slide 5 — IMPACT AND BENEFITS

### Target Audience & Stakeholders

- **Rural & Underserved Citizens:** Gain immediate, round-the-clock access to certified medications and remote clinical consultations.
- **Patients with Chronic & Acute Conditions:** Obtain life-saving rescue medications (inhalers, adrenaline, nitrates) via pre-authorized Emergency Passes without delay.
- **Healthcare Providers & Telemedicine Networks:** Gain an automated physical fulfillment channel that transforms teleconsultations into completed clinical treatments.
- **Retail & Hospital Pharmacies:** Expand market reach and establish automated satellite dispensaries with zero incremental staffing costs.

---

### Comprehensive Impact Matrix

| Dimension | Real-World Impact of SmartMed Ecosystem |
|---|---|
| **Healthcare** | Bridges rural doctor shortages; prevents self-medication dangers through automated screening; guarantees authentic, non-counterfeit medicines. |
| **Social** | Eliminates travel barriers for urgent medicines; ensures 24/7 dignity and privacy for sensitive healthcare needs (e.g., contraceptives, emergency care). |
| **Operational** | Completely automates inventory tracking, FEFO batch rotation, and regulatory record-keeping; eliminates human dispensing errors. |
| **Economic** | Lowers the capital expenditure of setting up 24/7 pharmacies; reduces out-of-pocket travel and lost-wage costs for rural patients. |
| **Environmental** | Proactive FEFO inventory alerts dramatically reduce pharmaceutical expiry wastage and minimize emissions from long travel distances. |

---

### Alignment with Sustainable Development Goals (SDGs)

- **SDG 3: Good Health and Well-Being (Target 3.8):** Achieve universal health coverage, including financial risk protection and access to safe, effective, quality, and affordable essential medicines.
- **SDG 9: Industry, Innovation, and Infrastructure (Target 9.b):** Support domestic technology development, healthcare IoT research, and frugal biomedical engineering.
- **SDG 10: Reduced Inequalities (Target 10.2):** Empower and promote the social and healthcare inclusion of geographically marginalized populations.
- **SDG 11: Sustainable Cities and Communities (Target 11.5):** Build resilient infrastructure that enhances disaster-preparedness and emergency medical responsiveness.

---

### Commercialization Roadmap

```text
  Phase 1: Proof of Concept (Completed)
  ├── Full-stack offline software prototype & 3D digital twin
  ├── Validated multi-tier safety engine & automated smoke suite
  └── 6-slot physical dispensing mechanism validated

  Phase 2: IoT Hardware & Sensor Integration (Months 1–3)
  ├── Industrial ESP32-S3 board with 4G LTE-M modem integration
  ├── Dual optical IR break-beam drop sensor implementation
  └── Ruggedized outdoor/indoor chassis fabrication

  Phase 3: Cloud & Telemedicine Launch (Months 4–6)
  ├── Cloud microservices deployment (PostgreSQL, MQTT over TLS)
  ├── Live video teleconsultation & real-time UPI payment gateway integration
  └── Centralized fleet management and inventory dashboard

  Phase 4: Regulatory Compliance & Field Pilots (Months 7–12)
  ├── CDSCO & Pharmacy Council regulatory compliance audit
  ├── Pilot deployment across 10 transit hubs and 5 rural health centres
  └── Integration with Ayushman Bharat Digital Mission (ABDM / ABHA)
```

---

## Slide 6 — RESEARCH AND REFERENCES

### Authoritative Technical, Legal, and Clinical References

#### 1. Embedded Systems & Internet-of-Things (IoT)
- **Espressif Systems** — *ESP32-S3 Series SoC Datasheet & Hardware Design Guidelines*  
  [ESP32-S3 Datasheet (PDF)](https://www.espressif.com/sites/default/files/documentation/esp32-s3_datasheet_en.pdf)
- **OASIS Standard** — *MQTT Version 5.0 Specification for Lightweight IoT Telemetry*  
  [MQTT 5.0 Specification](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html)

#### 2. Pharmaceutical Regulations & Dispensing Governance
- **Central Drugs Standard Control Organization (CDSCO)** — *Drugs and Cosmetics Act, 1940 and Drugs Rules, 1945 (as amended)*  
  [CDSCO Acts and Rules](https://cdsco.mohfw.gov.in/opencms/opencms/en/Acts-and-rules/Drugs-Rules/)
- **Ministry of Health and Family Welfare (MoHFW), Govt. of India** — *Telemedicine Practice Guidelines (Enabling Registered Medical Practitioners to Provide Healthcare Using Telemedicine)*  
  [Telemedicine Practice Guidelines](https://www.mohfw.gov.in/)
- **Pharmacy Council of India (PCI)** — *Pharmacy Practice Regulations, 2015*  
  [PCI Regulatory Guidelines](https://www.pci.nic.in/)

#### 3. Data Protection, Security & Digital Health Architecture
- **Ministry of Electronics and Information Technology (MeitY)** — *Digital Personal Data Protection Act, 2023 (Act No. 22 of 2023)*  
  [Digital Personal Data Protection Act, 2023 (PDF)](https://www.meity.gov.in/writereaddata/files/Digital%20Personal%20Data%20Protection%20Act%202023.pdf)
- **National Health Authority (NHA)** — *Ayushman Bharat Digital Mission (ABDM) Architecture & Health Data Management Policy*  
  [ABDM Official Portal](https://abdm.gov.in/)

#### 4. Presentation & Hackathon Framework
- **Smart India Hackathon (SIH)** — *SIH Official Idea Presentation Format & Guidelines*  
  [SIH Official Portal](https://sih.gov.in/)


---

## APPENDIX A — LIVE DEMONSTRATION & PITCH WALKTHROUGH SCRIPT

*(5-Minute Step-by-Step Judge / Evaluator Walkthrough)*

```text
[0:00 - 0:45] Step 1: OTC Purchase with Allergy Safety Warning
• Action: Open Patient App. Search for "Paracetamol" or use the guided Q&A triage.
• Demonstration: Show patient profile with a declared allergy. Attempt to purchase a conflicting item.
• Outcome: Server safety engine immediately blocks the transaction with an "ALLERGY CONFLICT" warning, proving active patient protection.

[0:46 - 1:45] Step 2: Doctor E-Prescription & Single-Use Fulfilment
• Action: Switch to Doctor portal. Issue an e-prescription for "Amoxicillin" with a specified dosage and 24-hour validity.
• Demonstration: Switch back to Patient App. View the prescribed item under covered medicines. Scan payment QR and collect the medicine.
• Outcome: Show that once dispensed, the prescription is marked as "USED" and cannot be redeemed again.

[1:46 - 2:45] Step 3: Urgent Emergency Pack Request & 60-Second Backup Escalation
• Action: Patient submits an urgent Emergency Request with acute symptom description.
• Demonstration: Case appears in Primary Doctor's queue. Let 60 seconds elapse without answering.
• Outcome: Demonstrate automated auto-escalation to the Backup Clinician queue, ensuring zero unattended medical emergencies.

[2:46 - 3:30] Step 4: Pre-Authorized Emergency Pass with Red-Flag Trigger
• Action: Patient with chronic asthma selects their doctor-issued Emergency Pass.
• Demonstration: Patient declares matching red-flag symptoms ("Severe Wheezing / Breathlessness").
• Outcome: Dispenser unlocks instant inhaler pack without waiting for a live doctor consultation. Demonstrates automated follow-up reminder creation.

[3:31 - 4:15] Step 5: Hardware Jam Simulation, 60s Timeout & Auto-Refund
• Action: On the machine operator interface, toggle "Simulate Jam".
• Demonstration: Patient attempts collection. The machine fails to actuate or reports a physical jam.
• Outcome: The system detects the failure, rolls back reserved stock to the lane, records a refund ledger entry, and logs a high-priority technician ticket.

[4:16 - 5:00] Step 6: Worker Operations & First-Expired-First-Out (FEFO) Inventory
• Action: Log in as Worker. Open machine lane overview.
• Demonstration: Add new stock with batch numbers and different expiry dates.
• Outcome: Show that the backend automatically routes subsequent orders to the earliest-expiring lane, preventing expired medicine delivery.
```

---

## APPENDIX B — ANTICIPATED JURY Q&A & EVALUATOR DEFENSE MATRIX

### High-Impact Answers for Presentation Defense

#### Q1: How do you prevent drug abuse, overdose, or black-market hoarding?
> **Answer:**  
> SmartMed implements a strict three-tier regulatory architecture. Tier 1 OTC medicines are strictly limited by per-order quantity caps and user age checks. Tier 2 prescription medicines require a registered doctor's e-prescription with single-use cryptographic cloud tokens that self-invalidate upon dispensing. Tier 3 emergency packs are subject to an enforced 24-hour rate limit per patient and require either live doctor tele-approval or a physician-issued Emergency Pass with symptom matching.

#### Q2: Why did you build an offline prototype if the final product uses the internet?
> **Answer:**  
> Developing an offline-first prototype allowed us to prove the most critical engineering challenge: that the safety engine, inventory state machine, and physical hardware hand-off can operate with 100% autonomous edge reliability without depending on fragile external servers. In the final product, the system connects via 4G/5G cellular IoT and cloud microservices for nationwide scale, while retaining this local offline architecture as an edge fail-safe buffer during transient network drops.

#### Q3: What happens if the motor rotates but the medicine packet gets stuck?
> **Answer:**  
> The commercial machine incorporates dual optical IR break-beam sensors across the collection chute. Dispensing is confirmed only when the sensor registers an optical interruption as the packet drops into the bin. If no drop is detected within 60 seconds, the kiosk executes an automatic reverse-pulse unjamming sequence. If that fails, the system executes an automated rollback: reserved stock is restored, an instant refund webhook is triggered to the patient's UPI account, and a maintenance ticket is dispatched to the field technician.

#### Q4: How does SmartMed comply with Indian drug laws (CDSCO) and Telemedicine Guidelines?
> **Answer:**  
> SmartMed operates as a technology partner to licensed pharmacies and registered medical practitioners (RMPs). Prescriptions are issued strictly in compliance with the MoHFW Telemedicine Practice Guidelines (2020), complete with digital signatures and registration numbers. The machine acts as an automated, supervised satellite dispensing unit under the custody of a licensed partner pharmacy, complying with the Drugs and Cosmetics Rules (1945). Schedule X and habit-forming narcotics are permanently excluded from the formulary.

#### Q5: How does the system handle power cuts or sudden internet loss during dispensing?
> **Answer:**  
> Every kiosk is equipped with an industrial uninterruptible power supply (UPS) and internal lithium battery buffer providing 4–6 hours of autonomous operation during power grid outages. In the event of an internet disruption during a transaction, the system operates on a "fail-closed" model: if verification cannot be completed, no transaction is charged, and stock remains securely locked. For pre-authorized emergency passes, cached local cryptographic signatures allow critical life-saving rescue dispensing even during brief network drops.

#### Q6: Can a patient use someone else's emergency pass or use their pass multiple times?
> **Answer:**  
> No. Each Emergency Pass is bound to the patient's authenticated identity (mobile OTP / ABHA ID) and carries a strict, doctor-defined usage quota (typically 1 or 2 uses) and a validity window (maximum 90 days). Once the allowed uses are exhausted, the pass status automatically switches to `EXHAUSTED` in the database and cannot be replayed. Furthermore, dispensing requires declaring matching red-flag symptoms specific to the approved medical condition.
