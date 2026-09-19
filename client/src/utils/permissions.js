/**
 * KhanNetra DGMS — Central RBAC Permissions Map
 *
 * Single source of truth for:
 *   - Which roles can access which frontend routes
 *   - Which sidebar groups/links each role sees
 *   - Which Navbar primary links each role sees
 *
 * Role canonicals (10 total):
 *   admin                — System Administrator
 *   government_officer   — DGMS / Govt. Officer (regulatory authority)
 *   mine_manager         — Mine Manager
 *   inspector            — Field Inspector / DGMS Inspector
 *   safety_officer       — Safety Officer
 *   environment_officer  — Environmental Officer
 *   contractor           — Contractor
 *   mining_engineer      — Mining Engineer
 *   corporate_management — Corporate / Senior Management
 *   prototype_tester     — Prototype Tester / Demo User
 *
 * IMPORTANT: This file controls FRONTEND visibility only.
 * Backend enforce real access via authenticate() + authorize() + requireMineAccess().
 * Never rely on this alone — it is a UI convenience layer, not a security boundary.
 */

/* ── Shorthand aliases for role sets ──────────────────────────────── */
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
const NO_CONTRACTOR_NO_TESTER = ALL.filter(r =>
  r !== 'contractor' && r !== 'prototype_tester');

/* ═══════════════════════════════════════════════════════════════════
   ROUTE PERMISSIONS
   Key = frontend route path (must match App.jsx exactly).
   Value = array of roles that may access it.
   Routes NOT listed here stay open to all authenticated users.
═══════════════════════════════════════════════════════════════════ */
export const ROUTE_PERMISSIONS = {
  /* ── Dashboard ───────────────────────────────────────────────── */
  '/dashboard':                ALL,   // everyone sees a dashboard

  /* ── Mines & GIS ────────────────────────────────────────────── */
  '/mines':                    MINE_OPS,
  '/mines/:id':                MINE_OPS,
  '/gis':                      MINE_OPS,
  '/mine-plans':               ['admin','government_officer','mine_manager',
                                 'inspector','safety_officer','mining_engineer',
                                 'corporate_management'],
  '/mine-plans/:id':           ['admin','government_officer','mine_manager',
                                 'inspector','safety_officer','mining_engineer',
                                 'corporate_management'],

  /* ── Safety & Incidents ─────────────────────────────────────── */
  '/incidents':                MINE_SAFETY,
  '/violations':               ['admin','government_officer','mine_manager',
                                 'inspector','safety_officer','environment_officer',
                                 'corporate_management'],
  '/risk-dashboard':           NO_CONTRACTOR_NO_TESTER,
  '/disaster':                 ALL,   // disaster alerts visible to everyone

  /* ── Compliance & Regulations ───────────────────────────────── */
  '/compliance':               MINE_COMPLIANCE,
  '/compliance/regulations':   MINE_COMPLIANCE,
  '/inspections':              ['admin','government_officer','mine_manager',
                                 'inspector','safety_officer','corporate_management'],
  '/deadlines':                MINE_COMPLIANCE,
  '/documents':                MINE_OPS,

  /* ── Environment ─────────────────────────────────────────────── */
  '/environment':              ['admin','government_officer','mine_manager',
                                 'inspector','safety_officer','environment_officer',
                                 'corporate_management'],

  /* ── Field & Workforce ──────────────────────────────────────── */
  '/field':                    ['admin','government_officer','mine_manager',
                                 'inspector','safety_officer','mining_engineer',
                                 'corporate_management'],
  '/attendance':               ['admin','government_officer','mine_manager',
                                 'inspector','safety_officer','corporate_management',
                                 'contractor'],
  '/workers':                  ['admin','government_officer','mine_manager',
                                 'inspector','safety_officer','corporate_management'],
  '/field-reports':            ['admin','government_officer','mine_manager',
                                 'inspector','safety_officer','mining_engineer',
                                 'corporate_management'],
  '/contractors':              ['admin','government_officer','mine_manager',
                                 'inspector','corporate_management'],

  /* ── AI Tools ───────────────────────────────────────────────── */
  '/ai/chat':                  ALL,   // AI assistant for everyone
  '/ai/risk':                  NO_CONTRACTOR_NO_TESTER,
  '/vision':                   ['admin','government_officer','mine_manager',
                                 'inspector','safety_officer','mining_engineer',
                                 'corporate_management'],
  '/ocr':                      NO_CONTRACTOR_NO_TESTER,

  /* ── Analytics & Reports ────────────────────────────────────── */
  '/analytics':                ADMIN_GOV_CORP,
  '/reports':                  ['admin','government_officer','mine_manager',
                                 'inspector','corporate_management','environment_officer'],

  /* ── Administration ─────────────────────────────────────────── */
  '/notifications':            ALL,
  '/audit':                    ADMIN_GOV_INS,
  '/users':                    ADMIN_GOV,
  '/profile':                  ALL,
  '/settings':                 ALL,
};

