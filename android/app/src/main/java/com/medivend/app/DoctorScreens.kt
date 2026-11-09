package com.medivend.app

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject

@Composable
fun DoctorShell() {
    val ctx = LocalContext.current
    val act = rememberAct()
    var tab by remember { mutableIntStateOf(0) }
    var online by remember { mutableStateOf(App.user?.b("online") ?: true) }
    val titles = listOf("Emergencies", "Passes", "Rx")
    Scaffold(
        topBar = {
            Column {
                TopBar(App.user?.s("name")?.ifEmpty { "Doctor" } ?: "Doctor", back = false) {
                    Text("Online")
                    Switch(checked = online, onCheckedChange = { v ->
                        online = v
                        act.go { Api.obj("POST", "/api/doctor/online", jsonOf("online" to v)) }
                    })
                    TextButton(onClick = { logout(ctx) }) { Text("Logout") }
                }
                TabRow(selectedTabIndex = tab) {
                    titles.forEachIndexed { i, t -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(t) }) }
                }
            }
        },
    ) { inner ->
        Column(Modifier.padding(inner).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            when (tab) {
                0 -> EmergencyQueue()
                1 -> PassQueue()
                else -> RxForm()
            }
        }
    }
}

@Composable
fun EmergencyQueue() {
    Load(key = "queue", pollMs = 4000, fetch = { Api.arr("/api/doctor/queue").objs() }) { list, _ ->
        if (list.isEmpty()) Text("No emergency requests")
        list.forEach { r ->
            val fresh = r.s("status") == "DOCTOR_ALERTED"
            Card(
                Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { Nav.push(Screen.DoctorCase(r.s("id"))) },
                colors = CardDefaults.cardColors(containerColor = if (fresh) Color(0xFFFFEBEE) else MaterialTheme.colorScheme.surfaceVariant),
            ) {
                Column(Modifier.padding(12.dp)) {
                    Text("${r.s("patient_name").ifEmpty { "Patient" }} · ${if (r.has("patient_age") && !r.isNull("patient_age")) r.i("patient_age").toString() + "y" else "?"}", fontWeight = FontWeight.Bold)
                    Text(r.s("situation"))
                    Text("${r.s("status")} · ${r.s("created_at").take(16).replace('T', ' ')} UTC", fontSize = 12.sp, color = Color.Gray)
                }
            }
        }
    }
}

@Composable
fun DoctorCaseScreen(id: String) {
    val act = rememberAct()
    Page("Case") {
        Load(key = id, pollMs = 3000, fetch = { Api.obj("GET", "/api/doctor/cases/$id") }) { c, reload ->
            val r = c.getJSONObject("request")
            val p = c.getJSONObject("patient")
            val status = r.s("status")
            val mine = r.s("doctor_id") == App.user?.s("id")
            val selected = remember { mutableStateListOf<String>().also { l -> r.arr("requested_items").objs().forEach { l.add(it.s("medicine_id")) } } }
            var note by remember { mutableStateOf("") }

            Heading("${p.s("name").ifEmpty { "Patient" }} · ${if (p.isNull("age")) "?" else p.i("age").toString()}y · ${if (p.isNull("weight_kg")) "?" else p.d("weight_kg").toString()} kg")
            Gap(4)
            Text("Situation: ${r.s("situation")}")
            Text("Allergies: ${p.arr("allergies").strs().ifEmpty { listOf("none") }.joinToString(", ")}")
            Text("Conditions: ${p.arr("conditions").strs().ifEmpty { listOf("none") }.joinToString(", ")}")
            Text("Current medicines: ${p.arr("current_meds").strs().ifEmpty { listOf("none") }.joinToString(", ")}")
            Text("Status: $status", fontWeight = FontWeight.Bold)
            HorizontalDivider(Modifier.padding(vertical = 12.dp))

            if (status == "DOCTOR_ALERTED") {
                BigButton("Accept case", enabled = !act.busy, onClick = {
                    act.go(onDone = reload) { Api.obj("POST", "/api/doctor/cases/$id/accept") }
                })
            }
            if (status == "DOCTOR_ACCEPTED" && mine) {
                Text("Approve emergency packs", fontWeight = FontWeight.Bold)
                Load(key = "t3", fetch = { Api.arr("/api/medicines?tier=3").objs() }) { meds, _ ->
                    meds.forEach { m ->
                        CheckRow(m.s("brand"), selected.contains(m.s("id")), { on -> if (on) selected.add(m.s("id")) else selected.remove(m.s("id")) }, m.s("warnings"))
                    }
                }
                Field("Note to patient", note, { note = it })
                BigButton("Approve", enabled = !act.busy, onClick = {
                    act.go(onDone = reload) {
                        Api.obj(
                            "POST", "/api/doctor/cases/$id/decide",
                            jsonOf("decision" to "approve", "note" to note, "items" to jsonArr(selected.map { jsonOf("medicine_id" to it, "qty" to 1) })),
                        )
                    }
                })
                Gap(8)
                OutlinedButton(onClick = {
                    act.go(onDone = reload) { Api.obj("POST", "/api/doctor/cases/$id/decide", jsonOf("decision" to "reject", "note" to note)) }
                }, enabled = !act.busy, modifier = Modifier.fillMaxWidth()) { Text("Reject") }
            }
            if (status == "DISPENSED" && mine) {
                BigButton("Mark follow-up call done", enabled = !act.busy, onClick = {
                    act.go(onDone = reload) { Api.obj("POST", "/api/doctor/cases/$id/followup") }
                })
            }
        }
    }
}

