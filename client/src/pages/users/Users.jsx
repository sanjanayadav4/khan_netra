/**
 * KhanNetra DGMS — User Management
 * 4 tabs: Pending Approval | Approved | Rejected | Suspended
 * Admin actions: Approve, Reject, Suspend, Change Role, Change Mine
 */
import { useState, useEffect, useCallback } from 'react';
import {
  FiUsers, FiEdit2, FiSearch, FiCheck, FiX, FiPause,
  FiRefreshCw, FiChevronDown, FiMapPin, FiClock,
  FiBriefcase, FiTag, FiAlertCircle, FiCheckCircle,
  FiShield, FiUserCheck,
} from 'react-icons/fi';
import { authApi, minesApi, aiApi } from '../../services/api';
import { formatDateTime, timeAgo, ROLES } from '../../utils/helpers';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import clsx from 'clsx';

/* ── Role options (for role-change dropdown) ─────────────────────── */
const ROLE_OPTIONS = Object.entries(ROLES).map(([v, r]) => ({ value: v, label: r.label }));

/* ── Status configuration ──────────────────────────────────────────── */
const STATUS_CFG = {
  PENDING:   { badge:'yellow', label:'Pending',   icon:FiClock,       desc:'Awaiting admin approval' },
  APPROVED:  { badge:'green',  label:'Approved',  icon:FiCheckCircle, desc:'Active, can log in'      },
  REJECTED:  { badge:'red',    label:'Rejected',  icon:FiX,           desc:'Registration denied'     },
  SUSPENDED: { badge:'orange', label:'Suspended', icon:FiPause,       desc:'Temporarily disabled'    },
};

const TABS = [
  { id:'PENDING',   label:'Pending Approval', icon:FiClock,       color:'text-amber-500'  },
  { id:'APPROVED',  label:'Approved Users',   icon:FiCheckCircle, color:'text-green-500'  },
  { id:'REJECTED',  label:'Rejected',         icon:FiX,           color:'text-red-500'    },
  { id:'SUSPENDED', label:'Suspended',        icon:FiPause,       color:'text-orange-500' },
];

