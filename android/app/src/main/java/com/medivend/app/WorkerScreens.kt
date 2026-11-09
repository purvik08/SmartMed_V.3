package com.medivend.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun WorkerShell() {
    val ctx = LocalContext.current
    var tab by remember { mutableIntStateOf(0) }
    Scaffold(
        topBar = {
            Column {
                TopBar("Maintenance", back = false) { TextButton(onClick = { logout(ctx) }) { Text("Logout") } }
                TabRow(selectedTabIndex = tab) {
                    listOf("Machines", "Add machine").forEachIndexed { i, t -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(t) }) }
                }
            }
        },
    ) { inner ->
        Column(Modifier.padding(inner).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            if (tab == 0) WorkerMachines() else AddMachine()
        }
    }
}

@Composable
fun WorkerMachines() {
    Load(key = "wm", fetch = { Api.arr("/api/machines").objs() }) { ms, reload ->
        TextButton(onClick = reload) { Text("Refresh") }
        ms.forEach { m ->
            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { Nav.push(Screen.MachineDetail(m.s("id"), m.s("name"))) }) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(if (m.b("online")) "●" else "○", color = if (m.b("online")) Color(0xFF2E7D32) else Color(0xFFC62828), fontSize = 20.sp)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(m.s("name"), fontWeight = FontWeight.SemiBold)
                        Text("${m.s("id")} · ${m.s("address")} · ${if (m.b("online")) "online" else "OFFLINE"}", fontSize = 12.sp, color = Color.Gray)
                    }
                }
            }
        }
    }
}

@Composable
fun RefillScreen(machineId: String, laneNo: Int) {
    val act = rememberAct()
    var med by remember { mutableStateOf("") }
    var qty by remember { mutableStateOf("10") }
    var batch by remember { mutableStateOf("") }
    var expiry by remember { mutableStateOf("") }
    Page("Refill lane $laneNo") {
        Text("Machine $machineId", color = Color.Gray)
        Gap(8)
        Text("Medicine", fontWeight = FontWeight.Bold)
        Load(key = "allmeds", fetch = { Api.arr("/api/medicines?max_tier=3").objs() }) { meds, _ ->
            meds.forEach { m -> RadioRow("${m.s("brand")}  (tier ${m.i("tier")})", med == m.s("id")) { med = m.s("id") } }
        }
        Gap(8)
        Field("Packets loaded", qty, { qty = it.filter { c -> c.isDigit() } })
        Field("Batch number", batch, { batch = it })
        Field("Expiry date (YYYY-MM-DD)", expiry, { expiry = it }, hint = "2028-06-30")
        Text("Use empty sealed boxes or placebo packs for the prototype.", fontSize = 12.sp, color = Color.Gray)
        Gap()
        BigButton("Save", enabled = !act.busy, onClick = {
            if (med.isEmpty()) { act.toast("Choose a medicine"); return@BigButton }
            act.go(onDone = { Nav.pop() }) {
                Api.obj(
                    "POST", "/api/worker/refill",
                    jsonOf("machine_id" to machineId, "lane_no" to laneNo, "medicine_id" to med, "qty" to (qty.toIntOrNull() ?: 0), "batch" to batch, "expiry" to expiry.trim()),
                )
            }
        })
    }
}

@Composable
fun AddMachine() {
    val act = rememberAct()
    var name by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var lat by remember { mutableStateOf("") }
    var lng by remember { mutableStateOf("") }
    var result by remember { mutableStateOf<String?>(null) }
    Field("Machine name", name, { name = it })
    Field("Address", address, { address = it })
    Field("Latitude (GPS pin)", lat, { lat = it })
    Field("Longitude (GPS pin)", lng, { lng = it })
    BigButton("Register machine (6 empty lanes)", enabled = !act.busy, onClick = {
        val la = lat.toDoubleOrNull()
        val ln = lng.toDoubleOrNull()
        if (name.isBlank() || la == null || ln == null) { act.toast("Enter name, latitude and longitude"); return@BigButton }
        act.go {
            val r = Api.obj("POST", "/api/worker/machines", jsonOf("name" to name, "address" to address, "lat" to la, "lng" to ln))
            result = "Machine ID: ${r.s("id")}\nMachine key: ${r.s("api_key")}\n\nOpen on the machine screen:\n/machine/${r.s("id")}?key=${r.s("api_key")}"
            name = ""; address = ""; lat = ""; lng = ""
        }
    })
    val msg = result
    if (msg != null) {
        AlertDialog(
            onDismissRequest = { result = null },
            title = { Text("Machine registered") },
            text = { Text(msg) },
            confirmButton = { TextButton(onClick = { result = null }) { Text("OK") } },
        )
    }
}
