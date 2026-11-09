package com.medivend.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Prefs.load(this)
        setContent {
            MaterialTheme(colorScheme = lightColorScheme(primary = Color(0xFF00796B))) {
                Surface(Modifier.fillMaxSize()) { Root() }
            }
        }
    }
}

@Composable
fun Root() {
    var booting by remember { mutableStateOf(Api.token != null) }
    LaunchedEffect(Unit) {
        if (Api.token != null) {
            try {
                App.user = Api.obj("GET", "/api/me")
                enterApp()
            } catch (e: Exception) {
                // server not reachable or login expired: show the login screen (server address can be fixed there)
                Nav.reset(Screen.Login)
            }
        }
        booting = false
    }
    BackHandler(enabled = Nav.stack.size > 1) { Nav.pop() }
    if (booting) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }
    when (val top = Nav.stack.last()) {
        is Screen.Login -> LoginScreen()
        is Screen.PatientHome -> PatientShell()
        is Screen.DoctorHome -> DoctorShell()
        is Screen.WorkerHome -> WorkerShell()
        is Screen.Search -> SearchScreen(top.query)
        is Screen.CartScreen -> CartScreen()
        is Screen.Guide -> GuideScreen()
        is Screen.Profile -> ProfileScreen()
        is Screen.EmergencyForm -> EmergencyFormScreen()
        is Screen.EmergencyStatus -> EmergencyStatusScreen(top.id)
        is Screen.Dispense -> DispenseScreen(top.orderId)
        is Screen.ApplyPass -> ApplyPassScreen()
        is Screen.UsePass -> UsePassScreen(top.pass)
        is Screen.DoctorCase -> DoctorCaseScreen(top.id)
        is Screen.PassReview -> PassReviewScreen(top.id)
        is Screen.MachineDetail -> MachineDetailScreen(top.id, top.name)
        is Screen.Refill -> RefillScreen(top.machineId, top.laneNo)
    }
}