/* ════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════════════════════ */
export default function Users() {
  const { user: me } = useAuthStore();
  const [activeTab, setActiveTab]   = useState('PENDING');
  const [users,     setUsers]       = useState([]);
  const [counts,    setCounts]      = useState({});
  const [mines,     setMines]       = useState([]);
  const [loading,   setLoading]     = useState(true);
  const [search,    setSearch]      = useState('');
  const [editUser,  setEditUser]    = useState(null);
  const [rejectDlg, setRejectDlg]   = useState(null);  // user to reject
  const [suspendDlg,setSuspendDlg]  = useState(null);  // user to suspend
  const [actionLoading, setActionLoading] = useState({});

  const isAdmin = me?.role === 'admin';

  /* Load users for current tab */
  const load = useCallback(async (tab) => {
    setLoading(true);
    try {
      const r = await authApi.getPendingUsers({ status: tab || activeTab });
      setUsers(r.data || []);
    } catch (e) {
      toast.error('Failed to load users');
    } finally { setLoading(false); }
  }, [activeTab]);

  /* Load counts for all tabs */
  const loadCounts = useCallback(async () => {
    try {
      const results = await Promise.allSettled(
        ['PENDING','APPROVED','REJECTED','SUSPENDED'].map(s =>
          authApi.getPendingUsers({ status: s })
        )
      );
      const newCounts = {};
      ['PENDING','APPROVED','REJECTED','SUSPENDED'].forEach((s, i) => {
        if (results[i].status === 'fulfilled')
          newCounts[s] = results[i].value.data?.length || 0;
        else newCounts[s] = 0;
      });
      setCounts(newCounts);
    } catch {}
  }, []);

  /* Load mines for assignment dropdown */
  const loadMines = useCallback(async () => {
    try { const r = await minesApi.getAll({ limit: 100 }); setMines(r.data || []); }
    catch {}
  }, []);

  useEffect(() => {
    loadMines();
    loadCounts();
  }, []);

  useEffect(() => { load(activeTab); }, [activeTab]);

  const refresh = () => { load(activeTab); loadCounts(); };

  /* ── Approve ─────────────────────────────────────────────────────── */
  const handleApprove = async (user, overrides = {}) => {
    setActionLoading(s => ({ ...s, [user.id]: 'approving' }));
    try {
      await authApi.approveUser(user.id, overrides);
      toast.success(`✅ ${user.full_name} approved — account activated.`);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Approval failed');
    } finally { setActionLoading(s => { const n={...s}; delete n[user.id]; return n; }); }
  };

  /* ── Reject ──────────────────────────────────────────────────────── */
  const handleReject = async (user, reason) => {
    setActionLoading(s => ({ ...s, [user.id]: 'rejecting' }));
    try {
      await authApi.rejectUser(user.id, { reason });
      toast.success(`${user.full_name} registration rejected.`);
      setRejectDlg(null);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Rejection failed');
    } finally { setActionLoading(s => { const n={...s}; delete n[user.id]; return n; }); }
  };

  /* ── Suspend ─────────────────────────────────────────────────────── */
  const handleSuspend = async (user, reason) => {
    setActionLoading(s => ({ ...s, [user.id]: 'suspending' }));
    try {
      await authApi.suspendUser(user.id, { reason });
      toast.success(`${user.full_name} account suspended.`);
      setSuspendDlg(null);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Suspension failed');
    } finally { setActionLoading(s => { const n={...s}; delete n[user.id]; return n; }); }
  };

  /* ── Filtered list ───────────────────────────────────────────────── */
  const filtered = users.filter(u => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q) ||
      u.organization?.toLowerCase().includes(q) ||
      u.mine_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FiUsers style={{ color:'var(--accent)' }}/> User Management
          </h1>
          <p className="page-subtitle">
            Manage registrations, approve accounts, assign roles and mine access
          </p>
        </div>
        <button onClick={refresh} className="btn-outline btn-sm">
          <FiRefreshCw size={13}/> Refresh
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const count = counts[tab.id] ?? '…';
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={clsx('flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all', isActive ? 'shadow-sm' : 'opacity-70 hover:opacity-100')}
              style={{
                backgroundColor: isActive ? 'var(--bg-card)' : 'var(--bg-card-hover)',
                border: `1px solid ${isActive ? 'var(--hover-accent-border)' : 'var(--border)'}`,
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              }}>
              <Icon size={14} className={isActive ? tab.color : ''}/>
              {tab.label}
              <span style={{
                padding:'1px 7px', borderRadius:999, fontSize:11, fontWeight:800,
                background: tab.id === 'PENDING' && count > 0 ? 'rgba(245,158,11,.2)' : 'var(--bg-card-hover)',
                color: tab.id === 'PENDING' && count > 0 ? 'var(--accent)' : 'var(--text-muted)',
                border:'1px solid var(--border)',
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative" style={{ maxWidth:480 }}>
        <FiSearch size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }}/>
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="input" style={{ paddingLeft:32 }}
          placeholder={`Search ${activeTab.toLowerCase()} users…`}/>
      </div>

      {/* Pending info banner */}
      {activeTab === 'PENDING' && filtered.length > 0 && (
        <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background:'rgba(245,158,11,.07)', border:'1px solid rgba(245,158,11,.25)' }}>
          <FiAlertCircle size={14} style={{ color:'var(--accent)', flexShrink:0, marginTop:2 }}/>
          <p className="text-xs" style={{ color:'var(--text-secondary)' }}>
            <strong style={{ color:'var(--accent)' }}>{filtered.length} user{filtered.length!==1?'s':''}</strong> waiting for approval.
            Review registration details carefully before approving.
            Approved users receive full access based on their assigned role.
          </p>
        </div>
      )}

      {/* User list */}
      {loading ? <PageLoader message="Loading users…"/> : filtered.length === 0 ? (
        <div className="card text-center py-14">
          <FiUsers size={32} style={{ color:'var(--text-muted)', margin:'0 auto 12px' }}/>
          <p className="font-semibold" style={{ color:'var(--text-primary)' }}>
            {search ? 'No users match your search' : `No ${activeTab.toLowerCase()} users`}
          </p>
          <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
            {activeTab === 'PENDING' ? 'All pending registrations have been processed.' : 'Nothing to show here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(u => (
            <UserCard key={u.id} user={u} me={me} isAdmin={isAdmin}
              actionLoading={actionLoading[u.id]}
              onApprove={handleApprove}
              onReject={() => setRejectDlg(u)}
              onSuspend={() => setSuspendDlg(u)}
              onEdit={() => setEditUser(u)}
              activeTab={activeTab}
            />
          ))}
        </div>
      )}

      {/* Edit / change role+mine modal */}
      <Modal isOpen={!!editUser} onClose={() => setEditUser(null)} title="Edit User" size="sm">
        {editUser && (
          <EditUserForm
            user={editUser} mines={mines}
            onSave={() => { setEditUser(null); refresh(); }}
            onCancel={() => setEditUser(null)}
          />
        )}
      </Modal>

      {/* Reject dialog */}
      <Modal isOpen={!!rejectDlg} onClose={() => setRejectDlg(null)} title="Reject Registration" size="sm">
        {rejectDlg && (
          <ReasonForm
            label="Rejection reason (optional)"
            confirmLabel="Reject Registration"
            confirmClass="btn-danger"
            user={rejectDlg}
            onConfirm={(reason) => handleReject(rejectDlg, reason)}
            onCancel={() => setRejectDlg(null)}
          />
        )}
      </Modal>

      {/* Suspend dialog */}
      <Modal isOpen={!!suspendDlg} onClose={() => setSuspendDlg(null)} title="Suspend Account" size="sm">
        {suspendDlg && (
          <ReasonForm
            label="Suspension reason (optional)"
            confirmLabel="Suspend Account"
            confirmClass="btn-danger"
            user={suspendDlg}
            onConfirm={(reason) => handleSuspend(suspendDlg, reason)}
            onCancel={() => setSuspendDlg(null)}
          />
        )}
      </Modal>
    </div>
  );
}

