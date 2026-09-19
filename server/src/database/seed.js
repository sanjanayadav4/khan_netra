require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');

async function seed() {
  console.log('🌱 Seeding database with demo data...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear existing data
    await client.query('TRUNCATE TABLE audit_logs, chat_history, notifications, documents, inspection_checklist, inspections, environmental_readings, corrective_actions, violations, incidents, compliance_records, users, mines, regulations CASCADE');

    // ── MINES ──────────────────────────────────────────────────────────────────
    const mineIds = [uuidv4(), uuidv4(), uuidv4(), uuidv4(), uuidv4(), uuidv4()];
    const mines = [
      { id: mineIds[0], mine_id: 'MN-JH-001', name: 'Jharia Central Coal Mine', type: 'Underground', location_name: 'Jharia Coalfield', state: 'Jharkhand', district: 'Dhanbad', latitude: 23.7957, longitude: 86.4304, area_hectares: 2456.5, depth_meters: 350, production_capacity_mt: 2500000, current_production_mt: 2100000, owner_name: 'Rajesh Kumar Singh', owner_company: 'Bharat Coking Coal Ltd', contact_email: 'manager@jharia-ccl.gov.in', contact_phone: '+91-9876543210', status: 'active', compliance_score: 72.5, risk_score: 68.3, environmental_score: 65.2, safety_score: 71.8, workers_count: 1250, established_year: 1975, mining_method: 'Bord and Pillar', license_number: 'ML-JH-2019-001', license_expiry: '2026-12-31', last_inspection_date: '2026-07-15', next_inspection_date: '2026-10-15' },
      { id: mineIds[1], mine_id: 'MN-CG-002', name: 'Korba Opencast Mine', type: 'Opencast', location_name: 'Korba Coalfield', state: 'Chhattisgarh', district: 'Korba', latitude: 22.3595, longitude: 82.7501, area_hectares: 5678.2, depth_meters: 85, production_capacity_mt: 8000000, current_production_mt: 7500000, owner_name: 'Priya Sharma', owner_company: 'South Eastern Coalfields Ltd', contact_email: 'manager@korba-secl.gov.in', contact_phone: '+91-9876543211', status: 'active', compliance_score: 85.2, risk_score: 42.1, environmental_score: 78.9, safety_score: 88.5, workers_count: 875, established_year: 1982, mining_method: 'Shovel-Dumper', license_number: 'ML-CG-2020-002', license_expiry: '2027-06-30', last_inspection_date: '2026-08-01', next_inspection_date: '2026-11-01' },
      { id: mineIds[2], mine_id: 'MN-OD-003', name: 'Talcher Super Thermal Mine', type: 'Opencast', location_name: 'Talcher Coalfield', state: 'Odisha', district: 'Angul', latitude: 20.9517, longitude: 85.2322, area_hectares: 8920.0, depth_meters: 120, production_capacity_mt: 12000000, current_production_mt: 11200000, owner_name: 'Amit Patel', owner_company: 'Mahanadi Coalfields Ltd', contact_email: 'manager@talcher-mcl.gov.in', contact_phone: '+91-9876543212', status: 'active', compliance_score: 91.8, risk_score: 28.5, environmental_score: 89.3, safety_score: 93.2, workers_count: 620, established_year: 1980, mining_method: 'Dragline', license_number: 'ML-OD-2021-003', license_expiry: '2028-03-31', last_inspection_date: '2026-08-20', next_inspection_date: '2026-11-20' },
      { id: mineIds[3], mine_id: 'MN-WB-004', name: 'Raniganj Deep Mine', type: 'Underground', location_name: 'Raniganj Coalfield', state: 'West Bengal', district: 'Paschim Bardhaman', latitude: 23.6105, longitude: 87.1380, area_hectares: 1876.3, depth_meters: 450, production_capacity_mt: 1800000, current_production_mt: 1400000, owner_name: 'Sunita Devi', owner_company: 'Eastern Coalfields Ltd', contact_email: 'manager@raniganj-ecl.gov.in', contact_phone: '+91-9876543213', status: 'under_inspection', compliance_score: 58.4, risk_score: 82.7, environmental_score: 52.1, safety_score: 55.3, workers_count: 1890, established_year: 1965, mining_method: 'Long Wall', license_number: 'ML-WB-2018-004', license_expiry: '2025-12-31', last_inspection_date: '2026-06-10', next_inspection_date: '2026-09-10' },
      { id: mineIds[4], mine_id: 'MN-MP-005', name: 'Singrauli Central Mine', type: 'Opencast', location_name: 'Singrauli Coalfield', state: 'Madhya Pradesh', district: 'Singrauli', latitude: 24.1997, longitude: 82.6629, area_hectares: 6543.8, depth_meters: 95, production_capacity_mt: 10000000, current_production_mt: 9200000, owner_name: 'Vikram Yadav', owner_company: 'Northern Coalfields Ltd', contact_email: 'manager@singrauli-ncl.gov.in', contact_phone: '+91-9876543214', status: 'active', compliance_score: 79.6, risk_score: 55.4, environmental_score: 72.8, safety_score: 81.3, workers_count: 745, established_year: 1978, mining_method: 'Truck-Shovel', license_number: 'ML-MP-2022-005', license_expiry: '2029-09-30', last_inspection_date: '2026-07-30', next_inspection_date: '2026-10-30' },
      { id: mineIds[5], mine_id: 'MN-TL-006', name: 'Ramagundam South Mine', type: 'Underground', location_name: 'Godavari Coalfield', state: 'Telangana', district: 'Peddapalli', latitude: 18.7597, longitude: 79.4747, area_hectares: 3210.6, depth_meters: 280, production_capacity_mt: 3500000, current_production_mt: 2800000, owner_name: 'Kavitha Reddy', owner_company: 'Singareni Collieries Company Ltd', contact_email: 'manager@ramagundam-sccl.gov.in', contact_phone: '+91-9876543215', status: 'suspended', compliance_score: 45.2, risk_score: 91.3, environmental_score: 38.7, safety_score: 42.6, workers_count: 2100, established_year: 1958, mining_method: 'Bord and Pillar', license_number: 'ML-TL-2017-006', license_expiry: '2024-06-30', last_inspection_date: '2026-05-20', next_inspection_date: '2026-08-20' },
    ];

    for (const mine of mines) {
      await client.query(
        `INSERT INTO mines (id, mine_id, name, type, location_name, state, district, latitude, longitude,
         area_hectares, depth_meters, production_capacity_mt, current_production_mt, owner_name, owner_company,
         contact_email, contact_phone, status, compliance_score, risk_score, environmental_score, safety_score,
         workers_count, established_year, mining_method, primary_mineral, license_number, license_expiry,
         last_inspection_date, next_inspection_date) VALUES
         ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)`,
        [mine.id, mine.mine_id, mine.name, mine.type, mine.location_name, mine.state, mine.district,
         mine.latitude, mine.longitude, mine.area_hectares, mine.depth_meters, mine.production_capacity_mt,
         mine.current_production_mt, mine.owner_name, mine.owner_company, mine.contact_email, mine.contact_phone,
         mine.status, mine.compliance_score, mine.risk_score, mine.environmental_score, mine.safety_score,
         mine.workers_count, mine.established_year, mine.mining_method, 'Coal', mine.license_number,
         mine.license_expiry, mine.last_inspection_date, mine.next_inspection_date]
      );
    }

    // ── USERS ──────────────────────────────────────────────────────────────────
    const password = await bcrypt.hash('KhanNetra@2024', 10);
    const userIds = Array.from({ length: 10 }, () => uuidv4());
    const users = [
      { id: userIds[0], email: 'admin@khannetra.gov.in', full_name: 'Dr. Arvind Mishra', role: 'admin', designation: 'Director General', department: 'DGMS HQ', phone: '+91-9800000001', mine_id: null },
      { id: userIds[1], email: 'officer1@khannetra.gov.in', full_name: 'Shri Ravi Shankar', role: 'government_officer', designation: 'Joint Secretary', department: 'Ministry of Coal', phone: '+91-9800000002', mine_id: null },
      { id: userIds[2], email: 'manager1@khannetra.gov.in', full_name: 'Rajesh Kumar Singh', role: 'mine_manager', designation: 'Mine Manager', department: 'Jharia Central Coal Mine', phone: '+91-9876543210', mine_id: mineIds[0] },
      { id: userIds[3], email: 'manager2@khannetra.gov.in', full_name: 'Priya Sharma', role: 'mine_manager', designation: 'Mine Manager', department: 'Korba Opencast Mine', phone: '+91-9876543211', mine_id: mineIds[1] },
      { id: userIds[4], email: 'inspector1@khannetra.gov.in', full_name: 'Mohd. Arif Khan', role: 'inspector', designation: 'Inspector of Mines', department: 'DGMS Region-2', phone: '+91-9800000005', mine_id: null },
      { id: userIds[5], email: 'inspector2@khannetra.gov.in', full_name: 'Suresh Babu', role: 'inspector', designation: 'Senior Inspector', department: 'DGMS Region-3', phone: '+91-9800000006', mine_id: null },
      { id: userIds[6], email: 'safety1@khannetra.gov.in', full_name: 'Geeta Rani Verma', role: 'safety_officer', designation: 'Safety Officer', department: 'Jharia Central Coal Mine', phone: '+91-9800000007', mine_id: mineIds[0] },
      { id: userIds[7], email: 'env1@khannetra.gov.in', full_name: 'Dr. Anita Joshi', role: 'environment_officer', designation: 'Environmental Officer', department: 'CPCB', phone: '+91-9800000008', mine_id: null },
      { id: userIds[8], email: 'manager3@khannetra.gov.in', full_name: 'Sunita Devi', role: 'mine_manager', designation: 'Mine Manager', department: 'Raniganj Deep Mine', phone: '+91-9876543213', mine_id: mineIds[3] },
      { id: userIds[9], email: 'officer2@khannetra.gov.in', full_name: 'Krishnaswamy Iyer', role: 'government_officer', designation: 'Director (Mines Safety)', department: 'DGMS', phone: '+91-9800000010', mine_id: null },
    ];

    for (const u of users) {
      await client.query(
        `INSERT INTO users (id, email, password_hash, full_name, role, designation, department, phone, mine_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [u.id, u.email, password, u.full_name, u.role, u.designation, u.department, u.phone, u.mine_id]
      );
    }

    // ── REGULATIONS ────────────────────────────────────────────────────────────
    const regulations = [
      { code: 'CMR-2017-R1', title: 'Mines Act 1952 - Section 22: Notice of Accidents', category: 'Safety', description: 'Every manager of a mine shall, within two hours of occurrence of any accident causing death or serious bodily injury in or about a mine, send notice to the Inspector.', effective_date: '2017-01-01', issuing_authority: 'DGMS', penalty_range: '₹1,00,000 - ₹5,00,000', applicable_mine_types: ['Underground', 'Opencast'] },
      { code: 'CMR-2017-R2', title: 'Coal Mines Regulations 2017 - Reg 104: Ventilation', category: 'Safety', description: 'Every underground coal mine shall be provided with adequate ventilation to dilute and render harmless inflammable and noxious gases.', effective_date: '2017-03-01', issuing_authority: 'DGMS', penalty_range: '₹50,000 - ₹2,00,000', applicable_mine_types: ['Underground'] },
      { code: 'EP-ACT-2024-R1', title: 'Environment Protection Act - Air Quality Standards', category: 'Environmental', description: 'NAAQS standards for PM10, PM2.5, SO2, NOx shall be maintained within prescribed limits at all coal mine sites.', effective_date: '2024-01-01', issuing_authority: 'CPCB/MoEFCC', penalty_range: '₹1,00,000 - ₹25,00,000', applicable_mine_types: ['Underground', 'Opencast'] },
      { code: 'CMR-2017-R3', title: 'CMR 2017 - Reg 168: Fire Prevention in Mines', category: 'Safety', description: 'Adequate fire-fighting equipment must be maintained and fire drills conducted every quarter in all coal mines.', effective_date: '2017-03-01', issuing_authority: 'DGMS', penalty_range: '₹25,000 - ₹1,00,000', applicable_mine_types: ['Underground', 'Opencast'] },
      { code: 'MWR-1966-R1', title: 'Mines Workers (Regulation of Employment) Act - Labor Standards', category: 'Labor', description: 'Maximum working hours, minimum wages, and welfare facilities for mine workers must comply with prescribed standards.', effective_date: '1966-01-01', issuing_authority: 'Ministry of Labour', penalty_range: '₹10,000 - ₹1,00,000', applicable_mine_types: ['Underground', 'Opencast'] },
      { code: 'CMR-2017-R4', title: 'CMR 2017 - Reg 188: Support and Strata Control', category: 'Safety', description: 'A suitable system of support shall be maintained in all underground workings to prevent falls of ground.', effective_date: '2017-03-01', issuing_authority: 'DGMS', penalty_range: '₹50,000 - ₹5,00,000', applicable_mine_types: ['Underground'] },
      { code: 'EP-ACT-2024-R2', title: 'Water Pollution Control - Mine Water Discharge', category: 'Environmental', description: 'Mine water discharged to water bodies must meet prescribed standards for pH, suspended solids and heavy metals.', effective_date: '2024-01-01', issuing_authority: 'CPCB/SPCB', penalty_range: '₹25,000 - ₹5,00,000', applicable_mine_types: ['Underground', 'Opencast'] },
      { code: 'MSHA-2017-R1', title: 'Mine Safety and Health Administration Rules - Dust Control', category: 'Health', description: 'Respirable dust concentration must not exceed 3 mg/m³ in coal mines. Regular monitoring mandatory.', effective_date: '2017-01-01', issuing_authority: 'DGMS', penalty_range: '₹25,000 - ₹2,00,000', applicable_mine_types: ['Underground', 'Opencast'] },
    ];

    for (const reg of regulations) {
      await client.query(
        `INSERT INTO regulations (id, code, title, category, description, effective_date, issuing_authority, penalty_range, applicable_mine_types) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [uuidv4(), reg.code, reg.title, reg.category, reg.description, reg.effective_date, reg.issuing_authority, reg.penalty_range, reg.applicable_mine_types]
      );
    }

    // ── VIOLATIONS ─────────────────────────────────────────────────────────────
    const violationData = [
      { mine_id: mineIds[0], type: 'Safety', severity: 'critical', category: 'Ventilation', description: 'Inadequate ventilation in Level-4 gallery causing methane accumulation above permissible limits (3.8% CH4 detected vs 0.5% limit). Immediate risk of explosion.', detected_date: '2026-08-15', status: 'open', fine_amount: 500000, regulation_reference: 'CMR-2017-R2' },
      { mine_id: mineIds[0], type: 'Safety', severity: 'high', category: 'Fire Safety', description: 'Fire extinguishers expired in 3 underground galleries. Fire drill not conducted in last 6 months.', detected_date: '2026-07-20', status: 'action_taken', fine_amount: 75000, regulation_reference: 'CMR-2017-R3' },
      { mine_id: mineIds[3], type: 'Environmental', severity: 'critical', category: 'Water Pollution', description: 'Mine water discharge pH 9.8 (limit: 6.5-8.5). High concentration of iron (45 mg/L vs 3 mg/L limit) detected in nearby Damodar River tributaries.', detected_date: '2026-08-10', status: 'under_review', fine_amount: 1200000, regulation_reference: 'EP-ACT-2024-R2' },
      { mine_id: mineIds[3], type: 'Safety', severity: 'high', category: 'Strata Control', description: 'Support pillars in seam 12 found undersized. Multiple roof falls recorded in last 30 days. Emergency evacuation twice.', detected_date: '2026-07-30', status: 'open', fine_amount: 400000, regulation_reference: 'CMR-2017-R4' },
      { mine_id: mineIds[5], type: 'Labor', severity: 'high', category: 'Working Hours', description: 'Workers forced to work 14-hour shifts without proper rest periods. 78 workers affected. Mandatory overtime not compensated.', detected_date: '2026-06-25', status: 'closed', fine_amount: 250000, regulation_reference: 'MWR-1966-R1' },
      { mine_id: mineIds[5], type: 'Environmental', severity: 'critical', category: 'Air Pollution', description: 'PM10 levels at 650 μg/m³ (limit: 100 μg/m³). Open burning of coal waste detected. Mine operations partially suspended.', detected_date: '2026-07-05', status: 'under_review', fine_amount: 2000000, regulation_reference: 'EP-ACT-2024-R1' },
      { mine_id: mineIds[1], type: 'Safety', severity: 'medium', category: 'Dust Control', description: 'Respirable dust levels 4.2 mg/m³ (limit: 3 mg/m³) in loading area. Water sprinklers malfunctioning.', detected_date: '2026-08-05', status: 'action_taken', fine_amount: 80000, regulation_reference: 'MSHA-2017-R1' },
      { mine_id: mineIds[4], type: 'Environmental', severity: 'medium', category: 'Noise Pollution', description: 'Blast vibrations exceeding 10 mm/s (limit: 5 mm/s) at 500m from nearest habitation. Complaints from 3 villages.', detected_date: '2026-07-18', status: 'action_taken', fine_amount: 100000, regulation_reference: 'EP-ACT-2024-R1' },
    ];

    const violIds = [];
    let vNum = 1;
    for (const v of violationData) {
      const vid = uuidv4();
      violIds.push(vid);
      const vNumber = `VIO-2026-${String(vNum++).padStart(4, '0')}`;
      await client.query(
        `INSERT INTO violations (id, violation_number, mine_id, type, severity, category, description, detected_date, detected_by, status, fine_amount, regulation_reference) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [vid, vNumber, v.mine_id, v.type, v.severity, v.category, v.description, v.detected_date, userIds[4], v.status, v.fine_amount, v.regulation_reference]
      );
    }

    // ── CORRECTIVE ACTIONS ─────────────────────────────────────────────────────
    const corrActions = [
      { violation_id: violIds[0], mine_id: mineIds[0], action_description: 'Install additional ventilation fans in Level-4. Seal all gas leaks. Deploy continuous methane monitoring sensors. Stop work till safe levels achieved.', priority: 'critical', status: 'in_progress', due_date: '2026-08-25' },
      { violation_id: violIds[1], mine_id: mineIds[0], action_description: 'Replace all expired fire extinguishers. Conduct mandatory fire drill for all underground workers. Maintain quarterly drill schedule.', priority: 'high', status: 'completed', due_date: '2026-08-01', completed_date: '2026-07-28' },
      { violation_id: violIds[2], mine_id: mineIds[3], action_description: 'Install effluent treatment plant for mine water. Neutralize current discharge. Weekly water quality monitoring report to SPCB.', priority: 'critical', status: 'in_progress', due_date: '2026-09-15' },
      { violation_id: violIds[4], mine_id: mineIds[5], action_description: 'Immediately revert to 8-hour shift system. Pay overtime dues. Implement digital attendance monitoring system.', priority: 'high', status: 'completed', due_date: '2026-07-15', completed_date: '2026-07-10' },
    ];

    for (const ca of corrActions) {
      await client.query(
        `INSERT INTO corrective_actions (id, violation_id, mine_id, action_description, assigned_to, assigned_by, priority, status, due_date, completed_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [uuidv4(), ca.violation_id, ca.mine_id, ca.action_description, userIds[2], userIds[4], ca.priority, ca.status, ca.due_date, ca.completed_date || null]
      );
    }

    // ── INCIDENTS ──────────────────────────────────────────────────────────────
    const incidents = [
      { mine_id: mineIds[0], type: 'Roof Fall', severity: 'serious', category: 'Ground Control', description: 'Sudden roof collapse in Seam 14, Gallery C. Worker trapped for 3 hours. Extracted safely but sustained fractures.', incident_date: '2026-08-12 14:30:00', location: 'Seam 14, Gallery C, Level 3', injuries: 1, fatalities: 0, status: 'under_investigation', dgms_notified: true },
      { mine_id: mineIds[0], type: 'Gas Ignition', severity: 'serious', category: 'Explosion Risk', description: 'Methane ignition near coal face. Quick response by mine rescue team prevented major explosion. 3 workers suffered burns.', incident_date: '2026-07-28 22:15:00', location: 'Seam 16, Level 4', injuries: 3, fatalities: 0, status: 'closed', dgms_notified: true },
      { mine_id: mineIds[3], type: 'Inundation', severity: 'serious', category: 'Water Hazard', description: 'Sudden water ingress from abandoned mine workings. Emergency evacuation. 8 workers evacuated safely. Mine partially flooded.', incident_date: '2026-07-22 08:45:00', location: 'North Wing, Level 5', injuries: 0, fatalities: 0, status: 'under_investigation', dgms_notified: true },
      { mine_id: mineIds[5], type: 'Slope Failure', severity: 'fatal', category: 'Ground Control', description: 'High wall failure on Eastern benches. Two workers fatally injured. Major slope instability. Operations halted.', incident_date: '2026-06-18 16:20:00', location: 'Eastern Highwall, Bench 7', injuries: 3, fatalities: 2, status: 'closed', dgms_notified: true },
      { mine_id: mineIds[1], type: 'Equipment Failure', severity: 'minor', category: 'Mechanical', description: 'Hydraulic failure in shovel. Operator escaped injury. Machine inoperable for 2 days.', incident_date: '2026-08-01 10:00:00', location: 'Bench 3, West Side', injuries: 0, fatalities: 0, status: 'closed', dgms_notified: false },
      { mine_id: mineIds[4], type: 'Near Miss', severity: 'near_miss', category: 'Blasting', description: 'Premature detonation of blasting charge. No injuries but workers in evacuation zone. Blasting procedure review initiated.', incident_date: '2026-07-15 07:30:00', location: 'Blast Zone B-12', injuries: 0, fatalities: 0, status: 'closed', dgms_notified: false },
    ];

    let iNum = 1;
    for (const inc of incidents) {
      await client.query(
        `INSERT INTO incidents (id, incident_number, mine_id, type, severity, category, description, incident_date, location_in_mine, injuries_count, fatalities_count, affected_workers, status, reported_by, dgms_notified, dgms_notification_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [uuidv4(), `INC-2026-${String(iNum++).padStart(4, '0')}`, inc.mine_id, inc.type, inc.severity, inc.category, inc.description, inc.incident_date, inc.location, inc.injuries, inc.fatalities, inc.injuries + inc.fatalities, inc.status, userIds[6], inc.dgms_notified, inc.dgms_notified ? '2026-06-19' : null]
      );
    }

    // ── ENVIRONMENTAL READINGS ─────────────────────────────────────────────────
    const envReadings = [];
    const now = new Date();
    for (let i = 0; i < 30; i++) {
      const dt = new Date(now);
      dt.setHours(dt.getHours() - i * 8);
      envReadings.push({ mine_id: mineIds[0], reading_type: 'Air Quality', parameter: 'PM10', value: 85 + Math.random() * 80, unit: 'μg/m³', threshold_min: 0, threshold_max: 100, location: 'Mine Entrance', recorded_at: dt });
      envReadings.push({ mine_id: mineIds[0], reading_type: 'Air Quality', parameter: 'CH4', value: 0.3 + Math.random() * 0.5, unit: '%', threshold_min: 0, threshold_max: 0.5, location: 'Level 4 Gallery', recorded_at: dt });
      envReadings.push({ mine_id: mineIds[1], reading_type: 'Air Quality', parameter: 'PM10', value: 55 + Math.random() * 40, unit: 'μg/m³', threshold_min: 0, threshold_max: 100, location: 'Loading Point', recorded_at: dt });
      envReadings.push({ mine_id: mineIds[3], reading_type: 'Water Quality', parameter: 'pH', value: 8.5 + Math.random() * 1.5, unit: 'pH', threshold_min: 6.5, threshold_max: 8.5, location: 'Discharge Point', recorded_at: dt });
      envReadings.push({ mine_id: mineIds[5], reading_type: 'Air Quality', parameter: 'SO2', value: 150 + Math.random() * 200, unit: 'μg/m³', threshold_min: 0, threshold_max: 80, location: 'Processing Area', recorded_at: dt });
    }

    for (const er of envReadings) {
      let status = 'normal';
      if (er.threshold_max && er.value > er.threshold_max) status = er.value > er.threshold_max * 1.5 ? 'critical' : 'warning';
      await client.query(
        `INSERT INTO environmental_readings (id, mine_id, reading_type, parameter, value, unit, threshold_min, threshold_max, status, location, recorded_at, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [uuidv4(), er.mine_id, er.reading_type, er.parameter, er.value.toFixed(4), er.unit, er.threshold_min, er.threshold_max, status, er.location, er.recorded_at, userIds[7]]
      );
    }

    // ── INSPECTIONS ────────────────────────────────────────────────────────────
    const inspData = [
      { mine_id: mineIds[0], type: 'Routine Safety', scheduled_date: '2026-07-15', completed_date: '2026-07-16', inspector_id: userIds[4], status: 'completed', overall_score: 68.5, findings: 'Methane concentration elevated in Level 4. Fire safety equipment partially inadequate. Strata support satisfactory in most areas.', recommendations: 'Install additional ventilation. Replace expired fire extinguishers. Enhance methane monitoring.' },
      { mine_id: mineIds[1], type: 'Environmental Compliance', scheduled_date: '2026-08-01', completed_date: '2026-08-02', inspector_id: userIds[5], status: 'completed', overall_score: 82.3, findings: 'Dust suppression measures generally adequate. Minor exceedance in PM10 at loading point. Water management good.', recommendations: 'Upgrade water sprinkler system at loading area. Continue current dust suppression practices.' },
      { mine_id: mineIds[3], type: 'Special Investigation', scheduled_date: '2026-06-10', completed_date: '2026-06-15', inspector_id: userIds[4], status: 'completed', overall_score: 51.2, findings: 'Multiple serious violations found. Water discharge non-compliant. Strata control inadequate. Workers safety at risk.', recommendations: 'Immediate ETP installation. Stop work in critical areas. Overhaul support systems in Seam 12.' },
      { mine_id: mineIds[2], type: 'Routine Safety', scheduled_date: '2026-10-20', inspector_id: userIds[5], status: 'scheduled', overall_score: null, findings: null, recommendations: null },
      { mine_id: mineIds[4], type: 'Quarterly Review', scheduled_date: '2026-09-15', inspector_id: userIds[4], status: 'scheduled', overall_score: null, findings: null, recommendations: null },
      { mine_id: mineIds[5], type: 'Emergency Inspection', scheduled_date: '2026-05-20', completed_date: '2026-05-22', inspector_id: userIds[5], status: 'completed', overall_score: 38.5, findings: 'Extreme non-compliance. Highwall failure hazard. Air quality critical. Mandatory suspension recommended.', recommendations: 'Suspend operations. Complete highwall stability audit. Install air quality monitoring. Address all critical findings before resumption.' },
    ];

    const inspIds = [];
    let insNum = 1;
    for (const ins of inspData) {
      const iid = uuidv4();
      inspIds.push(iid);
      await client.query(
        `INSERT INTO inspections (id, inspection_number, mine_id, type, scheduled_date, completed_date, inspector_id, status, overall_score, findings, recommendations, follow_up_required) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [iid, `INS-2026-${String(insNum++).padStart(4, '0')}`, ins.mine_id, ins.type, ins.scheduled_date, ins.completed_date || null, ins.inspector_id, ins.status, ins.overall_score, ins.findings, ins.recommendations, ins.overall_score && ins.overall_score < 70]
      );
    }

    // ── CHECKLIST ITEMS ────────────────────────────────────────────────────────
    const checklistCategories = ['Ventilation', 'Fire Safety', 'Strata Control', 'Electrical Safety', 'First Aid', 'PPE', 'Dust Control', 'Emergency Procedures'];
    for (let i = 0; i < 3; i++) {
      if (!inspIds[i]) continue;
      for (const cat of checklistCategories) {
        const isCompliant = Math.random() > 0.3;
        await client.query(
          `INSERT INTO inspection_checklist (id, inspection_id, category, item_description, is_compliant, score, remarks) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [uuidv4(), inspIds[i], cat, `${cat} standards and equipment check`, isCompliant, isCompliant ? Math.floor(Math.random() * 20 + 80) : Math.floor(Math.random() * 40 + 20), isCompliant ? 'Satisfactory' : 'Requires immediate attention']
        );
      }
    }

    // ── DOCUMENTS ─────────────────────────────────────────────────────────────
    const docs = [
      { mine_id: mineIds[0], title: 'Mining Lease License - Jharia Central', type: 'License', category: 'Regulatory', file_name: 'ML-JH-001.pdf', issue_date: '2019-01-15', expiry_date: '2026-12-31', issuing_authority: 'Govt of Jharkhand', document_number: 'ML-JH-2019-001', status: 'expiring_soon' },
      { mine_id: mineIds[0], title: 'Environmental Clearance Certificate', type: 'Certificate', category: 'Environmental', file_name: 'EC-JH-001.pdf', issue_date: '2021-06-01', expiry_date: '2026-05-31', issuing_authority: 'MoEFCC', document_number: 'EC-2021-JH-001', status: 'expired' },
      { mine_id: mineIds[1], title: 'Mining Lease License - Korba Mine', type: 'License', category: 'Regulatory', file_name: 'ML-CG-002.pdf', issue_date: '2020-07-01', expiry_date: '2027-06-30', issuing_authority: 'Govt of Chhattisgarh', document_number: 'ML-CG-2020-002', status: 'active' },
      { mine_id: mineIds[2], title: 'Mining Lease License - Talcher Mine', type: 'License', category: 'Regulatory', file_name: 'ML-OD-003.pdf', issue_date: '2021-04-01', expiry_date: '2028-03-31', issuing_authority: 'Govt of Odisha', document_number: 'ML-OD-2021-003', status: 'active' },
      { mine_id: mineIds[3], title: 'Mining Lease License - Raniganj Mine', type: 'License', category: 'Regulatory', file_name: 'ML-WB-004.pdf', issue_date: '2018-01-01', expiry_date: '2025-12-31', issuing_authority: 'Govt of West Bengal', document_number: 'ML-WB-2018-004', status: 'expired' },
      { mine_id: mineIds[3], title: 'Water Use Permit', type: 'Permit', category: 'Environmental', file_name: 'WUP-WB-004.pdf', issue_date: '2022-03-15', expiry_date: '2025-03-14', issuing_authority: 'WBPCB', document_number: 'WUP-2022-WB-004', status: 'expired' },
      { mine_id: mineIds[4], title: 'Mining Lease License - Singrauli Mine', type: 'License', category: 'Regulatory', file_name: 'ML-MP-005.pdf', issue_date: '2022-10-01', expiry_date: '2029-09-30', issuing_authority: 'Govt of MP', document_number: 'ML-MP-2022-005', status: 'active' },
      { mine_id: mineIds[5], title: 'Mining Lease License - Ramagundam Mine', type: 'License', category: 'Regulatory', file_name: 'ML-TL-006.pdf', issue_date: '2017-07-01', expiry_date: '2024-06-30', issuing_authority: 'Govt of Telangana', document_number: 'ML-TL-2017-006', status: 'expired' },
      { mine_id: mineIds[0], title: 'Annual Safety Report 2025-26', type: 'Report', category: 'Safety', file_name: 'ASR-JH-001-2026.pdf', issue_date: '2026-04-30', expiry_date: '2027-04-30', issuing_authority: 'Mine Management', document_number: 'ASR-2026-JH-001', status: 'active' },
    ];

    for (const doc of docs) {
      await client.query(
        `INSERT INTO documents (id, mine_id, title, type, category, file_name, file_path, file_size, mime_type, issue_date, expiry_date, issuing_authority, document_number, status, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [uuidv4(), doc.mine_id, doc.title, doc.type, doc.category, doc.file_name, `/uploads/docs/${doc.file_name}`, Math.floor(Math.random() * 500000 + 100000), 'application/pdf', doc.issue_date, doc.expiry_date, doc.issuing_authority, doc.document_number, doc.status, userIds[2]]
      );
    }

    // ── COMPLIANCE RECORDS ─────────────────────────────────────────────────────
    const complianceItems = [
      { mine_id: mineIds[0], category: 'Safety', parameter_name: 'Methane Monitoring System', required_value: 'Continuous sensors', actual_value: 'Partial deployment', status: 'non_compliant', score: 35 },
      { mine_id: mineIds[0], category: 'Safety', parameter_name: 'Fire Safety Equipment', required_value: 'Monthly inspection', actual_value: 'Last inspected 6 months ago', status: 'non_compliant', score: 20 },
      { mine_id: mineIds[0], category: 'Environmental', parameter_name: 'Dust Suppression', required_value: 'Active system', actual_value: 'Partially operational', status: 'warning', score: 60 },
      { mine_id: mineIds[1], category: 'Safety', parameter_name: 'PPE Compliance', required_value: '100% workers', actual_value: '97% workers', status: 'warning', score: 85 },
      { mine_id: mineIds[1], category: 'Environmental', parameter_name: 'PM10 Levels', required_value: '<100 μg/m³', actual_value: '82 μg/m³', status: 'compliant', score: 92 },
      { mine_id: mineIds[2], category: 'Safety', parameter_name: 'Emergency Response Plan', required_value: 'Updated annually', actual_value: 'Updated 2026-01-15', status: 'compliant', score: 95 },
      { mine_id: mineIds[3], category: 'Environmental', parameter_name: 'Effluent Treatment', required_value: 'ETP operational', actual_value: 'No ETP installed', status: 'non_compliant', score: 0 },
      { mine_id: mineIds[3], category: 'Safety', parameter_name: 'Strata Control Plan', required_value: 'DGMS approved plan', actual_value: 'Plan outdated (2022)', status: 'non_compliant', score: 25 },
      { mine_id: mineIds[4], category: 'Labor', parameter_name: 'Welfare Facilities', required_value: 'Per CMFAR 1959', actual_value: 'Fully compliant', status: 'compliant', score: 90 },
      { mine_id: mineIds[5], category: 'Safety', parameter_name: 'Highwall Stability', required_value: 'Quarterly survey', actual_value: 'Last survey 2026-01-10', status: 'non_compliant', score: 10 },
    ];

    for (const cr of complianceItems) {
      await client.query(
        `INSERT INTO compliance_records (id, mine_id, category, parameter_name, required_value, actual_value, status, score, verified_by, verification_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [uuidv4(), cr.mine_id, cr.category, cr.parameter_name, cr.required_value, cr.actual_value, cr.status, cr.score, userIds[4], '2026-08-01']
      );
    }

    // ── NOTIFICATIONS ──────────────────────────────────────────────────────────
    const notifs = [
      { user_id: userIds[0], mine_id: mineIds[0], title: '🚨 Critical Methane Alert', message: 'Methane levels reached 3.8% at Jharia Central Mine Level 4. Immediate action required.', type: 'alert', priority: 'critical' },
      { user_id: userIds[2], mine_id: mineIds[0], title: '⚠️ License Expiry Warning', message: 'Mining Lease License ML-JH-2019-001 expires on 31-Dec-2026. Renewal application must be submitted.', type: 'deadline', priority: 'high' },
      { user_id: userIds[0], mine_id: mineIds[5], title: '🔴 Mine Suspended', message: 'Ramagundam South Mine operations suspended due to critical safety violations. Compliance report needed.', type: 'violation', priority: 'critical' },
      { user_id: userIds[8], mine_id: mineIds[3], title: '🔍 Inspection Report Available', message: 'Special investigation report for Raniganj Deep Mine is ready. Score: 51.2/100.', type: 'info', priority: 'high' },
      { user_id: userIds[0], mine_id: mineIds[3], title: '🚑 Incident Reported', message: 'Water inundation at Raniganj Deep Mine North Wing. 8 workers evacuated safely. DGMS notified.', type: 'incident', priority: 'critical' },
      { user_id: userIds[1], mine_id: null, title: '📊 Monthly Compliance Report', message: 'August 2026 compliance report generated. Average score: 71.2%. 3 mines below threshold.', type: 'info', priority: 'medium' },
    ];

    for (const n of notifs) {
      await client.query(
        `INSERT INTO notifications (id, user_id, mine_id, title, message, type, priority, is_read) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [uuidv4(), n.user_id, n.mine_id, n.title, n.message, n.type, n.priority, false]
      );
    }

    // ── AUDIT LOGS ─────────────────────────────────────────────────────────────
    const auditEvents = [
      { user_id: userIds[4], action: 'CREATE', entity_type: 'violation', description: 'Created critical violation for methane levels at Jharia Mine', mine_id: mineIds[0] },
      { user_id: userIds[0], action: 'UPDATE', entity_type: 'mine', description: 'Updated mine status to suspended for Ramagundam Mine', mine_id: mineIds[5] },
      { user_id: userIds[5], action: 'CREATE', entity_type: 'inspection', description: 'Completed emergency inspection for Ramagundam South Mine', mine_id: mineIds[5] },
      { user_id: userIds[2], action: 'UPLOAD', entity_type: 'document', description: 'Uploaded Annual Safety Report for Jharia Central Mine', mine_id: mineIds[0] },
      { user_id: userIds[4], action: 'CREATE', entity_type: 'incident', description: 'Reported roof fall incident at Jharia Mine Seam 14', mine_id: mineIds[0] },
      { user_id: userIds[1], action: 'VIEW', entity_type: 'analytics', description: 'Viewed national compliance analytics dashboard', mine_id: null },
    ];

    for (const al of auditEvents) {
      await client.query(
        `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, description, mine_id, ip_address) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [uuidv4(), al.user_id, al.action, al.entity_type, uuidv4(), al.description, al.mine_id, '192.168.1.1']
      );
    }

    await client.query('COMMIT');
    console.log('✅ Database seeded successfully with demo data!');
    console.log('\n📋 Demo Login Credentials:');
    console.log('─────────────────────────────────────────────');
    console.log('Admin:              admin@khannetra.gov.in');
    console.log('Govt Officer:       officer1@khannetra.gov.in');
    console.log('Mine Manager:       manager1@khannetra.gov.in');
    console.log('Inspector:          inspector1@khannetra.gov.in');
    console.log('Safety Officer:     safety1@khannetra.gov.in');
    console.log('Environment Officer: env1@khannetra.gov.in');
    console.log('Password (all):     KhanNetra@2024');
    console.log('─────────────────────────────────────────────\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', err.message, err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
