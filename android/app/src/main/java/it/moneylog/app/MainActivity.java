package it.moneylog.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.URLConnection;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String INDEX = "https://" + HOST + "/index.html";
    private static final int OPEN_FILE = 1;
    private static final int SAVE_FILE = 2;
    private static final int MAX_HTML = 4_000_000;
    private static final String SNAPSHOT = String.format(Locale.ROOT, """
            (() => {
                if (!document.body) return null;
                const ignored = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'TEMPLATE']);
                function copy(node) {
                    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue);
                    if (node.nodeType !== Node.ELEMENT_NODE || ignored.has(node.tagName.toUpperCase())) return null;
                    const element = document.createElement(node.localName.includes('-') ? 'div' : node.localName);
                    for (const attribute of ['id', 'role', 'hidden', 'aria-hidden', 'title']) {
                        if (node.hasAttribute(attribute)) element.setAttribute(attribute, node.getAttribute(attribute));
                    }
                    const children = node instanceof HTMLSlotElement && node.assignedNodes().length ?
                        node.assignedNodes() : (node.shadowRoot || node).childNodes;
                    for (const child of children) {
                        const next = copy(child);
                        if (next) element.append(next);
                    }
                    return element;
                }
                return copy(document.body).innerHTML.slice(0, %d);
            })()
            """, MAX_HTML + 1);
    private WebView app;
    private AlertDialog reader;
    private QuoteReader quoteReader;
    private ValueCallback<Uri[]> filePicker;
    private Uri selectedBackup;
    private String exportContent;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout container = new FrameLayout(this);
        container.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        setContentView(container);
        app = new WebView(this);
        configureWebView(app);
        app.getSettings().setDomStorageEnabled(true);
        app.getSettings().setAllowContentAccess(true);
        app.addJavascriptInterface(new MoneyLogBridge(), "MoneyLogAndroid");
        app.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (isLocal(request.getUrl())) return loadAsset(request.getUrl());
                if ("content".equals(request.getUrl().getScheme())) return null;
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", null, null);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (isLocal(url)) return !INDEX.equals(url.toString());
                if (request.isForMainFrame() && isWebUrl(url)) openExternal(url);
                return true;
            }
        });
        app.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePicker != null) filePicker.onReceiveValue(null);
                filePicker = callback;
                selectedBackup = null;
                try {
                    Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                            .addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                    startActivityForResult(picker, OPEN_FILE);
                } catch (ActivityNotFoundException error) {
                    filePicker = null;
                    callback.onReceiveValue(null);
                }
                return true;
            }
        });
        container.addView(app, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        app.loadUrl(INDEX);
    }

    private static void configureWebView(WebView view) {
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setAllowFileAccess(false);
        view.getSettings().setAllowContentAccess(false);
    }

    private static boolean isLocal(Uri url) {
        return "https".equals(url.getScheme()) && HOST.equals(url.getHost()) && url.getPort() == -1;
    }

    private static boolean isWebUrl(Uri url) {
        return url.getHost() != null && url.getUserInfo() == null &&
                ("https".equalsIgnoreCase(url.getScheme()) || "http".equalsIgnoreCase(url.getScheme()));
    }

    private WebResourceResponse loadAsset(Uri url) {
        String path = url.getPath();
        if (path != null && path.matches("/[a-zA-Z0-9_./-]+") && !path.contains("..")) {
            try {
                String mime = path.endsWith(".js") || path.endsWith(".mjs") ? "text/javascript" :
                        URLConnection.guessContentTypeFromName(path);
                if (path.endsWith(".css")) mime = "text/css";
                return new WebResourceResponse(mime == null ? "application/octet-stream" : mime, "UTF-8",
                        200, "OK", Collections.singletonMap("Content-Security-Policy",
                        "script-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'"),
                        getAssets().open(path.substring(1)));
            } catch (IOException ignored) {
                // Missing local assets must stay on the local origin.
            }
        }
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, null);
    }

    private void openExternal(Uri url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, url));
        } catch (ActivityNotFoundException ignored) {
            // The device has no browser available for this link.
        }
    }

    private final class MoneyLogBridge {
        @JavascriptInterface
        public void readBackup() {
            runOnUiThread(() -> {
                Uri file = selectedBackup;
                if (file == null) {
                    deliverBackup(null, "Seleziona di nuovo il file di backup.");
                    return;
                }
                selectedBackup = null;
                new Thread(() -> {
                    try (InputStream stream = getContentResolver().openInputStream(file)) {
                        if (stream == null) throw new IOException("Il file selezionato non è leggibile.");
                        InputStreamReader input = new InputStreamReader(stream, StandardCharsets.UTF_8);
                        StringBuilder text = new StringBuilder();
                        char[] buffer = new char[8192];
                        int count;
                        while ((count = input.read(buffer)) != -1) text.append(buffer, 0, count);
                        runOnUiThread(() -> deliverBackup(text.toString(), null));
                    } catch (IOException | SecurityException error) {
                        runOnUiThread(() -> deliverBackup(null, error.toString()));
                    }
                }, "MoneyLog-backup").start();
            });
        }

        @JavascriptInterface
        public void readPage(String address) {
            runOnUiThread(() -> showReader(Uri.parse(address)));
        }

        @JavascriptInterface
        public void readQuotePage(String address, String request) {
            runOnUiThread(() -> {
                Uri url = Uri.parse(address);
                if (!isWebUrl(url) || isLocal(url) || reader != null || quoteReader != null) {
                    deliverQuotePage(request, null, "Pagina non valida o lettore già in uso.");
                    return;
                }
                quoteReader = new QuoteReader(request);
                quoteReader.load(url);
            });
        }

        @JavascriptInterface
        public void finishQuotePage(String request) {
            runOnUiThread(() -> {
                if (quoteReader != null && quoteReader.request.equals(request)) quoteReader.close();
            });
        }

        @JavascriptInterface
        public void saveFile(String name, String type, String content) {
            runOnUiThread(() -> {
                if (exportContent != null) return;
                exportContent = content;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE).setType(type)
                        .putExtra(Intent.EXTRA_TITLE, name);
                try {
                    startActivityForResult(intent, SAVE_FILE);
                } catch (ActivityNotFoundException error) {
                    exportContent = null;
                    showFileError();
                }
            });
        }
    }

    private void deliverBackup(String content, String error) {
        if (app == null) return;
        String value = content == null ? "null" : JSONObject.quote(content);
        String failure = error == null ? "null" : JSONObject.quote(error);
        app.evaluateJavascript("window.moneyLogBackupResult && window.moneyLogBackupResult("
                + value + "," + failure + ")", null);
    }

    private final class QuoteReader {
        private final String request;
        private final WebView page = new WebView(MainActivity.this);
        private final Handler timer = new Handler(Looper.getMainLooper());
        private String lastHtml;
        private boolean sampling;

        private QuoteReader(String request) {
            this.request = request;
        }

        private void load(Uri url) {
            configureWebView(page);
            page.getSettings().setDomStorageEnabled(true);
            page.layout(0, 0, app.getWidth(), app.getHeight());
            page.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest navigation) {
                    return !isWebUrl(navigation.getUrl()) || isLocal(navigation.getUrl());
                }

                @Override
                public void onPageFinished(WebView view, String address) {
                    if (quoteReader != QuoteReader.this || sampling || !isWebUrl(Uri.parse(address))) return;
                    sampling = true;
                    timer.postDelayed(QuoteReader.this::sample, 1000);
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest navigation, WebResourceError error) {
                    if (navigation.isForMainFrame()) fail("Pagina non raggiungibile.");
                }

                @Override
                public void onReceivedHttpError(WebView view, WebResourceRequest navigation, WebResourceResponse response) {
                    if (navigation.isForMainFrame()) fail("La fonte ha risposto con errore HTTP " + response.getStatusCode() + ".");
                }
            });
            timer.postDelayed(() -> fail("Tempo di lettura esaurito."), 15000);
            page.loadUrl(url.toString());
        }

        private void sample() {
            if (quoteReader != this) return;
            page.evaluateJavascript(SNAPSHOT, result -> {
                if (quoteReader != this) return;
                try {
                    Object snapshot = result == null ? null : new JSONTokener(result).nextValue();
                    if (snapshot instanceof String html) {
                        if (html.length() > MAX_HTML) {
                            fail("La pagina è troppo grande per la lettura.");
                            return;
                        }
                        if (!html.equals(lastHtml)) {
                            lastHtml = html;
                            deliverQuotePage(request, html, null);
                        }
                    }
                    timer.postDelayed(this::sample, 1250);
                } catch (Exception error) {
                    fail("Impossibile leggere il contenuto della pagina.");
                }
            });
        }

        private void fail(String error) {
            if (quoteReader != this) return;
            close();
            deliverQuotePage(request, null, error);
        }

        private void close() {
            quoteReader = null;
            timer.removeCallbacksAndMessages(null);
            page.stopLoading();
            page.destroy();
        }
    }

    private void deliverQuotePage(String request, String html, String error) {
        if (app == null) return;
        String value = html == null ? "null" : JSONObject.quote(html);
        String failure = error == null ? "null" : JSONObject.quote(error);
        app.evaluateJavascript("window.moneyLogQuotePageResult && window.moneyLogQuotePageResult("
                + JSONObject.quote(request) + "," + value + "," + failure + ")", null);
    }

    private void showReader(Uri url) {
        if (!isWebUrl(url) || isLocal(url) || reader != null) {
            deliverPage(null, "Indica un URL pubblico HTTP o HTTPS valido.");
            return;
        }
        WebView page = new WebView(this);
        configureWebView(page);
        page.getSettings().setDomStorageEnabled(true);
        boolean[] loadFailed = { false };
        page.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isWebUrl(request.getUrl()) || isLocal(request.getUrl());
            }

            @Override
            public void onPageStarted(WebView view, String address, android.graphics.Bitmap icon) {
                loadFailed[0] = false;
                if (reader != null) reader.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && reader != null) {
                    loadFailed[0] = true;
                    reader.setTitle("Pagina non raggiungibile");
                }
            }

            @Override
            public void onPageFinished(WebView view, String address) {
                if (reader != null && !loadFailed[0] && isWebUrl(Uri.parse(address))) {
                    reader.setTitle(Uri.parse(address).getHost());
                    reader.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
                }
            }
        });
        boolean[] finished = { false };
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(url.getHost())
                .setView(page)
                .setNegativeButton("Annulla", null)
                .setPositiveButton("Leggi pagina", null)
                .create();
        reader = dialog;
        dialog.setOnDismissListener(dismissed -> {
            page.stopLoading();
            if (page.getParent() instanceof ViewGroup parent) parent.removeView(page);
            page.destroy();
            reader = null;
            if (!finished[0]) deliverPage(null, "Lettura annullata.");
        });
        dialog.show();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        }
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(button -> {
            button.setEnabled(false);
            page.evaluateJavascript(SNAPSHOT, result -> {
                if (reader != dialog) return;
                if (result == null || result.equals("null")) {
                    button.setEnabled(true);
                    return;
                }
                finished[0] = true;
                try {
                    Object html = new JSONTokener(result).nextValue();
                    if (!(html instanceof String) || ((String) html).length() > MAX_HTML) {
                        deliverPage(null, "La pagina è troppo grande per la lettura.");
                    } else {
                        deliverPage((String) html, null);
                    }
                } catch (Exception error) {
                    deliverPage(null, "Non è stato possibile leggere il contenuto della pagina.");
                }
                dialog.dismiss();
            });
        });
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
        page.loadUrl(url.toString());
    }

    private void deliverPage(String html, String error) {
        if (app == null) return;
        String value = html == null ? "null" : JSONObject.quote(html);
        String failure = error == null ? "null" : JSONObject.quote(error);
        app.evaluateJavascript("window.moneyLogPageResult && window.moneyLogPageResult("
                + value + "," + failure + ")", null);
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == OPEN_FILE && filePicker != null) {
            ValueCallback<Uri[]> callback = filePicker;
            filePicker = null;
            Uri file = result == RESULT_OK && data != null ? data.getData() : null;
            selectedBackup = file != null && "content".equals(file.getScheme()) ? file : null;
            callback.onReceiveValue(selectedBackup == null ? null : new Uri[] { selectedBackup });
        } else if (request == SAVE_FILE) {
            String content = exportContent;
            exportContent = null;
            if (result != RESULT_OK || data == null || data.getData() == null || content == null) return;
            try (OutputStream stream = getContentResolver().openOutputStream(data.getData())) {
                if (stream == null) throw new IOException("Destination unavailable");
                stream.write(content.getBytes(StandardCharsets.UTF_8));
            } catch (IOException error) {
                showFileError();
            }
        }
    }

    private void showFileError() {
        new AlertDialog.Builder(this).setMessage("Impossibile salvare il file.")
                .setPositiveButton("OK", null).show();
    }

    @Override
    protected void onDestroy() {
        if (quoteReader != null) quoteReader.close();
        if (reader != null) reader.dismiss();
        if (filePicker != null) filePicker.onReceiveValue(null);
        if (app != null) {
            app.removeJavascriptInterface("MoneyLogAndroid");
            app.destroy();
            app = null;
        }
        super.onDestroy();
    }
}
