// Lets plain `node` (Node 24 strips TypeScript types itself) run the app's .ts sources, which import each other as `./x.js` or `../x`.
// Used to profile with fast-anything, whose function lookup needs the original line numbers that tsx's transform changes:
//   fast-anything scan -- node --import ./scripts/native-ts-resolve.mjs scripts/hot-paths-bench.ts
import {register} from 'node:module';
register('data:text/javascript,'+encodeURIComponent(`
import {existsSync} from 'node:fs';import {fileURLToPath} from 'node:url';
export async function resolve(spec,ctx,next){
 if(spec.startsWith('.')&&ctx.parentURL?.startsWith('file:')){
  if(spec.endsWith('.js')){const ts=new URL(spec.slice(0,-3)+'.ts',ctx.parentURL);if(existsSync(fileURLToPath(ts))&&!existsSync(fileURLToPath(new URL(spec,ctx.parentURL))))return next(ts.href,ctx);}
  else if(!/\\.[cm]?[jt]sx?$/.test(spec))for(const ext of ['.ts','.tsx','/index.ts']){const u=new URL(spec+ext,ctx.parentURL);if(existsSync(fileURLToPath(u)))return next(u.href,ctx);}
 }
 return next(spec,ctx);
}`));
