/**
 * KhanNetra — Environmental Officer Dashboard
 * Environmental monitoring: air quality, water, dust, emissions,
 * environmental compliance, violations, inspections.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FiFeather, FiAlertOctagon, FiCheckSquare,
  FiClipboard, FiFileText, FiCpu, FiAlertTriangle, FiActivity,
} from 'react-icons/fi';
import {
  environmentApi, violationsApi, inspectionsApi, complianceApi,
} from '../../../services/api';
import { RoleDashboardHeader, HeroBanner, StatCard, Panel, NoData, ViolationRow, InspectionRow } from './_shared';
import { CardSkeleton } from '../../../components/ui/LoadingSpinner';
import Badge from '../../../components/ui/Badge';

export default function EnvironmentalOfficerDashboard({ user }) {
  const [envDash,  setEnvDash]  = useState(null);
  const [readings, setReadings] = useState([]);
  const [viols,    setViols]    = useState([]);
  const [insps,    setInsps]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const p = user?.mine_id ? { mine_id: user.mine_id } : {};

  useEffect(() => {
    Promise.allSettled([
      environmentApi.getDashboard().catch(() => ({ data: null })),
      environmentApi.getReadings({ ...p, limit: 10 }),
      violationsApi.getAll({ ...p, status:'open', limit:5 }),
      inspectionsApi.getAll({ ...p, limit:4 }),
    ]).then(([ed, er, v, ins]) => {
      setEnvDash(ed.status === 'fulfilled' ? ed.value?.data : null);
      const allReadings = er.status === 'fulfilled' ? (er.value?.data || []) : [];
      setReadings(allReadings.filter(r => r.status !== 'normal').slice(0,8));
      setViols(v.status === 'fulfilled' ? (v.value?.data||[]) : []);
      setInsps(ins.status === 'fulfilled' ? (ins.value?.data||[]) : []);
    }).finally(() => setLoading(false));
  }, [user?.mine_id]);

  if (loading) return <div className="space-y-4"><CardSkeleton count={3}/></div>;

  const STATUS_COLOR = { critical:'red', warning:'yellow', normal:'green' };

  return (
    <div className="space-y-5">
      <HeroBanner user={user}
        tagline="Environmental monitoring: air quality, water, dust, emissions and compliance."
        actions={[
          { to:'/environment', label:'Environment',   icon:FiFeather,     color:'#0f766e' },
          { to:'/compliance',  label:'Env Compliance',icon:FiCheckSquare, color:'#16a34a' },
          { to:'/ai/chat',     label:'AI Assistant',  icon:FiCpu,         color:'#7c3aed', primary:true },
        ]}/>
      <RoleDashboardHeader user={user} subtitle="Environmental monitoring, compliance and reporting"/>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={FiAlertTriangle} label="Env Alerts"      value={readings.length}       sub="Warning + critical readings" color="#dc2626" to="/environment"/>
        <StatCard icon={FiAlertOctagon}  label="Env Violations"  value={viols.length}          sub="Open environmental violations" color="#ea580c" to="/violations"/>
        <StatCard icon={FiClipboard}     label="Inspections"     value={insps.length}          sub="Recent inspections"            color="#2563eb" to="/inspections"/>
        <StatCard icon={FiCheckSquare}   label="Compliance"      value={envDash ? 'View' : '—'} sub="Environmental compliance"    color="#0f766e" to="/compliance"/>
      </div>

      {/* Environmental readings panel */}
      <Panel title="⚠️ Active Environmental Alerts" to="/environment" toLabel="All Readings">
        {readings.length ? (
          <div className="space-y-0">
            {readings.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2.5" style={{ borderBottom:'1px solid var(--border)' }}>
                <div className="flex items-center gap-3">
                  <FiActivity size={12} style={{ color: r.status==='critical' ? '#dc2626' : '#f59e0b', flexShrink:0 }}/>
                  <div>
                    <p className="text-xs font-semibold" style={{ color:'var(--text-primary)' }}>
                      {r.parameter}: <span style={{ color: r.status==='critical'?'#dc2626':'#d97706' }}>{r.value} {r.unit}</span>
                    </p>
                    <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>
                      {r.reading_type} · {r.location || r.mine_name || '—'}
                    </p>
                  </div>
                </div>
                <Badge color={STATUS_COLOR[r.status]||'gray'}>{r.status}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <NoData message="All readings within normal limits"/>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="Environmental Violations" to="/violations">
          {viols.length ? viols.map(v => <ViolationRow key={v.id} v={v}/>) : <NoData message="No open violations"/>}
        </Panel>
        <Panel title="Environmental Inspections" to="/inspections">
          {insps.length ? insps.map(i => <InspectionRow key={i.id} ins={i}/>) : <NoData/>}
        </Panel>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { to:'/environment',           label:'Air & Water Quality', icon:FiFeather,       color:'#0f766e' },
          { to:'/compliance',            label:'Env Compliance',      icon:FiCheckSquare,   color:'#16a34a' },
          { to:'/compliance/regulations',label:'Regulations',         icon:FiFileText,      color:'#2563eb' },
          { to:'/reports',               label:'Reports',             icon:FiFileText,      color:'#7c3aed' },
        ].map(({ to, label, icon: Icon, color }) => (
          <Link key={to} to={to}
            className="flex items-center gap-3 p-3 rounded-xl border transition-all"
            style={{ borderColor:'var(--border)', backgroundColor:'var(--bg-card)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor=color+'55'; e.currentTarget.style.background=color+'08'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='var(--bg-card)'; }}>
            <div style={{ width:32, height:32, borderRadius:8, background:`${color}15`, border:`1px solid ${color}25`, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Icon size={14} style={{ color }}/>
            </div>
            <span className="text-sm font-semibold" style={{ color:'var(--text-secondary)' }}>{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
