module.exports={
 appId:'com.aianswer.creatorcompiler',productName:'Creator Compiler',
 directories:{output:'../../release',buildResources:'assets'},
 artifactName:'Creator-Compiler-${version}-${os}-${arch}.${ext}',
 asar:false,npmRebuild:false,
 files:['desktop/**/*','dist/**/*','server-dist/**/*','assets/creator-compiler-512.png','package.json'],
 extraResources:[{from:'runtime',to:'runtime'},{from:'../../LICENSE',to:'LICENSE'},{from:'../THIRD_PARTY_NOTICES.md',to:'THIRD_PARTY_NOTICES.md'}],
 mac:{target:['dmg','zip'],category:'public.app-category.video',icon:'assets/icon.icns',minimumSystemVersion:'14.0',
  hardenedRuntime:true,entitlements:'desktop/entitlements.mac.plist',entitlementsInherit:'desktop/entitlements.mac.plist',
  extendInfo:{NSCameraUsageDescription:'Record camera video for your scenes.',NSMicrophoneUsageDescription:'Record your narration.',NSScreenCaptureUsageDescription:'Record a screen or window you select.',NSAudioCaptureUsageDescription:'Record system audio you select.'}},
 win:{target:[{target:'nsis',arch:['x64']},{target:'zip',arch:['x64']}],icon:'assets/icon.ico'},
 nsis:{oneClick:false,allowToChangeInstallationDirectory:true,perMachine:false,createDesktopShortcut:true,createStartMenuShortcut:true,shortcutName:'Creator Compiler'},
 afterPack:'scripts/after-desktop-pack.cjs',publish:null,
};
