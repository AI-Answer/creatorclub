// "Creator Compiler (Local)": the app `npm run setup:local` builds from this checkout and installs next to the downloaded one
// (scripts/setup-local.mjs at the repo root). Its package.json says `creatorCompilerEdition: "local"`, so desktop/runtime.cjs
// gives it its own data folder, projects folder and port, and it never installs the published releases over itself.
// The executable keeps the installed app's name, which the bundled MCP launcher runs; setup-local names the bundle.
// When setup-local finds a signing certificate it sets CREATORCLUB_SIGN_SHA1, and the shared config signs with it
// (scripts/sign-creatorclub-dev.cjs), which keeps macOS camera, microphone and screen permissions across rebuilds.
const base=require('./electron-builder.cjs');
const afterPack=require('./scripts/after-desktop-pack.cjs');
const signed=Boolean(process.env.CREATORCLUB_SIGN_SHA1);
module.exports={
 ...base,
 appId:'com.aianswer.creatorcompiler.local',productName:'Creator Compiler (Local)',executableName:'Creator Compiler',
 extraMetadata:{productName:'Creator Compiler (Local)',creatorCompilerEdition:'local'},
 directories:{...base.directories,output:'../../release/local'},
 // Without a certificate: ad-hoc signed, which macOS accepts for an app built on this Mac.
 mac:{...base.mac,target:['dir'],hardenedRuntime:false,notarize:false,...(signed?{}:{identity:'-'})},
 win:{...base.win,target:['dir']},
 // The Windows MCP launcher needs cl.exe on PATH (a Developer Command Prompt). A local build still works without it.
 afterPack:async context=>{
  try{await afterPack(context);}
  catch(error){if(context.electronPlatformName!=='win32')throw error;console.warn(`Skipped the MCP launcher: ${error.message}`);}
 },
 publish:null,
};
