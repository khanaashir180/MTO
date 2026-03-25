const { matchesCondition, resolveWorkflowTransition } = require('../src/utils/workflowEngine');

describe('workflowEngine', () => {
  test('matchesCondition supports simple and array matches', () => {
    const context = { flow: 'MTO', currentStage: 'Model Room', customPattern: true };
    expect(matchesCondition({ flow: 'MTO' }, context)).toBe(true);
    expect(matchesCondition({ flow: ['BESPOKE', 'MTO'] }, context)).toBe(true);
    expect(matchesCondition({ currentStage: 'Cutting' }, context)).toBe(false);
  });

  test('matchesCondition supports operator objects', () => {
    const context = { flow: 'MTO', currentStage: 'Closing', notes: '' };
    expect(matchesCondition({ flow: { in: ['MTO', 'LASER'] } }, context)).toBe(true);
    expect(matchesCondition({ currentStage: { ne: 'Verification' } }, context)).toBe(true);
    expect(matchesCondition({ notes: { exists: false } }, context)).toBe(true);
  });

  test('resolveWorkflowTransition returns highest-priority matching rule', () => {
    const result = resolveWorkflowTransition({
      defaultNextStage: 'Cutting',
      context: { flow: 'MTO', currentStage: 'Model Room' },
      rules: [
        {
          rule_key: 'fallback',
          priority: 100,
          active: true,
          condition_json: { flow: 'MTO' },
          action_json: { nextStage: 'Sole' },
        },
        {
          rule_key: 'preferred',
          priority: 10,
          active: true,
          condition_json: { flow: 'MTO', currentStage: 'Model Room' },
          action_json: { nextStage: 'Cutting' },
        },
      ],
    });

    expect(result.nextStageName).toBe('Cutting');
    expect(result.source).toBe('workflow-rule');
    expect(result.ruleKey).toBe('preferred');
  });
});
