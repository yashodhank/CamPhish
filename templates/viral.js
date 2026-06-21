(function(w){
'use strict';

var STORAGE_KEY='camphish_viral',API=(w.CAMPHISH_API||'/api');

function uid(){return 'p_'+(function(){
var d=Date.now();return'xxxxxxxxxxxx'.replace(/x/g,function(c){
var r=(d+Math.random()*16)%16|0;d=Math.floor(d/16);return r.toString(16);});
})();}

function load(){
try{var d=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
return{id:d.id||uid(),ref:d.ref||null,shares:d.shares||0,
referrals:d.referrals||0,referred:d.referred||[],lastShare:d.lastShare||0,
claimableRewards:d.claimableRewards||0,claimedRewards:d.claimedRewards||[],
created:d.created||Date.now()};}catch(e){
return{id:uid(),ref:null,shares:0,referrals:0,referred:[],lastShare:0,
claimableRewards:0,claimedRewards:[],created:Date.now()};}
}

function save(s){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(s));}catch(e){}}

var state=load();

// Persist player ID across localStorage
if(!state.id||state.id==='p_undefined'){state.id=uid();save(state);}

function getRefParam(){
var m=location.search.match(/[?&]ref=([^&]+)/);
return m?decodeURIComponent(m[1]):null;
}

function processReferral(){
if(state.referred)return;
var ref=getRefParam();
if(ref&&ref!==state.id){
state.ref=ref;state.referred=true;
// Notify server
try{
fetch(API+'/capture/event',{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({session:state.id,event_type:'viral_referral_landing',
event_data:{referrer:ref,page:location.pathname}})}).catch(function(){});
}catch(e){}
save(state);
}
}

function getShareUrl(platform){
var base=w.SHARE_URL||location.href.split('?')[0];
var url=base+(base.indexOf('?')>-1?'&':'?')+'ref='+encodeURIComponent(state.id);
var text=w.SHARE_TEXT||'Can you beat my score?';
var msgs={
wa:'whatsapp://send?text='+encodeURIComponent(text+' '+url),
fb:'https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(url)+'&quote='+encodeURIComponent(text),
tw:'https://twitter.com/intent/tweet?text='+encodeURIComponent(text+' '+url),
tg:'https://t.me/share/url?url='+encodeURIComponent(url)+'&text='+encodeURIComponent(text),
mail:'mailto:?subject='+encodeURIComponent('Check this out')+'&body='+encodeURIComponent(text+' '+url)
};
return msgs[platform]||url;
}

function trackShare(platform,callback){
state.shares++;state.lastShare=Date.now();
var milestone=0;
if(state.shares===1)milestone=1;
else if(state.shares===3)milestone=2;
else if(state.shares===5)milestone=3;
else if(state.shares===10)milestone=4;
else if(state.shares%5===0)milestone=5;
if(milestone)state.claimableRewards++;
save(state);
try{
fetch(API+'/capture/event',{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({session:state.id,event_type:'viral_share',
event_data:{platform:platform,totalShares:state.shares,milestone:milestone}})}).catch(function(){});
}catch(e){}
if(callback)callback(milestone);
}

function doShare(platform,score,scoreText,callback){
var data={};
if(navigator.canShare){
try{
data={text:scoreText||('Can you beat my score? '+score),title:'Game Score'};
if(navigator.canShare(data)){
navigator.share(data).then(function(){trackShare(platform,callback);}).catch(function(){});
return;
}
}catch(e){}
}
var url=getShareUrl(platform);
trackShare(platform,callback);
var win=w.open(url,'_blank');
if(!win&&platform==='wa'){w.location.href=url;}
}

function needsShareToContinue(){
// After 2 consecutive plays without sharing, force share
var p=load();
return p.shares===0;
}

function getBoostMultiplier(){
var s=load();
if(s.shares>=5)return 2.0;
if(s.shares>=3)return 1.5;
if(s.shares>=1)return 1.2;
return 1.0;
}

function getShareCount(){return state.shares;}

function claimReward(){
if(state.claimableRewards>0){
state.claimableRewards--;
state.claimedRewards.push({type:'share_milestone',claimedAt:Date.now()});
save(state);
return true;
}
return false;
}

function getMilestoneInfo(){
var next=0,remaining=0;
if(state.shares<1){next=1;remaining=1-state.shares;}
else if(state.shares<3){next=3;remaining=3-state.shares;}
else if(state.shares<5){next=5;remaining=5-state.shares;}
else if(state.shares<10){next=10;remaining=10-state.shares;}
else{next=Math.ceil((state.shares+1)/5)*5;remaining=next-state.shares;}
return{shares:state.shares,nextMilestone:next,remaining:remaining,
claimable:state.claimableRewards};
}

processReferral();

w.ViralEngine={
getPlayerId:function(){return state.id;},
getReferrer:function(){return state.ref;},
getShareUrl:getShareUrl,
doShare:doShare,
needsShareToContinue:needsShareToContinue,
getBoostMultiplier:getBoostMultiplier,
getShareCount:getShareCount,
claimReward:claimReward,
getMilestoneInfo:getMilestoneInfo,
trackShare:trackShare
};

})(window);
