package com.medivend.app

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class ApiError(message: String, val code: String = "") : Exception(message)

// ---- small JSON helpers (org.json ships with Android, no libraries needed) ----
fun JSONObject.s(k: String): String = if (!has(k) || isNull(k)) "" else getString(k)
fun JSONObject.i(k: String): Int = if (!has(k) || isNull(k)) 0 else getInt(k)
fun JSONObject.d(k: String): Double = if (!has(k) || isNull(k)) 0.0 else getDouble(k)
fun JSONObject.b(k: String): Boolean = has(k) && !isNull(k) && getBoolean(k)
fun JSONObject.arr(k: String): JSONArray = optJSONArray(k) ?: JSONArray()
fun JSONArray.objs(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }
fun JSONArray.strs(): List<String> = (0 until length()).map { getString(it) }

fun jsonOf(vararg pairs: Pair<String, Any?>): JSONObject {
    val o = JSONObject()
    for ((k, v) in pairs) o.put(k, v ?: JSONObject.NULL)
    return o
}

fun jsonArr(items: List<Any?>): JSONArray {
    val a = JSONArray()
    for (x in items) a.put(x)
    return a
}

/** Talks to the SmartMed server on your own Wi-Fi / hotspot. Nothing leaves the local network. */
object Api {
    var baseUrl: String = "http://10.0.2.2:8080"
    var token: String? = null

    private fun http(method: String, path: String, body: JSONObject?): ByteArray {
        val conn = URL(baseUrl + path).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 5000
            conn.readTimeout = 20000
            conn.setRequestProperty("Content-Type", "application/json")
            token?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                conn.doOutput = true
                conn.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val bytes = stream?.use { it.readBytes() } ?: ByteArray(0)
            if (code !in 200..299) {
                val j = try { JSONObject(String(bytes)) } catch (e: Exception) { null }
                throw ApiError(j?.s("error")?.ifEmpty { null } ?: "Server error ($code)", j?.s("code") ?: "")
            }
            return bytes
        } finally {
            conn.disconnect()
        }
    }

    suspend fun obj(method: String, path: String, body: JSONObject? = null): JSONObject =
        withContext(Dispatchers.IO) { JSONObject(String(http(method, path, body))) }

    suspend fun arr(path: String): JSONArray =
        withContext(Dispatchers.IO) { JSONArray(String(http("GET", path, null))) }

    suspend fun bytes(path: String): ByteArray =
        withContext(Dispatchers.IO) { http("GET", path, null) }
}

/** Remembers the server address and the login between app launches. */
object Prefs {
    fun load(ctx: Context) {
        val p = ctx.getSharedPreferences("medivend", Context.MODE_PRIVATE)
        Api.baseUrl = p.getString("server", Api.baseUrl) ?: Api.baseUrl
        Api.token = p.getString("token", null)
    }

    fun save(ctx: Context) {
        ctx.getSharedPreferences("medivend", Context.MODE_PRIVATE).edit()
            .putString("server", Api.baseUrl).putString("token", Api.token).apply()
    }
}
