package com.medivend.app

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import org.json.JSONObject

private val RED = Color(0xFFC62828)

// situation text to the emergency pack that usually fits it (the doctor makes the final decision)
private val SITUATIONS = listOf(
    "Severe allergic reaction (swelling, rash, trouble breathing)" to "adrenaline",
    "Asthma attack or wheezing" to "salbutamol",
    "Chest pain (suspected heart attack)" to "aspirin",
    "Low blood sugar (shaky, sweaty, confused)" to "glucose",
    "Severe dehydration" to "ors-em",
    "Other emergency" to "",
)

@Composable
fun EmergencyFormScreen() {
    val act = rememberAct()
    var checking by remember { mutableStateOf(true) }
    var sit by remember { mutableIntStateOf(-1) }
    val selected = remember { mutableStateListOf<String>() }

    LaunchedEffect(Unit) {
        try {
            val r = Api.obj("GET", "/api/emergency/active")
            if (!r.isNull("request")) {
                Nav.replaceTop(Screen.EmergencyStatus(r.getJSONObject("request").s("id")))
                return@LaunchedEffect
            }
        } catch (e: Exception) {
            // ignore: the form still works, the server will refuse a duplicate request
        }
        checking = false
    }

    Page("Emergency medicine") {
        if (checking) {
            CircularProgressIndicator()
            return@Page
        }
        EmergencyBar()
        Gap(4)
        Text("Medicine here does not replace an ambulance. Call 108/112 first.", fontSize = 12.sp, color = Color.Gray)
        Gap()
        MachinePicker()
        Text("What is happening?", fontWeight = FontWeight.Bold)
        SITUATIONS.forEachIndexed { i, s ->
            RadioRow(s.first, sit == i) {
                sit = i
                selected.clear()
                if (s.second.isNotEmpty()) selected.add(s.second)
            }
        }
        Gap()
        Text("Emergency packs (a doctor makes the final decision)", fontWeight = FontWeight.Bold)
        Load(key = "t3", fetch = { Api.arr("/api/medicines?tier=3").objs() }) { meds, _ ->
            meds.forEach { m ->
                CheckRow(m.s("brand"), selected.contains(m.s("id")), { on -> if (on) selected.add(m.s("id")) else selected.remove(m.s("id")) }, m.s("uses"))
            }
        }
        Gap()
        BigButton("Request doctor approval", color = RED, enabled = !act.busy, onClick = {
            val m = machineIdOrNull()
            if (m == null) { act.toast("Choose a machine first"); return@BigButton }
            if (sit < 0 || selected.isEmpty()) { act.toast("Choose the situation and at least one pack"); return@BigButton }
            act.go {
                val r = Api.obj(
                    "POST", "/api/emergency",
                    jsonOf(
                        "machine_id" to m, "situation" to SITUATIONS[sit].first,
                        "items" to jsonArr(selected.map { jsonOf("medicine_id" to it, "qty" to 1) }),
                    ),
                )
                Nav.replaceTop(Screen.EmergencyStatus(r.getJSONObject("request").s("id")))
            }
        })
    }
}

@Composable
fun EmergencyStatusScreen(id: String) {
    val co = rememberCheckout()
    Page("Emergency request") {
        EmergencyBar()
        Gap()
        Load(key = id, pollMs = 1500, fetch = { Api.obj("GET", "/api/emergency/$id") }) { r, _ ->
            val status = r.s("status")
            val steps = listOf("DOCTOR_ALERTED", "DOCTOR_ACCEPTED", "APPROVED", "PAID", "DISPENSED")
            val idx = steps.indexOf(if (status == "FOLLOW_UP") "DISPENSED" else status)
            Text(steps.mapIndexed { i, s -> (if (i <= idx) "● " else "○ ") + s.lowercase().replace('_', ' ') }.joinToString("\n"), fontSize = 13.sp)
            Gap()
            val noDoctor = status == "TIMED_OUT" || (status == "DOCTOR_ALERTED" && r.i("elapsed_s") > r.i("timeout_s"))
            if (noDoctor) {
                Text("No doctor responded in time", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = RED)
                Text("Call 108 or 112 now and go to the nearest hospital.")
            } else when (status) {
                "DOCTOR_ALERTED" -> {
                    CircularProgressIndicator()
                    Gap(8)
                    Text("Doctors alerted ${r.i("elapsed_s")} s ago…", fontSize = 18.sp)
                    Text("It goes to the backup panel after 60 seconds.")
                }
                "DOCTOR_ACCEPTED" -> {
                    CircularProgressIndicator()
                    Gap(8)
                    Text("A doctor is reviewing your case…", fontSize = 18.sp)
                }
                "APPROVED" -> {
                    Text("Approved by a doctor", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color(0xFF2E7D32))
                    if (r.s("note").isNotEmpty()) Text("Doctor note: ${r.s("note")}")
                    r.arr("approved_items").objs().forEach { Text("• ${it.s("brand")} ×${it.i("qty")}") }
                    Gap()
                    BigButton("Pay and collect", enabled = !co.act.busy, onClick = {
                        val m = r.s("machine_id").ifEmpty { machineIdOrNull() ?: "" }
                        co.start(
                            jsonOf(
                                "machine_id" to m, "emergency_request_id" to id,
                                "items" to jsonArr(r.arr("approved_items").objs().map { jsonOf("medicine_id" to it.s("medicine_id"), "qty" to it.i("qty")) }),
                            ),
                        )
                    })
                }
                "PAID" -> {
                    Text("Paid. Scan the machine QR to collect.", fontSize = 18.sp)
                    Gap()
                    if (r.s("order_id").isNotEmpty()) BigButton("Continue to machine", onClick = { Nav.push(Screen.Dispense(r.s("order_id"))) })
                }
                "REJECTED" -> {
                    Text("The doctor did not approve this request", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = RED)
                    if (r.s("note").isNotEmpty()) Text("Reason: ${r.s("note")}")
                    Text("Call 108/112 if this is an emergency.")
                }
                else -> Text("Collected. Please see a doctor for follow-up. A reminder was set.", fontSize = 18.sp)
            }
        }
    }
    CheckoutDialog(co)
}

