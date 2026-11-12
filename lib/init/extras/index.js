// The order here is the order shown in the init checklist.
const EXTRAS = [
  require('./env'),
  require('./logger'),
  require('./apiPrefix'),
  require('./security'),
  require('./testing'),
  require('./lint'),
  require('./swagger'),
  require('./docker'),
];

const FEATURE_KEYS = EXTRAS.map((extra) => extra.key);

module.exports = { EXTRAS, FEATURE_KEYS };
