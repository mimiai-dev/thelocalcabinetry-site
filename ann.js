/* The top announcement bar (was in chat.js). Loaded as the FIRST script in <body> (one small same-origin file, no third party) so the bar is in the page before the
 * first paint: when chat.js (85 KB, deferred) put it in after the paint, the whole page jumped down by the bar height on every page (Lighthouse layout shift 0.08).
 * Owner 2026-10-24 (T-261024-23): a top announcement bar on every page until closed (then never again in this browser). Our own words and link only.
 * 2026-10-25 (T-261025-20): the membership offer, a free first month (ops lib/membership.ts plan free-month). The link opens /member/annual/?offer=free-month;
 * chat.js (memberOffer) turns that form into the claim.
 * Black Friday 2026 (owner 2026-10-31): the bar takes the top place until 2026-11-27 (the visitor calendar day, inclusive; the sale is that day only), then the
 * membership bar comes back. Tiers 15% under $5,000 and 20% from $5,000 are on /black-friday/; the bar states the range and links the terms.
 * Closing sets a localStorage key (its own key per bar, so closing the Black Friday bar does not hide the membership bar). Storage blocked: no bar (never nag). */
(function () {
  "use strict";
  var BF_KEY = "lco_ann_bf26_v1", ANN_KEY = "lco_ann_v2"; // a new announcement = a new key (v2 = the free-month offer, so a visitor who closed v1 still sees it)
  var ANN = { text: "Get your first month of membership free: 10% off all your orders.", link: "Claim it", href: "/member/annual/?offer=free-month" };
  var BF = { until: "2026-11-27", text: "Black Friday, Nov 27: plan your kitchen now and save 15\u201320% on your order.", link: "Plan my kitchen \u2192", href: "/design", details: "Details", detailsHref: "/black-friday/" };
  var CSS = ".lcoann{position:relative;z-index:2147483000;display:flex;align-items:center;justify-content:center;gap:12px;padding:8px 48px 8px 16px;background:#0e2740;color:#fff;font:14px/1.35 system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;text-align:center}.lcoann a{color:#e9c983;font-weight:600;text-decoration:underline;text-underline-offset:3px;white-space:nowrap}.lcoann-x{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:36px;height:36px;border:0;border-radius:50%;background:none;color:#fff;font-size:22px;line-height:1;cursor:pointer}.lcoann-x:hover{background:rgba(255,255,255,.12)}.lcoann[hidden]{display:none}div.bfbar{background:#000;flex-wrap:wrap;row-gap:2px;column-gap:12px}div.bfbar a.bfd{font-weight:400;font-size:13px;color:#fff;opacity:.85}";
  try {
    var d = new Date(), pad = function (n) { return (n < 10 ? "0" : "") + n };
    var bf = (d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())) <= BF.until, key = bf ? BF_KEY : ANN_KEY;
    try { if (localStorage.getItem(key)) return; } catch (e) { return; }
    if (!document.body || document.querySelector(".lcoann")) return;
    function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    var bar = el("div", "lcoann" + (bf ? " bfbar" : "")); bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Announcement");
    bar.appendChild(el("span", "", bf ? BF.text : ANN.text));
    var a = el("a", "", bf ? BF.link : ANN.link); a.href = bf ? BF.href : ANN.href; a.setAttribute("data-track", bf ? "announce-bf" : "announce-member");
    bar.appendChild(a);
    if (bf) { var dt = el("a", "bfd", BF.details); dt.href = BF.detailsHref; dt.setAttribute("data-track", "announce-bf-details"); bar.appendChild(dt); }
    var x = el("button", "lcoann-x", "\u00d7"); x.type = "button"; x.setAttribute("aria-label", "Close the announcement");
    x.addEventListener("click", function () { bar.hidden = true; try { localStorage.setItem(key, "1"); } catch (e) { /* ignore */ } });
    bar.appendChild(x);
    document.body.insertBefore(bar, document.body.firstChild);
  } catch (e) { /* the bar is optional */ }
})();
