package com.medivend.app

import android.content.Context
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
import org.json.JSONObject
import java.net.URLEncoder

@Composable
fun PatientShell() {
    val ctx = LocalContext.current
    var tab by remember { mutableIntStateOf(0) }
    val titles = listOf("Home", "Machines", "Orders", "Pass")
    val icons = listOf("🏠", "🗺", "🧾", "🪪")
    Scaffold(
        topBar = {
            TopBar("SmartMed", back = false) {
                TextButton(onClick = { Nav.push(Screen.Profile) }) { Text("Profile") }
                TextButton(onClick = { logout(ctx) }) { Text("Logout") }
            }
        },
        bottomBar = {
            NavigationBar {
                titles.forEachIndexed { i, t ->
                    NavigationBarItem(selected = tab == i, onClick = { tab = i }, icon = { Text(icons[i]) }, label = { Text(t) })
                }
            }
        },
    ) { inner ->
        Column(Modifier.padding(inner).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            when (tab) {
                0 -> HomeTab()
                1 -> MachinesTab()
                2 -> OrdersTab()
                else -> PassTab()
            }
        }
    }
}

@Composable
fun HomeTab() {
    val name = App.user?.s("name") ?: ""
    Heading(if (name.isEmpty()) "Hello" else "Hello, $name")
    Gap(8)
    MachinePicker()
    BigButton("EMERGENCY", color = Color(0xFFC62828), onClick = { Nav.push(Screen.EmergencyForm) })
    Gap(12)
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text("I know my medicine", fontWeight = FontWeight.Bold)
            Text("Search and buy OTC or prescription medicine", fontSize = 13.sp, color = Color.Gray)
            Gap(8)
            OutlinedButton(onClick = { Nav.push(Screen.Search()) }) { Text("Search medicines") }
        }
    }
    Gap(8)
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text("Help me choose", fontWeight = FontWeight.Bold)
            Text("Answer a few questions for OTC guidance", fontSize = 13.sp, color = Color.Gray)
            Gap(8)
            OutlinedButton(onClick = { Nav.push(Screen.Guide) }) { Text("Start guide") }
        }
    }
    Gap(12)
    Text("This is guidance, not a medical diagnosis. SmartMed is a prototype and not a medical device.", fontSize = 12.sp, color = Color.Gray)
}

@Composable
fun OrdersTab() {
    Heading("Your orders")
    Load(key = "orders", fetch = { Api.arr("/api/orders").objs() }) { orders, reload ->
        TextButton(onClick = reload) { Text("Refresh") }
        if (orders.isEmpty()) Text("No orders yet")
        orders.forEach { o ->
            val items = o.arr("items").objs().joinToString(", ") { "${it.s("brand")} ×${it.i("qty")}" }
            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { Nav.push(Screen.Dispense(o.s("id"))) }) {
                Column(Modifier.padding(12.dp)) {
                    Text(items, fontWeight = FontWeight.SemiBold)
                    Text("${o.s("status")} · ${inr(o.d("total"))} · ${o.s("created_at").take(10)}", fontSize = 13.sp, color = Color.Gray)
                }
            }
        }
    }
}

@Composable
fun SearchScreen(initial: String) {
    var text by remember { mutableStateOf(initial) }
    var submitted by remember { mutableStateOf(initial) }
    var detail by remember { mutableStateOf<JSONObject?>(null) }
    Page("Find medicine", actions = {
        TextButton(onClick = { Nav.push(Screen.CartScreen) }) { Text("Cart (${Cart.lines.sumOf { it.qty }})") }
    }) {
        Field("Search brand or generic name", text, { text = it })
        BigButton("Search", onClick = { submitted = text })
        Gap()
        Load(key = submitted, fetch = { Api.arr("/api/medicines?max_tier=2&q=" + URLEncoder.encode(submitted, "UTF-8")).objs() }) { meds, _ ->
            if (meds.isEmpty()) Text("No medicines found")
            meds.forEach { m ->
                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { detail = m }) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(m.s("brand"), fontWeight = FontWeight.SemiBold)
                            Text("${m.s("generic")} · ${m.s("category")}", fontSize = 12.sp, color = Color.Gray)
                            TierChip(m.i("tier"))
                        }
                        Text(inr(m.d("price")))
                        Spacer(Modifier.width(8.dp))
                        Button(onClick = { Cart.add(m) }) { Text("Add") }
                    }
                }
            }
        }
    }
    val m = detail
    if (m != null) {
        AlertDialog(
            onDismissRequest = { detail = null },
            title = { Text(m.s("brand")) },
            text = {
                Column {
                    Text("Uses: ${m.s("uses")}")
                    Text("Dose: ${m.s("dosage_text")}")
                    Text("Warnings: ${m.s("warnings")}", color = Color(0xFFB00020))
                    if (m.i("tier") == 2) Text("Needs an e-prescription from a registered doctor.", fontWeight = FontWeight.Bold)
                }
            },
            confirmButton = { Button(onClick = { Cart.add(m); detail = null }) { Text("Add to cart") } },
            dismissButton = { TextButton(onClick = { detail = null }) { Text("Close") } },
        )
    }
}

