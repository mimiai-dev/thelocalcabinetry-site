/* /design stubs: send the visitor on to the design host, carrying the first-touch source (T-261019-2) in the URL FRAGMENT
 * (#s=base64url JSON): a fragment is never sent to any server and never put in the Referer; the design page reads it once, keeps it in its own
 * sessionStorage and removes it. No fragment when Do-Not-Track / Global Privacy Control is on (t.js then defines nothing). */
(function () {
  var to = document.documentElement.getAttribute("data-to");
  if (!to) return;
  var h = "";
  try {
    var s = window.__tlcSrc && window.__tlcSrc();
    if (s) h = "#s=" + btoa(JSON.stringify(s)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch (e) {}
  location.replace(to + h);
})();