/* ── User Card ─────────────────────────────────────────────────────── */
function UserCard({ user, me, isAdmin, actionLoading, onApprove, onReject, onSuspend, onEdit, activeTab }) {
  const roleInfo   = ROLES[user.role] || { label: user.role, color:'gray' };
  const statusInfo = STATUS_CFG[user.status?.toUpperCase()] || STATUS_CFG.PENDING;
  const isSelf     = user.id === me?.id;
  const busy       = !!actionLoading;

  return (
    <div className="card" style={{ padding:'16px 20px' }}>
      <div className="flex flex-wrap items-start gap-4">
        {/* Avatar */}
        <div style={{ width:44, height:44, borderRadius:12, backgroundColor:'var(--accent-bg)', border:'1.5px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:18, fontWeight:800, color:'var(--accent)' }}>
          {user.full_name?.[0]?.toUpperCase() || 'U'}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <p className="text-sm font-bold" style={{ color:'var(--text-primary)' }}>{user.full_name}</p>
            <Badge color={roleInfo.color}>{roleInfo.label}</Badge>
            <Badge color={statusInfo.badge} dot>{statusInfo.label}</Badge>
            {user.role === 'prototype_tester' && (
              <span style={{ fontSize:10, fontWeight:800, padding:'1px 8px', borderRadius:999, background:'rgba(245,158,11,.12)', color:'#d97706', border:'1px solid rgba(245,158,11,.3)' }}>🧪 DEMO</span>
            )}
          </div>
          <p className="text-xs mb-2" style={{ color:'var(--text-muted)' }}>{user.email}</p>

          {/* Details grid */}
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {user.organization && (
              <span className="flex items-center gap-1 text-xs" style={{ color:'var(--text-secondary)' }}>
                <FiBriefcase size={10}/> {user.organization}
              </span>
            )}
            {(user.mine_name || user.mine_db_name) && (
              <span className="flex items-center gap-1 text-xs" style={{ color:'var(--text-secondary)' }}>
                <FiMapPin size={10}/> {user.mine_name || user.mine_db_name}
              </span>
            )}
            {user.employee_id && (
              <span className="flex items-center gap-1 text-xs" style={{ color:'var(--text-muted)' }}>
                <FiTag size={10}/> {user.employee_id}
              </span>
            )}
            {user.designation && (
              <span className="text-xs" style={{ color:'var(--text-muted)' }}>{user.designation}</span>
            )}
            <span className="flex items-center gap-1 text-xs" style={{ color:'var(--text-muted)' }}>
              <FiClock size={10}/> Registered {timeAgo(user.created_at)}
            </span>
          </div>

          {/* Rejection reason */}
          {user.rejection_reason && (
            <div className="mt-2 p-2 rounded-lg text-xs" style={{ background:'rgba(239,68,68,.07)', border:'1px solid rgba(239,68,68,.2)', color:'var(--text-secondary)' }}>
              <strong>Reason:</strong> {user.rejection_reason}
            </div>
          )}
        </div>

        {/* Actions */}
        {isAdmin && !isSelf && (
          <div className="flex flex-wrap gap-2 shrink-0">
            {/* Approve button — for PENDING and REJECTED */}
            {['PENDING','REJECTED'].includes(activeTab) && (
              <button onClick={() => onApprove(user)} disabled={busy}
                className="btn-sm flex items-center gap-1.5"
                style={{ background:'rgba(34,197,94,.12)', border:'1px solid rgba(34,197,94,.35)', color:'#16a34a', fontWeight:700, borderRadius:8, padding:'5px 12px', cursor: busy?'not-allowed':'pointer', fontSize:12, display:'flex', alignItems:'center', gap:5 }}>
                {actionLoading === 'approving'
                  ? <><span style={{ width:12,height:12,border:'2px solid rgba(22,163,74,.3)',borderTopColor:'#16a34a',borderRadius:'50%',animation:'spin .7s linear infinite',display:'inline-block'}}/> Approving…</>
                  : <><FiCheck size={12}/> Approve</>
                }
              </button>
            )}

            {/* Reject button — for PENDING */}
            {activeTab === 'PENDING' && (
              <button onClick={onReject} disabled={busy} className="btn-outline btn-sm">
                <FiX size={12}/> Reject
              </button>
            )}

            {/* Suspend button — for APPROVED */}
            {activeTab === 'APPROVED' && (
              <button onClick={onSuspend} disabled={busy} className="btn-outline btn-sm">
                <FiPause size={12}/> Suspend
              </button>
            )}

            {/* Re-activate (Approve) for SUSPENDED */}
            {activeTab === 'SUSPENDED' && (
              <button onClick={() => onApprove(user)} disabled={busy}
                className="btn-sm"
                style={{ background:'rgba(34,197,94,.12)', border:'1px solid rgba(34,197,94,.35)', color:'#16a34a', fontWeight:700, borderRadius:8, padding:'5px 12px', cursor: busy?'not-allowed':'pointer', fontSize:12, display:'flex', alignItems:'center', gap:5 }}>
                <FiUserCheck size={12}/> Re-activate
              </button>
            )}

            {/* Edit (role/mine) — always */}
            <button onClick={onEdit} disabled={busy} className="btn-outline btn-sm">
              <FiEdit2 size={12}/> Edit
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ── Edit User Form (role + mine) ─────────────────────────────────── */
function EditUserForm({ user, mines, onSave, onCancel }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      role:        user.role,
      mine_id:     user.mine_id || '',
      designation: user.designation || '',
      department:  user.department  || '',
      organization:user.organization|| '',
      employee_id: user.employee_id || '',
      is_active:   user.is_active ? '1' : '0',
    },
  });

  const onSubmit = async (data) => {
    try {
      await aiApi.updateUser(user.id, {
        role:        data.role,
        mine_id:     data.mine_id || null,
        designation: data.designation,
        department:  data.department,
        is_active:   data.is_active === '1' ? 1 : 0,
      });
      toast.success('User updated.');
      onSave();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Update failed');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div style={{ padding:'12px', borderRadius:10, backgroundColor:'var(--bg-card-hover)', border:'1px solid var(--border)', marginBottom:4 }}>
        <p className="font-semibold text-sm" style={{ color:'var(--text-primary)', margin:0 }}>{user.full_name}</p>
        <p className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>{user.email}</p>
      </div>

      <div className="form-group">
        <label className="label">Role</label>
        <select {...register('role')} className="select">
          {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label className="label">Assigned Mine (optional)</label>
        <select {...register('mine_id')} className="select">
          <option value="">— No specific mine assigned —</option>
          {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label className="label">Designation</label>
        <input {...register('designation')} className="input" placeholder="Inspector of Mines"/>
      </div>

      <div className="form-group">
        <label className="label">Department</label>
        <input {...register('department')} className="input" placeholder="DGMS Region-2"/>
      </div>

      <div className="form-group">
        <label className="label">Account Status</label>
        <select {...register('is_active')} className="select">
          <option value="1">Active</option>
          <option value="0">Inactive</option>
        </select>
      </div>

      <div className="flex justify-end gap-3 pt-2" style={{ borderTop:'1px solid var(--border)' }}>
        <button type="button" onClick={onCancel} className="btn-secondary btn-sm">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary btn-sm">
          {isSubmitting ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

/* ── Reason form (reject / suspend) ──────────────────────────────── */
function ReasonForm({ label, confirmLabel, confirmClass, user, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [busy,   setBusy]   = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    await onConfirm(reason.trim() || undefined);
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div style={{ padding:'12px', borderRadius:10, backgroundColor:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
        <p className="font-semibold text-sm" style={{ color:'var(--text-primary)' }}>{user.full_name}</p>
        <p className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>{user.email} · {ROLES[user.role]?.label || user.role}</p>
      </div>

      <div className="form-group">
        <label className="label">{label}</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} className="input"
          rows={3} placeholder="Optional reason visible to the user on login…"
          style={{ resize:'vertical', minHeight:72 }}/>
      </div>

      <div className="flex justify-end gap-3 pt-2" style={{ borderTop:'1px solid var(--border)' }}>
        <button onClick={onCancel} className="btn-secondary btn-sm">Cancel</button>
        <button onClick={handleConfirm} disabled={busy}
          className={`btn-sm ${confirmClass || 'btn-danger'}`}>
          {busy ? 'Processing…' : confirmLabel}
        </button>
      </div>
    </div>
  );
}
