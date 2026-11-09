package com.medivend.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

// ---------------- app-wide state ----------------
object App {
    var user by mutableStateOf<JSONObject?>(null)
    var machine by mutableStateOf<JSONObject?>(null)
}

class CartLine(val med: JSONObject, qty: Int) {
    var qty by mutableIntStateOf(qty)
}

object Cart {
    val lines = mutableStateListOf<CartLine>()
    fun add(med: JSONObject) {
        val l = lines.firstOrNull { it.med.s("id") == med.s("id") }
        if (l == null) lines.add(CartLine(med, 1)) else if (l.qty < med.i("max_per_order")) l.qty++
    }
    fun remove(med: JSONObject) {
        val l = lines.firstOrNull { it.med.s("id") == med.s("id") } ?: return
        if (l.qty > 1) l.qty-- else lines.remove(l)
    }
    fun total(): Double = lines.sumOf { it.med.d("price") * it.qty }
}

// ---------------- navigation ----------------
sealed class Screen {
    data object Login : Screen()
    data object PatientHome : Screen()
    data object DoctorHome : Screen()
    data object WorkerHome : Screen()
    data class Search(val query: String = "") : Screen()
    data object Assistant : Screen()
    data object CartScreen : Screen()
    data object Guide : Screen()
    data object Profile : Screen()
    data object EmergencyForm : Screen()
    data class EmergencyStatus(val id: String) : Screen()
    data class Dispense(val orderId: String) : Screen()
    data class Payment(val orderId: String) : Screen()
    data object ApplyPass : Screen()
    class UsePass(val pass: JSONObject) : Screen()
    data class DoctorCase(val id: String) : Screen()
    data class PassReview(val id: String) : Screen()
    data class MachineDetail(val id: String, val name: String) : Screen()
    data class Refill(val machineId: String, val laneNo: Int) : Screen()
}

object Nav {
    val stack = mutableStateListOf<Screen>(Screen.Login)
    fun push(s: Screen) { stack.add(s) }
    fun pop() { if (stack.size > 1) stack.removeAt(stack.lastIndex) }
    fun reset(root: Screen) { stack.clear(); stack.add(root) }
    fun replaceTop(s: Screen) { if (stack.isNotEmpty()) stack[stack.lastIndex] = s }
    fun popToRoot() { while (stack.size > 1) stack.removeAt(stack.lastIndex) }
}

fun enterApp() {
    Nav.reset(
        when (App.user?.s("role")) {
            "doctor" -> Screen.DoctorHome
            "worker", "admin" -> Screen.WorkerHome
            else -> Screen.PatientHome
        }
    )
}

fun logout(ctx: Context) {
    Api.token = null
    App.user = null
    App.machine = null
    Cart.lines.clear()
    Prefs.save(ctx)
    Nav.reset(Screen.Login)
}

// ---------------- running server calls from buttons ----------------
class Act(private val ctx: Context, private val scope: CoroutineScope) {
    var busy by mutableStateOf(false)

    fun toast(m: String) = Toast.makeText(ctx, m, Toast.LENGTH_LONG).show()

    /** Runs [block]; shows server errors as a message. [onDone] runs only if it succeeded. */
    fun go(onDone: (() -> Unit)? = null, block: suspend () -> Unit) {
        if (busy) return
        busy = true
        scope.launch {
            try {
                block()
                onDone?.invoke()
            } catch (e: CancellationException) {
                throw e
            } catch (e: ApiError) {
                toast(e.message ?: "Error")
            } catch (e: Exception) {
                toast("Cannot reach the server: ${e.message}. Check the server address and Wi-Fi.")
            } finally {
                busy = false
            }
        }
    }
}

@Composable
fun rememberAct(): Act {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    return remember { Act(ctx, scope) }
}

/** Loads data from the server; [pollMs] > 0 keeps refreshing (used for live status screens). */
@Composable
fun <T> Load(
    key: Any? = null,
    pollMs: Long = 0,
    fetch: suspend () -> T,
    content: @Composable (T, () -> Unit) -> Unit,
) {
    var reload by remember { mutableIntStateOf(0) }
    var data by remember(key) { mutableStateOf<T?>(null) }
    var error by remember(key) { mutableStateOf<String?>(null) }
    LaunchedEffect(key, reload) {
        while (true) {
            try {
                data = fetch()
                error = null
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error = e.message ?: "Could not load"
            }
            if (pollMs <= 0) break
            delay(pollMs)
        }
    }
    val d = data
    val err = error
    if (d != null) {
        content(d, { reload++ })
    } else if (err != null) {
        Column(Modifier.fillMaxWidth().padding(8.dp)) {
            Text(err, color = Color(0xFFB00020))
            Button(onClick = { reload++ }) { Text("Retry") }
        }
    } else {
        Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
    }
}

