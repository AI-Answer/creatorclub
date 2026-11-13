// electron-builder's `mac.sign` when CREATORCLUB_SIGN_SHA1 is set (see electron-builder.cjs). The team's "CreatorClub Dev"
// certificate is self-signed, and a CI runner cannot be told to trust it. codesign signs with it by SHA-1 anyway once its
// keychain is on the search list (scripts/import-signing-cert.sh at the repo root does that), so the SHA-1 goes straight in.
const {sign}=require('app-builder-lib/out/codeSign/macCodeSign');
exports.default=async function signWithCreatorClubDev(options){
 const identity=process.env.CREATORCLUB_SIGN_SHA1;
 if(!/^[A-F0-9]{40}$/i.test(identity||''))throw Error('CREATORCLUB_SIGN_SHA1 must be the certificate SHA-1.');
 await sign({...options,identity,identityValidation:false});
};
