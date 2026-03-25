function normalizeValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.trim().toUpperCase();
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  return value;
}

function compareAny(actual, expected) {
  const a = normalizeValue(actual);
  const e = normalizeValue(expected);
  return a === e;
}

function matchesCondition(condition = {}, context = {}) {
  if (!condition || typeof condition !== 'object') return true;
  return Object.entries(condition).every(([key, expected]) => {
    const actual = context[key];
    if (Array.isArray(expected)) {
      return expected.some((candidate) => compareAny(actual, candidate));
    }
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if (Object.prototype.hasOwnProperty.call(expected, 'in')) {
        const choices = Array.isArray(expected.in) ? expected.in : [];
        return choices.some((candidate) => compareAny(actual, candidate));
      }
      if (Object.prototype.hasOwnProperty.call(expected, 'eq')) {
        return compareAny(actual, expected.eq);
      }
      if (Object.prototype.hasOwnProperty.call(expected, 'ne')) {
        return !compareAny(actual, expected.ne);
      }
      if (Object.prototype.hasOwnProperty.call(expected, 'exists')) {
        const exists = actual !== null && actual !== undefined && actual !== '';
        return Boolean(expected.exists) ? exists : !exists;
      }
    }
    return compareAny(actual, expected);
  });
}

function resolveWorkflowTransition({
  defaultNextStage = null,
  rules = [],
  context = {},
}) {
  const ordered = [...(Array.isArray(rules) ? rules : [])]
    .filter((rule) => rule && rule.active !== false)
    .sort((a, b) => Number(a.priority || 100) - Number(b.priority || 100));

  for (const rule of ordered) {
    const condition = rule.condition_json || rule.condition || {};
    if (!matchesCondition(condition, context)) continue;
    const action = rule.action_json || rule.action || {};
    if (action.terminal === true) {
      return {
        nextStageName: null,
        source: 'workflow-rule',
        ruleKey: rule.rule_key || rule.ruleKey || null,
      };
    }
    if (typeof action.nextStage === 'string' && action.nextStage.trim()) {
      return {
        nextStageName: action.nextStage.trim(),
        source: 'workflow-rule',
        ruleKey: rule.rule_key || rule.ruleKey || null,
      };
    }
  }

  return {
    nextStageName: defaultNextStage,
    source: 'static-flow',
    ruleKey: null,
  };
}

module.exports = {
  matchesCondition,
  resolveWorkflowTransition,
};
