package com.medivend.app

import android.net.Uri
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

@Composable
fun PassTab() {
    Heading("Emergency Access Pass")
    Text(
        "For a known serious condition. A doctor reviews your records and issues a limited pass. It never replaces 108/112.",
        fontSize = 13.sp, color = Color.Gray,
    )
    Gap()
    BigButton("Apply for a pass", onClick = { Nav.push(Screen.ApplyPass) })
    Gap()
    Load(key = "passes", fetch = { Api.arr("/api/passes").objs() }) { passes, reload ->
        TextButton(onClick = reload) { Text("Refresh") }
        if (passes.isEmpty()) Text("No passes yet.")
        passes.forEach { p ->
            val active = p.s("status") == "ACTIVE"
            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(p.s("condition"), fontWeight = FontWeight.SemiBold)
                        Text(
                            p.s("status") + if (active) " · ${p.i("uses_left")}/${p.i("uses_allowed")} uses · till ${p.s("valid_until").take(10)}" else "",
                            fontSize = 13.sp, color = Color.Gray,
                        )
                        if (p.s("decision_note").isNotEmpty()) Text(p.s("decision_note"), fontSize = 12.sp)
                    }
                    if (active && p.i("uses_left") > 0)
                        Button(onClick = { Nav.push(Screen.UsePass(p)) }, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFC62828))) { Text("Use") }
                }
            }
        }
    }
}

@Composable
fun ApplyPassScreen() {
    val act = rememberAct()
    val ctx = LocalContext.current
    var condition by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var docType by remember { mutableStateOf("lab report") }
    val docs = remember { mutableStateListOf<Pair<String, String>>() } // id to label

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri != null) {
            act.go {
                val bytes = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } }
                    ?: throw ApiError("Could not read that file")
                val mime = ctx.contentResolver.getType(uri) ?: ""
                val ext = when {
                    mime.contains("png") -> "png"
                    mime.contains("pdf") -> "pdf"
                    mime.contains("webp") -> "webp"
                    else -> "jpg"
                }
                val r = Api.obj(
                    "POST", "/api/documents",
                    jsonOf("doc_type" to docType, "filename" to "record.$ext", "data_b64" to Base64.encodeToString(bytes, Base64.NO_WRAP)),
                )
                docs.add(r.s("id") to "$docType ($ext)")
            }
        }
    }

    Page("Apply for a pass") {
        Field("Condition (e.g. severe peanut allergy)", condition, { condition = it })
        Field("Note for the doctor", note, { note = it }, lines = 3)
        Text("Document type", fontWeight = FontWeight.Bold)
        listOf("lab report", "prescription", "discharge summary").forEach { t -> RadioRow(t, docType == t) { docType = t } }
        Gap(8)
        OutlinedButton(onClick = { picker.launch("*/*") }, enabled = !act.busy, modifier = Modifier.fillMaxWidth()) { Text("Add photo / PDF") }
        docs.forEach { Text("✓ ${it.second}", color = Color(0xFF2E7D32)) }
        Gap(8)
        Text("Files stay on your local server. Only the reviewing doctor can open them.", fontSize = 12.sp, color = Color.Gray)
        Gap()
        BigButton("Submit for review", enabled = !act.busy, onClick = {
            act.go(onDone = {
                act.toast("Submitted. A doctor will review your records.")
                Nav.pop()
            }) {
                Api.obj(
                    "POST", "/api/passes/apply",
                    jsonOf("condition" to condition, "note" to note, "document_ids" to jsonArr(docs.map { it.first })),
                )
            }
        })
    }
}

@Composable
fun UsePassScreen(pass: JSONObject) {
    val co = rememberCheckout()
    val flags = remember { mutableStateListOf<String>() }
    val picks = remember { mutableStateListOf<String>().also { l -> pass.arr("items").objs().forEach { l.add(it.s("medicine_id")) } } }
    Page("Use my pass") {
        EmergencyBar()
        Gap()
        Text("Condition: ${pass.s("condition")}", fontWeight = FontWeight.Bold)
        if (pass.s("instructions").isNotEmpty()) Text("Instructions: ${pass.s("instructions")}")
        Gap(8)
        MachinePicker()
        Text("Are you having any of these right now?", fontWeight = FontWeight.Bold)
        pass.arr("red_flag_keys").strs().forEach { k ->
            CheckRow(k, flags.contains(k), { on -> if (on) flags.add(k) else flags.remove(k) })
        }
        Gap(8)
        Text("Medicine on your pass", fontWeight = FontWeight.Bold)
        pass.arr("items").objs().forEach { i ->
            val mid = i.s("medicine_id")
            CheckRow(i.s("brand"), picks.contains(mid), { on -> if (on) picks.add(mid) else picks.remove(mid) })
        }
        Gap()
        BigButton("Pay and collect (no doctor wait)", color = Color(0xFFC62828), enabled = !co.act.busy, onClick = {
            val m = machineIdOrNull()
            if (m == null) { co.act.toast("Choose a machine first"); return@BigButton }
            if (flags.isEmpty()) { co.act.toast("Tick the symptoms you have. If none apply, this pass is not for this situation."); return@BigButton }
            co.start(
                jsonOf(
                    "machine_id" to m, "pass_id" to pass.s("id"), "red_flags" to jsonArr(flags.toList()),
                    "items" to jsonArr(picks.map { jsonOf("medicine_id" to it, "qty" to 1) }),
                ),
            )
        })
        Gap(8)
        Text("Your doctor is alerted when a pass is used and will call within 24 hours.", fontSize = 12.sp, color = Color.Gray)
    }
    CheckoutDialog(co)
}
