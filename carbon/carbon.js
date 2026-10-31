/* Shipping footprint estimate. Runs entirely in the browser; nothing is sent anywhere and the ZIP is not stored or logged.
   EVERY number comes from the dated factors file below (FACTORS_FILE). A change = a new dated file and a new name here, never an edit of the old file.
   Sources and method: the dated factors file (/carbon/factors-2026-10-31.json), linked as "Sources" on /carbon/. */
(function (root) {
  "use strict";
  var FACTORS_FILE = "/carbon/factors-2026-10-31.json";

  // Build the working constants from the parsed factors file.
  function build(f) {
    var F = f.factors, G = f.geometry.points, C = f.cube;
    var co2e = function (x) { return x.co2_kg + x.ch4_g * F.gwp.ch4 / 1000 + x.n2o_g * F.gwp.n2o / 1000; };
    var pt = function (p) { return [p.lat, p.lon]; };
    return {
      truckKgPerTonMile: co2e(F.truck), seaKgPerTonMile: co2e(F.ship),
      circuity: f.circuity.factor, breakevenLbPerCuft: f.density.breakeven_lb_per_cuft,
      earthMi: f.geometry.earth_radius_miles, refLf: C.reference_lf, flat: C.flat, asm: C.assembled,
      houston: pt(G.houston), port: pt(G.port), shanghai: pt(G.shanghai),
      noTruck: new RegExp("^(" + f.geometry.no_truck_prefixes.join("|") + ")$"),
      example: f.example, zipTable: f.geometry.buyer_table.file
    };
  }
  function gc(K, a, b) {
    var r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * K.earthMi * Math.asin(Math.sqrt(h));
  }
  function calc(K, buyer, lf) {
    var s = lf / K.refLf;
    var flatLb = K.flat.lb * s, flatCu = K.flat.cuft * s;
    var asmCu = K.asm.box_cuft * s / K.asm.efficiency * K.asm.deck;
    var asmLb = K.asm.cabinet_lb * s + K.asm.pallet_lb * asmCu / K.asm.pallet_cuft;
    var chg = function (lb, cu) { return Math.max(lb, cu * K.breakevenLbPerCuft); };
    var flatChg = chg(flatLb, flatCu), asmChg = chg(asmLb, asmCu);
    var houMi = gc(K, K.houston, buyer) * K.circuity;
    var portMi = gc(K, K.port, buyer) * K.circuity;
    var seaMi = gc(K, K.shanghai, K.port);
    var tn = function (lb) { return lb / 2000; };
    var flat = tn(flatChg) * houMi * K.truckKgPerTonMile;
    var asm = tn(asmChg) * houMi * K.truckKgPerTonMile;
    var sea = tn(flatLb) * seaMi * K.seaKgPerTonMile;
    var imTruck = tn(flatChg) * portMi * K.truckKgPerTonMile;
    return { flat: flat, asm: asm, imp: sea + imTruck, sea: sea, impTruck: imTruck,
      houMi: houMi, portMi: portMi, seaMi: seaMi, flatLb: flatLb, flatCu: flatCu, asmLb: asmLb, asmCu: asmCu,
      flatChg: flatChg, asmChg: asmChg };
  }
  function lookup(K, zip, table) {
    zip = String(zip || "").trim();
    if (!/^\d{5}$/.test(zip)) return { err: "Enter a 5-digit ZIP code." };
    var p = zip.slice(0, 3);
    if (K.noTruck.test(p)) return { err: "This estimate covers truck delivery in the lower 48 states only." };
    var c = table[p];
    if (!c) return { err: "We couldn't place that ZIP code. Check it and try again." };
    return { coords: c, prefix: p };
  }
  // Round sensibly: under 10 kg one decimal, under 100 whole kg, above that the nearest 5 kg; percentages to the nearest 5.
  function kg(n) { return n < 10 ? (Math.round(n * 10) / 10).toFixed(1) : n < 100 ? String(Math.round(n)) : Math.round(n / 5) * 5 >= 1000 ? (Math.round(n / 5) * 5).toLocaleString("en-US") : String(Math.round(n / 5) * 5); }
  // how much lower a is than base, to the nearest 5 percent ("X% less")
  function lessPct(a, base) { return Math.round((base - a) / base * 20) * 5; }
  function morePct(a, base) { return Math.round((a - base) / base * 20) * 5; }
  function nearest(r) { var m = Math.min(r.flat, r.asm, r.imp); return m === r.flat ? "flat" : m === r.asm ? "asm" : "imp"; }
  var api = { build: build, calc: calc, lookup: lookup, gc: gc, kg: kg, lessPct: lessPct, morePct: morePct, nearest: nearest, FACTORS_FILE: FACTORS_FILE };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.CarbonCalc = api;

  if (typeof document === "undefined") return;
  var $ = function (id) { return document.getElementById(id); };
  var K = null, table = null;
  var fmt = function (n) { return Math.round(n / 10) * 10 >= 1000 ? (Math.round(n / 10) * 10).toLocaleString("en-US") : String(Math.round(n / 10) * 10); };
  var NAMES = { flat: "Flat-pack", asm: "Assembled", imp: "Imported" };
  function draw(r, label, lf) {
    var max = Math.max(r.flat, r.asm, r.imp);
    var w = function (v) { return (v / max * 100).toFixed(1) + "%"; };
    $("b-flat").style.width = w(r.flat); $("b-asm").style.width = w(r.asm);
    $("b-sea").style.width = w(r.sea); $("b-imt").style.width = w(r.impTruck);
    ["flat", "asm", "imp"].forEach(function (k) { $("v-" + k).textContent = kg(r[k]); });
    $("t-sea").textContent = kg(r.sea); $("t-imt").textContent = kg(r.impTruck);
    $("s-flat").textContent = fmt(r.flatChg); $("s-asm").textContent = fmt(r.asmChg);
    $("mi-line").textContent = fmt(r.houMi) + " road miles from Houston, " + fmt(r.portMi) + " from Long Beach (for this delivery)";
    $("res-sub").textContent = label + " · " + lf + " linear feet";
    var n = nearest(r), order = ["flat", "asm", "imp"], others = order.filter(function (k) { return k !== n; });
    var next = others[0], nv = r[next]; if (r[others[1]] < nv) { next = others[1]; nv = r[next]; }
    order.forEach(function (k) {
      $("c-" + k).className = "rc" + (k === n ? " win" : "");
      $("d-" + k).textContent = k === n
        ? (r[n] < 5 ? "Lowest of the three" : lessPct(r[n], nv) + "% less than " + NAMES[next].toLowerCase())
        : (r[n] < 5 ? "+" + kg(r[k] - r[n]) + " kg" : "+" + morePct(r[k], r[n]) + "% vs " + NAMES[n].toLowerCase());
    });
    $("res-line").textContent = n === "flat"
      ? "For this delivery, flat-pack from Houston has the smallest estimated footprint."
      : "For this delivery, " + NAMES[n].toLowerCase() + " comes out lowest on these assumptions.";
  }
  function update() {
    var lf = Math.max(5, Math.min(80, parseFloat($("lf").value) || K.refLf));
    var zip = $("zip").value.trim(), msg = $("zip-msg");
    if (!zip) { msg.textContent = ""; draw(calc(K, table[K.example.prefix], lf), "Example: " + K.example.label, lf); return; }
    var q = lookup(K, zip, table);
    if (q.err) { msg.textContent = q.err; return; }
    msg.textContent = "";
    draw(calc(K, q.coords, lf), "ZIP " + zip, lf);
  }
  function init() {
    if (!$("zip")) return;
    var setLf = function (v) {
      $("lf").value = v;
      Array.prototype.forEach.call(document.querySelectorAll("[data-lf]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-lf") === String(v) ? "true" : "false"); });
      if (K && table) update();
    };
    $("zip").addEventListener("input", function () { if (K && table) update(); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-lf]"), function (b) {
      b.addEventListener("click", function () { setLf(b.getAttribute("data-lf")); });
    });
    $("zip-form").addEventListener("submit", function (e) { e.preventDefault(); if (K && table) update(); });
    fetch(FACTORS_FILE).then(function (r) { return r.json(); }).then(function (f) {
      K = build(f);
      return fetch(K.zipTable).then(function (r) { return r.json(); });
    }).then(function (j) { table = j.p; update(); })
      .catch(function () { $("zip-msg").textContent = "The data didn't load. Reload the page to try again."; });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
