/* Sharma passcode lock — shared by Sharma AR and Sharma P&L (same file in both repos).
   The finance data is published only as finance-data.enc.json (AES-GCM 256, key from
   PBKDF2-SHA256). This file asks for the code, derives the key in the browser with WebCrypto,
   and decrypts. Only the derived key is kept, in sessionStorage (this tab only). The code
   itself is never stored, logged or sent anywhere. */
(function () {
  "use strict";
  var STORE = "sharma-fin-key:v1";
  var C = { navy: "#264387", dnavy: "#1a2f61", gold: "#F0A846", ink: "#1d2433", gray: "#5b6478", line: "#dfe4ee", bg: "#f4f6fb" };
  var HEAD = "'Barlow Semi Condensed',Arial Narrow,Arial,sans-serif";
  var BODY = "Inter,-apple-system,Segoe UI,Arial,sans-serif";
  var MONO = "'IBM Plex Mono',Menlo,Consolas,monospace";
  var subtle = window.crypto && window.crypto.subtle;
  var enc = new TextEncoder(), dec = new TextDecoder();

  function b64(buf) { var s = "", a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(s) { var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }

  function checkEnvelope(e) {
    if (!e || e.format !== "sharma-enc-v1" || e.kdf !== "PBKDF2-SHA256" || e.cipher !== "AES-GCM-256" ||
        typeof e.salt !== "string" || typeof e.iv !== "string" || typeof e.ciphertext !== "string" || !(e.iterations >= 600000)) {
      throw new Error("finance-data.enc.json is not in the expected format");
    }
    return e;
  }
  function derive(code, e) {
    return subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveKey"]).then(function (base) {
      return subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: unb64(e.salt), iterations: e.iterations },
        base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
    });
  }
  function decrypt(key, e) {
    return subtle.decrypt({ name: "AES-GCM", iv: unb64(e.iv) }, key, unb64(e.ciphertext))
      .then(function (pt) { return JSON.parse(dec.decode(pt)); });
  }
  function saved(e) {
    try {
      var s = JSON.parse(sessionStorage.getItem(STORE) || "null");
      if (!s || s.salt !== e.salt || s.iterations !== e.iterations || !s.k) return null;
      return subtle.importKey("raw", unb64(s.k), { name: "AES-GCM" }, false, ["decrypt"]);
    } catch (x) { return null; }
  }
  function remember(key, e) {
    return subtle.exportKey("raw", key).then(function (raw) {
      try { sessionStorage.setItem(STORE, JSON.stringify({ salt: e.salt, iterations: e.iterations, k: b64(raw) })); } catch (x) {}
    });
  }


  var ALERT = "https://formspree.io/f/mzerejza";
  var FAILS = "sharma-fin-fails:";

  function appLabel(opts) {
    var path = (location.pathname || "").toLowerCase();
    if (path.indexOf("/sharma-ar") !== -1) return "Sharma AR";
    if (path.indexOf("/sharma-pnl") !== -1) return "Sharma P&L";
    var n = (opts && opts.appName) || "";
    if (/receivable/i.test(n)) return "Sharma AR";
    if (/p\s*&?\s*l/i.test(n)) return "Sharma P&L";
    return n || "Sharma finance app";
  }
  function failCount(opts) {
    try {
      var n = parseInt(localStorage.getItem(FAILS + appLabel(opts)) || "0", 10);
      return (n > 0 && isFinite(n)) ? n : 0;
    } catch (x) { return 0; }
  }
  function setFailCount(opts, n) {
    try {
      var k = FAILS + appLabel(opts);
      if (n > 0) localStorage.setItem(k, String(n));
      else localStorage.removeItem(k);
    } catch (x) {}
  }
  function alertTime(d) {
    var iso = d.toISOString(), local = iso;
    try {
      local = d.toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" });
    } catch (x) {}
    return iso + " / " + local + " America/New_York";
  }
  // Email office@ after 5, 10, 15, ... wrong tries. Never send the attempted or real code.
  function maybeAlert(opts, n) {
    if (n < 5 || n % 5 !== 0) return;
    var app = appLabel(opts);
    var body = {
      app: app,
      url: String(location.href || ""),
      time: alertTime(new Date()),
      attempts: n,
      userAgent: String(navigator.userAgent || ""),
      _subject: "Sharma app lock: " + n + " wrong passcode tries on " + app
    };
    try {
      fetch(ALERT, {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }).then(function () {}, function () {});
    } catch (x) {}
  }

  function css() {
    if (document.getElementById("sl-css")) return;
    var st = document.createElement("style");
    st.id = "sl-css";
    st.textContent =
      "html.sl-locked,html.sl-locked body{overflow:hidden}" +
      ".sl{position:fixed;inset:0;z-index:1000;background:" + C.bg + ";overflow:auto;color:" + C.ink + ";font:400 16px/1.45 " + BODY + "}" +
      ".sl-top{background:#fff;border-bottom:3px solid " + C.gold + "}" +
      ".sl-top-in,.sl-wrap{max-width:560px;margin:0 auto;padding:0 16px}" +
      ".sl-top-in{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:64px}" +
      ".sl-logo{height:40px;width:auto;display:block}" +
      ".sl-app{font:700 16px/1.15 " + HEAD + ";color:" + C.dnavy + ";text-transform:uppercase;letter-spacing:.04em;text-align:right}" +
      ".sl-panel{margin:20px 0;background:#fff;border:1px solid " + C.line + ";border-radius:4px;padding:16px}" +
      ".sl h2{font:700 22px/1.15 " + HEAD + ";color:" + C.dnavy + ";margin:0 0 12px;padding-bottom:6px;border-bottom:2px solid " + C.gold + "}" +
      ".sl p{margin:0 0 14px;font-size:16px;color:" + C.gray + "}" +
      ".sl label{display:block;font:700 16px/1.2 " + HEAD + ";color:" + C.dnavy + ";text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}" +
      ".sl input{box-sizing:border-box;width:100%;min-height:56px;padding:8px 12px;border:1px solid " + C.gray + ";border-radius:4px;background:#fff;color:" + C.ink + ";font:600 24px/1 " + MONO + ";letter-spacing:.3em;-webkit-appearance:none;appearance:none}" +
      ".sl input:focus{outline:3px solid " + C.gold + ";outline-offset:1px;border-color:" + C.dnavy + "}" +
      ".sl button{box-sizing:border-box;width:100%;min-height:56px;margin-top:12px;border:1px solid " + C.dnavy + ";border-radius:4px;background:" + C.navy + ";color:#fff;font:700 20px/1 " + HEAD + ";text-transform:uppercase;letter-spacing:.06em;cursor:pointer}" +
      ".sl button:focus-visible{outline:3px solid " + C.gold + ";outline-offset:2px}" +
      ".sl button[disabled]{background:" + C.gray + ";border-color:" + C.gray + "}" +
      ".sl-err{margin-top:12px;padding:10px 12px;border:1px solid " + C.dnavy + ";border-left:6px solid " + C.gold + ";border-radius:4px;background:#fff;font:700 18px/1.2 " + HEAD + ";color:" + C.dnavy + ";text-transform:uppercase;letter-spacing:.04em}" +
      ".sl-err[hidden]{display:none}" +
      ".sl-foot{color:" + C.gray + ";font-size:16px;padding:0 0 32px}" +
      ".sl-lockbtn{display:block;box-sizing:border-box;min-height:48px;min-width:120px;margin:8px auto 32px;padding:0 20px;border:1px solid " + C.dnavy + ";border-radius:4px;background:#fff;color:" + C.dnavy + ";font:700 18px/1 " + HEAD + ";text-transform:uppercase;letter-spacing:.05em;cursor:pointer}";
    document.head.appendChild(st);
  }

  function prompt(e, opts) {
    css();
    return new Promise(function (resolve) {
      var root = document.createElement("div");
      root.className = "sl";
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "true");
      root.setAttribute("aria-labelledby", "sl-h");
      root.innerHTML =
        '<div class="sl-top"><div class="sl-top-in"><img class="sl-logo" src="' + (opts.logo || "assets/logo.png") +
        '" alt="Sharma Electric &amp; HVAC" width="900" height="193"><div class="sl-app"></div></div></div>' +
        '<div class="sl-wrap"><form class="sl-panel" autocomplete="off" novalidate>' +
        '<h2 id="sl-h">Locked</h2><p>Enter the office code to see the numbers.</p>' +
        '<label for="sl-code">Code</label>' +
        '<input id="sl-code" name="sl-code" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="12" required>' +
        '<button type="submit">Unlock</button>' +
        '<div class="sl-err" role="alert" hidden>Wrong code</div>' +
        '</form><div class="sl-foot">Sharma Electric &amp; HVAC</div></div>';
      root.querySelector(".sl-app").textContent = opts.appName || "";
      document.documentElement.classList.add("sl-locked");
      document.body.appendChild(root);
      var form = root.querySelector("form"), input = root.querySelector("input"),
          btn = root.querySelector("button"), err = root.querySelector(".sl-err");
      setTimeout(function () { try { input.focus(); } catch (x) {} }, 50);
      input.addEventListener("input", function () { err.hidden = true; });
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var code = input.value.trim();
        if (!code) { err.textContent = "Enter the code"; err.hidden = false; return; }
        btn.disabled = true; btn.textContent = "Checking…"; err.hidden = true;
        var key;
        derive(code, e).then(function (k) { key = k; return decrypt(k, e); }).then(function (data) {
          code = ""; input.value = "";
          setFailCount(opts, 0);
          return remember(key, e).then(function () {
            root.remove();
            document.documentElement.classList.remove("sl-locked");
            resolve(data);
          });
        }).catch(function () {
          code = ""; input.value = "";
          var n = failCount(opts) + 1;
          setFailCount(opts, n);
          maybeAlert(opts, n);
          err.textContent = "Wrong code"; err.hidden = false;
          btn.disabled = false; btn.textContent = "Unlock";
          input.focus();
        });
      });
    });
  }

  function addLockButton() {
    if (document.getElementById("sl-lockbtn")) return;
    css();
    var b = document.createElement("button");
    b.type = "button"; b.id = "sl-lockbtn"; b.className = "sl-lockbtn"; b.textContent = "Lock";
    b.addEventListener("click", function () { try { sessionStorage.removeItem(STORE); } catch (x) {} location.reload(); });
    document.body.appendChild(b);
  }

  // load(url, {appName, logo}) -> Promise<decrypted finance data>
  function load(url, opts) {
    opts = opts || {};
    if (!subtle) return Promise.reject(new Error("This browser can't unlock the data (needs HTTPS and WebCrypto)."));
    return fetch(url + (url.indexOf("?") < 0 ? "?" : "&") + "t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(url + " returned " + r.status); return r.json(); })
      .then(function (raw) {
        var e = checkEnvelope(raw);
        var k = saved(e);
        var tryKey = k ? k.then(function (key) { return decrypt(key, e); }) : Promise.reject();
        return tryKey.catch(function () {
          try { sessionStorage.removeItem(STORE); } catch (x) {}
          return prompt(e, opts);
        });
      })
      .then(function (data) { setFailCount(opts, 0); addLockButton(); return data; });
  }

  window.SharmaLock = { load: load };
})();
