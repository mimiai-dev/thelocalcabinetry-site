(function (root) {
  "use strict";
  var TABLE = "/carbon/estimates.json";

  function lookup(T, zip) {
    zip = String(zip || "").trim();
    if (!/^\d{5}$/.test(zip)) return { err: "Enter a 5-digit ZIP code." };
    var p = zip.slice(0, 3);
    if (T.no.indexOf(p) >= 0) return { err: "This estimate covers truck delivery in the lower 48 states only." };
    var row = T.p[p];
    if (!row) return { err: "We couldn't place that ZIP code. Check it and try again." };
    return { row: row, prefix: p };
  }
  function at(T, row, lf) {
    var s = lf / T.lf, sea = T.sea * s, impTruck = row[2] * s;
    return { flat: row[0] * s, asm: row[1] * s, sea: sea, impTruck: impTruck, imp: sea + impTruck };
  }
  function kg(n) { return n < 10 ? (Math.round(n * 10) / 10).toFixed(1) : n < 100 ? String(Math.round(n)) : Math.round(n / 5) * 5 >= 1000 ? (Math.round(n / 5) * 5).toLocaleString("en-US") : String(Math.round(n / 5) * 5); }
  function lessPct(a, base) { return Math.round((base - a) / base * 100); }
  function morePct(a, base) { return Math.round((a - base) / base * 100); }
  function nearest(r) { var m = Math.min(r.flat, r.asm, r.imp); return m === r.flat ? "flat" : m === r.asm ? "asm" : "imp"; }
  var NAMES = { flat: "Flat-pack", asm: "Assembled", imp: "Imported" };
  function lines(r) {
    var n = nearest(r), order = ["flat", "asm", "imp"], others = order.filter(function (k) { return k !== n; });
    var next = others[0], nv = r[next]; if (r[others[1]] < nv) { next = others[1]; nv = r[next]; }
    var d = {};
    order.forEach(function (k) {
      d[k] = k === n
        ? (r[n] < 5 ? "Lowest of the three" : lessPct(r[n], nv) + "% less than " + NAMES[next].toLowerCase())
        : (r[n] < 5 ? "+" + kg(r[k] - r[n]) + " kg" : "+" + morePct(r[k], r[n]) + "% vs " + NAMES[n].toLowerCase());
    });
    return { win: n, d: d, verdict: n === "flat"
      ? "For this delivery, flat-pack from Houston has the smallest estimated footprint."
      : "For this delivery, " + NAMES[n].toLowerCase() + " comes out lowest on these assumptions." };
  }
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function totalsView(t) {
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(t.asof || ""));
    var co2 = Math.max(0, Math.floor(Number(t.co2_kg) || 0)), pallets = Math.max(0, Math.floor(Number(t.pallets) || 0)), cuft = Math.max(0, Math.floor(Number(t.space_cuft) || 0));
    var big = co2 >= 10000;
    return {
      sets: String(Math.max(0, Math.floor(Number(t.sets) || 0))),
      co2: big ? (Math.floor(co2 / 100) / 10).toLocaleString("en-US") : co2.toLocaleString("en-US"),
      "co2-unit": big ? "tonnes CO₂e" : "kg CO₂e",
      space: pallets >= 1 ? pallets.toLocaleString("en-US") : cuft.toLocaleString("en-US"),
      "space-unit": pallets >= 1 ? (pallets === 1 ? "pallet" : "pallets") : "cu ft",
      asof: d ? MONTHS[Number(d[2]) - 1] + " " + Number(d[3]) + ", " + d[1] : ""
    };
  }
  function saved(r) { return kg(Math.max(0, r.asm - r.flat)); }
  var api = { lookup: lookup, at: at, kg: kg, lessPct: lessPct, morePct: morePct, nearest: nearest, lines: lines, totalsView: totalsView, saved: saved, TABLE: TABLE };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.CarbonCalc = api;

  if (typeof document === "undefined") return;
  var $ = function (id) { return document.getElementById(id); };
  var T = null;
  function draw(r, label, lf) {
    var max = Math.max(r.flat, r.asm, r.imp);
    var w = function (v) { return (v / max * 100).toFixed(1) + "%"; };
    $("b-flat").style.width = w(r.flat); $("b-asm").style.width = w(r.asm);
    $("b-sea").style.width = w(r.sea); $("b-imt").style.width = w(r.impTruck);
    ["flat", "asm", "imp"].forEach(function (k) { $("v-" + k).textContent = kg(r[k]); });
    $("t-sea").textContent = kg(r.sea); $("t-imt").textContent = kg(r.impTruck);
    $("res-sub").textContent = label + " · " + lf + " linear feet";
    var L = lines(r);
    ["flat", "asm", "imp"].forEach(function (k) {
      $("c-" + k).className = "rc" + (k === L.win ? " win" : "");
      $("d-" + k).textContent = L.d[k];
    });
    $("res-line").textContent = L.verdict;
    $("you-kg").textContent = saved(r);
    $("you-lbl").textContent = label.indexOf("Example") === 0 ? (String(lf) === "25" ? "A 10×10 kitchen to Atlanta" : "A " + lf + " linear-foot kitchen to Atlanta") : "Your kitchen (" + label + ", " + lf + " linear feet)";
  }
  function update() {
    var lf = Math.max(5, Math.min(80, parseFloat($("lf").value) || T.lf));
    var zip = $("zip").value.trim(), msg = $("zip-msg");
    if (!zip) { msg.textContent = ""; draw(at(T, T.p[T.ex.prefix], lf), "Example: " + T.ex.label, lf); return; }
    var q = lookup(T, zip);
    if (q.err) { msg.textContent = q.err; return; }
    msg.textContent = "";
    draw(at(T, q.row, lf), "ZIP " + zip, lf);
  }
  function init() {
    if (!$("zip")) return;
    var setLf = function (v) {
      $("lf").value = v;
      Array.prototype.forEach.call(document.querySelectorAll("[data-lf]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-lf") === String(v) ? "true" : "false"); });
      if (T) update();
    };
    $("zip").addEventListener("input", function () { if (T) update(); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-lf]"), function (b) {
      b.addEventListener("click", function () { setLf(b.getAttribute("data-lf")); });
    });
    $("zip-form").addEventListener("submit", function (e) { e.preventDefault(); if (T) update(); });
    fetch(TABLE).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status + " " + TABLE); return r.json(); }).then(function (j) {
      T = j;
      try { update(); } catch (e) { console.error("carbon: could not draw the result", e); }
    }, function (e) {
      console.error("carbon: data did not load", e);
      $("zip-msg").textContent = "The data didn't load. Reload the page to try again.";
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
