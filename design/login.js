// Sign-in on the public site: the email code is requested from / verified by the design API
// (same-site host, cookie set there), then the visitor goes back to /design/.
(function () {
  var API = window.LCO.api, $ = function (id) { return document.getElementById(id); };
  var err = $("err"), fe = $("f-email"), fc = $("f-code"), email = "";
  function post(path, body) {
    return fetch(API + path, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); });
  }
  fe.addEventListener("submit", function (e) {
    e.preventDefault(); err.textContent = ""; email = $("email").value.trim();
    post("/login/request", { email: email }).then(function (r) {
      if (r.ok) { fe.hidden = true; fc.hidden = false; $("intro").textContent = "We sent a code to " + email + ". It expires in 10 minutes."; $("code").focus(); }
      else err.textContent = r.d.message || (r.d.error === "bad_email" ? "Please enter a valid email address." : "That did not go through. Please try again.");
    }).catch(function () { err.textContent = "We could not reach the sign-in service. Please try again."; });
  });
  fc.addEventListener("submit", function (e) {
    e.preventDefault(); err.textContent = "";
    post("/login/verify", { email: email, code: $("code").value.trim() }).then(function (r) {
      if (r.ok) location.href = "/design/";
      else err.textContent = r.status === 429 ? "Too many wrong codes. Request a new code and try again later." : "That code is wrong or has expired.";
    }).catch(function () { err.textContent = "We could not reach the sign-in service. Please try again."; });
  });
})();