// ---------------- shared widgets ----------------
fun inr(v: Double): String = "₹" + v.toLong()
fun shortId(id: String): String = id.drop(1).uppercase()
fun callNumber(ctx: Context, n: String) = ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$n")))

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TopBar(title: String, back: Boolean, actions: @Composable RowScope.() -> Unit = {}) {
    TopAppBar(
        title = { Text(title) },
        navigationIcon = { if (back) TextButton(onClick = { Nav.pop() }) { Text("←", fontSize = 24.sp) } },
        actions = actions,
    )
}

@Composable
fun Page(
    title: String,
    actions: @Composable RowScope.() -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    Scaffold(topBar = { TopBar(title, back = true, actions = actions) }) { inner ->
        Column(
            Modifier.padding(inner).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            content = content,
        )
    }
}

@Composable
fun Heading(t: String) = Text(t, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)

@Composable
fun Gap(h: Int = 12) = Spacer(Modifier.height(h.dp))

@Composable
fun Field(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier, hint: String = "", lines: Int = 1) {
    OutlinedTextField(
        value = value, onValueChange = onChange, label = { Text(label) },
        placeholder = { if (hint.isNotEmpty()) Text(hint) },
        modifier = modifier.fillMaxWidth(), minLines = lines,
    )
    Gap(8)
}

@Composable
fun TierChip(tier: Int) {
    val label = when (tier) {
        1 -> "OTC"
        2 -> "Rx"
        else -> "Emergency"
    }
    val color = when (tier) {
        1 -> Color(0xFF00796B)
        2 -> Color(0xFFEF6C00)
        else -> Color(0xFFC62828)
    }
    Text(label, color = color, fontSize = 12.sp, fontWeight = FontWeight.Bold)
}

@Composable
fun CheckRow(text: String, checked: Boolean, onChange: (Boolean) -> Unit, sub: String = "") {
    Row(Modifier.fillMaxWidth().clickable { onChange(!checked) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = checked, onCheckedChange = onChange)
        Column { Text(text); if (sub.isNotEmpty()) Text(sub, fontSize = 12.sp, color = Color.Gray) }
    }
}

@Composable
fun RadioRow(text: String, selected: Boolean, onSelect: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable { onSelect() }.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        RadioButton(selected = selected, onClick = onSelect)
        Text(text)
    }
}

@Composable
fun BigButton(text: String, onClick: () -> Unit, enabled: Boolean = true, color: Color? = null) {
    Button(
        onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().height(52.dp),
        colors = if (color != null) ButtonDefaults.buttonColors(containerColor = color) else ButtonDefaults.buttonColors(),
    ) { Text(text, fontSize = 16.sp) }
}

@Composable
fun EmergencyBar() {
    val ctx = LocalContext.current
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFFFEBEE)), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("In an emergency call first", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Button(onClick = { callNumber(ctx, "108") }, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFC62828))) { Text("108") }
            Spacer(Modifier.width(6.dp))
            Button(onClick = { callNumber(ctx, "112") }, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFC62828))) { Text("112") }
        }
    }
}

/** Chooses which vending machine the order is for (stored in App.machine). */
@Composable
fun MachinePicker() {
    Load(key = "machines", fetch = { Api.arr("/api/machines").objs() }) { ms, reload ->
        LaunchedEffect(ms) {
            val cur = App.machine
            App.machine = ms.firstOrNull { cur != null && it.s("id") == cur.s("id") }
                ?: ms.firstOrNull { it.b("online") } ?: ms.firstOrNull()
        }
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp)) {
                Text("Machine", fontWeight = FontWeight.Bold)
                ms.forEach { m ->
                    RadioRow(
                        "${m.s("name")}   ${if (m.b("online")) "● online" else "○ offline"}",
                        App.machine?.s("id") == m.s("id"),
                    ) { App.machine = m }
                }
                TextButton(onClick = reload) { Text("Refresh machines") }
            }
        }
    }
    Gap(8)
}

// ---------------- create order, request a machine payment QR, then collect ----------------
class Checkout(val act: Act) {
    var pending by mutableStateOf<JSONObject?>(null)
    fun start(body: JSONObject) = act.go {
        pending = Api.obj("POST", "/api/orders", body).getJSONObject("order")
    }
}

@Composable
fun rememberCheckout(): Checkout {
    val act = rememberAct()
    return remember { Checkout(act) }
}

@Composable
fun CheckoutDialog(co: Checkout) {
    val o = co.pending ?: return
    AlertDialog(
        onDismissRequest = { co.pending = null },
        title = { Text("Continue to machine payment") },
        text = { Text("Order ${shortId(o.s("id"))} is ready for ${inr(o.d("total"))}. The selected machine will display a payment QR. This is different from the machine QR used later for collection.") },
        confirmButton = {
            Button(onClick = {
                co.pending = null
                co.act.go {
                    Api.obj("POST", "/api/orders/${o.s("id")}/payment-session")
                    Nav.push(Screen.Payment(o.s("id")))
                }
            }) { Text("Show payment QR") }
        },
        dismissButton = { TextButton(onClick = { co.pending = null }) { Text("Cancel") } },
    )
}

fun machineIdOrNull(): String? = App.machine?.s("id")
