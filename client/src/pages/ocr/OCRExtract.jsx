/**
 * KhanNetra — OCR Document Digitization
 * ─────────────────────────────────────────────────────────────────────────────
 * Step 1: Upload PDF / Image  →
 * Step 2: Gemini Vision extracts full text + structured fields  →
 * Step 3: User reviews / edits structured preview per target module  →
 * Step 4: Confirm & Save → written into Inspection / Compliance /
 *          Safety Observation / Violation DB
 *
 * Shows: Uploaded Document · OCR Raw Text · Structured Preview · Confirm/Edit/Save
 * History tab: past extractions with status
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from '../../components/ui/BackButton';
import Badge from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ocrApi, minesApi } from '../../services/api';
import { formatDate, timeAgo, getSeverityColor } from '../../utils/helpers';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  FiUpload, FiFileText, FiCpu, FiCheckCircle, FiAlertTriangle,
  FiSave, FiEdit2, FiRefreshCw, FiChevronDown, FiChevronRight,
  FiEye, FiClock, FiTrash2, FiCheck, FiX, FiInfo,
  FiClipboard, FiShield, FiAlertOctagon, FiList,
} from 'react-icons/fi';

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════════════════════ */
const DOC_TYPES = [
  'Inspection Report', 'Safety Certificate', 'Compliance Report',
  'Environmental Clearance', 'License', 'Certificate', 'Permit',
  'Violation Notice', 'Safety Observation Report', 'Other',
];

const TARGET_MODULES = [
  {
    id: 'inspection',
    label: 'Inspection Record',
    icon: FiClipboard,
    color: 'blue',
    desc: 'Save as a completed mine inspection with checklist and findings',
    route: '/inspections',
  },
  {
    id: 'compliance',
    label: 'Compliance Record',
    icon: FiCheckCircle,
    color: 'green',
    desc: 'Save as a compliance record with category, status, and deadline',
    route: '/compliance',
  },
  {
    id: 'safety_observation',
    label: 'Safety Observation',
    icon: FiShield,
    color: 'yellow',
    desc: 'Save as a safety observation with severity and assignment',
    route: '/safety-hub',
  },
  {
    id: 'violation',
    label: 'Violation Record',
    icon: FiAlertOctagon,
    color: 'red',
    desc: 'Save as a violation with category, fine, and corrective action',
    route: '/violations',
  },
];

const STEPS = ['Upload', 'Extracting', 'Review & Edit', 'Saved'];

/* ══════════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════════ */
function confidenceColor(c) {
  if (!c) return 'gray';
  if (c >= 0.8) return 'green';
  if (c >= 0.5) return 'yellow';
  return 'red';
}

function RiskLevelBadge({ level }) {
  if (!level) return null;
  const c = { LOW: 'green', MEDIUM: 'yellow', HIGH: 'yellow', CRITICAL: 'red',
               Low: 'green', Medium: 'yellow', High: 'yellow', Critical: 'red' };
  return <Badge color={c[level] || 'gray'}>{level}</Badge>;
}

function Field({ label, children, className = '' }) {
  if (!children && children !== 0) return null;
  return (
    <div className={clsx('space-y-1', className)}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
      <div className="text-sm font-medium text-[var(--text-primary)]">{children}</div>
    </div>
  );
}

