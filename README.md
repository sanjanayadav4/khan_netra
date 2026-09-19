# KhanNetra 🏔️⛏️

**AI-Based Smart Governance and Compliance Monitoring System for Coal Mines**

> *Intelligent Governance. Safer Mines. Smarter Compliance.*

Built for **SIH Problem Statement 24** — Directorate General of Mines Safety (DGMS), Ministry of Coal, Government of India.

---

## 🚀 Quick Start (3 Steps)

### Step 1 – Setup PostgreSQL Database

```bash
# 1. Create database in PostgreSQL
psql -U postgres -c "CREATE DATABASE khannetra;"

# 2. Run migrations
cd server
npm run migrate

# 3. Seed with demo data
npm run seed
```

### Step 2 – Start Backend

```bash
cd server
cp .env.example .env       # Edit DB credentials
npm install
npm run dev                # Starts on http://localhost:5000
```

### Step 3 – Start Frontend

```bash
cd client
npm install
npm run dev                # Starts on http://localhost:3000
```

Open **http://localhost:3000** in your browser.

---

## 🔑 Demo Login Credentials

| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@khannetra.gov.in | KhanNetra@2024 |
| **Govt Officer** | officer1@khannetra.gov.in | KhanNetra@2024 |
| **Mine Manager** | manager1@khannetra.gov.in | KhanNetra@2024 |
| **Inspector** | inspector1@khannetra.gov.in | KhanNetra@2024 |
| **Safety Officer** | safety1@khannetra.gov.in | KhanNetra@2024 |
| **Env. Officer** | env1@khannetra.gov.in | KhanNetra@2024 |

---

## ✨ Features

### Core Modules
- 🏠 **Smart Dashboard** — Real-time compliance scores, risk scores, KPIs, charts
- 🗺️ **Mine Management + GIS Map** — Interactive Leaflet map of all mines
- ⚠️ **Violations Tracking** — Report, track and resolve regulatory violations
- 🚨 **Incident Monitoring** — Accident/near-miss reporting with DGMS notification
- 🌿 **Environmental Monitoring** — Real-time air/water quality with threshold alerts
- 🔍 **Inspection Management** — Schedule, conduct and record inspection checklists
- 📄 **Document Management** — License/certificate tracking with expiry alerts
- ✅ **Compliance Monitoring** — Parameter-level compliance scoring
- 📚 **Regulations Database** — Full catalog of mining regulations

### AI & Intelligence
- 🤖 **AI Chatbot** — Intelligent responses to regulatory queries (OpenAI / built-in KB)
- 🧠 **AI Risk Prediction** — ML-based mine risk scoring and incident probability
- 📎 **Document Analysis** — AI-powered certificate and report analysis

### Reporting & Analytics
- 📊 **Interactive Charts** — Recharts: line, bar, pie, radar, area charts
- 📥 **PDF Reports** — Professional PDF generation with PDFKit
- 📊 **Excel Export** — Multi-sheet Excel reports with XLSX
- 🔍 **Audit Trail** — Complete tamper-evident activity log

### Administration
- 👥 **User Management** — Role-based access control (6 roles)
- 🔔 **Notifications** — Real-time alerts via Socket.IO
- 🔐 **JWT Auth** — Secure login with refresh token support

---

## 🏗️ Architecture

```
khanSetu11/
├── server/                     # Node.js + Express backend
│   ├── src/
│   │   ├── config/             # Database connection
│   │   ├── controllers/        # Business logic
│   │   │   ├── authController.js
│   │   │   ├── mineController.js
│   │   │   ├── violationController.js
│   │   │   ├── incidentController.js
│   │   │   ├── environmentController.js
│   │   │   ├── inspectionController.js
│   │   │   ├── documentController.js
│   │   │   ├── complianceController.js
│   │   │   ├── analyticsController.js
│   │   │   ├── notificationController.js
│   │   │   ├── reportController.js
│   │   │   └── aiController.js
│   │   ├── routes/             # Express routers
│   │   ├── middleware/         # Auth, upload, audit, error
│   │   ├── database/           # Schema, migrations, seed
│   │   └── index.js            # Server entry point
│   ├── uploads/                # File storage
│   └── .env                    # Environment config
│
└── client/                     # React + Vite frontend
    ├── src/
    │   ├── components/
    │   │   ├── layout/         # Sidebar, Navbar, Layout
    │   │   └── ui/             # Badge, Modal, ScoreBar, etc.
    │   ├── pages/              # All page components
    │   ├── services/api.js     # Axios API client
    │   ├── store/authStore.js  # Zustand state management
    │   └── utils/helpers.js    # Utility functions
    └── index.html
```

---

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.x
- **Database**: PostgreSQL 14+ with `pg` driver
- **Auth**: JWT (jsonwebtoken) + bcryptjs
- **AI**: OpenAI GPT-3.5 (optional) with built-in knowledge base
- **Reports**: PDFKit (PDF) + XLSX (Excel)
- **Real-time**: Socket.IO
- **Scheduler**: node-cron

### Frontend
- **Framework**: React 18 + Vite
- **Styling**: Tailwind CSS v3
- **Charts**: Recharts
- **Maps**: React-Leaflet + OpenStreetMap
- **State**: Zustand
- **Forms**: React Hook Form
- **HTTP**: Axios
- **Icons**: React Icons (Feather)

---

## 📡 API Reference

Base URL: `http://localhost:5000/api/v1`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Login |
| GET | `/mines` | List all mines |
| GET | `/analytics/dashboard` | Dashboard data |
| GET | `/violations` | List violations |
| GET | `/incidents` | List incidents |
| GET | `/environment` | Environmental readings |
| GET | `/inspections` | List inspections |
| GET | `/documents` | List documents |
| GET | `/compliance/records` | Compliance records |
| POST | `/ai/chat` | AI chatbot |
| GET | `/ai/risk/:mine_id` | Risk prediction |
| GET | `/reports/pdf` | Download PDF report |
| GET | `/reports/excel` | Download Excel report |

---

## 🌐 Environment Variables

See `server/.env.example` for full list.

Key variables:
```
DB_HOST=localhost
DB_NAME=khannetra
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your_secret_key
OPENAI_API_KEY=sk-...  # Optional
CLIENT_URL=http://localhost:3000
```

---

## 📊 Demo Data Included

- **6 Coal Mines** across Jharkhand, Chhattisgarh, Odisha, West Bengal, MP, Telangana
- **10 Users** across all roles
- **8 Violations** (critical to low severity)
- **6 Incidents** including fatal accidents
- **150+ Environmental readings** with anomalies
- **6 Inspections** with checklist data
- **9 Documents** with expiry scenarios
- **10 Compliance records**
- **6 Notifications** and **6 Audit logs**
- **8 Regulations** from CMR 2017, Mines Act, EP Act

---

## 🎯 SIH Problem Statement 24 Compliance

This system addresses all requirements of **SIH PS-24**:

| Requirement | Status |
|-------------|--------|
| AI-Based Compliance Monitoring | ✅ |
| Risk Prediction Engine | ✅ |
| Real-time Environmental Alerts | ✅ |
| Inspection Management | ✅ |
| Violation Tracking | ✅ |
| Document Management | ✅ |
| GIS Mine Map | ✅ |
| Multi-role Access Control | ✅ |
| Audit Trail | ✅ |
| Report Generation | ✅ |
| AI Chatbot for Regulations | ✅ |

---

## 👨‍💻 Development

```bash
# Backend only
cd server && npm run dev

# Frontend only
cd client && npm run dev

# Build frontend
cd client && npm run build
```

---

*© 2026 KhanNetra | DGMS, Ministry of Coal, Government of India*
