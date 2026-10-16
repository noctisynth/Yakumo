package app.yakumo.vault

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.webkit.WebView
import androidx.activity.result.ActivityResult
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@InvokeArg class AppearanceArgs { var dark: Boolean = false }
@InvokeArg class KeyArgs { var create: Boolean = false }
@InvokeArg class ExportArgs { lateinit var filename: String; lateinit var content: String }

@TauriPlugin
class VaultPlugin(private val host: Activity): Plugin(host) {
    override fun load(webView: WebView) {
        super.load(webView)
        // Keep Android/WebView detection intact while identifying our map requests.
        val identity = "Yakumo (+https://github.com/noctisynth/Yakumo)"
        if (!webView.settings.userAgentString.contains(identity)) {
            webView.settings.userAgentString += " $identity"
        }
    }
    private val alias = "app.yakumo.vault.wrap.v1"
    private var exportContent: String? = null
    @Command
    fun appearance(invoke: Invoke) {
        try {
            val dark = invoke.parseArgs(AppearanceArgs::class.java).dark
            val decor = host.window.decorView
            val insets = ViewCompat.getRootWindowInsets(decor)
            val bars = insets?.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val density = host.resources.displayMetrics.density.toDouble()
            val controller = WindowInsetsControllerCompat(host.window, decor)
            controller.isAppearanceLightStatusBars = !dark
            controller.isAppearanceLightNavigationBars = !dark
            invoke.resolve(JSObject().put("top", (bars?.top ?: 0) / density).put("bottom", (bars?.bottom ?: 0) / density)
                .put("left", (bars?.left ?: 0) / density).put("right", (bars?.right ?: 0) / density)
                .put("keyboard", insets?.isVisible(WindowInsetsCompat.Type.ime()) == true))
        } catch (_: Exception) { invoke.reject("Appearance unavailable") }
    }
    @Command @Synchronized
    fun key(invoke: Invoke) {
        var plaintext: ByteArray? = null
        try {
            val args = invoke.parseArgs(KeyArgs::class.java)
            val prefs = host.getSharedPreferences("yakumo-native-vault", Context.MODE_PRIVATE)
            val stored = prefs.getString("wrapped-master", null)
            val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            if (stored != null && !store.containsAlias(alias)) { invoke.reject("Secure storage unavailable"); return }
            if (stored == null && !args.create) { invoke.reject("Secure storage unavailable"); return }
            val wrappingKey = if (store.containsAlias(alias)) store.getKey(alias, null) as SecretKey else {
                val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
                generator.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256).setRandomizedEncryptionRequired(true).build())
                generator.generateKey()
            }
            if (stored == null) {
                plaintext = ByteArray(32).also { SecureRandom().nextBytes(it) }
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.ENCRYPT_MODE, wrappingKey)
                val wrapped = cipher.iv + cipher.doFinal(plaintext)
                if (!prefs.edit().putString("wrapped-master", Base64.encodeToString(wrapped, Base64.NO_WRAP)).commit()) { invoke.reject("Secure storage unavailable"); return }
            } else {
                val wrapped = Base64.decode(stored, Base64.NO_WRAP)
                require(wrapped.size >= 28)
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.DECRYPT_MODE, wrappingKey, GCMParameterSpec(128, wrapped.copyOfRange(0, 12)))
                plaintext = cipher.doFinal(wrapped.copyOfRange(12, wrapped.size))
            }
            require(plaintext!!.size == 32)
            invoke.resolve(JSObject().put("key", Base64.encodeToString(plaintext, Base64.NO_WRAP)))
        } catch (_: Exception) { invoke.reject("Secure storage unavailable") }
        finally { plaintext?.fill(0) }
    }
    @Command
    fun exportPreview(invoke: Invoke) {
        if (exportContent != null) { invoke.reject("Export in progress"); return }
        try {
            val args = invoke.parseArgs(ExportArgs::class.java)
            require(args.content.length <= 4 * 1024 * 1024 && args.filename.matches(Regex("yakumo-synthetic-[a-f0-9]{12}\\.json")))
            exportContent = args.content
            val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE, args.filename)
            startActivityForResult(invoke, intent, "onExport")
        } catch (_: Exception) { exportContent = null; invoke.reject("Export failed") }
    }
    @ActivityCallback
    fun onExport(invoke: Invoke, result: ActivityResult) {
        val content = exportContent; exportContent = null
        if (result.resultCode != Activity.RESULT_OK) { invoke.resolve(JSObject().put("cancelled", true)); return }
        try {
            val uri = result.data?.data ?: throw IllegalStateException()
            host.contentResolver.openOutputStream(uri, "wt").use { stream -> requireNotNull(stream).write(requireNotNull(content).toByteArray(Charsets.UTF_8)) }
            invoke.resolve(JSObject().put("cancelled", false))
        } catch (_: Exception) { invoke.reject("Export failed") }
    }
}
