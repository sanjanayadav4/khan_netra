/**
 * KhanNetra — Default / Prototype Tester Dashboard
 * Shown when role is prototype_tester or unrecognised.
 * Read-only overview of system. Demo data clearly labelled.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FiCpu, FiMap, FiRss, FiCheckSquare,
  FiActivity, FiInfo,
} from 'react-icons/fi';
import { disasterApi } from '../../../services/api';
import { RoleDashboardHeader, HeroBanner, Panel, NoData, AlertRow } from './_shared';
import { ROLE_LABEL } from '../../../utils/permissions';

export default function DefaultDashboard({ user }) {
  const [disaster, setDisaster] = useState([]);
  useEffect(() => {
    disasterApi.getActive().then(r => setDisaster((r?.data||[]).slice(0,3))).catch(() => {});
  }, []);

  const role  = user?.role || '';
  const label = ROLE_LABEL[role] || role || 'User';

  return (
    <div className="space-y-5">
      <HeroBanner user={user}
        tagline="Explore KhanNetra's AI-powered compliance and safety monitoring platform."
        actions={[
          { to:'/ai/chat',  label:'AI Assistant',    icon:FiCpu,         color:'#7c3aed', primary:true },
          { to:'/disaster', label:'Disaster Alerts', icon:FiRss,         color:'#dc2626' },
          { to:'/profile',  label:'My Profile',      icon:FiCheckSquare, color:'#16a34a' },
        ]}/>
      <RoleDashboardHeader user={user} subtitle={`Logged in as ${label} — limited access mode`}/>

      <div className="card p-5" style={{ background:'rgba(245,158,11,.06)', border:'1px solid rgba(245,158,11,.25)' }}>
        <div className="flex items-start gap-3">
          <FiInfo size={18} style={{ color:'var(--accent)', flexShrink:0, marginTop:2 }}/>
          <div>
            <p className="font-bold text-sm mb-1" style={{ color:'var(--text-primary)' }}>
              {role === 'prototype_tester' ? '🧪 Prototype Tester Account' : 'Limited Access Account'}
            </p>
            <p className="text-sm" style={{ color:'var(--text-secondary)', lineHeight:1.6 }}>
              {role === 'prototype_tester'
                ? 'You are logged in as a Prototype Tester. You can explore the KhanNetra interface and test major UI features. Real mine data, user management, and sensitive modules are not accessible in this mode.'
                : `Your role (${label}) has limited dashboard access. Contact your administrator to assign the correct permissions.`
              }
            </p>
          </div>
        </div>
      </div>

      {/* Accessible quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { to:'/ai/chat',  label:'AI Assistant',    icon:FiCpu,         color:'#7c3aed', desc:'Ask questions about coal mine safety and regulations' },
          { to:'/disaster', label:'Disaster Alerts', icon:FiRss,         color:'#dc2626', desc:'View active disaster and emergency alerts'             },
          { to:'/profile',  label:'My Profile',      icon:FiCheckSquare, color:'#16a34a', desc:'View and update your account information'              },
        ].map(({ to, label, icon: Icon, color, desc }) => (
          <Link key={to} to={to}
            className="card flex flex-col gap-2 transition-all"
            style={{ cursor:'pointer' }}
            onMouseEnter={e => e.currentTarget.style.borderColor=color+'55'}
            onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}>
            <div style={{ width:36, height:36, borderRadius:10, background:`${color}15`, border:`1px solid ${color}25`, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Icon size={16} style={{ color }}/>
            </div>
            <p className="font-bold text-sm" style={{ color:'var(--text-primary)' }}>{label}</p>
            <p className="text-xs" style={{ color:'var(--text-muted)' }}>{desc}</p>
          </Link>
        ))}
      </div>

      {/* Disaster alerts — visible to all */}
      <Panel title="Disaster Alerts" to="/disaster">
        {disaster.length ? disaster.map(a => <AlertRow key={a.id} alert={a}/>) : <NoData message="No active disaster alerts"/>}
      </Panel>
    </div>
  );
}
