const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
module.exports=async function(context){
 if(context.electronPlatformName==='darwin'){
  const {buildMcpLauncher}=await import('./build-mcp-launcher.mjs');
  await buildMcpLauncher(path.join(context.appOutDir,`${context.packager.appInfo.productFilename}.app`));
 }else if(context.electronPlatformName==='win32'){
  execFileSync('cl.exe',['/nologo','/O2',path.join(__dirname,'mcp-launcher-windows.c'),'/Fe:'+path.join(context.appOutDir,'creator-compiler-mcp.exe'),'/Fo:'+path.join(os.tmpdir(),'creator-compiler-mcp.obj')],{stdio:'inherit'});
 }
};
