// Runs first inside every design tool on the public site. The tools were written to be served by
// the app that owns their data and call it with root paths (/tools/design ...). On the site those
// paths belong to the design API host, so they are sent there, with the cookie.
(function () {
  var API = (window.LCO && window.LCO.api) || "";
  if (!API || !window.fetch) return;
  var real = window.fetch.bind(window);
  window.fetch = function (input, init) {
    if (typeof input === "string" && /^\/(tools|api)\//.test(input)) {
      init = Object.assign({}, init, { credentials: "include" });
      var p = real(API + input, init);
      // tell the design page when the tool has its draft (the page keeps a "Loading" veil until then)
      if (/^\/tools\/design\?/.test(input) && (!init.method || init.method === "GET")) {
        var told = function () { try { window.parent.postMessage({ lco: "draft" }, location.origin); } catch (e) {} };
        p.then(told, told);
      }
      return p;
    }
    return real(input, init);
  };
})();
