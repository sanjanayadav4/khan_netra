import { format, formatDistanceToNow, parseISO } from 'date-fns';

export const formatDate = (date, fmt = 'dd MMM yyyy') => {
  if (!date) return '—';
  try { return format(typeof date === 'string' ? parseISO(date) : date, fmt); }
  catch { return date; }
};

export const formatDateTime = (date) => formatDate(date, 'dd MMM yyyy, HH:mm');

export const timeAgo = (date) => {
  if (!date) return '—';
  try { return formatDistanceToNow(typeof date === 'string' ? parseISO(date) : date, { addSuffix: true }); }
  catch { return date; }
};

export const formatCurrency = (amount) => {
  if (!amount && amount !== 0) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
};

export const formatNumber = (n) => {
  if (!n && n !== 0) return '—';
  return new Intl.NumberFormat('en-IN').format(n);
};

export const formatMT = (mt) => {
  if (!mt && mt !== 0) return '—';
  if (mt >= 1000000) return `${(mt / 1000000).toFixed(2)} MT`;
  if (mt >= 1000)    return `${(mt / 1000).toFixed(1)} KT`;
  return `${mt} T`;
};

export const truncate = (str, n = 60) => str?.length > n ? str.substring(0, n) + '…' : str;

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
};

/* ── Color helpers ────────────────────────────────────────────────────── */
export const scoreToColor = (score) => {
  const s = parseFloat(score) || 0;
  if (s >= 80) return 'text-green-600';
  if (s >= 60) return 'text-amber-600';
  return 'text-red-600';
};

export const scoreToBg = (score) => {
  const s = parseFloat(score) || 0;
  if (s >= 80) return 'bg-green-500';
  if (s >= 60) return 'bg-amber-500';
  return 'bg-red-500';
};

export const getSeverityColor = (severity) => {
  const m = {
    critical: 'red', fatal: 'red',
    high: 'yellow', serious: 'yellow',
    medium: 'blue', minor: 'blue',
    low: 'green', near_miss: 'gray',
  };
  return m[severity?.toLowerCase()] || 'gray';
};

export const getStatusColor = (status) => {
  const m = {
    active: 'green', compliant: 'green', completed: 'green', closed: 'green',
    warning: 'yellow', action_taken: 'yellow', in_progress: 'yellow',
    expiring_soon: 'yellow', under_inspection: 'yellow', under_review: 'yellow',
    under_investigation: 'yellow', scheduled: 'blue',
    open: 'red', non_compliant: 'red', expired: 'red', suspended: 'red',
    inactive: 'gray', pending: 'gray', cancelled: 'gray',
  };
  return m[status?.toLowerCase()] || 'gray';
};

export const ROLES = {
  admin:                { label: 'System Admin',          color: 'red'    },
  government_officer:   { label: 'DGMS / Govt. Officer',  color: 'blue'   },
  mine_manager:         { label: 'Mine Manager',          color: 'yellow' },
  inspector:            { label: 'Field Inspector',       color: 'green'  },
  safety_officer:       { label: 'Safety Officer',        color: 'orange' },
  environment_officer:  { label: 'Environmental Officer', color: 'teal'   },
  contractor:           { label: 'Contractor',            color: 'purple' },
  prototype_tester:     { label: 'Prototype Tester',      color: 'gray'   },
  mining_engineer:      { label: 'Mining Engineer',       color: 'blue'   },
  corporate_management: { label: 'Corporate Management',  color: 'red'    },
};

export const MINE_STATES = [
  'Jharkhand','Chhattisgarh','Odisha','West Bengal','Madhya Pradesh',
  'Telangana','Maharashtra','Bihar','Assam','Meghalaya',
];