function EditableField({ label, value, onChange, type = 'text', options = null }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
        {label}
      </label>
      {options ? (
        <select
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="select w-full text-sm"
        >
          <option value="">— Select —</option>
          {options.map(o => (
            <option key={o.value || o} value={o.value || o}>
              {o.label || o}
            </option>
          ))}
        </select>
      ) : type === 'textarea' ? (
        <textarea
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          rows={3}
          className="input w-full text-sm resize-none"
        />
      ) : (
        <input
          type={type}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="input w-full text-sm"
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   STEP INDICATOR
══════════════════════════════════════════════════════════════════════════ */
function StepBar({ step }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center flex-1 last:flex-none">
          <div className={clsx(
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0 transition-all',
            i < step  ? 'bg-green-500 border-green-500 text-white'
            : i === step ? 'bg-amber-500 border-amber-500 text-white shadow-lg'
            : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-muted)]'
          )}>
            {i < step ? <FiCheck size={12} /> : i + 1}
          </div>
          <p className={clsx(
            'ml-1.5 text-xs font-semibold hidden sm:block',
            i === step ? 'text-amber-500' : i < step ? 'text-green-500' : 'text-[var(--text-muted)]'
          )}>{s}</p>
          {i < STEPS.length - 1 && (
            <div className={clsx(
              'flex-1 h-0.5 mx-2',
              i < step ? 'bg-green-500' : 'bg-[var(--border)]'
            )} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   SECTION ACCORDION
══════════════════════════════════════════════════════════════════════════ */
function Section({ title, icon: Icon, defaultOpen = true, children, badge = null }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card p-0 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-[var(--bg-card-hover)] transition-colors"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon size={15} className="text-amber-500" />}
          <span className="font-semibold text-sm text-[var(--text-primary)]">{title}</span>
          {badge && <span className="ml-1">{badge}</span>}
        </div>
        {open ? <FiChevronDown size={14} className="text-[var(--text-muted)]" />
               : <FiChevronRight size={14} className="text-[var(--text-muted)]" />}
      </button>
      {open && <div className="px-4 pb-4 border-t border-[var(--border)]">{children}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   RAW TEXT PANEL
══════════════════════════════════════════════════════════════════════════ */
function RawTextPanel({ rawText }) {
  if (!rawText) return null;
  return (
    <Section title="OCR Extracted Text" icon={FiFileText} defaultOpen={false}>
      <pre className="mt-3 p-3 rounded-xl bg-[var(--bg-code)] border border-[var(--border)] text-xs text-[var(--text-secondary)] whitespace-pre-wrap font-mono leading-relaxed max-h-72 overflow-y-auto">
        {rawText || '(no raw text — image-based extraction)'}
      </pre>
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   EXTRACTED DOCUMENT INFO PANEL
══════════════════════════════════════════════════════════════════════════ */
function DocumentInfoPanel({ d }) {
  if (!d) return null;
  const isExpired = d.expiry_date && new Date(d.expiry_date) < new Date();
  const expiringSoon = d.expiry_date && !isExpired &&
    new Date(d.expiry_date) < new Date(Date.now() + 60 * 86400000);

  return (
    <Section title="Extracted Document Information" icon={FiInfo} defaultOpen>
      <div className="mt-3 space-y-4">
        {/* AI Summary */}
        {d.summary && (
          <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1.5">AI Summary</p>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{d.summary}</p>
          </div>
        )}

        {/* Key fields grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Field label="Document Type">{d.document_type}</Field>
          <Field label="Document Number">{d.document_number}</Field>
          <Field label="Title">{d.title}</Field>
          <Field label="Issuing Authority">{d.issuing_authority}</Field>
          <Field label="Holder / Company">{d.holder_name}</Field>
          <Field label="Mine Name">{d.mine_name}</Field>
          <Field label="Inspector / Officer">{d.inspector_name}{d.officer_designation ? ` (${d.officer_designation})` : ''}</Field>
          <Field label="Inspection Type">{d.inspection_type}</Field>
          <Field label="Issue Date">{formatDate(d.issue_date)}</Field>
          <Field label="Inspection Date">{formatDate(d.inspection_date)}</Field>
          <Field label="Expiry Date">
            {d.expiry_date ? (
              <span className={clsx(isExpired ? 'text-red-500 font-bold' : expiringSoon ? 'text-amber-500 font-bold' : '')}>
                {formatDate(d.expiry_date)} {isExpired ? '⚠ EXPIRED' : expiringSoon ? '⚠ Expiring soon' : ''}
              </span>
            ) : '—'}
          </Field>
          <Field label="Risk Level"><RiskLevelBadge level={d.risk_level} /></Field>
          <Field label="Overall Result">
            {d.overall_result && <Badge color={
              d.overall_result === 'Pass' || d.overall_result === 'Satisfactory' ? 'green'
              : d.overall_result === 'Fail' || d.overall_result === 'Unsatisfactory' ? 'red'
              : 'gray'
            }>{d.overall_result}</Badge>}
          </Field>
          <Field label="Compliance %">
            {d.compliance_percentage != null ? `${d.compliance_percentage}%` : null}
          </Field>
          <Field label="Checks">
            {d.total_checks != null
              ? `${d.passed_checks ?? '?'} passed / ${d.failed_checks ?? '?'} failed / ${d.total_checks} total`
              : null}
          </Field>
          <Field label="Section / Location">{[d.section, d.location_in_mine].filter(Boolean).join(' · ')}</Field>
        </div>

        {/* Findings / Recommendations */}
        {d.findings && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Findings</p>
            <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{d.findings}</p>
          </div>
        )}
        {d.recommendations && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Recommendations</p>
            <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{d.recommendations}</p>
          </div>
        )}

        {/* Checklist observations */}
        {d.observations?.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">
              Checklist / Observations ({d.observations.length})
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {d.observations.map((o, i) => (
                <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-[var(--bg-card-hover)]">
                  <Badge color={o.result === 'Pass' ? 'green' : o.result === 'Fail' ? 'red' : 'gray'} className="shrink-0 mt-0.5">
                    {o.result || 'N/A'}
                  </Badge>
                  <div>
                    <p className="text-xs font-medium text-[var(--text-primary)]">{o.item}</p>
                    {o.note && <p className="text-[11px] text-[var(--text-muted)]">{o.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Violations mentioned */}
        {d.violations?.length > 0 && (
          <div className="p-3 rounded-xl bg-red-500/8 border border-red-500/20">
            <p className="text-[10px] font-bold uppercase tracking-widest text-red-500 mb-2 flex items-center gap-1">
              <FiAlertTriangle size={11} /> Violations Mentioned ({d.violations.length})
            </p>
            {d.violations.map((v, i) => (
              <div key={i} className="text-xs text-red-400 flex items-start gap-2 mb-1.5">
                <span className="shrink-0 mt-0.5">•</span>
                <span>{v.description} {v.regulation ? `(${v.regulation})` : ''} {v.fine_amount ? `— ₹${v.fine_amount}` : ''}</span>
              </div>
            ))}
          </div>
        )}

        {/* Compliance items */}
        {d.compliance_items?.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">Compliance Items</p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {d.compliance_items.map((ci, i) => (
                <div key={i} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-[var(--bg-card-hover)]">
                  <span className="text-xs text-[var(--text-secondary)] flex-1">{ci.item}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {ci.deadline && <span className="text-[10px] text-[var(--text-muted)]">{formatDate(ci.deadline)}</span>}
                    <Badge color={ci.status === 'compliant' ? 'green' : ci.status === 'non_compliant' ? 'red' : 'gray'}>
                      {(ci.status || 'unknown').replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Corrective actions */}
        {d.corrective_actions?.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">Corrective Actions</p>
            {d.corrective_actions.map((ca, i) => (
              <div key={i} className="p-2 rounded-lg border border-[var(--border)] mb-2">
                <p className="text-xs font-medium text-[var(--text-primary)]">{ca.action}</p>
                <div className="flex gap-3 mt-1">
                  {ca.responsible && <span className="text-[11px] text-[var(--text-muted)]">👤 {ca.responsible}</span>}
                  {ca.deadline && <span className="text-[11px] text-[var(--text-muted)]">📅 {formatDate(ca.deadline)}</span>}
                  {ca.priority && <Badge color={getSeverityColor(ca.priority)}>{ca.priority}</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Regulatory references */}
        {d.regulatory_references?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {d.regulatory_references.map((r, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[var(--bg-card-hover)] text-[var(--text-muted)] border border-[var(--border)]">
                {r}
              </span>
            ))}
          </div>
        )}

        {/* Warnings */}
        {d.warnings?.length > 0 && (
          <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-1">Extraction Notes</p>
            {d.warnings.map((w, i) => <p key={i} className="text-xs text-amber-400">{w}</p>)}
          </div>
        )}
      </div>
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MODULE EDITOR PANELS
══════════════════════════════════════════════════════════════════════════ */
function InspectionEditor({ fields, onChange, mines }) {
  const f = fields;
  const set = (k, v) => onChange({ ...f, [k]: v });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
      <EditableField label="Mine *" value={f.mine_id} onChange={v => set('mine_id', v)}
        options={mines.map(m => ({ value: m.id, label: m.name }))} />
      <EditableField label="Inspection Type" value={f.type} onChange={v => set('type', v)}
        options={['Safety', 'Labour', 'Environment', 'Machinery', 'Compliance', 'General']} />
      <EditableField label="Scheduled / Inspection Date" value={f.scheduled_date} onChange={v => set('scheduled_date', v)} type="date" />
      <EditableField label="Completed Date" value={f.completed_date} onChange={v => set('completed_date', v)} type="date" />
      <EditableField label="Overall Score (0–100)" value={f.overall_score} onChange={v => set('overall_score', v)} type="number" />
      <EditableField label="Risk Level" value={f.risk_level} onChange={v => set('risk_level', v)}
        options={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']} />
      <EditableField label="Location in Mine" value={f.location_in_mine} onChange={v => set('location_in_mine', v)} />
      <EditableField label="Section" value={f.section} onChange={v => set('section', v)} />
      <EditableField label="Findings" value={f.findings} onChange={v => set('findings', v)} type="textarea" className="sm:col-span-2" />
      <EditableField label="Recommendations" value={f.recommendations} onChange={v => set('recommendations', v)} type="textarea" className="sm:col-span-2" />
      <EditableField label="Inspector Notes" value={f.inspector_notes} onChange={v => set('inspector_notes', v)} type="textarea" className="sm:col-span-2" />
    </div>
  );
}

function ComplianceEditor({ fields, onChange, mines }) {
  const f = fields;
  const set = (k, v) => onChange({ ...f, [k]: v });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
      <EditableField label="Mine *" value={f.mine_id} onChange={v => set('mine_id', v)}
        options={mines.map(m => ({ value: m.id, label: m.name }))} />
      <EditableField label="Category" value={f.category} onChange={v => set('category', v)}
        options={['Safety', 'Labour', 'Environment', 'Production']} />
      <EditableField label="Parameter / Record Name" value={f.parameter_name} onChange={v => set('parameter_name', v)} className="sm:col-span-2" />
      <EditableField label="Status" value={f.status} onChange={v => set('status', v)}
        options={['compliant', 'non_compliant', 'pending']} />
      <EditableField label="Workflow Status" value={f.workflow_status} onChange={v => set('workflow_status', v)}
        options={['Pending', 'Under Verification', 'Approved', 'Rejected']} />
      <EditableField label="Compliance Score (0–100)" value={f.score} onChange={v => set('score', v)} type="number" />
      <EditableField label="Due Date" value={f.due_date} onChange={v => set('due_date', v)} type="date" />
      <EditableField label="Responsible Officer" value={f.responsible_officer} onChange={v => set('responsible_officer', v)} />
      <EditableField label="Verified By" value={f.verified_by} onChange={v => set('verified_by', v)} />
      <EditableField label="Notes" value={f.notes} onChange={v => set('notes', v)} type="textarea" className="sm:col-span-2" />
    </div>
  );
}

function SafetyObsEditor({ fields, onChange, mines }) {
  const f = fields;
  const set = (k, v) => onChange({ ...f, [k]: v });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
      <EditableField label="Mine *" value={f.mine_id} onChange={v => set('mine_id', v)}
        options={mines.map(m => ({ value: m.id, label: m.name }))} />
      <EditableField label="Severity" value={f.severity} onChange={v => set('severity', v)}
        options={['low', 'medium', 'high', 'critical']} />
      <EditableField label="Title" value={f.title} onChange={v => set('title', v)} className="sm:col-span-2" />
      <EditableField label="Observation Type" value={f.type} onChange={v => set('type', v)}
        options={['safety', 'environment', 'labour', 'machinery', 'fire', 'electrical', 'general']} />
      <EditableField label="Status" value={f.status} onChange={v => set('status', v)}
        options={['open', 'in_progress', 'resolved']} />
      <EditableField label="Location" value={f.location} onChange={v => set('location', v)} />
      <EditableField label="Section" value={f.section} onChange={v => set('section', v)} />
      <EditableField label="Observed At" value={f.observed_at?.slice(0, 16)} onChange={v => set('observed_at', v)} type="datetime-local" />
      <EditableField label="Description" value={f.description} onChange={v => set('description', v)} type="textarea" className="sm:col-span-2" />
    </div>
  );
}

function ViolationEditor({ fields, onChange, mines }) {
  const f = fields;
  const set = (k, v) => onChange({ ...f, [k]: v });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
      <EditableField label="Mine *" value={f.mine_id} onChange={v => set('mine_id', v)}
        options={mines.map(m => ({ value: m.id, label: m.name }))} />
      <EditableField label="Severity" value={f.severity} onChange={v => set('severity', v)}
        options={['low', 'medium', 'high', 'critical']} />
      <EditableField label="Type" value={f.type} onChange={v => set('type', v)}
        options={['Safety', 'Labour', 'Environment', 'Machinery', 'Compliance']} />
      <EditableField label="Category" value={f.category} onChange={v => set('category', v)}
        options={['Safety', 'Labour', 'Environment', 'Machinery', 'Compliance', 'Production']} />
      <EditableField label="Detected Date" value={f.detected_date} onChange={v => set('detected_date', v)} type="date" />
      <EditableField label="Fine Amount (₹)" value={f.fine_amount} onChange={v => set('fine_amount', v)} type="number" />
      <EditableField label="Regulation Reference" value={f.regulation_reference} onChange={v => set('regulation_reference', v)} />
      <EditableField label="Corrective Deadline" value={f.corrective_deadline} onChange={v => set('corrective_deadline', v)} type="date" />
      <EditableField label="Description" value={f.description} onChange={v => set('description', v)} type="textarea" className="sm:col-span-2" />
      <EditableField label="Corrective Action" value={f.corrective_action} onChange={v => set('corrective_action', v)} type="textarea" className="sm:col-span-2" />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   HISTORY PANEL
══════════════════════════════════════════════════════════════════════════ */
function HistoryPanel({ navigate }) {
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage]     = useState(1);
  const [meta, setMeta]     = useState({});

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const r = await ocrApi.getHistory({ page: p, limit: 15 });
      setItems(r.data || []);
      setMeta(r.meta || {});
      setPage(p);
    } catch { toast.error('Failed to load history'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(1); }, []);

  const discard = async (id, e) => {
    e.stopPropagation();
    try {
      await ocrApi.deleteHistory(id);
      toast.success('Discarded');
      load(page);
    } catch { toast.error('Failed to discard'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <LoadingSpinner size="lg" />
    </div>
  );

  if (!items.length) return (
    <div className="text-center py-16 text-[var(--text-muted)]">
      <FiClock size={32} className="mx-auto mb-3 opacity-40" />
      <p className="font-semibold">No extraction history yet</p>
      <p className="text-sm mt-1">Upload a document on the Extract tab to get started.</p>
    </div>
  );

  const statusColor = { extracted: 'yellow', saved: 'green', discarded: 'gray' };
  const moduleIcon  = {
    inspection: FiClipboard, compliance: FiCheckCircle,
    safety_observation: FiShield, violation: FiAlertOctagon, none: FiFileText,
  };

  return (
    <div className="space-y-3">
      {items.map(item => {
        const Icon = moduleIcon[item.target_module] || FiFileText;
        return (
          <div key={item.id}
            className="card flex items-start gap-4 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => navigate(`/ocr?view=${item.id}`)}
          >
            <div className="p-2 rounded-xl bg-[var(--bg-card-hover)] border border-[var(--border)] shrink-0">
              <Icon size={18} className="text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold text-sm text-[var(--text-primary)] truncate">
                    {item.doc_title || item.original_filename || 'Untitled'}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {item.doc_type} · {item.file_type?.toUpperCase()} · {timeAgo(item.created_at)}
                  </p>
                  {item.mine_name && (
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">⛏ {item.mine_name}</p>
                  )}
                  {item.summary && (
                    <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">{item.summary}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge color={statusColor[item.status] || 'gray'}>{item.status}</Badge>
                  {item.confidence != null && (
                    <Badge color={confidenceColor(item.confidence)}>
                      {Math.round(item.confidence * 100)}%
                    </Badge>
                  )}
                  {item.status !== 'saved' && (
                    <button
                      onClick={e => discard(item.id, e)}
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      title="Discard"
                    >
                      <FiTrash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
              {item.saved_record_id && (
                <p className="text-[10px] font-mono text-green-500 mt-1">
                  ✓ Saved as {item.target_module?.replace('_', ' ')} · ID: {item.saved_record_id?.slice(0, 8)}
                </p>
              )}
            </div>
          </div>
        );
      })}

      {/* Pagination */}
      {meta.pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button disabled={page === 1} onClick={() => load(page - 1)} className="btn-outline btn-sm">← Prev</button>
          <span className="text-xs text-[var(--text-muted)]">Page {page} / {meta.pages}</span>
          <button disabled={page >= meta.pages} onClick={() => load(page + 1)} className="btn-outline btn-sm">Next →</button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════ */
export default function OCRExtract() {
  const navigate = useNavigate();

  /* ── Tab ────────────────────────────────────────────────── */
  const [activeTab, setActiveTab] = useState('extract'); // 'extract' | 'history'

  /* ── Step ───────────────────────────────────────────────── */
  const [step,        setStep]       = useState(0);  // 0=upload 1=extracting 2=review 3=saved
  const [extractError,setExtractError] = useState(null); // persistent error message with retry

  /* ── Upload state ───────────────────────────────────────── */
  const [file,         setFile]        = useState(null);
  const [previewUrl,   setPreviewUrl]  = useState(null);
  const [docType,      setDocType]     = useState('Inspection Report');
  const [mineId,       setMineId]      = useState('');
  const [mines,        setMines]       = useState([]);
  const [dragging,     setDragging]    = useState(false);
  const inputRef = useRef();

  /* ── Extraction result ──────────────────────────────────── */
  const [extractionId,    setExtractionId]    = useState(null);
  const [extractedData,   setExtractedData]   = useState(null); // raw structured from Gemini
  const [rawText,         setRawText]         = useState('');
  const [modelUsed,       setModelUsed]       = useState('');
  const [suggestedModule, setSuggestedModule] = useState('inspection');
  const [previews,        setPreviews]        = useState({});   // server-mapped fields per module

  /* ── Review/Edit state ──────────────────────────────────── */
  const [targetModule, setTargetModule] = useState('inspection');
  const [editedFields, setEditedFields] = useState({});

  /* ── Saving ─────────────────────────────────────────────── */
  const [saving,    setSaving]   = useState(false);
  const [saveResult,setSaveResult] = useState(null);

  /* ── Mines (lazy) ───────────────────────────────────────── */
  const ensureMines = useCallback(async () => {
    if (mines.length) return;
    try {
      const r = await minesApi.getAll({ limit: 100 });
      setMines(r.data || []);
    } catch {}
  }, [mines.length]);

  /* ── File pick ──────────────────────────────────────────── */
  const handleFile = useCallback((f) => {
    if (!f) return;
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(f.type)) {
      toast.error('Unsupported file. Use JPEG, PNG, WebP, or PDF.');
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      toast.error('File must be under 15 MB.');
      return;
    }
    setFile(f);
    setExtractedData(null);
    setRawText('');
    setSaveResult(null);
    setStep(0);
    setExtractError(null);

    // Build preview URL
    if (f.type !== 'application/pdf') {
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
    ensureMines();
  }, [ensureMines]);

  const onDrop = useCallback(e => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const reset = () => {
    setFile(null);
    setPreviewUrl(null);
    setExtractedData(null);
    setRawText('');
    setExtractionId(null);
    setSaveResult(null);
    setStep(0);
    setExtractError(null);
    setEditedFields({});
  };

  /* ── EXTRACT ────────────────────────────────────────────── */
  const doExtract = async () => {
    if (!file) { toast.error('Please select a file first.'); return; }
    setStep(1);
    setExtractedData(null);
    setExtractError(null);

    try {
      const fd = new FormData();
      fd.append('document', file);
      fd.append('doc_type', docType);
      if (mineId) fd.append('mine_id', mineId);

      const res = await ocrApi.extract(fd);

      // res is the parsed response body from axios interceptor (res.data)
      const d          = res.data  || {};
      const confidence = typeof d.confidence === 'number' ? d.confidence : 0;

      setExtractionId(res.extraction_id);
      setExtractedData(d);
      setRawText(res.raw_text || '');
      setModelUsed(res.model_used || 'gemini');
      setPreviews(res.previews || {});

      const mod = res.suggested_module || 'inspection';
      setSuggestedModule(mod);
      setTargetModule(mod);

      const preview = (res.previews || {})[mod] || {};
      setEditedFields({ ...preview, mine_id: mineId || preview.mine_id || '' });

      setStep(2);
      const confPct = Math.round(confidence * 100);
      toast.success(
        confPct >= 60
          ? `Extracted! ${confPct}% confidence · ${res.model_used || 'gemini'}`
          : `Extracted (low confidence: ${confPct}%) — review fields carefully`
      );
    } catch (err) {
      setStep(0);
      // Build a helpful, actionable error message
      const serverMsg  = err.response?.data?.message || '';
      const serverHint = err.response?.data?.hint    || '';
      const netMsg     = err.message || '';
      const isHighDemand = /high demand|503|temporarily/i.test(serverMsg + netMsg);
      const isTimeout    = /timeout|timed out/i.test(serverMsg + netMsg);
      const isQuota      = /quota|429|rate limit/i.test(serverMsg + netMsg);
      const isBadKey     = /api.key|GEMINI_API_KEY/i.test(serverMsg + netMsg);

      let userMsg = serverMsg || netMsg || 'Extraction failed — please try again.';
      if (isHighDemand) userMsg = 'Gemini AI is under high demand right now. Wait 30 seconds and click Retry.';
      if (isTimeout)    userMsg = 'Request timed out. The AI server was slow — click Retry.';
      if (isQuota)      userMsg = 'Gemini API quota exceeded. Wait a few minutes, then retry.';
      if (isBadKey)     userMsg = 'Gemini API key is not configured. Check server/.env.';

      setExtractError({
        message: userMsg,
        hint:    serverHint || (isHighDemand ? 'This is temporary — Gemini will recover shortly.' : ''),
        canRetry: isHighDemand || isTimeout || isQuota,
      });
      toast.error(userMsg.substring(0, 80));
    }
  };

  /* ── When user switches target module ───────────────────── */
  const switchModule = (mod) => {
    setTargetModule(mod);
    const preview = (previews || {})[mod] || {};
    setEditedFields(prev => ({
      ...preview,
      mine_id: prev.mine_id || mineId || preview.mine_id || '',
    }));
  };

  /* ── SAVE ───────────────────────────────────────────────── */
  const doSave = async () => {
    if (!editedFields.mine_id) {
      toast.error('Please select a mine before saving.');
      return;
    }
    setSaving(true);
    try {
      const res = await ocrApi.save({
        extraction_id: extractionId,
        target_module: targetModule,
        fields:        editedFields,
        mine_id:       editedFields.mine_id,
      });
      setSaveResult(res);
      setStep(3);
      toast.success(`Saved as ${targetModule.replace('_', ' ')}!`);
    } catch (err) {
      const msg = err.response?.data?.message || 'Save failed';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  /* ────────────────────────────────────────────────────────── */
  const moduleInfo = TARGET_MODULES.find(m => m.id === targetModule);

  return (
    <div className="space-y-5 pb-10">
      <BackButton className="mb-1" />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FiCpu className="text-amber-500" /> OCR Document Digitization
          </h1>
          <p className="page-subtitle">
            Upload inspection reports, compliance certificates or safety documents — AI extracts
            structured data and saves it into the correct module.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('extract')}
            className={clsx('btn-sm px-4', activeTab === 'extract' ? 'btn-primary' : 'btn-outline')}
          >
            <FiUpload size={13} /> Extract
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={clsx('btn-sm px-4', activeTab === 'history' ? 'btn-primary' : 'btn-outline')}
          >
            <FiClock size={13} /> History
          </button>
        </div>
      </div>

      {/* ── HISTORY TAB ────────────────────────────────────── */}
      {activeTab === 'history' && <HistoryPanel navigate={navigate} />}

      {/* ── EXTRACT TAB ────────────────────────────────────── */}
      {activeTab === 'extract' && (
        <>
          <StepBar step={step} />

          {/* ── STEP 3: SAVED ──────────────────────────────── */}
          {step === 3 && saveResult && (
            <div className="card text-center py-12 space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-500/15 border-2 border-green-500 flex items-center justify-center mx-auto">
                <FiCheckCircle size={32} className="text-green-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[var(--text-primary)]">Saved Successfully!</h2>
                <p className="text-sm text-[var(--text-muted)] mt-1">{saveResult.message}</p>
                <p className="text-xs font-mono text-green-500 mt-2">
                  Record ID: {saveResult.saved_record_id}
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <button
                  onClick={() => navigate(saveResult.navigate_to || '/dashboard')}
                  className="btn-primary"
                >
                  <FiEye size={14} /> View {targetModule.replace('_', ' ')}
                </button>
                <button onClick={reset} className="btn-outline">
                  <FiRefreshCw size={14} /> Extract Another
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 0–2 ────────────────────────────────────── */}
          {step < 3 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

              {/* ════ LEFT COLUMN: Upload + Config ════ */}
              <div className="space-y-4">

                {/* Drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => !file && inputRef.current?.click()}
                  className={clsx(
                    'rounded-2xl border-2 border-dashed transition-all duration-200 relative',
                    'min-h-[240px] flex items-center justify-center',
                    dragging
                      ? 'border-amber-500 bg-amber-500/5 cursor-copy'
                      : file
                        ? 'border-[var(--border)] cursor-default'
                        : 'border-[var(--border)] hover:border-amber-500/50 cursor-pointer',
                  )}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    className="hidden"
                    onChange={e => handleFile(e.target.files[0])}
                  />

                  {!file && (
                    <div className="text-center p-8">
                      <div className="w-14 h-14 rounded-2xl bg-[var(--bg-card-hover)] border border-[var(--border)] flex items-center justify-center mx-auto mb-4">
                        <FiUpload size={26} className="text-[var(--text-muted)]" />
                      </div>
                      <p className="font-bold text-[var(--text-primary)] mb-1">
                        Drop document here or click to browse
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        JPEG · PNG · WebP · PDF &nbsp;·&nbsp; Max 15 MB
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1.5">
                        Supports: Inspection Reports, Compliance Certificates, Safety Docs, Violation Notices
                      </p>
                    </div>
                  )}

                  {file && (
                    <div className="w-full">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt="Preview"
                          className="w-full max-h-[360px] object-contain rounded-2xl"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center p-10">
                          <FiFileText size={42} className="text-red-400 mb-3" />
                          <p className="font-semibold text-[var(--text-primary)]">{file.name}</p>
                          <p className="text-xs text-[var(--text-muted)] mt-1">PDF · {(file.size / 1024).toFixed(0)} KB</p>
                        </div>
                      )}
                      {/* File info overlay */}
                      <div className="absolute bottom-3 left-3 flex items-center gap-2">
                        <div className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)]/90 border border-[var(--border)] backdrop-blur-sm">
                          <p className="text-xs font-medium text-[var(--text-primary)]">{file.name}</p>
                          <p className="text-[10px] text-[var(--text-muted)]">{(file.size / 1024).toFixed(0)} KB</p>
                        </div>
                      </div>
                      {/* Remove button */}
                      <button
                        onClick={e => { e.stopPropagation(); reset(); }}
                        className="absolute top-3 right-3 p-1.5 rounded-lg bg-[var(--bg-card)]/90 border border-[var(--border)] text-[var(--text-muted)] hover:text-red-500 transition-colors"
                      >
                        <FiX size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Config */}
                <div className="card grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="label">Document Type</label>
                    <select
                      value={docType}
                      onChange={e => setDocType(e.target.value)}
                      className="select"
                    >
                      {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Mine (optional)</label>
                    <select
                      value={mineId}
                      onChange={e => setMineId(e.target.value)}
                      onFocus={ensureMines}
                      className="select"
                    >
                      <option value="">— Select mine —</option>
                      {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                </div>

                {/* Extract button */}
                <button
                  onClick={doExtract}
                  disabled={!file || step === 1}
                  className="btn-primary w-full justify-center py-3 text-base font-bold"
                >
                  {step === 1 ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      Gemini Vision extracting…
                    </>
                  ) : (
                    <><FiCpu size={18} /> Extract &amp; Analyse Document</>
                  )}
                </button>

                {step === 1 && (
                  <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20 flex items-center gap-3">
                    <LoadingSpinner size="sm" />
                    <div>
                      <p className="text-xs font-semibold text-amber-400">
                        Analysing with Gemini Vision…
                      </p>
                      <p className="text-[11px] text-amber-400/70 mt-0.5">
                        Extracting text, identifying fields, structuring data — 15–30 seconds
                      </p>
                    </div>
                  </div>
                )}

                {/* Persistent extraction error with retry */}
                {extractError && step === 0 && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 space-y-2">
                    <div className="flex items-start gap-2">
                      <FiAlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-red-400">Extraction Failed</p>
                        <p className="text-xs text-red-300 mt-0.5">{extractError.message}</p>
                        {extractError.hint && (
                          <p className="text-[11px] text-red-400/70 mt-1">{extractError.hint}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={doExtract}
                        disabled={!file}
                        className="btn-primary btn-sm flex items-center gap-1.5"
                      >
                        <FiRefreshCw size={12} /> Retry Extraction
                      </button>
                      <button
                        onClick={() => setExtractError(null)}
                        className="btn-outline btn-sm"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ════ RIGHT COLUMN: Results ════ */}
              <div className="space-y-4">
                {step < 2 && (
                  <div className="flex flex-col items-center justify-center min-h-[300px] rounded-2xl border-2 border-dashed border-[var(--border)] text-center p-8">
                    <FiFileText size={36} className="text-[var(--text-muted)] opacity-40 mb-3" />
                    <p className="font-semibold text-[var(--text-muted)]">Results will appear here</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1 max-w-xs">
                      Upload a document and click Extract. AI will read the document and fill in all structured fields automatically.
                    </p>
                  </div>
                )}

                {step === 2 && extractedData && (
                  <>
                    {/* Confidence + model */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Badge color={confidenceColor(extractedData.confidence)}>
                          {Math.round((extractedData.confidence ?? 0) * 100)}% confidence
                        </Badge>
                        <span className="text-[11px] text-[var(--text-muted)]">via {modelUsed}</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={reset} className="btn-outline btn-sm">
                          <FiRefreshCw size={12} /> New Upload
                        </button>
                        <button onClick={doExtract} className="btn-outline btn-sm">
                          <FiRefreshCw size={12} /> Re-extract
                        </button>
                      </div>
                    </div>

                    {/* Document info */}
                    <DocumentInfoPanel d={extractedData} />

                    {/* Raw text */}
                    <RawTextPanel rawText={rawText} />

                    {/* ─── Save to Module ─── */}
                    <Section title="Save to KhanNetra Module" icon={FiSave} defaultOpen>
                      <div className="mt-3 space-y-4">

                        {/* Module selector */}
                        <div>
                          <p className="text-xs text-[var(--text-muted)] mb-2">
                            AI suggests: <strong className="text-amber-500 capitalize">
                              {suggestedModule.replace('_', ' ')}
                            </strong>. Select where to save this data:
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {TARGET_MODULES.map(m => {
                              const Icon = m.icon;
                              return (
                                <button
                                  key={m.id}
                                  onClick={() => switchModule(m.id)}
                                  className={clsx(
                                    'flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all',
                                    targetModule === m.id
                                      ? 'border-amber-500 bg-amber-500/8'
                                      : 'border-[var(--border)] hover:border-amber-500/40'
                                  )}
                                >
                                  <Icon size={16} className={clsx(
                                    'shrink-0 mt-0.5',
                                    targetModule === m.id ? 'text-amber-500' : 'text-[var(--text-muted)]'
                                  )} />
                                  <div>
                                    <p className={clsx(
                                      'text-xs font-semibold',
                                      targetModule === m.id ? 'text-amber-500' : 'text-[var(--text-primary)]'
                                    )}>{m.label}</p>
                                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-tight">{m.desc}</p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Editable fields for selected module */}
                        <div className="border border-[var(--border)] rounded-xl p-4 bg-[var(--bg-card-hover)]">
                          <div className="flex items-center gap-2 mb-3">
                            <FiEdit2 size={13} className="text-amber-500" />
                            <p className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wide">
                              Review &amp; Edit Fields — {moduleInfo?.label}
                            </p>
                          </div>

                          {targetModule === 'inspection' && (
                            <InspectionEditor
                              fields={editedFields}
                              onChange={setEditedFields}
                              mines={mines}
                            />
                          )}
                          {targetModule === 'compliance' && (
                            <ComplianceEditor
                              fields={editedFields}
                              onChange={setEditedFields}
                              mines={mines}
                            />
                          )}
                          {targetModule === 'safety_observation' && (
                            <SafetyObsEditor
                              fields={editedFields}
                              onChange={setEditedFields}
                              mines={mines}
                            />
                          )}
                          {targetModule === 'violation' && (
                            <ViolationEditor
                              fields={editedFields}
                              onChange={setEditedFields}
                              mines={mines}
                            />
                          )}
                        </div>

                        {/* Confirm & Save */}
                        <button
                          onClick={doSave}
                          disabled={saving || !editedFields.mine_id}
                          className="btn-primary w-full justify-center py-3 text-base font-bold"
                        >
                          {saving ? (
                            <><LoadingSpinner size="sm" className="mr-2" /> Saving…</>
                          ) : (
                            <><FiSave size={16} /> Confirm &amp; Save as {moduleInfo?.label}</>
                          )}
                        </button>

                        {!editedFields.mine_id && (
                          <p className="text-xs text-amber-500 text-center">
                            ⚠ Select a mine above before saving.
                          </p>
                        )}
                      </div>
                    </Section>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