@Composable
fun CartScreen() {
    val co = rememberCheckout()
    var rxId by remember { mutableStateOf<String?>(null) }
    Page("Your cart") {
        if (Cart.lines.isEmpty()) {
            Text("Cart is empty")
        } else {
            MachinePicker()
            Cart.lines.toList().forEach { l ->
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(l.med.s("brand"), fontWeight = FontWeight.SemiBold)
                        Text("${inr(l.med.d("price"))} each", fontSize = 12.sp, color = Color.Gray)
                    }
                    OutlinedButton(onClick = { Cart.remove(l.med) }) { Text("−") }
                    Text("  ${l.qty}  ")
                    OutlinedButton(onClick = { Cart.add(l.med) }) { Text("+") }
                }
            }
            val needsRx = Cart.lines.any { it.med.i("tier") == 2 }
            if (needsRx) {
                Gap()
                Text("Choose your e-prescription", fontWeight = FontWeight.Bold)
                Load(key = "rx", fetch = { Api.arr("/api/prescriptions").objs() }) { rx, _ ->
                    if (rx.isEmpty()) Text("No valid prescription found. Ask a doctor to issue one.", color = Color(0xFFB00020))
                    rx.forEach { r ->
                        val names = r.arr("items").objs().joinToString(", ") { it.s("brand") }
                        RadioRow("Rx ${shortId(r.s("id"))}: $names (till ${r.s("valid_until").take(10)})", rxId == r.s("id")) { rxId = r.s("id") }
                    }
                }
            }
            Gap()
            Heading("Total ${inr(Cart.total())}")
            Gap()
            BigButton("Pay and continue", enabled = !co.act.busy, onClick = {
                val m = machineIdOrNull()
                if (m == null) { co.act.toast("Choose a machine first"); return@BigButton }
                if (needsRx && rxId == null) { co.act.toast("Choose an e-prescription for Rx medicines"); return@BigButton }
                val body = jsonOf(
                    "machine_id" to m,
                    "items" to jsonArr(Cart.lines.map { jsonOf("medicine_id" to it.med.s("id"), "qty" to it.qty) }),
                )
                if (needsRx) body.put("prescription_id", rxId)
                co.start(body)
            })
        }
    }
    CheckoutDialog(co)
}

@Composable
fun GuideScreen() {
    val ctx = LocalContext.current
    val tree = remember { JSONObject(ctx.assets.open("guide.json").bufferedReader().use { it.readText() }) }
    val nodes = tree.getJSONObject("nodes")
    val history = remember { mutableStateListOf<String>() }
    var current by remember { mutableStateOf(tree.getString("start")) }
    val n = nodes.getJSONObject(current)
    Page("Help me choose", actions = {
        if (history.isNotEmpty()) TextButton(onClick = { current = history.removeAt(history.lastIndex) }) { Text("Back") }
    }) {
        EmergencyBar()
        Gap(16)
        val result = n.s("result")
        if (result.isEmpty()) {
            Heading(n.s("q"))
            Gap()
            n.arr("options").objs().forEach { o ->
                OutlinedButton(
                    onClick = { history.add(current); current = o.s("next") },
                    modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
                ) { Text(o.s("t")) }
            }
        } else {
            Heading(n.s("title"))
            Gap(8)
            Text(n.s("text"))
            Gap(16)
            when (result) {
                "otc" -> BigButton("Find ${n.s("generic")} in the catalogue", onClick = { Nav.push(Screen.Search(n.s("generic"))) })
                "emergency" -> BigButton("Request emergency medicine", color = Color(0xFFC62828), onClick = { Nav.push(Screen.EmergencyForm) })
            }
            Gap()
            Text("This is guidance, not a medical diagnosis.", color = Color.Gray)
        }
    }
}

@Composable
fun ProfileScreen() {
    val act = rememberAct()
    val u = App.user ?: JSONObject()
    var name by remember { mutableStateOf(u.s("name")) }
    var dob by remember { mutableStateOf(u.s("dob")) }
    var weight by remember { mutableStateOf(if (u.has("weight_kg") && !u.isNull("weight_kg")) u.d("weight_kg").toString() else "") }
    var allergies by remember { mutableStateOf(u.arr("allergies").strs().joinToString(", ")) }
    var conditions by remember { mutableStateOf(u.arr("conditions").strs().joinToString(", ")) }
    var meds by remember { mutableStateOf(u.arr("current_meds").strs().joinToString(", ")) }
    fun list(s: String) = jsonArr(s.split(",").map { it.trim() }.filter { it.isNotEmpty() })
    Page("Health profile") {
        Field("Full name", name, { name = it })
        Field("Date of birth (YYYY-MM-DD)", dob, { dob = it }, hint = "1998-04-21")
        Field("Weight (kg)", weight, { weight = it })
        Field("Allergies (comma separated)", allergies, { allergies = it }, hint = "penicillin, aspirin")
        Field("Existing conditions", conditions, { conditions = it })
        Field("Current medicines", meds, { meds = it })
        Text("Your date of birth and allergies are checked by the server before any medicine is dispensed.", fontSize = 12.sp, color = Color.Gray)
        Gap()
        BigButton("Save", enabled = !act.busy, onClick = {
            act.go(onDone = { Nav.pop() }) {
                val body = jsonOf(
                    "name" to name, "dob" to dob.trim(), "weight_kg" to weight.toDoubleOrNull(),
                    "allergies" to list(allergies), "conditions" to list(conditions), "current_meds" to list(meds),
                )
                App.user = Api.obj("PUT", "/api/me", body)
            }
        })
    }
}
