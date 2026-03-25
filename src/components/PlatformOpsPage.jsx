import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const emptyWorkflowForm = {
  workflowKey: '',
  workflowName: '',
  definition: '{"startStage":"Verification"}',
  active: true,
};

const emptyFlagForm = {
  flagKey: '',
  flagValue: 'true',
  description: '',
  scope: 'GLOBAL',
};

export default function PlatformOpsPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [health, setHealth] = useState(null);
  const [flags, setFlags] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [rules, setRules] = useState([]);
  const [slaPolicies, setSlaPolicies] = useState([]);
  const [breaches, setBreaches] = useState([]);
  const [erpAudit, setErpAudit] = useState(null);
  const [workflowValidation, setWorkflowValidation] = useState({ run_in_progress: false, latest: null, runs: [] });
  const [workflowForm, setWorkflowForm] = useState(emptyWorkflowForm);
  const [flagForm, setFlagForm] = useState(emptyFlagForm);
  const [workflowRulesBusy, setWorkflowRulesBusy] = useState(false);
  const [sweepBusy, setSweepBusy] = useState(false);
  const [slaEdits, setSlaEdits] = useState({});
  const [newRule, setNewRule] = useState({
    ruleKey: '',
    condition: '{"flow":"MTO"}',
    action: '{"nextStage":"Model Room"}',
    priority: 100,
    active: true,
  });

  function hydrateSlaEdits(policies) {
    const next = {};
    (policies || []).forEach((policy) => {
      next[policy.id] = {
        maxHours: String(policy.max_hours ?? ''),
        escalationTo: policy.escalation_to || '',
        active: policy.active !== false,
      };
    });
    setSlaEdits(next);
  }

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const [healthRes, flagsRes, wfRes, slaRes, breachRes, auditRes, workflowValidationRes] = await Promise.all([
        api.get('/platform/health/dependencies'),
        api.get('/platform/feature-flags'),
        api.get('/platform/workflows'),
        api.get('/platform/sla-policies'),
        api.get('/platform/sla-breaches'),
        api.get('/platform/audit/erp-readiness'),
        api.get('/platform/workflow-validation/reports?limit=10'),
      ]);
      const nextPolicies = slaRes.data?.policies || [];
      setHealth(healthRes.data || null);
      setFlags(flagsRes.data?.flags || []);
      setWorkflows(wfRes.data?.workflows || []);
      setSlaPolicies(nextPolicies);
      setBreaches(breachRes.data?.breaches || []);
      setErpAudit(auditRes.data || null);
      setWorkflowValidation({
        run_in_progress: Boolean(workflowValidationRes.data?.run_in_progress),
        latest: workflowValidationRes.data?.latest || null,
        runs: workflowValidationRes.data?.runs || [],
      });
      hydrateSlaEdits(nextPolicies);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to load platform operations data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRules = useCallback(async (workflowId) => {
    if (!workflowId) {
      setRules([]);
      return;
    }
    setWorkflowRulesBusy(true);
    try {
      const { data } = await api.get(`/platform/workflows/${workflowId}/rules`);
      setRules(data.rules || []);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to load workflow rules');
    } finally {
      setWorkflowRulesBusy(false);
    }
  }, []);

  useEffect(() => {
    loadAll().catch(() => {});
  }, [loadAll]);

  useEffect(() => {
    loadRules(selectedWorkflowId).catch(() => {});
  }, [selectedWorkflowId, loadRules]);

  const selectedWorkflow = useMemo(
    () => workflows.find((wf) => Number(wf.id) === Number(selectedWorkflowId)) || null,
    [workflows, selectedWorkflowId]
  );

  async function saveFlag() {
    try {
      setMessage('');
      await api.post('/platform/feature-flags', {
        flagKey: flagForm.flagKey,
        flagValue: JSON.parse(flagForm.flagValue || 'false'),
        description: flagForm.description,
        scope: flagForm.scope,
      });
      setFlagForm(emptyFlagForm);
      await loadAll();
      setMessage('Feature flag saved.');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save feature flag');
    }
  }

  async function saveSlaPolicy(policy) {
    const edit = slaEdits[policy.id] || {};
    try {
      setMessage('');
      await api.post('/platform/sla-policies', {
        stageId: policy.stage_id,
        maxHours: Number(edit.maxHours || policy.max_hours),
        escalationTo: edit.escalationTo,
        active: Boolean(edit.active),
      });
      await loadAll();
      setMessage(`SLA policy updated for ${policy.stage_name}.`);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update SLA policy');
    }
  }

  async function runSlaSweep() {
    setSweepBusy(true);
    try {
      setMessage('');
      const { data } = await api.post('/platform/sla-escalate', { limit: 500, notifyOnly: false });
      await loadAll();
      setMessage(`SLA sweep completed. Escalated ${data.escalated}, skipped ${data.skipped_existing}.`);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to run SLA escalation sweep');
    } finally {
      setSweepBusy(false);
    }
  }

  async function runWorkflowValidation() {
    try {
      setMessage('');
      const { data } = await api.post('/platform/workflow-validation/run');
      await loadAll();
      setMessage(`Workflow validation completed: ${data.summary?.passed || 0}/${data.summary?.total_checks || 0} checks passed.`);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to run workflow validation');
    }
  }

  return (
    <section className="module-page">
      <div className="module-hero">
        <div>
          <h2>Platform Ops</h2>
          <p>Feature flags, workflow rules, SLA policies, dependency health, and audit exports.</p>
        </div>
        <div className="actions-cell">
          <button type="button" className="button-secondary" onClick={() => loadAll()}>Refresh</button>
          <button type="button" className="button-secondary" disabled={workflowValidation.run_in_progress} onClick={runWorkflowValidation}>
            {workflowValidation.run_in_progress ? 'Workflow Validation Running...' : 'Run Workflow Validation'}
          </button>
          <button type="button" className="button-secondary" disabled={sweepBusy} onClick={runSlaSweep}>
            {sweepBusy ? 'Running SLA Sweep...' : 'Run SLA Escalation Sweep'}
          </button>
          <button type="button" className="button-secondary" onClick={() => window.open(`${window.location.origin}/api/platform/audit/export?type=user`, '_blank')}>Export User Audit CSV</button>
          <button type="button" className="button-secondary" onClick={() => window.open(`${window.location.origin}/api/platform/audit/export?type=order`, '_blank')}>Export Order Audit CSV</button>
        </div>
      </div>

      {message ? <div className="card"><p>{message}</p></div> : null}
      {loading && <div className="card"><p>Loading platform operations data...</p></div>}

      {!loading && (
        <>
          <div className="grid three">
            <article className="card">
              <h4>Dependency Health</h4>
              <p>Status: <strong>{health?.status || '-'}</strong></p>
              <p>DB: {health?.dependencies?.database?.status || '-'}</p>
              <p>Storage: {health?.dependencies?.storage?.status || '-'}</p>
            </article>
            <article className="card">
              <h4>Feature Flags</h4>
              <p>Total Flags: <strong>{flags.length}</strong></p>
              <div className="compact-list">
                {flags.slice(0, 8).map((flag) => <p key={flag.id}>{flag.flag_key}: {String(flag.flag_value)}</p>)}
              </div>
            </article>
            <article className="card">
              <h4>SLA Breaches</h4>
              <p>Total Breaches: <strong>{breaches.length}</strong></p>
              <p>Active SLA Policies: <strong>{slaPolicies.filter((x) => x.active).length}</strong></p>
            </article>
            <article className="card">
              <h4>ERP Readiness Audit</h4>
              <p>Controls: <strong>{erpAudit?.summary?.total_checks || 0}</strong></p>
              <p>Score: <strong>{erpAudit?.summary?.score_pct || 0}%</strong></p>
              <p>Release Ready: <strong>{erpAudit?.summary?.release_ready ? 'Yes' : 'No'}</strong></p>
            </article>
          </div>

          <div className="card">
            <h4>ERP Audit Blockers</h4>
            <div className="actions-cell">
              <button type="button" className="button-secondary" onClick={() => window.open(`${window.location.origin}/api/platform/audit/erp-readiness/export`, '_blank')}>Export ERP Audit CSV</button>
            </div>
            <table>
              <thead>
                <tr><th>Control</th><th>Issue</th><th>Details</th></tr>
              </thead>
              <tbody>
                {erpAudit?.blockers?.length ? erpAudit.blockers.map((blocker) => (
                  <tr key={blocker.id}>
                    <td>{blocker.id}</td>
                    <td>{blocker.title}</td>
                    <td>{blocker.details}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={3}>No critical blockers.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h4>Workflow Validation Reports</h4>
            <div className="actions-cell">
              {workflowValidation.latest?.json_file ? (
                <button type="button" className="button-secondary" onClick={() => window.open(`${window.location.origin}/api/platform/workflow-validation/reports/${workflowValidation.latest.json_file}`, '_blank')}>
                  Download Latest JSON
                </button>
              ) : null}
              {workflowValidation.latest?.csv_file ? (
                <button type="button" className="button-secondary" onClick={() => window.open(`${window.location.origin}/api/platform/workflow-validation/reports/${workflowValidation.latest.csv_file}`, '_blank')}>
                  Download Latest CSV
                </button>
              ) : null}
            </div>
            <table>
              <thead>
                <tr><th>Run ID</th><th>Status</th><th>Checks</th><th>Passed</th><th>Failed</th><th>Success %</th><th>Generated</th></tr>
              </thead>
              <tbody>
                {(workflowValidation.runs || []).length === 0 ? (
                  <tr><td colSpan={7}>No workflow validation reports yet.</td></tr>
                ) : (workflowValidation.runs || []).map((run) => (
                  <tr key={run.run_id}>
                    <td>{run.run_id}</td>
                    <td>{run.status}</td>
                    <td>{run.total_checks}</td>
                    <td>{run.passed}</td>
                    <td>{run.failed}</td>
                    <td>{run.success_rate_pct}</td>
                    <td>{String(run.generated_at || '').replace('T', ' ').slice(0, 19)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h4>Create or Update Feature Flag</h4>
            <div className="grid four">
              <label>Flag Key<input value={flagForm.flagKey} onChange={(e) => setFlagForm((p) => ({ ...p, flagKey: e.target.value }))} /></label>
              <label>Scope<select value={flagForm.scope} onChange={(e) => setFlagForm((p) => ({ ...p, scope: e.target.value }))}><option value="GLOBAL">GLOBAL</option><option value="PRODUCTION">PRODUCTION</option><option value="RETAIL">RETAIL</option></select></label>
              <label>Description<input value={flagForm.description} onChange={(e) => setFlagForm((p) => ({ ...p, description: e.target.value }))} /></label>
            </div>
            <label>Flag Value JSON<textarea rows={2} value={flagForm.flagValue} onChange={(e) => setFlagForm((p) => ({ ...p, flagValue: e.target.value }))} /></label>
            <div className="actions-cell">
              <button type="button" onClick={saveFlag}>Save Flag</button>
            </div>
          </div>

          <div className="card">
            <h4>Workflow Definitions</h4>
            <div className="grid three">
              <label>Key<input value={workflowForm.workflowKey} onChange={(e) => setWorkflowForm((p) => ({ ...p, workflowKey: e.target.value }))} /></label>
              <label>Name<input value={workflowForm.workflowName} onChange={(e) => setWorkflowForm((p) => ({ ...p, workflowName: e.target.value }))} /></label>
              <label>Active<select value={workflowForm.active ? 'true' : 'false'} onChange={(e) => setWorkflowForm((p) => ({ ...p, active: e.target.value === 'true' }))}><option value="true">Yes</option><option value="false">No</option></select></label>
            </div>
            <label>Definition JSON<textarea rows={3} value={workflowForm.definition} onChange={(e) => setWorkflowForm((p) => ({ ...p, definition: e.target.value }))} /></label>
            <div className="actions-cell">
              <button
                type="button"
                onClick={async () => {
                  try {
                    setMessage('');
                    await api.post('/platform/workflows', {
                      workflowKey: workflowForm.workflowKey,
                      workflowName: workflowForm.workflowName,
                      definition: JSON.parse(workflowForm.definition || '{}'),
                      active: workflowForm.active,
                    });
                    setWorkflowForm(emptyWorkflowForm);
                    await loadAll();
                    setMessage('Workflow saved.');
                  } catch (error) {
                    setMessage(error.response?.data?.message || 'Unable to save workflow');
                  }
                }}
              >
                Save Workflow
              </button>
            </div>
            <div className="grid two">
              <label>
                Select Workflow
                <select value={selectedWorkflowId} onChange={(e) => setSelectedWorkflowId(e.target.value)}>
                  <option value="">Select workflow</option>
                  {workflows.map((wf) => <option key={wf.id} value={wf.id}>{wf.workflow_name}</option>)}
                </select>
              </label>
              <div>
                <p>Selected: <strong>{selectedWorkflow?.workflow_name || '-'}</strong></p>
                <p>Rules: <strong>{rules.length}</strong></p>
              </div>
            </div>
          </div>

          <div className="card">
            <h4>Workflow Rules</h4>
            <div className="grid four">
              <label>Rule Key<input value={newRule.ruleKey} onChange={(e) => setNewRule((p) => ({ ...p, ruleKey: e.target.value }))} /></label>
              <label>Priority<input type="number" value={newRule.priority} onChange={(e) => setNewRule((p) => ({ ...p, priority: e.target.value }))} /></label>
              <label>Active<select value={newRule.active ? 'true' : 'false'} onChange={(e) => setNewRule((p) => ({ ...p, active: e.target.value === 'true' }))}><option value="true">Yes</option><option value="false">No</option></select></label>
            </div>
            <div className="grid two">
              <label>Condition JSON<textarea rows={3} value={newRule.condition} onChange={(e) => setNewRule((p) => ({ ...p, condition: e.target.value }))} /></label>
              <label>Action JSON<textarea rows={3} value={newRule.action} onChange={(e) => setNewRule((p) => ({ ...p, action: e.target.value }))} /></label>
            </div>
            <div className="actions-cell">
              <button
                type="button"
                disabled={!selectedWorkflowId || workflowRulesBusy}
                onClick={async () => {
                  try {
                    if (!selectedWorkflowId) return;
                    setMessage('');
                    await api.post(`/platform/workflows/${selectedWorkflowId}/rules`, {
                      ruleKey: newRule.ruleKey,
                      condition: JSON.parse(newRule.condition || '{}'),
                      action: JSON.parse(newRule.action || '{}'),
                      priority: Number(newRule.priority || 100),
                      active: newRule.active,
                    });
                    await loadRules(selectedWorkflowId);
                    setMessage('Workflow rule saved.');
                  } catch (error) {
                    setMessage(error.response?.data?.message || 'Unable to save workflow rule');
                  }
                }}
              >
                Save Rule
              </button>
            </div>
            <table>
              <thead>
                <tr><th>Rule</th><th>Priority</th><th>Active</th><th>Condition</th><th>Action</th></tr>
              </thead>
              <tbody>
                {rules.length === 0 ? (
                  <tr><td colSpan={5}>No rules.</td></tr>
                ) : rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{rule.rule_key}</td>
                    <td>{rule.priority}</td>
                    <td>{rule.active ? 'Yes' : 'No'}</td>
                    <td><code>{JSON.stringify(rule.condition_json || {})}</code></td>
                    <td><code>{JSON.stringify(rule.action_json || {})}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h4>Stage SLA Policies</h4>
            <table>
              <thead>
                <tr><th>Stage</th><th>Max Hours</th><th>Escalation To</th><th>Active</th><th>Action</th></tr>
              </thead>
              <tbody>
                {slaPolicies.length === 0 ? (
                  <tr><td colSpan={5}>No policies.</td></tr>
                ) : slaPolicies.map((policy) => (
                  <tr key={policy.id}>
                    <td>{policy.stage_name}</td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={slaEdits[policy.id]?.maxHours ?? ''}
                        onChange={(e) => setSlaEdits((prev) => ({
                          ...prev,
                          [policy.id]: { ...(prev[policy.id] || {}), maxHours: e.target.value },
                        }))}
                      />
                    </td>
                    <td>
                      <input
                        value={slaEdits[policy.id]?.escalationTo ?? ''}
                        onChange={(e) => setSlaEdits((prev) => ({
                          ...prev,
                          [policy.id]: { ...(prev[policy.id] || {}), escalationTo: e.target.value },
                        }))}
                      />
                    </td>
                    <td>
                      <select
                        value={slaEdits[policy.id]?.active ? 'true' : 'false'}
                        onChange={(e) => setSlaEdits((prev) => ({
                          ...prev,
                          [policy.id]: { ...(prev[policy.id] || {}), active: e.target.value === 'true' },
                        }))}
                      >
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </td>
                    <td>
                      <button type="button" className="button-secondary" onClick={() => saveSlaPolicy(policy)}>Save</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h4>Current SLA Breaches</h4>
            <table>
              <thead>
                <tr><th>Order No</th><th>Customer</th><th>Stage</th><th>SLA (hrs)</th><th>Age (hrs)</th><th>Due Date</th></tr>
              </thead>
              <tbody>
                {breaches.length === 0 ? (
                  <tr><td colSpan={6}>No active breaches.</td></tr>
                ) : breaches.map((row) => (
                  <tr key={row.id}>
                    <td>{row.production_order_no}</td>
                    <td>{row.customer_name}</td>
                    <td>{row.current_stage}</td>
                    <td>{row.max_hours}</td>
                    <td>{row.stage_age_hours}</td>
                    <td>{String(row.due_date || '').slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
