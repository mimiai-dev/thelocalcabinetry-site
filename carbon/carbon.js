/* Shipping footprint estimate. Runs entirely in the browser; nothing is sent anywhere and the ZIP is not stored.
   Sources and method: see "How we calculate" on /carbon/. */
(function (root) {
  "use strict";
  var K = {
    // EPA GHG Emission Factors Hub 2025, Table 8 (Scope 3 Cat. 4), CO2e with the Hub's own AR5 GWPs (CH4 28, N2O 265)
    truckKgPerTonMile: 0.186 + 0.0016 * 28 / 1000 + 0.0054 * 265 / 1000,
    seaKgPerTonMile: 0.077 + 0.0310 * 28 / 1000 + 0.0020 * 265 / 1000,
    circuity: 1.22,             // Qureshi, Hwang & Chin 2002, TRR 1804
    breakevenLbPerCuft: 11.6,   // 44,000 lb payload / 3,800 cu ft, 53 ft dry van
    refLf: 25,                  // typical 10x10 kitchen, same as the cost guide
    // typical 25 lf kitchen, our sizing code (cube.py)
    flat: { lb: 694, cuft: 44.8 },
    // assembled: outside boxes (+2 in each way) / 0.85 stacking efficiency, +10% for pallet deck
    asm: { boxCuft: 127.6, efficiency: 0.85, deck: 1.1, cabinetLb: 634, palletLb: 60, palletCuft: 73.3 },
    houston: [29.768297, -95.308971],   // ZCTA 77020 internal point
    port: [33.754, -118.216],           // Port of Long Beach
    shanghai: [31.23, 121.47]
  };
  var R_MI = 3958.8;
  function gc(a, b) {
    var r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R_MI * Math.asin(Math.sqrt(h));
  }
  function calc(buyer, lf) {
    var s = lf / K.refLf;
    var flatLb = K.flat.lb * s, flatCu = K.flat.cuft * s;
    var asmCu = K.asm.boxCuft * s / K.asm.efficiency * K.asm.deck;
    var asmLb = K.asm.cabinetLb * s + K.asm.palletLb * asmCu / K.asm.palletCuft;
    var chg = function (lb, cu) { return Math.max(lb, cu * K.breakevenLbPerCuft); };
    var flatChg = chg(flatLb, flatCu), asmChg = chg(asmLb, asmCu);
    var houMi = gc(K.houston, buyer) * K.circuity;
    var portMi = gc(K.port, buyer) * K.circuity;
    var seaMi = gc(K.shanghai, K.port);
    var tn = function (lb) { return lb / 2000; };
    var flat = tn(flatChg) * houMi * K.truckKgPerTonMile;
    var asm = tn(asmChg) * houMi * K.truckKgPerTonMile;
    var sea = tn(flatLb) * seaMi * K.seaKgPerTonMile;
    var imTruck = tn(flatChg) * portMi * K.truckKgPerTonMile;
    return { flat: flat, asm: asm, imp: sea + imTruck, sea: sea, impTruck: imTruck,
      houMi: houMi, portMi: portMi, seaMi: seaMi, flatLb: flatLb, flatCu: flatCu, asmLb: asmLb, asmCu: asmCu,
      flatChg: flatChg, asmChg: asmChg };
  }
  // lower 48 only: trucks do not reach AK, HI, PR, Guam; APO/FPO prefixes are not in the table
  var NO_TRUCK = /^(006|007|008|009|967|968|969|995|996|997|998|999)$/;
  function lookup(zip, table) {
    zip = String(zip || "").trim();
    if (!/^\d{5}$/.test(zip)) return { err: "Enter a 5-digit ZIP code." };
    var p = zip.slice(0, 3);
    if (NO_TRUCK.test(p)) return { err: "This estimate covers truck delivery in the lower 48 states only." };
    var c = table[p];
    if (!c) return { err: "We couldn't place that ZIP code. Check it and try again." };
    return { coords: c, prefix: p };
  }
  // Round sensibly: under 10 kg one decimal, under 100 whole kg, above that the nearest 5 kg; percentages to the nearest 5.
  function kg(n) { return n < 10 ? (Math.round(n * 10) / 10).toFixed(1) : n < 100 ? String(Math.round(n)) : Math.round(n / 5) * 5 >= 1000 ? (Math.round(n / 5) * 5).toLocaleString("en-US") : String(Math.round(n / 5) * 5); }
  function pct(a, base) { if (base < 5) { var x = a - base; return "+" + kg(x) + " kg"; } var d = Math.round((a - base) / base * 20) * 5; return (d > 0 ? "+" : "") + d + "%"; }
  function nearest(r) { var m = Math.min(r.flat, r.asm, r.imp); return m === r.flat ? "flat" : m === r.asm ? "asm" : "imp"; }
  var api = { K: K, calc: calc, lookup: lookup, gc: gc, kg: kg, pct: pct };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.CarbonCalc = api;

  if (typeof document === "undefined") return;
  var $ = function (id) { return document.getElementById(id); };
  var table = null, loaded = false;
  var fmt = function (n) { return Math.round(n / 10) * 10 >= 1000 ? (Math.round(n / 10) * 10).toLocaleString("en-US") : String(Math.round(n / 10) * 10); };
  function draw(r, label, lf) {
    var max = Math.max(r.flat, r.asm, r.imp);
    var w = function (v) { return (v / max * 100).toFixed(1) + "%"; };
    $("b-flat").style.width = w(r.flat); $("b-asm").style.width = w(r.asm);
    $("b-sea").style.width = w(r.sea); $("b-imt").style.width = w(r.impTruck);
    $("v-flat").textContent = kg(r.flat) + " kg CO₂e";
    $("v-asm").textContent = kg(r.asm) + " kg CO₂e";
    $("v-imp").textContent = kg(r.imp) + " kg CO₂e";
    $("d-flat").textContent = "baseline";
    $("d-asm").textContent = pct(r.asm, r.flat) + (r.flat < 5 ? " more" : " vs flat-pack");
    $("d-imp").textContent = pct(r.imp, r.flat) + (r.flat < 5 ? " more" : " vs flat-pack");
    $("res-sub").textContent = label + " · " + lf + " linear feet · about " + fmt(r.houMi) + " road miles from Houston, " + fmt(r.portMi) + " from Long Beach";
    $("t-sea").textContent = kg(r.sea); $("t-imt").textContent = kg(r.impTruck);
    $("s-flat").textContent = fmt(r.flatChg); $("s-asm").textContent = fmt(r.asmChg);
    var n = nearest(r);
    $("res-line").textContent = n === "flat"
      ? "For this delivery the flat-pack route has the smallest estimated footprint of the three."
      : "For this delivery the flat-pack route is not the smallest of the three: " + (n === "imp" ? "the imported route, trucked a short way from the port," : "the assembled route") + " comes out lower on these assumptions.";
  }
  function update() {
    var lf = Math.max(5, Math.min(80, parseFloat($("lf").value) || 25));
    $("lfv").textContent = lf;
    var zip = $("zip").value.trim(), msg = $("zip-msg");
    if (!zip) { msg.textContent = ""; draw(calc(table["303"], lf), "Example: Atlanta, GA (ZIP prefix 303)", lf); return; }
    if (!loaded) { msg.textContent = "Loading distance table…"; return; }
    var q = lookup(zip, table);
    if (q.err) { msg.textContent = q.err; return; }
    msg.textContent = "";
    draw(calc(q.coords, lf), "ZIP " + zip, lf);
  }
  function init() {
    if (!$("zip")) return;
    ["zip", "lf"].forEach(function (id) { $(id).addEventListener("input", function () {
      if (id === "lf") Array.prototype.forEach.call(document.querySelectorAll("[data-lf]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-lf") === $("lf").value ? "true" : "false"); });
      if (table) update(); }); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-lf]"), function (b) {
      b.addEventListener("click", function () { $("lf").value = b.getAttribute("data-lf"); $("lf").dispatchEvent(new Event("input")); });
    });
    $("zip-form").addEventListener("submit", function (e) { e.preventDefault(); if (table) update(); });
    fetch("/carbon/zip3.json").then(function (r) { return r.json(); }).then(function (j) { table = j.p; loaded = true; update(); })
      .catch(function () { $("zip-msg").textContent = "The distance table didn't load. Reload the page to try again."; });
  }
  table = null;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
