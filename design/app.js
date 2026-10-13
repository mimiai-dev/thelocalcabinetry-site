// The portal page: design tool (left) + chat / my items (right).
(function () {
  var $ = function (id) { return document.getElementById(id); };
  // Static site mode (thelocalcabinetry.com/design/): window.LCO = { api, toolUrl } from lco-config.js. The page is
  // one static file; who is looking (guest or customer) comes from GET /api/session on the API host.
  var LCO = window.LCO || null, API = (LCO && LCO.api) || "";
  var cfg = document.body.dataset;
  if (LCO) {
    fetch(API + "/api/session", { credentials: "include" }).then(function (r) { return r.json(); }).then(function (s) {
      if (s.mode === "user") {
        cfg.guest = "0"; cfg.ops = s.opsConnected ? "1" : "0";
        $("who").textContent = s.email;
        document.querySelectorAll("[data-user]").forEach(function (e) { e.hidden = false; });
        document.querySelectorAll("[data-guest-only]").forEach(function (e) { e.hidden = true; });
        $("main").classList.remove("solo");
      } else {
        cfg.guest = "1";
        $("signin").hidden = !s.mailReady; $("soon").hidden = !!s.mailReady;
        $("guestnote").textContent = "Your design is kept on this device only. " + (s.mailReady ? "Sign in with your email to send it to our team." : "Email sign-in is opening soon. Then you can send your design to our team.");
      }
      run();
    }).catch(function () { $("guestnote").textContent = "We could not reach the design service. Please reload the page."; });
  } else run();
  function run() {
  var tool = "kitchen", names = { kitchen: "Kitchen", closet: "Closet", vanity: "Vanity", unit: "Free design" };
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }

  // ---- tool tabs
  var frame = $("tool"), tabs = document.querySelectorAll("[data-tool]");
  function pick(t) {
    tool = t;
    tabs.forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.tool === t)); });
    frame.src = LCO ? LCO.toolUrl(t) : "/design/" + t + "?embed=1&design=" + t;
    try { sessionStorage.setItem("lco_tool", t); } catch (e) {}
  }
  tabs.forEach(function (b) { b.addEventListener("click", function () { pick(b.dataset.tool); }); });
  var first = "kitchen";
  try { first = sessionStorage.getItem("lco_tool") || first; } catch (e) {}
  pick(names[first] ? first : "kitchen");

  if (cfg.guest === "1") return; // guest: design tools only

  // ---- right panel tabs
  var panes = { chat: $("pane-chat"), items: $("pane-items") }, ptabs = document.querySelectorAll("[data-pane]");
  function pane(p) {
    ptabs.forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.pane === p)); });
    for (var k in panes) panes[k].hidden = k !== p;
    if (p === "items") loadDesigns();
  }
  ptabs.forEach(function (b) { b.addEventListener("click", function () { pane(b.dataset.pane); }); });
  window.LcoChat.mount($("chat-root"), {});

  // ---- save design
  var status = $("save-status");
  function toast(msg, bad) { status.textContent = msg; status.className = "save-status" + (bad ? " bad" : ""); }
  async function j(method, path, body) {
    var res = await fetch(API + path, { method: method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: API ? "include" : "same-origin" });
    var d = {}; try { d = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(d.message || "That did not go through. Please try again.");
    return d;
  }
  $("save").addEventListener("click", async function () {
    var b = $("save"); b.disabled = true; toast("Saving...");
    await new Promise(function (r) { setTimeout(r, 900); }); // the tool autosaves ~0.4 s after the last edit
    try {
      var r = await j("POST", "/api/design/save", { tool: tool });
      toast("Saved. Our team can see your " + names[tool].toLowerCase() + " design now (" + r.design_id + ").");
      pane("items"); loadDesigns(r.design_id);
    } catch (e) { toast(e.message, true); }
    b.disabled = false;
  });

  // ---- my items
  var sel = $("design-pick"), table = $("items");
  async function loadDesigns(pickId) {
    sel.textContent = ""; table.textContent = "";
    var msg = $("items-note"); msg.textContent = ""; msg.className = "chat-note";
    try {
      var r = await j("GET", "/api/designs");
      if (!r.designs.length) { msg.textContent = "No saved designs yet. Build one on the left and press Save design."; return; }
      r.designs.forEach(function (d) {
        var o = el("option", null, (names[d.tool] || d.tool || "Design") + " " + d.id + (d.at ? " - " + new Date(d.at).toLocaleDateString() : ""));
        o.value = d.id; sel.append(o);
      });
      sel.value = pickId || r.designs[r.designs.length - 1].id;
      loadItems();
    } catch (e) { msg.textContent = e.message; msg.className = "chat-note bad"; }
  }
  async function loadItems() {
    table.textContent = "";
    var msg = $("items-note"); msg.textContent = "Loading..."; msg.className = "chat-note";
    try {
      var r = await j("GET", "/api/items?design_id=" + encodeURIComponent(sel.value));
      var custom = r.custom || [];
      msg.textContent = r.items.length || custom.length ? "" : "No items on this design yet. Our team is still working on it.";
      if (!r.items.length && !custom.length) return;
      var head = el("tr"); ["ID", "Item", "Qty", "Size", "Finish"].forEach(function (h) { head.append(el("th", null, h)); });
      table.append(head);
      r.items.forEach(function (it) {
        var tr = el("tr");
        [it.id, it.description, it.qty, it.size, it.finish].forEach(function (v) { tr.append(el("td", null, v)); });
        table.append(tr);
      });
      if (custom.length) {
        var h = el("tr"); var th = el("th", null, "Custom items (team will confirm)"); th.colSpan = 5; h.append(th); table.append(h);
        custom.forEach(function (c) { var tr = el("tr"); [c.description, "", c.qty, "", ""].forEach(function (v) { tr.append(el("td", null, v)); }); table.append(tr); });
      }
      if (r.total != null) { var t = el("tr"); var td = el("td", null, "Quoted total: $" + r.total.toFixed(2)); td.colSpan = 5; t.append(td); table.append(t); }
    } catch (e) { msg.textContent = e.message; msg.className = "chat-note bad"; }
  }
  sel.addEventListener("change", loadItems);

  var out = $("logout");
  if (out && LCO) out.addEventListener("click", async function () {
    try { await j("POST", "/logout", {}); } catch (e) {}
    location.href = "/design/";
  });
  }
})();
