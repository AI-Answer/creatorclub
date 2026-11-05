// The island's script follower: Borumi's tokens, its voice matching and its pacing, in plain functions the island (recording-hud.js) drives.
// What Borumi does was read from its app (tokenize-script-*.js and the borumi-script-follower crate in its binary): the notes in each function
// say which parts are its rules and which are ours.
(root=>{
 'use strict';

 // Borumi's tokenizer (tokenize-script Ie) for plain text: words split on whitespace, a newline marks the word before it, and a [bracketed]
 // note is one "secondary" token that is never read aloud.
 function tokenize(text){
  const out=[];let fragment=null,group=null,groupSpace=false;
  const flush=()=>{if(!fragment)return;const f=fragment;fragment=null;
   if(group){if(groupSpace&&group.text.length>0)group.text+=' ';group.text+=f.text;groupSpace=false;if(f.text.includes(']')){out.push(group);group=null;}return;}
   if(f.text.startsWith('[')){group={text:f.text,secondary:true};if(f.text.includes(']')){out.push(group);group=null;}return;}
   out.push(f);};
  for(const ch of String(text||'')){
   if(/\s/u.test(ch)){flush();if(group)groupSpace=group.text.length>0;else if(/[\n\r\u2028\u2029]/u.test(ch)&&out.length)out[out.length-1].newline=true;continue;}
   if(fragment)fragment.text+=ch;else fragment={text:ch};
  }
  flush();if(group)out.push(group);
  return out;
 }

 // Where each token starts, in characters (Borumi's offsets count each token's characters; the space after it is ours). Notes take no time.
 function offsets(tokens){const out=[];let at=0;for(const token of tokens){out.push(at);if(!token.secondary)at+=[...token.text].length+1;}return {starts:out,total:Math.max(0,at-1)};}
 // The last token that starts at or before a position (Borumi's playback index); 0 before the first.
 function indexAt(starts,position){let lo=0,hi=starts.length-1,found=0;while(lo<=hi){const mid=(lo+hi)>>1;if(starts[mid]<=position){found=mid;lo=mid+1;}else hi=mid-1;}return found;}

 // Words as the matcher compares them: lower case, no accents or punctuation, contractions spelled out (Borumi's normalize does this for
 // English; its table is "are not re am shall can have will"), hyphenated words split, and number words as digits (ours).
 const NUMBERS={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,hundred:100,thousand:1000};
 const WHOLE={"can't":'can not',"won't":'will not',"shan't":'shall not'},ENDINGS=[["n't",' not'],["'re",' are'],["'m",' am'],["'ll",' will'],["'ve",' have']];
 function words(text){
  const out=[];
  for(let raw of String(text||'').toLowerCase().replace(/[\u2018\u2019\u02bc]/g,"'").normalize('NFD').replace(/\p{M}/gu,'').split(/[\s\-\u2010-\u2014/]+/u)){
   raw=raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,'');if(!raw)continue;
   let spelled=WHOLE[raw];if(!spelled)for(const [end,full] of ENDINGS)if(raw.endsWith(end)&&raw.length>end.length){spelled=raw.slice(0,-end.length)+full;break;}
   for(const part of (spelled||raw).split(' ')){const word=part.replace(/[^\p{L}\p{N}]/gu,'');if(word)out.push(word in NUMBERS?String(NUMBERS[word]):word);}
  }
  return out;
 }

 // Borumi's token_similarity: 1 − edit distance over the longer word's length, in characters.
 function similarity(a,b){
  if(a===b)return 1;const x=[...a],y=[...b],n=Math.max(x.length,y.length);if(!n)return 1;
  let row=Array.from({length:y.length+1},(_,i)=>i);
  for(let i=1;i<=x.length;i++){const next=[i];for(let j=1;j<=y.length;j++)next[j]=Math.min(row[j]+1,next[j-1]+1,row[j-1]+(x[i-1]===y[j-1]?0:1));row=next;}
  return 1-row[y.length]/n;
 }

 // The voice matcher. Borumi aligns what was heard with the script near where you are and moves only on enough evidence: a word counts at
 // 0.75 similarity and fully at 0.9 (its thresholds), and a longer jump needs more matching words (its evidence steps at 1, 5 and 13 words).
 // The exact counts below, the 8-word window and the tie-breaking toward the nearest place are ours.
 const MATCH=.75,STRONG=.9,TAIL=8,BACK=40,AHEAD=60;
 function createMatcher(tokens){
  const script=[];tokens.forEach((token,index)=>{if(!token.secondary)for(const word of words(token.text))script.push({word,token:index});});
  let position=-1,heard=[],ignore=0;
  const weight=(value,word)=>(value>=STRONG?1:.6)*(word.length<=2?.5:1);
  function alignAt(tail,end){
   for(let anchor=tail.length-1;anchor>=Math.max(0,tail.length-2);anchor--){
    const first=similarity(tail[anchor],script[end].word);if(first<MATCH)continue;
    let matches=1,score=weight(first,script[end].word),h=anchor-1,k=end-1,skips=0;
    while(h>=0&&k>=0&&end-k<=TAIL+4&&skips<=3){
     const value=similarity(tail[h],script[k].word);
     if(value>=MATCH){matches++;score+=weight(value,script[k].word);h--;k--;continue;}
     if(k>0&&similarity(tail[h],script[k-1].word)>=MATCH){k--;skips++;continue;}
     if(h>0&&similarity(tail[h-1],script[k].word)>=MATCH){h--;skips++;continue;}
     h--;k--;skips++;
    }
    return {matches,score,first,last:anchor===tail.length-1};
   }
   return null;
  }
  function enough(jump,m,word){
   if(jump===1)return m.matches>=2||(m.first>=STRONG&&word.length>=3);
   if(jump===2)return m.matches>=2||(m.first>=STRONG&&word.length>=5);
   if(jump<=5)return m.matches>=2&&m.score>=2;
   if(jump<13)return m.matches>=3&&m.score>=3;
   if(jump>0)return m.matches>=4&&m.score>=4;
   return m.matches>=3&&m.score>=3;// back to a place already read: you started a sentence again
  }
  const index=()=>position<0?0:script[position].token;
  return {
   get words(){return script;},
   index,
   /** The running transcript of the current recognition; returns the token now read, or null when nothing moved. */
   hear(text){
    heard=words(text);ignore=Math.min(ignore,heard.length);
    const tail=heard.slice(Math.max(ignore,heard.length-TAIL));if(!tail.length||!script.length)return null;
    // Staying put competes too: a place is taken only when the words fit it better than where you are. Going back needs the last word heard.
    const here=position>=0?alignAt(tail,position):null;let best={end:position,rank:here?here.score:-Infinity};
    for(let end=Math.max(0,position-BACK);end<=Math.min(script.length-1,position+AHEAD);end++){
     const jump=end-position;if(jump===0)continue;
     const m=alignAt(tail,end);if(!m||!enough(jump,m,script[end].word)||(jump<0&&!m.last))continue;
     const rank=m.score-(jump>0?.05*(jump-1):.1*-jump);
     if(rank>best.rank)best={end,rank};
    }
    if(best.end===position)return null;
    position=best.end;return index();
   },
   /** A new recognition began: its transcript starts empty. */
   restart(){heard=[];ignore=0;},
   /** Go to a token (it counts as read; 0 is the start): words heard before now no longer count. */
   seek(token){let at=-1;if(token>0)for(let i=0;i<script.length&&script[i].token<=token;i++)at=i;position=at;ignore=heard.length;}
  };
 }

 // Borumi's reading pace for Voice follow (Enhanced): characters a second over the last stretch of at least 3 s, at least 8, and 15 until
 // there is one (VoicePlaybackEngine). The 10 s window is ours.
 function createPace(){
  let samples=[];
  return {
   add(time,chars){samples=samples.filter(([t])=>time-t<=10000);if(samples.length&&chars<samples[samples.length-1][1])samples=[];samples.push([time,chars]);},
   rate(){if(samples.length<2)return 15;const [t0,c0]=samples[0],[t1,c1]=samples[samples.length-1],span=(t1-t0)/1000;return span>=3&&c1>c0?Math.max(8,(c1-c0)/span):15;},
   clear(){samples=[];}
  };
 }
 // Borumi's optimistic index: for 0.75 s after it last heard you, it reads ahead at your pace, but never more than one word past what it heard.
 function optimisticIndex({confirmed,since,rate,starts}){
  if(!(since>=0)||since>750)return confirmed;
  const ahead=indexAt(starts,starts[confirmed]+rate*since/1000);
  return Math.max(confirmed,Math.min(ahead,confirmed+1,starts.length-1));
 }

 // Voice activity for Constant speed (Voice activated), from the island's microphone level (the peak, −50 to 0 dB as 0 to 1). Borumi runs a
 // Silero model with enter and exit thresholds; these levels and the 400 ms hold are ours.
 function createVoiceActivity({enter=.4,exit=.3,hold=400}={}){
  let active=false,quietSince=0;
  return {update(level,now){if(typeof level!=='number'){active=false;return active;}if(level>=enter){active=true;quietSince=0;}else if(active&&level<exit){if(!quietSince)quietSince=now;else if(now-quietSince>=hold)active=false;}else if(level>=exit)quietSince=0;return active;},get active(){return active;}};
 }

 // Borumi's recorder scroll: the next word's line to the top of the script, eased (ease-in-out cubic), in 500 ms, or 180 ms when going back
 // or jumping 6 words or more.
 const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
 const scrollDuration=(from,to)=>from==null?500:to<from||to-from>=6?180:500;

 const api={tokenize,offsets,indexAt,words,similarity,createMatcher,createPace,optimisticIndex,createVoiceActivity,ease,scrollDuration};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.ScriptFollower=api;
})(typeof window==='object'?window:globalThis);