@Composable
fun PassQueue() {
    Load(key = "passq", pollMs = 4000, fetch = { Api.arr("/api/doctor/passes").objs() }) { list, _ ->
        if (list.isEmpty()) Text("No pass applications")
        list.forEach { p ->
            val review = p.s("status") == "UNDER_REVIEW"
            Card(
                Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { Nav.push(Screen.PassReview(p.s("id"))) },
                colors = CardDefaults.cardColors(containerColor = if (review) Color(0xFFFFF8E1) else MaterialTheme.colorScheme.surfaceVariant),
            ) {
                Column(Modifier.padding(12.dp)) {
                    Text("${p.s("patient_name").ifEmpty { "Patient" }} · ${p.s("condition")}", fontWeight = FontWeight.Bold)
                    Text(p.s("status") + if (p.s("status") == "ACTIVE") " · ${p.i("uses_left")}/${p.i("uses_allowed")} uses" else "", fontSize = 13.sp, color = Color.Gray)
                }
            }
        }
    }
}

@Composable
fun DocImage(docId: String, filename: String) {
    val lower = filename.lowercase()
    val isImage = lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp") || lower.endsWith(".gif")
    if (!isImage) {
        Text("📄 $filename (open it from the server folder data/uploads)")
        return
    }
    val bmp by produceState<androidx.compose.ui.graphics.ImageBitmap?>(null, docId) {
        value = try {
            val b = Api.bytes("/api/documents/$docId")
            BitmapFactory.decodeByteArray(b, 0, b.size)?.asImageBitmap()
        } catch (e: Exception) {
            null
        }
    }
    val b = bmp
    if (b != null) Image(bitmap = b, contentDescription = filename, modifier = Modifier.fillMaxWidth().heightIn(max = 260.dp))
    else Text("Loading $filename…")
}

