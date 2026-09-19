-- KhanNetra Database Schema
-- AI-Based Smart Governance and Compliance Monitoring System for Coal Mines

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'government_officer', 'mine_manager', 'inspector', 'safety_officer', 'environment_officer')),
  phone VARCHAR(20),
  designation VARCHAR(255),
  department VARCHAR(255),
  mine_id UUID,
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Mines table
CREATE TABLE IF NOT EXISTS mines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mine_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  location_name VARCHAR(255) NOT NULL,
  state VARCHAR(100) NOT NULL,
  district VARCHAR(100) NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  area_hectares DECIMAL(10, 2),
  depth_meters DECIMAL(10, 2),
  production_capacity_mt DECIMAL(15, 2),
  current_production_mt DECIMAL(15, 2) DEFAULT 0,
  owner_name VARCHAR(255) NOT NULL,
  owner_company VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(20),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'under_inspection', 'closed')),
  compliance_score DECIMAL(5, 2) DEFAULT 0,
  risk_score DECIMAL(5, 2) DEFAULT 0,
  environmental_score DECIMAL(5, 2) DEFAULT 0,
  safety_score DECIMAL(5, 2) DEFAULT 0,
  workers_count INTEGER DEFAULT 0,
  established_year INTEGER,
  mining_method VARCHAR(100),
  primary_mineral VARCHAR(100) DEFAULT 'Coal',
  license_number VARCHAR(100),
  license_expiry DATE,
  last_inspection_date DATE,
  next_inspection_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add foreign key after mines table exists
ALTER TABLE users ADD CONSTRAINT fk_users_mine FOREIGN KEY (mine_id) REFERENCES mines(id) ON DELETE SET NULL;

-- Compliance records
CREATE TABLE IF NOT EXISTS compliance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mine_id UUID NOT NULL REFERENCES mines(id) ON DELETE CASCADE,
  category VARCHAR(100) NOT NULL,
  parameter_name VARCHAR(255) NOT NULL,
  required_value VARCHAR(255),
  actual_value VARCHAR(255),
  status VARCHAR(50) DEFAULT 'compliant' CHECK (status IN ('compliant', 'non_compliant', 'warning', 'pending')),
  score DECIMAL(5, 2) DEFAULT 0,
  notes TEXT,
  verified_by UUID REFERENCES users(id),
  verification_date DATE,
  due_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Violations
CREATE TABLE IF NOT EXISTS violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  violation_number VARCHAR(50) UNIQUE NOT NULL,
  mine_id UUID NOT NULL REFERENCES mines(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  category VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  detected_date DATE NOT NULL,
  detected_by UUID REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'action_taken', 'closed', 'appealed')),
  fine_amount DECIMAL(15, 2) DEFAULT 0,
  fine_paid BOOLEAN DEFAULT false,
  corrective_action TEXT,
  corrective_deadline DATE,
  closed_date DATE,
  closed_by UUID REFERENCES users(id),
  regulation_reference VARCHAR(255),
  evidence_files TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Corrective Actions
CREATE TABLE IF NOT EXISTS corrective_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  violation_id UUID NOT NULL REFERENCES violations(id) ON DELETE CASCADE,
  mine_id UUID NOT NULL REFERENCES mines(id) ON DELETE CASCADE,
  action_description TEXT NOT NULL,
  assigned_to UUID REFERENCES users(id),
  assigned_by UUID REFERENCES users(id),
  priority VARCHAR(50) DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue', 'cancelled')),
  due_date DATE,
  completed_date DATE,
  completion_notes TEXT,
  evidence_files TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Incidents
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_number VARCHAR(50) UNIQUE NOT NULL,
  mine_id UUID NOT NULL REFERENCES mines(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) NOT NULL CHECK (severity IN ('fatal', 'serious', 'minor', 'near_miss')),
  category VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  incident_date TIMESTAMP NOT NULL,
  location_in_mine VARCHAR(255),
  injuries_count INTEGER DEFAULT 0,
  fatalities_count INTEGER DEFAULT 0,
  affected_workers INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'under_investigation', 'closed', 'reported_to_dgms')),
  reported_by UUID REFERENCES users(id),
  investigated_by UUID REFERENCES users(id),
  root_cause TEXT,
  corrective_measures TEXT,
  dgms_notified BOOLEAN DEFAULT false,
  dgms_notification_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Environmental readings
