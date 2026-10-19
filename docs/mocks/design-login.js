/* Design login: email -> 6-digit code. Same-origin script (CSP script-src 'self'). Contract: ../ops-contract-design-login-code.md
   MOCK=true answers locally (any email; code 123456 works, 000000 = wrong, 999999 = expired) so the page can be reviewed without a server. Set MOCK=false in production. */
(function(){
var MOCK=true, API={send:'/api/portal/send-code',verify:'/api/portal/verify-code'}, NEXT='/design', COOL=30;
var $=function(i){return document.getElementById(i)}, f1=$('f1'),f2=$('f2'),em=$('em'),m1=$('m1'),m2=$('m2'),codes=$('codes'),boxes=[].slice.call(codes.querySelectorAll('input')),resend=$('resend'),timer=null,busy=false;
function post(url,body){
  if(MOCK) return new Promise(function(r){setTimeout(function(){
    if(url===API.send) return r({status:/@/.test(body.email)?204:400});
    r({status:body.code==='123456'?200:body.code==='999999'?410:body.code==='429429'?429:400})},500)});
  return fetch(url,{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)}).then(function(r){return {status:r.status}},function(){return {status:0}})
}
function say(el,t,c){el.textContent=t||'';el.className='msg'+(c?' '+c:'')}
function code(){return boxes.map(function(b){return b.value}).join('')}
function clearCode(){boxes.forEach(function(b){b.value=''});codes.classList.remove('bad')}
function cool(){var s=COOL;resend.disabled=true;clearInterval(timer);resend.textContent='Send a new code in '+s+' s';timer=setInterval(function(){s--;if(s<=0){clearInterval(timer);resend.disabled=false;resend.textContent='Send a new code'}else resend.textContent='Send a new code in '+s+' s'},1000)}
function show2(){f1.hidden=true;f2.hidden=false;$('h').textContent='Enter your code';$('lead').textContent='Check your inbox (and spam) for an email from The Local Cabinetry.';$('to').textContent=em.value.trim();clearCode();say(m2,'');cool();boxes[0].focus()}
function show1(){clearInterval(timer);f2.hidden=true;f1.hidden=false;$('h').textContent='Sign in with your email';$('lead').textContent='We will email you a 6-digit code. No password.';say(m1,'');em.focus()}
function send(again){
  var v=em.value.trim(); if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)){say(m1,'Please enter a valid email address.','err');em.focus();return}
  if(busy)return;busy=true;$('send').disabled=true;say(m1,'Sending...');
  post(API.send,{email:v}).then(function(r){busy=false;$('send').disabled=false;
    if(r.status===204||r.status===200){say(m1,'');if(again){clearCode();say(m2,'A new code is on its way.','ok');cool();boxes[0].focus()}else show2()}
    else if(r.status===429){say(again?m2:m1,'Too many tries. Please wait a few minutes and try again.','err')}
    else if(r.status===400){say(m1,'Please enter a valid email address.','err')}
    else say(again?m2:m1,'We could not send the code. Check your connection and try again.','err')})
}
function verify(){
  var c=code(); if(c.length<6){say(m2,'Enter all 6 digits.','err');(boxes.filter(function(b){return !b.value})[0]||boxes[5]).focus();return}
  if(busy)return;busy=true;$('verify').disabled=true;say(m2,'Checking...');
  post(API.verify,{email:em.value.trim(),code:c}).then(function(r){busy=false;$('verify').disabled=false;
    if(r.status===200){say(m2,'Signed in. Opening your design page...','ok'); if(!MOCK) location.href=NEXT}
    else if(r.status===410){codes.classList.add('bad');say(m2,'That code has expired. Send a new code.','err');resend.disabled=false;resend.textContent='Send a new code'}
    else if(r.status===429){say(m2,'Too many tries. Please wait a few minutes and try again.','err')}
    else{codes.classList.add('bad');say(m2,'That code is not right. Check it and try again.','err');boxes.forEach(function(b){b.select&&0});boxes[0].focus();boxes[0].select()}})
}
boxes.forEach(function(b,i){
  b.addEventListener('input',function(){b.value=b.value.replace(/\D/g,'').slice(-1);codes.classList.remove('bad');if(b.value&&i<5)boxes[i+1].focus();if(code().length===6)verify()});
  b.addEventListener('keydown',function(e){if(e.key==='Backspace'&&!b.value&&i>0){boxes[i-1].focus();boxes[i-1].value=''}else if(e.key==='ArrowLeft'&&i>0)boxes[i-1].focus();else if(e.key==='ArrowRight'&&i<5)boxes[i+1].focus()});
  b.addEventListener('focus',function(){b.select()});
  b.addEventListener('paste',function(e){var t=((e.clipboardData||window.clipboardData).getData('text')||'').replace(/\D/g,'').slice(0,6);if(!t)return;e.preventDefault();clearCode();t.split('').forEach(function(d,k){boxes[k].value=d});boxes[Math.min(t.length,5)].focus();if(t.length===6)verify()})
});
f1.addEventListener('submit',function(e){e.preventDefault();send(false)});
f2.addEventListener('submit',function(e){e.preventDefault();verify()});
resend.addEventListener('click',function(){send(true)});$('other').addEventListener('click',show1);
})();
