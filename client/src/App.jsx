import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';
import Layout from './components/layout/Layout';
import Unauthorized from './pages/Unauthorized';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import VerifyEmail from './pages/auth/VerifyEmail';
import Dashboard from './pages/dashboard/Dashboard';
import Mines from './pages/mines/Mines';
import MineDetail from './pages/mines/MineDetail';
import Violations from './pages/violations/Violations';
import Incidents from './pages/incidents/Incidents';
import Environment from './pages/environment/Environment';
import Inspections from './pages/inspections/Inspections';
import Documents from './pages/documents/Documents';
import Compliance from './pages/compliance/Compliance';
import Regulations from './pages/compliance/Regulations';
import Analytics from './pages/analytics/Analytics';
import AIChat from './pages/ai/AIChat';
import RiskPrediction from './pages/ai/RiskPrediction';
import SafetyVision from './pages/vision/SafetyVision';
import SafetyHub from './pages/safety/SafetyHub';
import Contractors from './pages/contractors/Contractors';
import FieldReports from './pages/fieldreports/FieldReports';
import Deadlines from './pages/deadlines/Deadlines';
import RiskDashboard from './pages/risk/RiskDashboard';
import OCRExtract from './pages/ocr/OCRExtract';
import GISMap from './pages/gis/GISMap';
import Notifications from './pages/notifications/Notifications';
import DisasterAlerts from './pages/disaster/DisasterAlerts';
import ProductionMonitoring from './pages/production/ProductionMonitoring';
import AuditTrail from './pages/audit/AuditTrail';
import Reports from './pages/reports/Reports';
import Users from './pages/users/Users';
import Profile from './pages/Profile';
import FieldDashboard from './pages/field/FieldDashboard';
import Attendance from './pages/attendance/Attendance';
import Workers from './pages/attendance/Workers';
import MinePlans from './pages/mine-plans/MinePlans';
import MinePlanViewer from './pages/mine-plans/MinePlanViewer';
import Settings from './pages/settings/Settings';

/* ── Role sets — keep in sync with permissions.js ───────────────── */
const ALL = [
  'admin','government_officer','mine_manager','inspector',
  'safety_officer','environment_officer','contractor',
  'mining_engineer','corporate_management','prototype_tester',
];
const ADMIN_ONLY       = ['admin'];
const ADMIN_GOV        = ['admin','government_officer'];
const ADMIN_GOV_CORP   = ['admin','government_officer','corporate_management'];
const ADMIN_GOV_INS    = ['admin','government_officer','inspector'];
const MINE_OPS         = ['admin','government_officer','mine_manager','inspector',
                          'safety_officer','environment_officer','mining_engineer',
                          'contractor','corporate_management'];
const MINE_SAFETY      = ['admin','government_officer','mine_manager','inspector',
                          'safety_officer','corporate_management'];
const MINE_COMPLIANCE  = ['admin','government_officer','mine_manager','inspector',
                          'safety_officer','environment_officer','corporate_management'];
const NO_CONTRACTOR_NO_TESTER = ALL.filter(
  r => r !== 'contractor' && r !== 'prototype_tester'
);
const ENV_ROLES        = ['admin','government_officer','mine_manager','inspector',
                          'safety_officer','environment_officer','corporate_management'];
const INSPECTION_ROLES = ['admin','government_officer','mine_manager','inspector',
                          'safety_officer','corporate_management'];
const MINE_PLANS_ROLES = ['admin','government_officer','mine_manager','inspector',
                          'safety_officer','mining_engineer','corporate_management'];
const FIELD_ROLES      = ['admin','government_officer','mine_manager','inspector',
                          'safety_officer','mining_engineer','corporate_management'];
const ATTENDANCE_ROLES = ['admin','government_officer','mine_manager','inspector',
                          'safety_officer','corporate_management','contractor'];
const CONTRACTOR_MGMT  = ['admin','government_officer','mine_manager','inspector',
                          'corporate_management'];
const VIOLATION_ROLES  = ['admin','government_officer','mine_manager','inspector',
                          'safety_officer','environment_officer','corporate_management'];
const REPORT_ROLES     = ['admin','government_officer','mine_manager','inspector',
                          'corporate_management','environment_officer'];
const VISION_ROLES     = ['admin','government_officer','mine_manager','inspector',
                          'safety_officer','mining_engineer','corporate_management'];
const PRODUCTION_ROLES = ['admin','government_officer','mine_manager','inspector',
                          'safety_officer','mining_engineer','corporate_management'];

/* ═══════════════════════════════════════════════════════════════════
   ProtectedRoute
   - No roles prop  → auth-only gate (wraps the whole Layout)
   - roles prop     → also checks role; shows <Unauthorized> (not redirect)
     so the user sees a proper message instead of a silent redirect loop
═══════════════════════════════════════════════════════════════════ */
function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) return <Unauthorized />;
  return children;
}