@Composable
fun PassReviewScreen(id: String) {
    val act = rememberAct()
    Page("Pass review") {
        Load(key = id, fetch = { Api.obj("GET", "/api/doctor/passes/$id") }) { c, _ ->
            val p = c.getJSONObject("pass")
            val pat = c.getJSONObject("patient")
            val review = p.s("status") == "UNDER_REVIEW"
            Heading("${pat.s("name").ifEmpty { "Patient" }} · ${if (pat.isNull("age")) "?" else pat.i("age").toString()}y")
            Text("Condition: ${p.s("condition")}")
            if (p.s("note").isNotEmpty()) Text("Patient note: ${p.s("note")}")
            Text("Allergies: ${pat.arr("allergies").strs().ifEmpty { listOf("none") }.joinToString(", ")}")
            Text("Current medicines: ${pat.arr("current_meds").strs().ifEmpty { listOf("none") }.joinToString(", ")}")
            Gap(8)
            Text("Uploaded records", fontWeight = FontWeight.Bold)
            c.arr("documents").objs().forEach { d ->
                Text("${d.s("doc_type")}: ${d.s("filename")}", fontSize = 12.sp)
                DocImage(d.s("id"), d.s("filename"))
            }
            HorizontalDivider(Modifier.padding(vertical = 12.dp))

            if (review) {
                val sel = remember { mutableStateListOf<String>() }
                var flags by remember { mutableStateOf("") }
                var uses by remember { mutableIntStateOf(1) }
                var days by remember { mutableIntStateOf(30) }
                var instr by remember { mutableStateOf("") }
                var note by remember { mutableStateOf("") }
                Text("Medicines on the pass (pre-agreed emergency packs only)", fontWeight = FontWeight.Bold)
                Load(key = "t3", fetch = { Api.arr("/api/medicines?tier=3").objs() }) { meds, _ ->
                    meds.forEach { m -> CheckRow(m.s("brand"), sel.contains(m.s("id")), { on -> if (on) sel.add(m.s("id")) else sel.remove(m.s("id")) }) }
                }
                Field("Red-flag symptoms (comma separated)", flags, { flags = it }, hint = "throat swelling, trouble breathing")
                Text("Uses allowed", fontWeight = FontWeight.Bold)
                Row { listOf(1, 2).forEach { n -> Row(Modifier.clickable { uses = n }, verticalAlignment = Alignment.CenterVertically) { RadioButton(selected = uses == n, onClick = { uses = n }); Text("$n  ") } } }
                Text("Valid for (days)", fontWeight = FontWeight.Bold)
                Row { listOf(30, 90).forEach { n -> Row(Modifier.clickable { days = n }, verticalAlignment = Alignment.CenterVertically) { RadioButton(selected = days == n, onClick = { days = n }); Text("$n  ") } } }
                Field("Usage instructions", instr, { instr = it }, lines = 2)
                Field("Note (shown if rejected)", note, { note = it })
                BigButton("Issue pass", enabled = !act.busy, onClick = {
                    act.go(onDone = { Nav.pop() }) {
                        Api.obj(
                            "POST", "/api/doctor/passes/$id/issue",
                            jsonOf(
                                "items" to jsonArr(sel.map { jsonOf("medicine_id" to it, "max_qty" to 1) }),
                                "red_flag_keys" to jsonArr(flags.split(",").map { it.trim() }.filter { it.isNotEmpty() }),
                                "uses_allowed" to uses, "valid_days" to days, "instructions" to instr,
                            ),
                        )
                    }
                })
                Gap(8)
                OutlinedButton(onClick = {
                    act.go(onDone = { Nav.pop() }) { Api.obj("POST", "/api/doctor/passes/$id/reject", jsonOf("note" to note)) }
                }, enabled = !act.busy, modifier = Modifier.fillMaxWidth()) { Text("Reject") }
            } else {
                Text("Status: ${p.s("status")} · ${p.i("uses_left")}/${p.i("uses_allowed")} uses left · till ${p.s("valid_until").take(10)}")
                Text("Red flags: ${p.arr("red_flag_keys").strs().joinToString(", ")}")
                Text("Medicines: ${p.arr("items").objs().joinToString(", ") { it.s("brand") }}")
                Gap(8)
                Text("Usage history", fontWeight = FontWeight.Bold)
                val usage = c.arr("usage").objs()
                if (usage.isEmpty()) Text("Not used yet")
                usage.forEach { Text("Used ${it.s("used_at").take(16).replace('T', ' ')} UTC. Call the patient within 24 hours.") }
                if (p.s("status") == "ACTIVE") {
                    Gap()
                    OutlinedButton(onClick = {
                        act.go(onDone = { Nav.pop() }) { Api.obj("POST", "/api/doctor/passes/$id/revoke", jsonOf("note" to "Revoked by doctor")) }
                    }, enabled = !act.busy, modifier = Modifier.fillMaxWidth()) { Text("Revoke pass") }
                }
            }
        }
    }
}

@Composable
fun RxForm() {
    val act = rememberAct()
    var phone by remember { mutableStateOf("") }
    var days by remember { mutableIntStateOf(7) }
    val sel = remember { mutableStateListOf<String>() }
    Heading("Issue e-prescription (Rx)")
    Gap(8)
    Field("Patient mobile (10 digits)", phone, { phone = it.filter { c -> c.isDigit() }.take(10) })
    Load(key = "t2", fetch = { Api.arr("/api/medicines?tier=2").objs() }) { meds, _ ->
        meds.forEach { m -> CheckRow(m.s("brand"), sel.contains(m.s("id")), { on -> if (on) sel.add(m.s("id")) else sel.remove(m.s("id")) }) }
    }
    Text("Valid for (days)", fontWeight = FontWeight.Bold)
    Row { listOf(3, 7, 14).forEach { n -> Row(Modifier.clickable { days = n }, verticalAlignment = Alignment.CenterVertically) { RadioButton(selected = days == n, onClick = { days = n }); Text("$n  ") } } }
    Gap()
    BigButton("Issue one-time e-prescription", enabled = !act.busy, onClick = {
        act.go(onDone = { act.toast("E-prescription issued"); sel.clear() }) {
            Api.obj(
                "POST", "/api/doctor/rx",
                jsonOf("patient_phone" to phone, "valid_days" to days, "items" to jsonArr(sel.map { jsonOf("medicine_id" to it, "qty" to 1) })),
            )
        }
    })
}

