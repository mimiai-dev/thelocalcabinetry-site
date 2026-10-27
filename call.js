/* The site carries no phone number (owner 2026-10-27: removed completely, no number and no call button). This file stays only for pages a browser or
 * cache still holds from before: it removes their hidden "Call us" link. Nothing loads it any more. */
(function () {
  function drop() { var els = document.querySelectorAll('a[data-call]'); for (var i = 0; i < els.length; i++) els[i].parentNode.removeChild(els[i]) }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', drop); else drop()
})()
