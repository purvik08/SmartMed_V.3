# MediVend: fully offline prototype

Everything runs on your own laptop and your own Wi-Fi or phone hotspot. **No internet is needed to run it**
(no cloud, no Docker, no map tiles, no SMS, no npm packages).

```
server/    Local server (Node.js, built-in SQLite). API for the app + the machine screen. Tested.
android/   Android Studio project (Kotlin, Jetpack Compose): Patient, Doctor and Worker in one app.
```
Prototype, not a medical device. Use empty sealed boxes or placebo packs only. Catalogue doses, prices and
the Tier 3 emergency formulary are placeholders that a licensed doctor and pharmacist must review.

## 1. Start the server (laptop)
Install **Node.js 22.13 or newer** once (nodejs.org). Then:
```
cd server
node --no-warnings server.mjs        (or double-click start-server.bat / run ./start-server.sh)
```
On Windows, the quickest demo option is to double-click **`start-medivend.bat`** in the project folder. It starts the
server if it is not already running, then opens the connected M1 3D simulation in your default browser.
It prints your laptop's address, for example `192.168.1.5:8080`, and creates `server/data/medivend.db`
with demo data on first run. Delete `server/data/medivend.db*` to reset everything.
Windows: if asked, allow Node.js through the firewall on **Private** networks so the phone can reach it.

Check the whole backend any time: `cd server && node test/smoke.mjs` (19 end-to-end checks, about 15 s).

## 2. Open the machine screen (laptop browser)
`http://localhost:8080/machine/M1?key=demo-key-1`

This page acts as the vending machine: it shows the single-use QR, runs the dispense state machine, and has a
**Simulate jam** button to demo the automatic refund. Machines M2 and M3 work the same way
(`/machine/M2?key=demo-key-2`, `/machine/M3?key=demo-key-3`). Keep it open: an offline machine blocks orders.
Stock per machine: M1 has Paracetamol, ORS, Cetirizine, Adrenaline, Salbutamol, Aspirin. M2 has Paracetamol, Antacid,
Povidone-iodine, Amoxicillin (Rx), Glucose, Isosorbide. M3 is a light machine.

### Connected 3D prototype
`http://localhost:8080/simulation/M1?key=demo-key-1`

This is the cabinet's interactive 3D prototype, connected to exactly the same local machine API as the Android app.
Keep either the 2D machine screen or this 3D page open for the selected machine (not both): it sends heartbeats, issues
the short-lived QR, receives the app's dispense command, animates the commanded lanes, and reports the sensor result.
Use the **Simulate jam** control before a dispense to demonstrate the automatic refund flow. Change `M1` and the `key`
in the URL for M2 or M3.

## 3. Build the app (Android Studio)
1. Open Android Studio (Koala or newer) > **Open** > choose the `android` folder.
2. Let it **Sync**. This is the **only step that needs internet**, once, to download Gradle and the libraries.
   After a successful sync you can switch Gradle to **Offline mode** (Settings > Build > Gradle) and work offline.
   If it says the Gradle wrapper is missing or offers to upgrade plugins, accept its suggestion.
3. Run on an emulator or a real phone (USB debugging).
4. On the login screen set **Server address**:
   - Emulator: `10.0.2.2:8080`
   - Real phone: the laptop address the server printed (phone and laptop on the same Wi-Fi or hotspot; the network
     does not need internet).
5. Demo logins (type 10 digits, OTP `123456`): patient `9000000001` / `9000000002`, doctor `9000000011`,
   backup doctor `9000000012`, worker `9000000021`. Use two devices (or emulator + phone) for patient + doctor.
6. As a patient, open **Profile** and set date of birth first (age rules need it).

Emulator QR tip: the emulator camera cannot easily see your screen. On the Collect screen, paste the QR text shown
under the machine page QR into the box and press Start dispensing.

## Demo script
- **OTC:** Search "ORS" > add > cart > pay (mock UPI) > scan machine QR > the machine page dispenses.
- **Emergency:** Home > EMERGENCY > situation + pack (machine M1 or M2 must stock it) > doctor device shows the alert >
  Accept > Approve > patient pays and collects. After 60 s the backup-panel doctor can see it; after 5 min with no
  doctor the patient is told to call 108.
- **Rx:** Doctor > Rx tab issues an e-prescription by patient phone > patient buys Amoxicillin on machine M2 (one-time use).
- **Pass:** Patient > Pass > apply with a photo > Doctor > Passes > review, issue > Patient "Use" > no doctor wait.
- **Failure:** tick Simulate jam on the machine page, dispense: automatic refund + support ticket + stock restored.
- **Worker:** refill lanes with batch and expiry, LOW and expiring flags, register a new machine.

## What changed from the cloud version
| Before | Now |
|---|---|
| Supabase + Docker | Node.js server with a built-in SQLite file |
| Phone SMS OTP | Fixed demo OTP 123456 (no SMS offline) |
| Flutter + pub packages + OSM tiles | Native Android Studio app, schematic offline map from GPS pins |
| Optional MQTT broker | Machine talks plain HTTP to the same server (an ESP32 can do the same) |
| Cloud storage for reports | Files saved in `server/data/uploads` |

Rules are unchanged: the server alone decides eligibility (tiers, age, allergies, Rx one-time use, doctor approval
valid 1 h, pass red flags, 24 h emergency limit, stock, expiry) and re-checks at order, payment and dispense time.
QR tokens are single-use and last 60 s. Failed or unconfirmed dispenses refund automatically. The audit log is
append-only (database triggers).

## Machine protocol (for the ESP32-S3 later)
`POST /api/machine` with header `x-machine-key`, JSON `{machine_id, action}`:
`session` (returns QR text), `heartbeat` (every 15 s), `poll` (returns `{command:{order_id, items:[{lane_no, qty}]}}`),
`report` (`{order_id, result:'success'|'fail', reason}`). `server/machine.html` is a working reference.

## Honest status
- **Server:** run and tested here (19 end-to-end checks pass; the QR encoder was verified by decoding with OpenCV).
- **Android app:** written carefully but **not compiled here** (no Android SDK in my environment). Expect a few small
  compile or version fixes on first build. Paste any error and it is quick to resolve.
- Not built: Hindi/Gujarati text, reminder screens (rows are saved), video consults, admin dashboard, ESP32 firmware.
- Real use would need a licensed pharmacy partner, a doctor-reviewed formulary, real payments and an SMS/auth provider.