/* ═══════════════════════════════════════════════════════════════════
   SIDEBAR NAVIGATION PERMISSIONS
   Each entry defines which roles see it.
   Undefined roles array = visible to everyone.
═══════════════════════════════════════════════════════════════════ */
export const NAV_PERMISSIONS = {
  /* Quick access */
  '/dashboard':               ALL,
  '/compliance':              MINE_COMPLIANCE,
  '/incidents':               MINE_SAFETY,
  '/inspections':             ['admin','government_officer','mine_manager',
                                'inspector','safety_officer','corporate_management'],
  '/environment':             ['admin','government_officer','mine_manager','inspector',
                                'safety_officer','environment_officer','corporate_management'],

  /* Tools & Alerts */
  '/ocr':                     NO_CONTRACTOR_NO_TESTER,
  '/disaster':                ALL,

  /* Mine Operations group */
  '/mines':                   MINE_OPS,
  '/gis':                     MINE_OPS,
  '/mine-plans':              ['admin','government_officer','mine_manager','inspector',
                                'safety_officer','mining_engineer','corporate_management'],
  '/deadlines':               MINE_COMPLIANCE,
  '/documents':               MINE_OPS,

  /* Field & Workforce group */
  '/field':                   ['admin','government_officer','mine_manager','inspector',
                                'safety_officer','mining_engineer','corporate_management'],
  '/attendance':              ['admin','government_officer','mine_manager','inspector',
                                'safety_officer','corporate_management','contractor'],
  '/workers':                 ['admin','government_officer','mine_manager','inspector',
                                'safety_officer','corporate_management'],
  '/field-reports':           ['admin','government_officer','mine_manager','inspector',
                                'safety_officer','mining_engineer','corporate_management'],
  '/contractors':             ['admin','government_officer','mine_manager','inspector',
                                'corporate_management'],

  /* Governance & Compliance group */
  '/compliance/regulations':  MINE_COMPLIANCE,
  '/violations':              ['admin','government_officer','mine_manager','inspector',
                                'safety_officer','environment_officer','corporate_management'],

  /* Safety & Environment group */
  '/risk-dashboard':          NO_CONTRACTOR_NO_TESTER,

  /* Reports & Analytics group */
  '/reports':                 ['admin','government_officer','mine_manager','inspector',
                                'corporate_management','environment_officer'],
  '/analytics':               ADMIN_GOV_CORP,

  /* Administration group */
  '/notifications':           ALL,
  '/audit':                   ADMIN_GOV_INS,
  '/users':                   ADMIN_GOV,
};

/* ═══════════════════════════════════════════════════════════════════
   NAVBAR PRIMARY NAV PERMISSIONS
   Controls which links appear in the top navigation bar.
═══════════════════════════════════════════════════════════════════ */
export const NAVBAR_PERMISSIONS = {
  '/mines':      MINE_OPS,          // Mine Map
  '/attendance': ['admin','government_officer','mine_manager','inspector',
                  'safety_officer','corporate_management','contractor'],
  '/ai/chat':    ALL,               // AI Assistant — everyone
  '/ai/risk':    NO_CONTRACTOR_NO_TESTER,
  '/vision':     ['admin','government_officer','mine_manager','inspector',
                  'safety_officer','mining_engineer','corporate_management'],
};

/* ═══════════════════════════════════════════════════════════════════
   HELPER — canRole(role, path)
   Returns true if the given role can access the given path.
   Falls back to true if path is not listed (open to all auth users).
═══════════════════════════════════════════════════════════════════ */
export function canRole(role, path) {
  const allowed = ROUTE_PERMISSIONS[path];
  if (!allowed) return true;  // not restricted
  return allowed.includes(role);
}

/* ── Role display labels (used in Navbar, Sidebar, Users page) ───── */
export const ROLE_LABEL = {
  admin:                'System Admin',
  government_officer:   'DGMS / Govt. Officer',
  mine_manager:         'Mine Manager',
  inspector:            'Field Inspector',
  safety_officer:       'Safety Officer',
  environment_officer:  'Env. Officer',
  contractor:           'Contractor',
  mining_engineer:      'Mining Engineer',
  corporate_management: 'Corp. Management',
  prototype_tester:     'Prototype Tester',
};

/* ── Role badge colours (matches Badge component colour prop) ──────── */
export const ROLE_COLOR = {
  admin:                'red',
  government_officer:   'blue',
  mine_manager:         'yellow',
  inspector:            'green',
  safety_officer:       'orange',
  environment_officer:  'teal',
  contractor:           'purple',
  mining_engineer:      'blue',
  corporate_management: 'red',
  prototype_tester:     'gray',
};