@Composable
fun PaymentScreen(orderId: String) {
    val act = rememberAct()
    var manual by remember { mutableStateOf("") }

    fun confirm(qr: String) = act.go {
        Api.obj("POST", "/api/orders/$orderId/pay-by-qr", jsonOf("qr" to qr))
        Cart.lines.clear()
        Nav.replaceTop(Screen.Dispense(orderId))
    }

    val launcher = rememberLauncherForActivityResult(ScanContract()) { result ->
        result.contents?.let(::confirm)
    }

    Page("Pay at the machine") {
        Load(key = orderId, pollMs = 1500, fetch = { Api.obj("GET", "/api/orders/$orderId") }) { order, _ ->
            if (order.s("status") == "paid") {
                Text("Payment confirmed. Continue to the machine collection QR.", fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                BigButton("Continue to collect", onClick = { Nav.replaceTop(Screen.Dispense(orderId)) })
            } else {
                Heading("Pay ${inr(order.d("total"))}")
                Gap(8)
                Text("The selected machine now shows an order-bound payment QR. Scan that payment QR here to confirm the local payment. Do not scan the machine identity QR until payment is complete.", fontSize = 14.sp)
                Gap(16)
                BigButton("Scan payment QR", enabled = !act.busy, onClick = {
                    launcher.launch(ScanOptions().apply {
                        setPrompt("Scan the payment QR on the machine")
                        setBeepEnabled(false)
                        setOrientationLocked(true)
                        setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                    })
                })
                Gap()
                Text("Camera unavailable? Paste the payment QR text from the machine display:", fontSize = 12.sp)
                Field("Payment QR text", manual, { manual = it }, hint = "smartmed://pay/order?t=...")
                OutlinedButton(onClick = { confirm(manual) }, enabled = !act.busy, modifier = Modifier.fillMaxWidth()) { Text("Confirm payment") }
                Gap(12)
                Text("Local-development payment confirmation only. A production installation must use a regulated payment provider and verified callback.", fontSize = 12.sp, color = Color.Gray)
            }
        }
    }
}

@Composable
fun DispenseScreen(orderId: String) {
    val act = rememberAct()
    var manual by remember { mutableStateOf("") }

    fun start(qr: String) {
        act.go { Api.obj("POST", "/api/orders/$orderId/dispense", jsonOf("qr" to qr)) }
    }

    val launcher = rememberLauncherForActivityResult(ScanContract()) { result ->
        val text = result.contents
        if (text != null) start(text)
    }

    Page("Collect your medicine") {
        Load(key = orderId, pollMs = 1500, fetch = { Api.obj("GET", "/api/orders/$orderId") }) { o, _ ->
            Text("Order ${shortId(o.s("id"))}", fontWeight = FontWeight.Bold)
            Text(o.arr("items").objs().joinToString("\n") { "${it.s("brand")} ×${it.i("qty")}" })
            Gap(16)
            when (o.s("status")) {
                "paid" -> {
                    Text("Scan the QR shown on the machine screen", fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                    Gap(8)
                    BigButton("Scan machine QR", enabled = !act.busy, onClick = {
                        launcher.launch(
                            ScanOptions().apply {
                                setPrompt("Scan the QR on the machine")
                                setBeepEnabled(false)
                                setOrientationLocked(true)
                                setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                            },
                        )
                    })
                    Gap()
                    Text("Camera not working (emulator)? Paste the QR text from the machine page:", fontSize = 12.sp)
                    Field("Machine QR text", manual, { manual = it }, hint = "smartmed://m/M1?t=...")
                    OutlinedButton(onClick = { start(manual) }, enabled = !act.busy, modifier = Modifier.fillMaxWidth()) { Text("Start dispensing") }
                }
                "dispensing" -> {
                    Gap(24)
                    CircularProgressIndicator()
                    Gap(8)
                    Text("The machine is dispensing…", fontSize = 18.sp)
                }
                "dispensed" -> {
                    Text("✅ Collect your medicine from the tray", fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    Text("Paid ${inr(o.d("total"))} · receipt ${shortId(o.s("id"))}")
                    Gap(8)
                    Text("Read the leaflet. If you used emergency medicine, call 108/112 and see a doctor.")
                    Gap()
                    BigButton("Done", onClick = { Nav.popToRoot() })
                }
                "failed", "refunded" -> {
                    Text("⚠ The machine could not dispense", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = RED)
                    Text(if (o.s("status") == "refunded") "Your ${inr(o.d("total"))} was refunded automatically and a support ticket was opened." else "Refund in progress…")
                    Gap()
                    BigButton("Back home", onClick = { Nav.popToRoot() })
                }
                else -> Text("Status: ${o.s("status")}. Payment is not complete.")
            }
        }
    }
}
