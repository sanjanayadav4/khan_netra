/**
 * KhanNetra – SQLite init: creates all tables + seeds demo data
 * Run once: node src/database/init.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const path   = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '../../khannetra.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF'); // off during init

const uuid = () => {
  const b = (n) => [...Array(n)].map(()=>Math.floor(Math.random()*16).toString(16)).join('');
  return `${b(8)}-${b(4)}-4${b(3)}-${['8','9','a','b'][Math.floor(Math.random()*4)]}${b(3)}-${b(12)}`;
};

// ── SCHEMA ────────────────────────────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  phone TEXT,
  designation TEXT,
  department TEXT,
  organization TEXT,
  mine_id TEXT,
  mine_name TEXT,
  employee_id TEXT,
  status TEXT DEFAULT 'PENDING',
  is_active INTEGER DEFAULT 1,
  last_login TEXT,
  approved_at TEXT,
  approved_by TEXT,
  rejection_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mines (
  id TEXT PRIMARY KEY,
  mine_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  location_name TEXT,
  state TEXT,
  district TEXT,
  latitude REAL,
  longitude REAL,
  area_hectares REAL,
  depth_meters REAL,
  production_capacity_mt REAL,
  current_production_mt REAL DEFAULT 0,
  owner_name TEXT,
  owner_company TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  status TEXT DEFAULT 'active',
  compliance_score REAL DEFAULT 50,
  risk_score REAL DEFAULT 50,
  environmental_score REAL DEFAULT 50,
  safety_score REAL DEFAULT 50,
  workers_count INTEGER DEFAULT 0,
  established_year INTEGER,
  mining_method TEXT,
  primary_mineral TEXT DEFAULT 'Coal',
  license_number TEXT,
  license_expiry TEXT,
  last_inspection_date TEXT,
  next_inspection_date TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS violations (
  id TEXT PRIMARY KEY,
  violation_number TEXT UNIQUE NOT NULL,
  mine_id TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  detected_date TEXT NOT NULL,
  detected_by TEXT,
  status TEXT DEFAULT 'open',
  fine_amount REAL DEFAULT 0,
  fine_paid INTEGER DEFAULT 0,
  corrective_action TEXT,
  corrective_deadline TEXT,
  closed_date TEXT,
  closed_by TEXT,
  regulation_reference TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS corrective_actions (
  id TEXT PRIMARY KEY,
  violation_id TEXT NOT NULL,
  mine_id TEXT NOT NULL,
  action_description TEXT NOT NULL,
  assigned_to TEXT,
  assigned_by TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending',
  due_date TEXT,
  completed_date TEXT,
  completion_notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  incident_number TEXT UNIQUE NOT NULL,
  mine_id TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  category TEXT,
  description TEXT NOT NULL,
  incident_date TEXT NOT NULL,
  location_in_mine TEXT,
  injuries_count INTEGER DEFAULT 0,
  fatalities_count INTEGER DEFAULT 0,
  affected_workers INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open',
  reported_by TEXT,
  investigated_by TEXT,
  root_cause TEXT,
  corrective_measures TEXT,
  dgms_notified INTEGER DEFAULT 0,
  dgms_notification_date TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS environmental_readings (
  id TEXT PRIMARY KEY,
  mine_id TEXT NOT NULL,
  reading_type TEXT NOT NULL,
  parameter TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT,
  threshold_min REAL,
  threshold_max REAL,
  status TEXT DEFAULT 'normal',
  location TEXT,
  recorded_at TEXT DEFAULT (datetime('now')),
  recorded_by TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inspections (
  id TEXT PRIMARY KEY,
  inspection_number TEXT UNIQUE NOT NULL,
  mine_id TEXT NOT NULL,
  type TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  completed_date TEXT,
  inspector_id TEXT,
  status TEXT DEFAULT 'scheduled',
  overall_score REAL,
  findings TEXT,
  recommendations TEXT,
  follow_up_required INTEGER DEFAULT 0,
  follow_up_date TEXT,
  report_file TEXT,
  checklist_completed INTEGER DEFAULT 0,
  location_in_mine TEXT,
  section TEXT,
  gps_lat REAL,
  gps_lon REAL,
  gps_captured_at TEXT,
  evidence_photos TEXT,
  corrective_actions_count INTEGER DEFAULT 0,
  inspector_notes TEXT,
  risk_level TEXT DEFAULT 'Low',
  total_checks INTEGER DEFAULT 0,
  passed_checks INTEGER DEFAULT 0,
  failed_checks INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inspection_checklist (
  id TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL,
  category TEXT NOT NULL,
  item_description TEXT NOT NULL,
  is_compliant INTEGER,
  score INTEGER DEFAULT 0,
  remarks TEXT,
  result TEXT DEFAULT 'na',
  observation TEXT,
  evidence_photo TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inspection_corrective_actions (
  id TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL,
  inspection_checklist_id TEXT,
  mine_id TEXT NOT NULL,
  observation TEXT NOT NULL,
  responsible_person TEXT,
  department TEXT,
  priority TEXT DEFAULT 'medium',
  due_date TEXT,
  status TEXT DEFAULT 'open',
  resolution_notes TEXT,
  resolution_evidence TEXT,
  resolved_at TEXT,
  resolved_by TEXT,
  requires_reinspection INTEGER DEFAULT 0,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  mine_id TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  issue_date TEXT,
  expiry_date TEXT,
  issuing_authority TEXT,
  document_number TEXT,
  status TEXT DEFAULT 'active',
  ai_analysis TEXT,
  ai_risk_flags TEXT,
  uploaded_by TEXT,
  verified_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  mine_id TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  priority TEXT DEFAULT 'medium',
  is_read INTEGER DEFAULT 0,
  action_url TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS regulations (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  effective_date TEXT,
  last_updated TEXT,
  issuing_authority TEXT,
  penalty_range TEXT,
  applicable_mine_types TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS compliance_records (
  id TEXT PRIMARY KEY,
  mine_id TEXT NOT NULL,
  category TEXT NOT NULL,
  parameter_name TEXT NOT NULL,
  required_value TEXT,
  actual_value TEXT,
  status TEXT DEFAULT 'pending',
  score REAL DEFAULT 0,
  notes TEXT,
  verified_by TEXT,
  verification_date TEXT,
  due_date TEXT,
  workflow_status TEXT DEFAULT 'pending',
  responsible_officer TEXT,
  rejection_reason TEXT,
  document_id TEXT,
  submitted_at TEXT,
  approved_at TEXT,
  approved_by TEXT,
  resubmission_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  old_values TEXT,
  new_values TEXT,
  ip_address TEXT,
  user_agent TEXT,
  mine_id TEXT,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_history (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tokens_used INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── NEW: Contractors ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contractors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  registration_number TEXT,
  mine_id TEXT NOT NULL,
  work_type TEXT NOT NULL,
  contract_start TEXT,
  contract_end TEXT,
  safety_score REAL DEFAULT 50,
  compliance_score REAL DEFAULT 50,
  workers_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  last_inspection_date TEXT,
  violations_count INTEGER DEFAULT 0,
  incidents_count INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ── NEW: Field Reports (geo-tagged, time-stamped) ────────────────────────────
CREATE TABLE IF NOT EXISTS field_reports (
  id TEXT PRIMARY KEY,
  report_number TEXT UNIQUE NOT NULL,
  mine_id TEXT NOT NULL,
  reported_by TEXT NOT NULL,
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  location_name TEXT,
  severity TEXT DEFAULT 'info',
  status TEXT DEFAULT 'open',
  images TEXT,
  tags TEXT,
  follow_up_required INTEGER DEFAULT 0,
  follow_up_date TEXT,
  resolved_date TEXT,
  resolved_by TEXT,
  resolution_notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ── NEW: Compliance Deadlines / Escalations ──────────────────────────────────
CREATE TABLE IF NOT EXISTS compliance_deadlines (
  id TEXT PRIMARY KEY,
  mine_id TEXT NOT NULL,
  compliance_record_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  deadline_date TEXT NOT NULL,
  responsible_person TEXT,
  escalation_level INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  reminder_sent INTEGER DEFAULT 0,
  escalated_to TEXT,
  completed_date TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
`);

console.log('✅ Tables created');

// ── SEED ──────────────────────────────────────────────────────────────────────
const insert = db.transaction(() => {

  // Check already seeded
  const existing = db.prepare("SELECT COUNT(*) as c FROM mines").get();
  if (existing.c > 0) { console.log('Already seeded, skipping.'); return; }

  const pw = bcrypt.hashSync('KhanNetra@2024', 10);

  // Mines
  const mineIds = Array.from({length:6},()=>uuid());
  const mines = [
    [mineIds[0],'MN-JH-001','Jharia Central Coal Mine','Underground','Jharia Coalfield','Jharkhand','Dhanbad',23.7957,86.4304,2456.5,350,2500000,2100000,'Rajesh Kumar Singh','Bharat Coking Coal Ltd','manager@jharia-ccl.gov.in','+91-9876543210','active',72.5,68.3,65.2,71.8,1250,1975,'Bord and Pillar','Coal','ML-JH-2019-001','2026-12-31','2026-07-15','2026-10-15'],
    [mineIds[1],'MN-CG-002','Korba Opencast Mine','Opencast','Korba Coalfield','Chhattisgarh','Korba',22.3595,82.7501,5678.2,85,8000000,7500000,'Priya Sharma','South Eastern Coalfields Ltd','manager@korba-secl.gov.in','+91-9876543211','active',85.2,42.1,78.9,88.5,875,1982,'Shovel-Dumper','Coal','ML-CG-2020-002','2027-06-30','2026-08-01','2026-11-01'],
    [mineIds[2],'MN-OD-003','Talcher Super Thermal Mine','Opencast','Talcher Coalfield','Odisha','Angul',20.9517,85.2322,8920.0,120,12000000,11200000,'Amit Patel','Mahanadi Coalfields Ltd','manager@talcher-mcl.gov.in','+91-9876543212','active',91.8,28.5,89.3,93.2,620,1980,'Dragline','Coal','ML-OD-2021-003','2028-03-31','2026-08-20','2026-11-20'],
    [mineIds[3],'MN-WB-004','Raniganj Deep Mine','Underground','Raniganj Coalfield','West Bengal','Paschim Bardhaman',23.6105,87.1380,1876.3,450,1800000,1400000,'Sunita Devi','Eastern Coalfields Ltd','manager@raniganj-ecl.gov.in','+91-9876543213','under_inspection',58.4,82.7,52.1,55.3,1890,1965,'Long Wall','Coal','ML-WB-2018-004','2025-12-31','2026-06-10','2026-09-10'],
    [mineIds[4],'MN-MP-005','Singrauli Central Mine','Opencast','Singrauli Coalfield','Madhya Pradesh','Singrauli',24.1997,82.6629,6543.8,95,10000000,9200000,'Vikram Yadav','Northern Coalfields Ltd','manager@singrauli-ncl.gov.in','+91-9876543214','active',79.6,55.4,72.8,81.3,745,1978,'Truck-Shovel','Coal','ML-MP-2022-005','2029-09-30','2026-07-30','2026-10-30'],
    [mineIds[5],'MN-TL-006','Ramagundam South Mine','Underground','Godavari Coalfield','Telangana','Peddapalli',18.7597,79.4747,3210.6,280,3500000,2800000,'Kavitha Reddy','Singareni Collieries Company Ltd','manager@ramagundam-sccl.gov.in','+91-9876543215','suspended',45.2,91.3,38.7,42.6,2100,1958,'Bord and Pillar','Coal','ML-TL-2017-006','2024-06-30','2026-05-20','2026-08-20'],
  ];
  const mineStmt = db.prepare(`INSERT INTO mines (id,mine_id,name,type,location_name,state,district,latitude,longitude,area_hectares,depth_meters,production_capacity_mt,current_production_mt,owner_name,owner_company,contact_email,contact_phone,status,compliance_score,risk_score,environmental_score,safety_score,workers_count,established_year,mining_method,primary_mineral,license_number,license_expiry,last_inspection_date,next_inspection_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  mines.forEach(m => mineStmt.run(...m));

  // Users
  const userIds = Array.from({length:10},()=>uuid());
  const users = [
    [userIds[0],'admin@khannetra.gov.in',pw,'Dr. Arvind Mishra','admin','+91-9800000001','Director General','DGMS HQ','DGMS, Ministry of Coal',null,'DGMS Admin Complex, New Delhi','DGMS-ADM-001','APPROVED',1],
    [userIds[1],'officer1@khannetra.gov.in',pw,'Shri Ravi Shankar','government_officer','+91-9800000002','Joint Secretary','Ministry of Coal','Ministry of Coal, GoI',null,'Shram Shakti Bhawan, New Delhi','MOC-OFF-001','APPROVED',1],
    [userIds[2],'manager1@khannetra.gov.in',pw,'Rajesh Kumar Singh','mine_manager','+91-9876543210','Mine Manager','Jharia Central Coal Mine','Bharat Coking Coal Ltd',mineIds[0],'Jharia Central Coal Mine','CCL-MGR-001','APPROVED',1],
    [userIds[3],'manager2@khannetra.gov.in',pw,'Priya Sharma','mine_manager','+91-9876543211','Mine Manager','Korba Opencast Mine','South Eastern Coalfields Ltd',mineIds[1],'Korba Opencast Mine','SECL-MGR-002','APPROVED',1],
    [userIds[4],'inspector1@khannetra.gov.in',pw,'Mohd. Arif Khan','inspector','+91-9800000005','Inspector of Mines','DGMS Region-2','DGMS',null,'DGMS Region-2 Office, Dhanbad','DGMS-INS-001','APPROVED',1],
    [userIds[5],'inspector2@khannetra.gov.in',pw,'Suresh Babu','inspector','+91-9800000006','Senior Inspector','DGMS Region-3','DGMS',null,'DGMS Region-3 Office, Nagpur','DGMS-INS-002','APPROVED',1],
    [userIds[6],'safety1@khannetra.gov.in',pw,'Geeta Rani Verma','safety_officer','+91-9800000007','Safety Officer','Jharia Central Coal Mine','Bharat Coking Coal Ltd',mineIds[0],'Jharia Central Coal Mine','CCL-SAF-001','APPROVED',1],
    [userIds[7],'env1@khannetra.gov.in',pw,'Dr. Anita Joshi','environment_officer','+91-9800000008','Environmental Officer','CPCB','Central Pollution Control Board',null,'CPCB HQ, New Delhi','CPCB-ENV-001','APPROVED',1],
    [userIds[8],'manager3@khannetra.gov.in',pw,'Sunita Devi','mine_manager','+91-9876543213','Mine Manager','Raniganj Deep Mine','Eastern Coalfields Ltd',mineIds[3],'Raniganj Deep Mine','ECL-MGR-003','APPROVED',1],
    [userIds[9],'officer2@khannetra.gov.in',pw,'Krishnaswamy Iyer','government_officer','+91-9800000010','Director (Mines Safety)','DGMS','DGMS, Ministry of Coal',null,'DGMS HQ, Dhanbad','DGMS-OFF-002','APPROVED',1],
  ];
  const userStmt = db.prepare(`INSERT INTO users (id,email,password_hash,full_name,role,phone,designation,department,organization,mine_id,mine_name,employee_id,status,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  users.forEach(u => userStmt.run(...u));

  // Violations
  const vStmt = db.prepare(`INSERT INTO violations (id,violation_number,mine_id,type,severity,category,description,detected_date,detected_by,status,fine_amount,regulation_reference) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const violations = [
    [uuid(),'VIO-2026-0001',mineIds[0],'Safety','critical','Ventilation','Inadequate ventilation in Level-4 gallery causing methane accumulation above permissible limits (3.8% CH4 detected vs 0.5% limit). Immediate risk of explosion.','2026-08-15',userIds[4],'open',500000,'CMR-2017-R2'],
    [uuid(),'VIO-2026-0002',mineIds[0],'Safety','high','Fire Safety','Fire extinguishers expired in 3 underground galleries. Fire drill not conducted in last 6 months.','2026-07-20',userIds[4],'action_taken',75000,'CMR-2017-R3'],
    [uuid(),'VIO-2026-0003',mineIds[3],'Environmental','critical','Water Pollution','Mine water discharge pH 9.8 detected. High concentration of iron (45 mg/L vs 3 mg/L limit) detected in nearby river tributaries.','2026-08-10',userIds[4],'under_review',1200000,'EP-ACT-2024-R2'],
    [uuid(),'VIO-2026-0004',mineIds[3],'Safety','high','Strata Control','Support pillars in seam 12 found undersized. Multiple roof falls recorded.','2026-07-30',userIds[4],'open',400000,'CMR-2017-R4'],
    [uuid(),'VIO-2026-0005',mineIds[5],'Labor','high','Working Hours','Workers forced to work 14-hour shifts without proper rest. 78 workers affected.','2026-06-25',userIds[4],'closed',250000,'MWR-1966-R1'],
    [uuid(),'VIO-2026-0006',mineIds[5],'Environmental','critical','Air Pollution','PM10 levels at 650 ug/m3 (limit: 100). Open burning of coal waste detected.','2026-07-05',userIds[4],'under_review',2000000,'EP-ACT-2024-R1'],
    [uuid(),'VIO-2026-0007',mineIds[1],'Safety','medium','Dust Control','Respirable dust levels 4.2 mg/m3 (limit: 3 mg/m3) in loading area.','2026-08-05',userIds[4],'action_taken',80000,'MSHA-2017-R1'],
    [uuid(),'VIO-2026-0008',mineIds[4],'Environmental','medium','Noise Pollution','Blast vibrations exceeding 10 mm/s (limit: 5 mm/s) at 500m from nearest habitation.','2026-07-18',userIds[4],'action_taken',100000,'EP-ACT-2024-R1'],
  ];
  violations.forEach(v => vStmt.run(...v));

  // Incidents
  const iStmt = db.prepare(`INSERT INTO incidents (id,incident_number,mine_id,type,severity,category,description,incident_date,location_in_mine,injuries_count,fatalities_count,affected_workers,status,reported_by,dgms_notified,dgms_notification_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const incidents = [
    [uuid(),'INC-2026-0001',mineIds[0],'Roof Fall','serious','Ground Control','Sudden roof collapse in Seam 14, Gallery C. Worker trapped for 3 hours. Extracted safely but sustained fractures.','2026-08-12 14:30:00','Seam 14, Gallery C, Level 3',1,0,1,'under_investigation',userIds[6],1,'2026-08-12'],
    [uuid(),'INC-2026-0002',mineIds[0],'Gas Ignition','serious','Explosion Risk','Methane ignition near coal face. 3 workers suffered burns.','2026-07-28 22:15:00','Seam 16, Level 4',3,0,3,'closed',userIds[6],1,'2026-07-29'],
    [uuid(),'INC-2026-0003',mineIds[3],'Inundation','serious','Water Hazard','Sudden water ingress from abandoned mine. 8 workers evacuated safely.','2026-07-22 08:45:00','North Wing, Level 5',0,0,8,'under_investigation',userIds[6],1,'2026-07-22'],
    [uuid(),'INC-2026-0004',mineIds[5],'Slope Failure','fatal','Ground Control','High wall failure on Eastern benches. Two workers fatally injured.','2026-06-18 16:20:00','Eastern Highwall, Bench 7',3,2,5,'closed',userIds[6],1,'2026-06-18'],
    [uuid(),'INC-2026-0005',mineIds[1],'Equipment Failure','minor','Mechanical','Hydraulic failure in shovel. Operator escaped injury.','2026-08-01 10:00:00','Bench 3, West Side',0,0,1,'closed',userIds[3],0,null],
    [uuid(),'INC-2026-0006',mineIds[4],'Near Miss','near_miss','Blasting','Premature detonation of blasting charge. No injuries.','2026-07-15 07:30:00','Blast Zone B-12',0,0,0,'closed',userIds[2],0,null],
  ];
  incidents.forEach(i => iStmt.run(...i));

  // Environmental readings (recent 30 readings)
  const eStmt = db.prepare(`INSERT INTO environmental_readings (id,mine_id,reading_type,parameter,value,unit,threshold_min,threshold_max,status,location,recorded_at,recorded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const dt = new Date(now.getTime() - i * 8 * 3600000).toISOString();
    const pm10_jh = 85 + Math.random()*80;
    const ch4_jh  = 0.3 + Math.random()*0.5;
    const pm10_kb = 55 + Math.random()*40;
    const ph_wb   = 8.5 + Math.random()*1.5;
    const so2_tl  = 150 + Math.random()*200;
    eStmt.run(uuid(),mineIds[0],'Air Quality','PM10',+pm10_jh.toFixed(4),'μg/m³',0,100,pm10_jh>150?'critical':pm10_jh>100?'warning':'normal','Mine Entrance',dt,userIds[7]);
    eStmt.run(uuid(),mineIds[0],'Gas Monitoring','CH4',+ch4_jh.toFixed(4),'%',0,0.5,ch4_jh>0.75?'critical':ch4_jh>0.5?'warning':'normal','Level 4 Gallery',dt,userIds[7]);
    eStmt.run(uuid(),mineIds[1],'Air Quality','PM10',+pm10_kb.toFixed(4),'μg/m³',0,100,pm10_kb>100?'warning':'normal','Loading Point',dt,userIds[7]);
    eStmt.run(uuid(),mineIds[3],'Water Quality','pH',+ph_wb.toFixed(4),'pH',6.5,8.5,ph_wb>8.5?'warning':'normal','Discharge Point',dt,userIds[7]);
    eStmt.run(uuid(),mineIds[5],'Air Quality','SO2',+so2_tl.toFixed(4),'μg/m³',0,80,'critical','Processing Area',dt,userIds[7]);
  }

  // Inspections
  const insStmt = db.prepare(`INSERT INTO inspections (id,inspection_number,mine_id,type,scheduled_date,completed_date,inspector_id,status,overall_score,findings,recommendations,follow_up_required) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insIds = [uuid(),uuid(),uuid(),uuid(),uuid(),uuid()];
  const insp = [
    [insIds[0],'INS-2026-0001',mineIds[0],'Routine Safety','2026-07-15','2026-07-16',userIds[4],'completed',68.5,'Methane concentration elevated in Level 4. Fire safety equipment inadequate.','Install additional ventilation. Replace expired fire extinguishers.',1],
    [insIds[1],'INS-2026-0002',mineIds[1],'Environmental Compliance','2026-08-01','2026-08-02',userIds[5],'completed',82.3,'Dust suppression adequate. Minor PM10 exceedance at loading point.','Upgrade water sprinkler system.',0],
    [insIds[2],'INS-2026-0003',mineIds[3],'Special Investigation','2026-06-10','2026-06-15',userIds[4],'completed',51.2,'Multiple violations found. Water discharge non-compliant. Strata control inadequate.','Immediate ETP installation. Stop work in critical areas.',1],
    [insIds[3],'INS-2026-0004',mineIds[2],'Routine Safety','2026-10-20',null,userIds[5],'scheduled',null,null,null,0],
    [insIds[4],'INS-2026-0005',mineIds[4],'Quarterly Review','2026-09-15',null,userIds[4],'scheduled',null,null,null,0],
    [insIds[5],'INS-2026-0006',mineIds[5],'Emergency Inspection','2026-05-20','2026-05-22',userIds[5],'completed',38.5,'Extreme non-compliance. Highwall failure hazard. Air quality critical.','Suspend operations. Complete highwall stability audit.',1],
  ];
  insp.forEach(i => insStmt.run(...i));

  // Checklist items for first 3 inspections
  const cats = ['Ventilation','Fire Safety','Strata Control','PPE','Electrical Safety','Emergency Procedures','First Aid','Dust Control'];
  const ckStmt = db.prepare(`INSERT INTO inspection_checklist (id,inspection_id,category,item_description,is_compliant,score,remarks) VALUES (?,?,?,?,?,?,?)`);
  for (let i = 0; i < 3; i++) {
    cats.forEach(cat => {
      const ok = Math.random() > 0.3 ? 1 : 0;
      ckStmt.run(uuid(),insIds[i],cat,`${cat} standards check`,ok,ok?80+Math.floor(Math.random()*20):20+Math.floor(Math.random()*30),ok?'Satisfactory':'Requires attention');
    });
  }

  // Documents
  const dStmt = db.prepare(`INSERT INTO documents (id,mine_id,title,type,category,file_name,file_path,file_size,mime_type,issue_date,expiry_date,issuing_authority,document_number,status,uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const docs = [
    [mineIds[0],'Mining Lease License - Jharia Central','License','Regulatory','ML-JH-001.pdf','/uploads/docs/ML-JH-001.pdf',245000,'application/pdf','2019-01-15','2026-12-31','Govt of Jharkhand','ML-JH-2019-001','expiring_soon'],
    [mineIds[0],'Environmental Clearance Certificate','Certificate','Environmental','EC-JH-001.pdf','/uploads/docs/EC-JH-001.pdf',312000,'application/pdf','2021-06-01','2026-05-31','MoEFCC','EC-2021-JH-001','expired'],
    [mineIds[1],'Mining Lease License - Korba Mine','License','Regulatory','ML-CG-002.pdf','/uploads/docs/ML-CG-002.pdf',198000,'application/pdf','2020-07-01','2027-06-30','Govt of Chhattisgarh','ML-CG-2020-002','active'],
    [mineIds[2],'Mining Lease License - Talcher Mine','License','Regulatory','ML-OD-003.pdf','/uploads/docs/ML-OD-003.pdf',215000,'application/pdf','2021-04-01','2028-03-31','Govt of Odisha','ML-OD-2021-003','active'],
    [mineIds[3],'Mining Lease License - Raniganj Mine','License','Regulatory','ML-WB-004.pdf','/uploads/docs/ML-WB-004.pdf',187000,'application/pdf','2018-01-01','2025-12-31','Govt of West Bengal','ML-WB-2018-004','expired'],
    [mineIds[3],'Water Use Permit','Permit','Environmental','WUP-WB-004.pdf','/uploads/docs/WUP-WB-004.pdf',145000,'application/pdf','2022-03-15','2025-03-14','WBPCB','WUP-2022-WB-004','expired'],
    [mineIds[4],'Mining Lease License - Singrauli Mine','License','Regulatory','ML-MP-005.pdf','/uploads/docs/ML-MP-005.pdf',230000,'application/pdf','2022-10-01','2029-09-30','Govt of MP','ML-MP-2022-005','active'],
    [mineIds[5],'Mining Lease License - Ramagundam Mine','License','Regulatory','ML-TL-006.pdf','/uploads/docs/ML-TL-006.pdf',176000,'application/pdf','2017-07-01','2024-06-30','Govt of Telangana','ML-TL-2017-006','expired'],
  ];
  docs.forEach(d => dStmt.run(uuid(),...d,userIds[2]));

  // Compliance records
  const crStmt = db.prepare(`INSERT INTO compliance_records (id,mine_id,category,parameter_name,required_value,actual_value,status,score,verified_by,verification_date) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const cr = [
    [mineIds[0],'Safety','Methane Monitoring System','Continuous sensors','Partial deployment','non_compliant',35,userIds[4],'2026-08-01'],
    [mineIds[0],'Safety','Fire Safety Equipment','Monthly inspection','Last inspected 6 months ago','non_compliant',20,userIds[4],'2026-08-01'],
    [mineIds[0],'Environmental','Dust Suppression','Active system','Partially operational','warning',60,userIds[4],'2026-08-01'],
    [mineIds[1],'Safety','PPE Compliance','100% workers','97% workers','warning',85,userIds[4],'2026-08-02'],
    [mineIds[1],'Environmental','PM10 Levels','<100 μg/m³','82 μg/m³','compliant',92,userIds[4],'2026-08-02'],
    [mineIds[2],'Safety','Emergency Response Plan','Updated annually','Updated 2026-01-15','compliant',95,userIds[4],'2026-08-20'],
    [mineIds[3],'Environmental','Effluent Treatment','ETP operational','No ETP installed','non_compliant',0,userIds[4],'2026-06-15'],
    [mineIds[3],'Safety','Strata Control Plan','DGMS approved plan','Plan outdated (2022)','non_compliant',25,userIds[4],'2026-06-15'],
    [mineIds[4],'Labor','Welfare Facilities','Per CMFAR 1959','Fully compliant','compliant',90,userIds[4],'2026-07-30'],
    [mineIds[5],'Safety','Highwall Stability','Quarterly survey','Last survey 2026-01-10','non_compliant',10,userIds[4],'2026-05-22'],
  ];
  cr.forEach(c => crStmt.run(uuid(),...c));

  // Regulations
  const regStmt = db.prepare(`INSERT INTO regulations (id,code,title,category,description,effective_date,issuing_authority,penalty_range,applicable_mine_types) VALUES (?,?,?,?,?,?,?,?,?)`);
  const regs = [
    ['CMR-2017-R1','Mines Act 1952 - Section 22: Notice of Accidents','Safety','Every manager of a mine shall, within two hours of occurrence of any accident causing death or serious bodily injury, send notice to the Inspector.','2017-01-01','DGMS','₹1,00,000 - ₹5,00,000','Underground,Opencast'],
    ['CMR-2017-R2','Coal Mines Regulations 2017 - Reg 104: Ventilation','Safety','Every underground coal mine shall be provided with adequate ventilation to dilute and render harmless inflammable and noxious gases.','2017-03-01','DGMS','₹50,000 - ₹2,00,000','Underground'],
    ['EP-ACT-2024-R1','Environment Protection Act - Air Quality Standards','Environmental','NAAQS standards for PM10, PM2.5, SO2, NOx shall be maintained within prescribed limits at all coal mine sites.','2024-01-01','CPCB/MoEFCC','₹1,00,000 - ₹25,00,000','Underground,Opencast'],
    ['CMR-2017-R3','CMR 2017 - Reg 168: Fire Prevention in Mines','Safety','Adequate fire-fighting equipment must be maintained and fire drills conducted every quarter.','2017-03-01','DGMS','₹25,000 - ₹1,00,000','Underground,Opencast'],
    ['MWR-1966-R1','Mines Workers Act - Labor Standards','Labor','Maximum working hours, minimum wages, and welfare facilities for mine workers must comply with prescribed standards.','1966-01-01','Ministry of Labour','₹10,000 - ₹1,00,000','Underground,Opencast'],
    ['CMR-2017-R4','CMR 2017 - Reg 188: Support and Strata Control','Safety','A suitable system of support shall be maintained in all underground workings to prevent falls of ground.','2017-03-01','DGMS','₹50,000 - ₹5,00,000','Underground'],
    ['EP-ACT-2024-R2','Water Pollution Control - Mine Water Discharge','Environmental','Mine water discharged to water bodies must meet prescribed standards for pH, suspended solids and heavy metals.','2024-01-01','CPCB/SPCB','₹25,000 - ₹5,00,000','Underground,Opencast'],
    ['MSHA-2017-R1','Mine Safety - Dust Control','Health','Respirable dust concentration must not exceed 3 mg/m³ in coal mines. Regular monitoring mandatory.','2017-01-01','DGMS','₹25,000 - ₹2,00,000','Underground,Opencast'],
  ];
  regs.forEach(r => regStmt.run(uuid(),...r));

  // Notifications
  const nStmt = db.prepare(`INSERT INTO notifications (id,user_id,mine_id,title,message,type,priority,is_read) VALUES (?,?,?,?,?,?,?,?)`);
  const notifs = [
    [userIds[0],mineIds[0],'🚨 Critical Methane Alert','Methane levels reached 3.8% at Jharia Central Mine Level 4. Immediate action required.','alert','critical',0],
    [userIds[2],mineIds[0],'⚠️ License Expiry Warning','Mining Lease License ML-JH-2019-001 expires on 31-Dec-2026. Renewal required.','deadline','high',0],
    [userIds[0],mineIds[5],'🔴 Mine Suspended','Ramagundam South Mine operations suspended due to critical safety violations.','violation','critical',0],
    [userIds[8],mineIds[3],'🔍 Inspection Report Available','Special investigation report for Raniganj Deep Mine ready. Score: 51.2/100.','info','high',0],
    [userIds[0],mineIds[3],'🚑 Incident Reported','Water inundation at Raniganj Deep Mine. 8 workers evacuated safely.','incident','critical',0],
    [userIds[1],null,'📊 Monthly Compliance Report','August 2026 compliance report generated. Average score: 71.2%.','info','medium',0],
  ];
  notifs.forEach(n => nStmt.run(uuid(),...n));

  // Audit logs
  const alStmt = db.prepare(`INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,mine_id,ip_address) VALUES (?,?,?,?,?,?,?,?)`);
  const al = [
    [userIds[4],'CREATE','violation',uuid(),'Created critical methane violation for Jharia Mine',mineIds[0],'192.168.1.1'],
    [userIds[0],'UPDATE','mine',mineIds[5],'Updated mine status to suspended for Ramagundam Mine',mineIds[5],'192.168.1.1'],
    [userIds[5],'CREATE','inspection',insIds[5],'Completed emergency inspection for Ramagundam South Mine',mineIds[5],'192.168.1.2'],
    [userIds[2],'UPLOAD','document',uuid(),'Uploaded Annual Safety Report for Jharia Central Mine',mineIds[0],'192.168.1.3'],
    [userIds[4],'CREATE','incident',uuid(),'Reported roof fall incident at Jharia Mine Seam 14',mineIds[0],'192.168.1.1'],
    [userIds[1],'VIEW','analytics',null,'Viewed national compliance analytics dashboard',null,'192.168.1.4'],
  ];
  al.forEach(a => alStmt.run(uuid(),...a));

  console.log('✅ Demo data seeded!');
});

insert();

console.log('\n📋 Demo Login Credentials:');
console.log('─────────────────────────────────────────────────');
console.log('Admin:               admin@khannetra.gov.in');
console.log('Govt Officer:        officer1@khannetra.gov.in');
console.log('Mine Manager:        manager1@khannetra.gov.in');
console.log('Inspector:           inspector1@khannetra.gov.in');
console.log('Safety Officer:      safety1@khannetra.gov.in');
console.log('Environment Officer: env1@khannetra.gov.in');
console.log('Password (all):      KhanNetra@2024');
console.log('─────────────────────────────────────────────────\n');

db.close();
