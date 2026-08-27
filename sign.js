// sign.js - No-op code signing script
// This bypasses winCodeSign entirely (no symlink permission needed)
exports.default = async function(configuration) {
  // Signing intentionally skipped — no certificate configured
  console.log(`Skipping code signing for: ${configuration.path}`);
};
