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
      return real(API + input, init);
    }
    return real(input, init);
  };
})();
