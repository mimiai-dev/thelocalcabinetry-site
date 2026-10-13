// Chat panel shared by the portal page and the website widget frame.
// LcoChat.mount(root, { token }) : token = guest bearer token (widget); omitted = login cookie.
// Polls every 4 s; renders with textContent only. Plain JS, no dependencies.
(function () {
  var API = (window.LCO && window.LCO.api) || ""; // static site: the Worker lives on another (same-site) host
  var POLL_MS = 4000, MAX_FILE = 10 * 1024 * 1024;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function mount(root, opts) {
    opts = opts || {};
    var after = 0, seen = {}, busy = false, timer = null, pending = [];
    var list = el("div", "chat-list"), note = el("div", "chat-note"), bar = el("form", "chat-bar");
    var input = el("textarea", "chat-input"), send = el("button", "chat-send", "Send"), attach = el("button", "chat-attach", "Attach photo / PDF");
    var file = el("input"), chips = el("div", "chat-chips");
    input.rows = 2; input.maxLength = 4000; input.placeholder = "Write to our team...";
    send.type = "submit"; attach.type = "button"; file.type = "file"; file.accept = "image/*,application/pdf"; file.hidden = true;
    list.setAttribute("aria-live", "polite");
    var row = el("div", "chat-row"); row.append(attach, send);
    bar.append(chips, input, row, file);
    root.append(list, note, bar);

    function headers(extra) {
      var h = extra || {};
      if (opts.token) h.authorization = "Bearer " + opts.token;
      return h;
    }
    function say(msg, bad) { note.textContent = msg || ""; note.className = "chat-note" + (bad ? " bad" : ""); }
    async function api(method, path, body, extra) {
      var res;
      try {
        res = await fetch(API + path, { method: method, headers: headers(extra), body: body, credentials: API ? "include" : "same-origin" });
      } catch (e) { throw { message: "No connection. We will keep trying." }; }
      var data = null;
      try { data = await res.json(); } catch (e) { data = {}; }
      if (res.status === 401) { throw { message: "Your session ended. Please reload and log in again.", auth: true }; }
      if (!res.ok) throw { message: data.message || "That did not go through. Please try again.", code: data.error };
      return data;
    }
    function draw(m) {
      if (seen[m.seq]) return;
      seen[m.seq] = 1;
      var row = el("div", "msg " + (m.from === "me" ? "me" : "team"));
      if (m.text) row.append(el("div", "msg-text", m.text));
      (m.files || []).forEach(function (f) { row.append(el("div", "msg-file", "Attachment: " + f.name)); });
      if (m.at) { var d = new Date(m.at); if (!isNaN(d)) row.append(el("div", "msg-at", d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))); }
      list.append(row);
      list.scrollTop = list.scrollHeight;
    }
    async function poll() {
      if (busy) return;
      busy = true;
      try {
        var r = await api("GET", "/api/chat/messages?after=" + after);
        (r.messages || []).forEach(function (m) { draw(m); if (m.seq > after) after = m.seq; });
        if (!list.firstChild) list.append(Object.assign(el("div", "chat-empty", "Say hello. Tell us about your space and attach a photo or sketch if you have one. A real person replies here."), { id: "chat-empty" }));
        else { var e = document.getElementById("chat-empty"); if (e) e.remove(); }
        say("");
      } catch (e) { say(e.message, true); if (e.auth) stop(); }
      busy = false;
    }
    function schedule() { clearTimeout(timer); timer = setTimeout(async function () { await poll(); schedule(); }, document.hidden ? POLL_MS * 6 : POLL_MS); }
    function stop() { clearTimeout(timer); }

    function drawChips() {
      chips.textContent = "";
      pending.forEach(function (p, i) {
        var c = el("span", "chip", p.name + " ");
        var x = el("button", "chip-x", "x"); x.type = "button"; x.setAttribute("aria-label", "remove " + p.name);
        x.addEventListener("click", function () { pending.splice(i, 1); drawChips(); });
        c.append(x); chips.append(c);
      });
    }
    attach.addEventListener("click", function () { file.click(); });
    file.addEventListener("change", async function () {
      var f = file.files[0]; file.value = "";
      if (!f) return;
      if (f.size > MAX_FILE) return say("That file is too large (10 MB maximum).", true);
      say("Uploading " + f.name + "...");
      try {
        var r = await api("POST", "/api/chat/file", f, { "content-type": f.type || "application/octet-stream", "x-file-name": encodeURIComponent(f.name) });
        pending.push({ id: r.file_id, name: f.name }); drawChips(); say("");
      } catch (e) { say(e.message, true); }
    });
    bar.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var text = input.value.trim();
      if (!text && !pending.length) return;
      send.disabled = true;
      try {
        await api("POST", "/api/chat/message", JSON.stringify({ text: text || "(attachment)", file_ids: pending.map(function (p) { return p.id; }) }), { "content-type": "application/json" });
        input.value = ""; pending = []; drawChips(); say("");
        await poll();
      } catch (e) { say(e.message, true); }
      send.disabled = false;
      input.focus();
    });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); bar.requestSubmit(); } });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) { poll(); schedule(); } });
    poll().then(schedule);
    return { poll: poll, stop: stop };
  }
  window.LcoChat = { mount: mount };
})();
