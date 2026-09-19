/**
 * KhanNetra DGMS — Role-Dispatched Dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 * ROOT CAUSE FIX:
 *   Previously this file rendered one monolithic dashboard to every user,
 *   completely ignoring user.role. The RBAC permissions existed in the DB
 *   and JWT but were never used here.
 *
 *   Now: reads user.role from the authenticated Zustand store (populated
 *   from the backend JWT on login), and renders a completely different
 *   component for each role. No fake data. No hardcoded numbers.
 *
 * Role → Component mapping:
 *   admin                → AdminDashboard
 *   government_officer   → GovernmentOfficerDashboard
 *   mine_manager         → MineManagerDashboard
 *   inspector            → InspectorDashboard
 *   safety_officer       → SafetyOfficerDashboard
 *   environment_officer  → EnvironmentalOfficerDashboard
 *   contractor           → ContractorDashboard
 *   mining_engineer      → MiningEngineerDashboard
 *   corporate_management → CorporateDashboard
 *   prototype_tester     → DefaultDashboard
 *   (anything else)      → DefaultDashboard
 */
import { Suspense, lazy } from 'react';
import useAuthStore from '../../store/authStore';
import { PageLoader } from '../../components/ui/LoadingSpinner';

/* Lazy-load each role dashboard so the bundle stays efficient */
const AdminDashboard               = lazy(() => import('./roles/AdminDashboard'));
const GovernmentOfficerDashboard   = lazy(() => import('./roles/GovernmentOfficerDashboard'));
const MineManagerDashboard         = lazy(() => import('./roles/MineManagerDashboard'));
const InspectorDashboard           = lazy(() => import('./roles/InspectorDashboard'));
const SafetyOfficerDashboard       = lazy(() => import('./roles/SafetyOfficerDashboard'));
const EnvironmentalOfficerDashboard= lazy(() => import('./roles/EnvironmentalOfficerDashboard'));
const ContractorDashboard          = lazy(() => import('./roles/ContractorDashboard'));
const MiningEngineerDashboard      = lazy(() => import('./roles/MiningEngineerDashboard'));
const CorporateDashboard           = lazy(() => import('./roles/CorporateDashboard'));
const DefaultDashboard             = lazy(() => import('./roles/DefaultDashboard'));

/* ── Role → component map ──────────────────────────────────────────── */
const ROLE_DASHBOARDS = {
  admin:                AdminDashboard,
  government_officer:   GovernmentOfficerDashboard,
  mine_manager:         MineManagerDashboard,
  inspector:            InspectorDashboard,
  safety_officer:       SafetyOfficerDashboard,
  environment_officer:  EnvironmentalOfficerDashboard,
  contractor:           ContractorDashboard,
  mining_engineer:      MiningEngineerDashboard,
  corporate_management: CorporateDashboard,
  prototype_tester:     DefaultDashboard,
};

export default function Dashboard() {
  const { user } = useAuthStore();
  const role     = user?.role || '';

  /* Pick the matching component, fall back to Default for unknown roles */
  const RoleDashboard = ROLE_DASHBOARDS[role] || DefaultDashboard;

  return (
    <Suspense fallback={<PageLoader message="Loading your dashboard…" />}>
      {/*
        Pass the full user object so each role dashboard can show
        name, mine_name, organisation etc. without extra API calls.
        Role data is from the authenticated backend session — never
        from a frontend prop the user could manipulate.
      */}
      <RoleDashboard user={user} />
    </Suspense>
  );
}
