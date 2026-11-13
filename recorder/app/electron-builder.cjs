// CreatorClub's installers. Installed apps update themselves from this repository's GitHub Releases
// (desktop/updater.cjs): electron-builder writes latest-mac.yml / latest.yml next to the installers, and the
// release workflow publishes them together.
// The Mac build is signed with the team's own "CreatorClub Dev" certificate when CREATORCLUB_SIGN_SHA1 is set
// (scripts/sign-creatorclub-dev.cjs). A Mac installs an update only when it is signed with the same certificate
// as the copy it runs, so every published build must use that one certificate.
const signSha1=process.env.CREATORCLUB_SIGN_SHA1;
module.exports={
 appId:'com.aianswer.creatorclub',productName:'CreatorClub',
 directories:{output:'../../release',buildResources:'assets'},
 artifactName:'CreatorClub-${version}-${os}-${arch}.${ext}',
 asar:false,npmRebuild:false,
 files:['desktop/**/*','dist/**/*','server-dist/**/*','assets/creator-compiler-512.png','package.json'],
 extraResources:[{from:'runtime',to:'runtime'},{from:'../../LICENSE',to:'LICENSE'},{from:'../THIRD_PARTY_NOTICES.md',to:'THIRD_PARTY_NOTICES.md'}],
 mac:{target:['dmg','zip'],category:'public.app-category.video',icon:'assets/icon.icns',minimumSystemVersion:'14.0',
  // With a self-signed certificate macOS refuses a hardened app at launch, so that build goes without it.
  hardenedRuntime:!signSha1,entitlements:'desktop/entitlements.mac.plist',entitlementsInherit:'desktop/entitlements.mac.plist',
  // electron-builder only looks up identities macOS trusts; '-' gets it past that lookup and the signer below swaps in the certificate's SHA-1.
  ...(signSha1?{identity:'-',sign:'scripts/sign-creatorclub-dev.cjs',notarize:false}:{}),
  extendInfo:{NSCameraUsageDescription:'Record camera video for your scenes.',NSMicrophoneUsageDescription:'Record your narration.',NSScreenCaptureUsageDescription:'Record a screen or window you select.',NSAudioCaptureUsageDescription:'Record system audio you select.',NSSpeechRecognitionUsageDescription:'Follow your voice to scroll the script while you record.'}},
 win:{target:[{target:'nsis',arch:['x64']},{target:'zip',arch:['x64']}],icon:'assets/icon.ico'},
 nsis:{oneClick:false,allowToChangeInstallationDirectory:true,perMachine:false,createDesktopShortcut:true,createStartMenuShortcut:true,shortcutName:'CreatorClub'},
 afterPack:'scripts/after-desktop-pack.cjs',
 publish:{provider:'github',owner:'AI-Answer',repo:'creatorclub',releaseType:'release'},
};
