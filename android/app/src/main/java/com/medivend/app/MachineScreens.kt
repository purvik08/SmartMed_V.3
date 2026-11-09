package com.medivend.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject

/** Offline "map": machine GPS pins are plotted relative to each other. No map tiles are downloaded. */
@Composable
fun SchematicMap(ms: List<JSONObject>) {
    Canvas(Modifier.fillMaxWidth().height(220.dp)) {
        drawRect(Color(0xFFE0F2F1))
        if (ms.isEmpty()) return@Canvas
        val lats = ms.map { it.d("lat") }
        val lngs = ms.map { it.d("lng") }
        val minLat = lats.minOrNull() ?: 0.0
        val maxLat = lats.maxOrNull() ?: 0.0
        val minLng = lngs.minOrNull() ?: 0.0
        val maxLng = lngs.maxOrNull() ?: 0.0
        val pad = 56f
        val w = size.width - 2 * pad
        val h = size.height - 2 * pad
        val paint = android.graphics.Paint().apply {
            color = android.graphics.Color.WHITE
            textSize = 30f
            textAlign = android.graphics.Paint.Align.CENTER
            isFakeBoldText = true
        }
        ms.forEachIndexed { i, m ->
            val fx = if (maxLng > minLng) ((m.d("lng") - minLng) / (maxLng - minLng)).toFloat() else 0.5f
            val fy = if (maxLat > minLat) ((m.d("lat") - minLat) / (maxLat - minLat)).toFloat() else 0.5f
            val c = Offset(pad + fx * w, pad + (1f - fy) * h)
            drawCircle(if (m.b("online")) Color(0xFF00796B) else Color.Gray, radius = 22f, center = c)
            drawIntoCanvas { it.nativeCanvas.drawText("${i + 1}", c.x, c.y + 10f, paint) }
        }
    }
}

@Composable
fun MachinesTab() {
    Heading("Machines")
    Text("Offline map from GPS pins. Tap a machine to see stock.", fontSize = 12.sp, color = Color.Gray)
    Load(key = "mlist", fetch = { Api.arr("/api/machines").objs() }) { ms, reload ->
        Gap(8)
        SchematicMap(ms)
        TextButton(onClick = reload) { Text("Refresh") }
        ms.forEachIndexed { i, m ->
            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { Nav.push(Screen.MachineDetail(m.s("id"), m.s("name"))) }) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("${i + 1}", fontWeight = FontWeight.Bold, fontSize = 20.sp)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(m.s("name"), fontWeight = FontWeight.SemiBold)
                        Text("${m.s("address")} · ${if (m.b("online")) "online" else "offline"}", fontSize = 12.sp, color = Color.Gray)
                    }
                }
            }
        }
    }
}

/** Stock view for patients; workers can tap a lane to refill it. */
@Composable
fun MachineDetailScreen(id: String, name: String) {
    val isStaff = App.user?.s("role") != "patient"
    Page(name) {
        Load(key = id, fetch = { Api.arr("/api/machines/$id/lanes").objs() }) { lanes, _ ->
            lanes.forEach { l ->
                val empty = l.s("brand").isEmpty()
                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable(enabled = isStaff) { Nav.push(Screen.Refill(id, l.i("lane_no"))) }) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("${l.i("lane_no")}", fontWeight = FontWeight.Bold, fontSize = 20.sp)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(if (empty) "Empty lane" else l.s("brand"), fontWeight = FontWeight.SemiBold)
                            if (!empty) Text("batch ${l.s("batch")} · expires ${l.s("expiry")}", fontSize = 12.sp, color = Color.Gray)
                        }
                        if (!empty) {
                            val low = l.i("qty") < 3
                            Text("${l.i("qty")} left${if (low) "  LOW" else ""}", color = if (low) Color(0xFFC62828) else Color.Unspecified, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
            if (isStaff) Text("Tap a lane to refill it.", fontSize = 12.sp, color = Color.Gray)
        }
        if (!isStaff) {
            Gap()
            BigButton("Use this machine", onClick = {
                App.machine = jsonOf("id" to id, "name" to name)
                Nav.pop()
            })
        }
    }
}
