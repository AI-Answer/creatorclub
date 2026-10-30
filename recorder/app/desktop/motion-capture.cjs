// Captures a motion block's frames as transparent PNGs over the Chrome DevTools Protocol. The desktop app runs it in offscreen
// windows (desktop/motion-render.cjs, through webContents.debugger); development and tests run it in Chrome (server/motion-chrome.ts).
// Both send the same commands, so the frames are the same: the page is sized to the export frame at scale 1, its background is
// transparent, every animation is paused and set to the frame's time, and only the block's box is captured.
'use strict';

/** Validates a capture job; returns it normalized or throws. */
function captureJob(job){
 const int=(n,lo,hi)=>Number.isInteger(n)&&n>=lo&&n<=hi;
 if(!job||typeof job!=='object')throw new Error('Invalid motion job');
 const {width,height,fps,frames,clip}=job;
 if(!int(width,16,8192)||!int(height,16,8192)||!(fps>=1&&fps<=120)||!int(frames,1,120*3600))throw new Error('Invalid motion job size');
 if(!clip||!int(clip.x,0,width)||!int(clip.y,0,height)||!int(clip.width,1,width)||!int(clip.height,1,height)||clip.x+clip.width>width||clip.y+clip.height>height)throw new Error('Invalid motion job clip');
 // The seek is the shared template's own function with the frame's time in place of __MS__ (shared/motion/document.ts).
 if(typeof job.seek!=='string'||job.seek.length>4000||!job.seek.endsWith('__MS__)'))throw new Error('Invalid motion job seek');
 return job;
}

/**
 * `sessions`: one `send(method, params)` per loaded page (each holds the same document). Frames are shared out between them in order;
 * `write(index, png)` stores each one. Resolves when every frame is written.
 */
async function captureFrames(sessions,job,write){
 captureJob(job);
 for(const send of sessions){
  await send('Emulation.setDeviceMetricsOverride',{width:job.width,height:job.height,deviceScaleFactor:1,mobile:false});
  await send('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
  await send('Runtime.evaluate',{expression:'document.fonts.ready.then(()=>document.fonts.size)',awaitPromise:true});
 }
 let next=0;
 await Promise.all(sessions.map(async send=>{
  while(next<job.frames){
   const index=next++,ms=index*1000/job.fps;
   const seek=job.seek.slice(0,-'__MS__)'.length)+`${Number(ms.toFixed(3))})`;
   const evaluated=await send('Runtime.evaluate',{expression:seek,returnByValue:true});
   if(evaluated&&evaluated.exceptionDetails)throw new Error('The motion template could not be set to its time.');
   const {data}=await send('Page.captureScreenshot',{format:'png',clip:{x:job.clip.x,y:job.clip.y,width:job.clip.width,height:job.clip.height,scale:1},captureBeyondViewport:false,optimizeForSpeed:true});
   await write(index,Buffer.from(data,'base64'));
  }
 }));
}

module.exports={captureFrames,captureJob};
