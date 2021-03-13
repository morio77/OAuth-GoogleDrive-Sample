const crypto = require('crypto');
const base64url = require('base64url')

exports.urlSafeRandomChars = function(byteSize) {
  return base64url.fromBase64(crypto.randomBytes(byteSize).toString('base64')).substring(0, byteSize);
}

exports.getCodeChallengeFromCodeVerifier = function(codeVerifier) {
  return base64url.fromBase64(crypto.createHash('sha256').update(codeVerifier).digest('base64'));
}