export default function App() {
  const { isAuthenticated } = useAuthStore();
  return (
    <Routes>
      {/* ── Public routes ─────────────────────────────────────────── */}
      <Route path="/login"        element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />} />
      <Route path="/register"     element={isAuthenticated ? <Navigate to="/dashboard" /> : <Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* ── Protected routes (all require auth; individual routes add role gates) ── */}
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Navigate to="/dashboard" />} />

        {/* Dashboard — all roles */}
        <Route path="/dashboard" element={<Dashboard />} />

        {/* Mines & GIS */}
        <Route path="/mines"        element={<ProtectedRoute roles={MINE_OPS}><Mines /></ProtectedRoute>} />
        <Route path="/mines/:id"    element={<ProtectedRoute roles={MINE_OPS}><MineDetail /></ProtectedRoute>} />
        <Route path="/gis"          element={<ProtectedRoute roles={MINE_OPS}><GISMap /></ProtectedRoute>} />
        <Route path="/mine-plans"   element={<ProtectedRoute roles={MINE_PLANS_ROLES}><MinePlans /></ProtectedRoute>} />
        <Route path="/mine-plans/:id" element={<ProtectedRoute roles={MINE_PLANS_ROLES}><MinePlanViewer /></ProtectedRoute>} />

        {/* Safety & incidents */}
        <Route path="/incidents"     element={<ProtectedRoute roles={MINE_SAFETY}><Incidents /></ProtectedRoute>} />
        <Route path="/violations"    element={<ProtectedRoute roles={VIOLATION_ROLES}><Violations /></ProtectedRoute>} />
        <Route path="/risk-dashboard" element={<ProtectedRoute roles={NO_CONTRACTOR_NO_TESTER}><RiskDashboard /></ProtectedRoute>} />
        <Route path="/disaster"      element={<DisasterAlerts />} />
        <Route path="/production"    element={<ProtectedRoute roles={PRODUCTION_ROLES}><ProductionMonitoring /></ProtectedRoute>} />

        {/* Compliance */}
        <Route path="/compliance"                element={<ProtectedRoute roles={MINE_COMPLIANCE}><Compliance /></ProtectedRoute>} />
        <Route path="/compliance/regulations"    element={<ProtectedRoute roles={MINE_COMPLIANCE}><Regulations /></ProtectedRoute>} />
        <Route path="/inspections"               element={<ProtectedRoute roles={INSPECTION_ROLES}><Inspections /></ProtectedRoute>} />
        <Route path="/deadlines"                 element={<ProtectedRoute roles={MINE_COMPLIANCE}><Deadlines /></ProtectedRoute>} />
        <Route path="/documents"                 element={<ProtectedRoute roles={MINE_OPS}><Documents /></ProtectedRoute>} />

        {/* Environment */}
        <Route path="/environment" element={<ProtectedRoute roles={ENV_ROLES}><Environment /></ProtectedRoute>} />

        {/* Field & Workforce */}
        <Route path="/field"         element={<ProtectedRoute roles={FIELD_ROLES}><FieldDashboard /></ProtectedRoute>} />
        <Route path="/attendance"    element={<ProtectedRoute roles={ATTENDANCE_ROLES}><Attendance /></ProtectedRoute>} />
        <Route path="/workers"       element={<ProtectedRoute roles={MINE_SAFETY}><Workers /></ProtectedRoute>} />
        <Route path="/field-reports" element={<ProtectedRoute roles={[...FIELD_ROLES]}><FieldReports /></ProtectedRoute>} />
        <Route path="/contractors"   element={<ProtectedRoute roles={CONTRACTOR_MGMT}><Contractors /></ProtectedRoute>} />

        {/* AI tools */}
        <Route path="/ai/chat" element={<AIChat />} />
        <Route path="/ai/risk" element={<ProtectedRoute roles={NO_CONTRACTOR_NO_TESTER}><RiskPrediction /></ProtectedRoute>} />
        <Route path="/vision"  element={<ProtectedRoute roles={VISION_ROLES}><SafetyVision /></ProtectedRoute>} />
        <Route path="/safety-hub" element={<SafetyHub />} />
        <Route path="/ocr"     element={<ProtectedRoute roles={NO_CONTRACTOR_NO_TESTER}><OCRExtract /></ProtectedRoute>} />

        {/* Analytics & reports */}
        <Route path="/analytics" element={<ProtectedRoute roles={ADMIN_GOV_CORP}><Analytics /></ProtectedRoute>} />
        <Route path="/reports"   element={<ProtectedRoute roles={REPORT_ROLES}><Reports /></ProtectedRoute>} />

        {/* Administration */}
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/audit"  element={<ProtectedRoute roles={ADMIN_GOV_INS}><AuditTrail /></ProtectedRoute>} />
        <Route path="/users"  element={<ProtectedRoute roles={ADMIN_GOV}><Users /></ProtectedRoute>} />
        <Route path="/profile"   element={<Profile />} />
        <Route path="/settings"  element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
}
