/** Security headers (helmet) and basic rate limiting, wired into src/app. */
module.exports = {
  key: 'security',
  label: 'Security (helmet + rate limit)',
  dependencies: () => ['helmet@^8', 'express-rate-limit@^8'],
};