CREATE TABLE IF NOT EXISTS environmental_readings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mine_id UUID NOT NULL REFERENCES mines(id) ON DELETE CASCADE,
  reading_type VARCHAR(100) NOT NULL,
  parameter VARCHAR(100) NOT NULL,
  value DECIMAL(15, 4) NOT NULL,
  unit VARCHAR(50),
  threshold_min DECIMAL(15, 4),
  threshold_max DECIMAL(15, 4),
  status VARCHAR(50) DEFAULT 'normal' CHECK (status IN ('normal', 'warning', 'critical', 'alert')),
  location VARCHAR(255),
  recorded_at TIMESTAMP DEFAULT NOW(),
  recorded_by UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Inspections
CREATE TABLE IF NOT EXISTS inspections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_number VARCHAR(50) UNIQUE NOT NULL,
  mine_id UUID NOT NULL REFERENCES mines(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  scheduled_date DATE NOT NULL,
  completed_date DATE,
  inspector_id UUID REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'rescheduled')),
  overall_score DECIMAL(5, 2),
  findings TEXT,
  recommendations TEXT,
  follow_up_required BOOLEAN DEFAULT false,
  follow_up_date DATE,
  report_file VARCHAR(255),
  checklist_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Inspection checklist items
CREATE TABLE IF NOT EXISTS inspection_checklist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  category VARCHAR(100) NOT NULL,
  item_description TEXT NOT NULL,
  is_compliant BOOLEAN,
  score INTEGER DEFAULT 0,
  remarks TEXT,
  evidence_file VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Documents
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mine_id UUID NOT NULL REFERENCES mines(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  category VARCHAR(100) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),
  issue_date DATE,
  expiry_date DATE,
  issuing_authority VARCHAR(255),
  document_number VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'expiring_soon', 'revoked', 'pending')),
  ai_analysis TEXT,
  ai_risk_flags TEXT[],
  uploaded_by UUID REFERENCES users(id),
  verified_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  mine_id UUID REFERENCES mines(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('alert', 'warning', 'info', 'success', 'deadline', 'violation', 'incident')),
  priority VARCHAR(50) DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  is_read BOOLEAN DEFAULT false,
  action_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Regulations
CREATE TABLE IF NOT EXISTS regulations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(500) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  effective_date DATE,
  last_updated DATE,
  issuing_authority VARCHAR(255),
  penalty_range VARCHAR(255),
  applicable_mine_types TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  mine_id UUID REFERENCES mines(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Analytics cache
CREATE TABLE IF NOT EXISTS analytics_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cache_key VARCHAR(255) UNIQUE NOT NULL,
  data JSONB NOT NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- AI chat history
CREATE TABLE IF NOT EXISTS chat_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  tokens_used INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_mines_status ON mines(status);
CREATE INDEX IF NOT EXISTS idx_mines_state ON mines(state);
CREATE INDEX IF NOT EXISTS idx_violations_mine_id ON violations(mine_id);
CREATE INDEX IF NOT EXISTS idx_violations_status ON violations(status);
CREATE INDEX IF NOT EXISTS idx_violations_severity ON violations(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_mine_id ON incidents(mine_id);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_environmental_mine_id ON environmental_readings(mine_id);
CREATE INDEX IF NOT EXISTS idx_environmental_reading_type ON environmental_readings(reading_type);
CREATE INDEX IF NOT EXISTS idx_inspections_mine_id ON inspections(mine_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(status);
CREATE INDEX IF NOT EXISTS idx_documents_mine_id ON documents(mine_id);
CREATE INDEX IF NOT EXISTS idx_documents_expiry ON documents(expiry_date);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_compliance_mine_id ON compliance_records(mine_id);
