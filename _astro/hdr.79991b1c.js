(function(){var h=document.querySelector('.hdr');if(!h)return;var last=window.pageYOffset||0,tick=false;
function upd(){tick=false;var y=window.pageYOffset||0,nav=document.getElementById('site-nav');
if(nav&&nav.classList.contains('is-open')||y<80){h.classList.remove('hdr-hide');last=y;return}
if(y>last+6)h.classList.add('hdr-hide');else if(y<last-6)h.classList.remove('hdr-hide');last=y}
window.addEventListener('scroll',function(){if(!tick){tick=true;requestAnimationFrame(upd)}},{passive:true});
window.addEventListener('focusin',function(e){if(h.contains(e.target))h.classList.remove('hdr-hide')})})();
