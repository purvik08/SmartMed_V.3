package com.medivend.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun LoginScreen() {
    val act = rememberAct()
    val ctx = LocalContext.current
    var server by remember { mutableStateOf(Api.baseUrl.removePrefix("http://")) }
    var phone by remember { mutableStateOf("") }
    var otp by remember { mutableStateOf("") }
    var sent by remember { mutableStateOf(false) }

    fun applyServer() {
        Api.baseUrl = "http://" + server.trim().removePrefix("http://").trimEnd('/')
        Prefs.save(ctx)
    }

    Scaffold { inner ->
        Column(
            Modifier.padding(inner).fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text("SmartMed", fontSize = 30.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            Text("Doctor-authorised medicine, 24x7 (offline prototype)")
            Gap(24)
            Field("Server address (laptop IP:port)", server, { server = it; sent = false }, hint = "192.168.1.5:8080  (emulator: 10.0.2.2:8080)")
            Field("Mobile number (10 digits)", phone, { phone = it.filter { c -> c.isDigit() }.take(10) })
            if (sent) Field("OTP", otp, { otp = it.filter { c -> c.isDigit() }.take(6) })
            Gap(8)
            BigButton(if (sent) "Verify and continue" else "Send OTP", enabled = !act.busy, onClick = {
                applyServer()
                if (!sent) {
                    act.go {
                        Api.obj("POST", "/api/auth/otp", jsonOf("phone" to phone))
                        sent = true
                    }
                } else {
                    act.go {
                        val r = Api.obj("POST", "/api/auth/verify", jsonOf("phone" to phone, "otp" to otp))
                        Api.token = r.getString("token")
                        App.user = r.getJSONObject("user")
                        Prefs.save(ctx)
                        enterApp()
                    }
                }
            })
            Gap(24)
            Text(
                "Demo logins, OTP 123456:\nPatient 9000000001 or 9000000002\nDoctor 9000000011, backup doctor 9000000012\nWorker 9000000021",
                fontSize = 12.sp, color = Color.Gray,
            )
            Gap(8)
            Text("Prototype, not a medical device. Works on your local network only.", fontSize = 12.sp, color = Color.Gray)
        }
    }
}
