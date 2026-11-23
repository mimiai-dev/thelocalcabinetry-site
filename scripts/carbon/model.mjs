import { readFileSync } from "node:fs";

export const FACTORS = "factors-2026-11-06.json";

export function load(dir = new URL("./", import.meta.url)) {
  const f = JSON.parse(readFileSync(new URL(FACTORS, dir), "utf8"));
  const zip3 = JSON.parse(readFileSync(new URL("zip3.json", dir), "utf8")).p;
  return { f, K: build(f), zip3 };
}

export function build(f) {
  const F = f.factors, G = f.geometry.points, C = f.cube;
  const co2e = (x) => x.co2_kg + x.ch4_g * F.gwp.ch4 / 1000 + x.n2o_g * F.gwp.n2o / 1000;
  const pt = (p) => [p.lat, p.lon];
  return {
    truckKgPerTonMile: co2e(F.truck), seaKgPerTonMile: co2e(F.ship),
    circuity: f.circuity.factor, breakevenLbPerCuft: f.density.breakeven_lb_per_cuft,
    earthMi: f.geometry.earth_radius_miles, refLf: C.reference_lf, flat: C.flat, asm: C.assembled,
    sizes: C.size_buttons_lf,
    houston: pt(G.houston), port: pt(G.port), shanghai: pt(G.shanghai),
    noTruck: f.geometry.no_truck_prefixes, example: f.example
  };
}

export function gc(K, a, b) {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * K.earthMi * Math.asin(Math.sqrt(h));
}

export function calc(K, buyer, lf) {
  const s = lf / K.refLf;
  const flatLb = K.flat.lb * s, flatCu = K.flat.cuft * s;
  const asmCu = K.asm.box_cuft * s / K.asm.efficiency * K.asm.deck;
  const asmLb = K.asm.cabinet_lb * s + K.asm.pallet_lb * asmCu / K.asm.pallet_cuft;
  const chg = (lb, cu) => Math.max(lb, cu * K.breakevenLbPerCuft);
  const flatChg = chg(flatLb, flatCu), asmChg = chg(asmLb, asmCu);
  const houMi = gc(K, K.houston, buyer) * K.circuity;
  const portMi = gc(K, K.port, buyer) * K.circuity;
  const seaMi = gc(K, K.shanghai, K.port);
  const tn = (lb) => lb / 2000;
  const flat = tn(flatChg) * houMi * K.truckKgPerTonMile;
  const asm = tn(asmChg) * houMi * K.truckKgPerTonMile;
  const sea = tn(flatLb) * seaMi * K.seaKgPerTonMile;
  const impTruck = tn(flatChg) * portMi * K.truckKgPerTonMile;
  return { flat, asm, imp: sea + impTruck, sea, impTruck };
}

const r4 = (n) => Math.round(n * 1e4) / 1e4;

export function table({ K, zip3 }) {
  const no = new Set(K.noTruck), p = {};
  let sea = null;
  for (const [prefix, coords] of Object.entries(zip3)) {
    if (no.has(prefix)) continue;
    const r = calc(K, coords, K.refLf);
    sea = r4(r.sea);
    p[prefix] = [r4(r.flat), r4(r.asm), r4(r.impTruck)];
  }
  return { lf: K.refLf, sizes: K.sizes, ex: K.example, no: K.noTruck, sea, p };
}
