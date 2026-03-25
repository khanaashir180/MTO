const { isFlagEnabled } = require('../utils/featureFlags');

function requireFeatureFlag(flagKey, fallback = false) {
  return async (req, res, next) => {
    try {
      const enabled = await isFlagEnabled(flagKey, fallback);
      if (!enabled) {
        return res.status(404).json({ message: 'Not found' });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  requireFeatureFlag,
};
