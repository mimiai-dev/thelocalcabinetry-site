/* Design login: email -> 6-digit code. Same-origin script (CSP script-src 'self'). Contract: ../ops-contract-design-login-code.md
   MOCK=true answers locally (any email; code 123456 works, 000000 = wrong, 999999 = expired, 888888 = superseded, 429429 = rate limited) so the page can be reviewed without a server. Set MOCK=false in production. */
(function(){
var MOCK=true, API={send:'/design/api/login/send-code',verify:'/design/api/login/verify-code'}, NEXT='/design', COOL=30;
var $=function(i){return document.getElementById(i)}, f1=$('f1'),f2=$('f2'),em=$('em'),m1=$('m1'),m2=$('m2'),codes=$('codes'),resend=$('resend'),timer=null,busy=false;
function post(url,body){
  if(MOCK) return new Promise(function(r){setTimeout(function(){
    if(url===API.send) return r({status:/@/.test(body.email)?204:400,json:{error:'bad_email'}});
    var c=body.code; r(c==='123456'?{status:200,json:{ok:true,signedIn:true,email:body.email}}:c==='999999'?{status:410,json:{error:'expired'}}:c==='888888'?{status:410,json:{error:'superseded'}}:c==='429429'?{status:429,json:{error:'slow_down'}}:{status:400,json:{error:'wrong_code',tries_left:4}})},500)});
  return fetch(url,{method:'POST',headers:{'content-type':'application/json','x-lco-design':'1'},credentials:'same-origin',body:JSON.stringify(body)}).then(function(r){return r.json().catch(function(){return {}}).then(function(j){return {status:r.status,json:j}})},function(){return {status:0,json:{}}})
}
function say(el,t,c){el.textContent=t||'';el.className='msg'+(c?' '+c:'')}
var inp=$('code'),cells=[].slice.call(codes.querySelectorAll('i'));
function code(){return inp.value}
function paint(){var v=inp.value;cells.forEach(function(c,k){c.textContent=v[k]||'';c.className=k===Math.min(v.length,5)?'on':''})}
function clearCode(){inp.value='';codes.classList.remove('bad');paint()}
function cool(){var s=COOL;resend.disabled=true;clearInterval(timer);resend.textContent='Send a new code in '+s+' s';timer=setInterval(function(){s--;if(s<=0){clearInterval(timer);resend.disabled=false;resend.textContent='Send a new code'}else resend.textContent='Send a new code in '+s+' s'},1000)}
function show2(){f1.hidden=true;f2.hidden=false;$('h').textContent='Enter your code';$('lead').textContent='Check your inbox (and spam) for an email from The Local Cabinetry.';$('to').textContent=em.value.trim();clearCode();say(m2,'');cool();inp.focus()}
function show1(){clearInterval(timer);f2.hidden=true;f1.hidden=false;$('h').textContent='Sign in with your email';$('lead').textContent='We will email you a 6-digit code. No password.';say(m1,'');em.focus()}
function send(again){
  var v=em.value.trim(); if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)){say(m1,'Please enter a valid email address.','err');em.focus();return}
  if(busy)return;busy=true;$('send').disabled=true;say(m1,'Sending...');
  post(API.send,{email:v}).then(function(r){busy=false;$('send').disabled=false;
    if(r.status===204||r.status===200){say(m1,'');if(again){clearCode();say(m2,'A new code is on its way.','ok');cool();inp.focus()}else show2()}
    else if(r.status===429){say(again?m2:m1,'Too many tries. Please wait a few minutes and try again.','err')}
    else if(r.status===400){say(m1,'Please enter a valid email address.','err')}
    else if(r.status===503){say(m1,'We cannot send codes right now. Please write to info@thelocalcabinetry.com.','err')}
    else say(again?m2:m1,'We could not send the code. Check your connection and try again.','err')})
}
function verify(){
  var c=code(); if(c.length<6){say(m2,'Enter all 6 digits.','err');inp.focus();return}
  if(busy)return;busy=true;$('verify').disabled=true;say(m2,'Checking...');
  post(API.verify,{email:em.value.trim(),code:c}).then(function(r){busy=false;$('verify').disabled=false;
    var e=(r.json&&r.json.error)||'';
    if(r.status===200){say(m2,'Signed in. Opening your design page...','ok'); if(!MOCK) location.href=NEXT}
    else if(r.status===410&&e==='superseded'){codes.classList.add('bad');say(m2,'A newer code was sent to you. Use the latest email.','err')}
    else if(r.status===410){codes.classList.add('bad');say(m2,'That code has expired. Send a new code.','err');resend.disabled=false;resend.textContent='Send a new code'}
    else if(r.status===429){say(m2,'Too many tries. Please wait a few minutes and try again.','err')}
    else{codes.classList.add('bad');var n=r.json&&r.json.tries_left;say(m2,'That code is not right.'+(n!=null?' '+n+(n===1?' try left.':' tries left.'):' Check it and try again.'),'err');inp.focus();inp.select()}})
}
inp.addEventListener('input',function(){inp.value=inp.value.replace(/\D/g,'').slice(0,6);codes.classList.remove('bad');paint();if(inp.value.length===6)verify()});
inp.addEventListener('focus',paint);inp.addEventListener('blur',function(){cells.forEach(function(c){c.className=''})});
f1.addEventListener('submit',function(e){e.preventDefault();send(false)});
f2.addEventListener('submit',function(e){e.preventDefault();verify()});
resend.addEventListener('click',function(){send(true)});$('other').addEventListener('click',show1);
})();
