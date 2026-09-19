import axios from 'axios';
import toast from 'react-hot-toast';

/**
 * API base URL strategy:
 *   Dev:        Vite proxy forwards /api/v1 → http://localhost:5000/api/v1
 *               (set in vite.config.js — no CORS issue, no hardcoded IPs)
 *   Production: If API and frontend share the same origin, keep '/api/v1'.
 *               If API is on a different origin, set in client/.env.production:
 *                 VITE_API_URL=https://api.khannetra.yourdomain.in/api/v1
 */
const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
}, (err) => Promise.reject(err));

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const status = err.response?.status;
    const msg    = err.response?.data?.message || err.message || 'An error occurred';
    const url    = err.config?.url || '';

    // Auth routes handle their own errors — don't double-toast
    const isAuthRoute = url.includes('/auth/');

    if (status === 401) {
      // Clear stale credentials
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Only redirect if NOT already on login/register page and NOT an auth API call
      const onAuthPage = window.location.pathname.includes('/login') ||
                         window.location.pathname.includes('/register') ||
                         window.location.pathname.includes('/verify-email');
      if (!isAuthRoute && !onAuthPage) {
        // Use React Router navigation if possible, else hard redirect
        window.location.replace('/login');
      }
    } else if (status === 429) {
      // Rate limit — show once, not doubled
      if (!isAuthRoute) toast.error('Too many requests. Please wait and try again.');
    } else if (status && status !== 404 && status !== 400 && status !== 403 && status !== 409) {
      // Only show toast for unexpected server errors; let auth/form components handle 400/403/409
      if (!isAuthRoute) toast.error(msg);
    }

    return Promise.reject(err);
  }
);

export const authApi = {
  login:              (d)    => api.post('/auth/login', d),
  register:           (d)    => api.post('/auth/register', d),
  getMe:              ()     => api.get('/auth/me'),
  refresh:            (d)    => api.post('/auth/refresh', d),
  updateProfile:      (d)    => api.put('/auth/profile', d),
  changePassword:     (d)    => api.put('/auth/change-password', d),
  // Admin approval endpoints
  getPendingUsers:    (p)    => api.get('/auth/pending-users', { params: p }),
  approveUser:        (id,d) => api.post(`/auth/approve/${id}`, d || {}),
  rejectUser:         (id,d) => api.post(`/auth/reject/${id}`,  d || {}),
  suspendUser:        (id,d) => api.post(`/auth/suspend/${id}`, d || {}),
  // Legacy stubs — kept so old code that calls these doesn't crash
  verifyEmail:        ()     => Promise.resolve({ success: false, message: 'Email verification removed.' }),
  resendVerification: ()     => Promise.resolve({ success: false, message: 'Email verification removed.' }),
};

export const minesApi = {
  getAll:   (p)     => api.get('/mines',          { params: p }),
  search:   (q, l)  => api.get('/mines/search',   { params: { q, limit: l || 8 } }),
  getById:  (id)    => api.get(`/mines/${id}`),
  getStats: (id)    => api.get(`/mines/${id}/stats`),
  create:   (d)     => api.post('/mines', d),
  update:   (id, d) => api.put(`/mines/${id}`, d),
  delete:   (id)    => api.delete(`/mines/${id}`),
};

export const violationsApi = {
  getAll:                 (p)      => api.get('/violations', { params: p }),
  getById:                (id)     => api.get(`/violations/${id}`),
  create:                 (d)      => api.post('/violations', d),
  update:                 (id, d)  => api.put(`/violations/${id}`, d),
  delete:                 (id)     => api.delete(`/violations/${id}`),
  getCorrectiveActions:   (p)      => api.get('/violations/corrective-actions', { params: p }),
  createCorrectiveAction: (d)      => api.post('/violations/corrective-actions', d),
  updateCorrectiveAction: (id, d)  => api.put(`/violations/corrective-actions/${id}`, d),
};

export const incidentsApi = {
  getAll:   (p)     => api.get('/incidents', { params: p }),
  getById:  (id)    => api.get(`/incidents/${id}`),
  create:   (d)     => api.post('/incidents', d),
  update:   (id, d) => api.put(`/incidents/${id}`, d),
  getStats: ()      => api.get('/incidents/stats'),
};

export const safetyApi = {
  /* Dashboard */
  getDashboard:           (p)      => api.get('/safety/dashboard',                      { params: p }),
  /* Observations */
  getObservations:        (p)      => api.get('/safety/observations',                   { params: p }),
  getObservationById:     (id)     => api.get(`/safety/observations/${id}`),
  getObservationStats:    (p)      => api.get('/safety/observations/stats',             { params: p }),
  createObservation:      (fd)     => api.post('/safety/observations', fd,              { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateObservation:      (id, d)  => api.put(`/safety/observations/${id}`, d),
  uploadObservationPhoto: (id, fd) => api.post(`/safety/observations/${id}/photo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  /* Enhanced incident creation */
  createIncident:         (fd)     => api.post('/safety/incidents', fd,                { headers: { 'Content-Type': 'multipart/form-data' } }),
  /* Corrective Actions */
  getCAs:                 (p)      => api.get('/safety/corrective-actions',             { params: p }),
  getCAStats:             (p)      => api.get('/safety/corrective-actions/stats',       { params: p }),
  createCA:               (d)      => api.post('/safety/corrective-actions', d),
  updateCA:               (id, d)  => api.put(`/safety/corrective-actions/${id}`, d),
  markOverdue:            ()       => api.post('/safety/corrective-actions/mark-overdue'),
};

export const environmentApi = {
  getReadings:     (p)  => api.get('/environment',              { params: p }),
  createReading:   (d)  => api.post('/environment', d),
  updateReading:   (id, d) => api.put(`/environment/${id}`, d),
  deleteReading:   (id) => api.delete(`/environment/${id}`),
  getAlerts:       (p)  => api.get('/environment/alerts',        { params: p }),
  acknowledgeAlert:(id) => api.post(`/environment/alerts/${id}/acknowledge`),
  getDashboard:    (p)  => api.get('/environment/dashboard',     { params: p }),
  getTrends:       (p)  => api.get('/environment/trends',        { params: p }),
  getStats:        (p)  => api.get('/environment/stats',         { params: p }),
  getParameters:   ()   => api.get('/environment/parameters'),
  getLatestByMine: (id) => api.get(`/environment/mine/${id}/latest`),
  sensorIngest:    (d)  => api.post('/environment/sensor-ingest', d),
};

export const inspectionsApi = {
  getAll:                    (p)       => api.get('/inspections',                   { params: p }),
  getById:                   (id)      => api.get(`/inspections/${id}`),
  getStats:                  (p)       => api.get('/inspections/stats',             { params: p }),
  create:                    (d)       => api.post('/inspections', d),
  update:                    (id, d)   => api.put(`/inspections/${id}`, d),
  saveChecklist:             (d)       => api.post('/inspections/checklist', d),
  getSchedule:               (p)       => api.get('/inspections/schedule',          { params: p }),
  uploadPhoto:               (id, fd)  => api.post(`/inspections/${id}/photo`, fd,  { headers: { 'Content-Type': 'multipart/form-data' } }),
  getCorrectiveActions:      (id)      => api.get(`/inspections/${id}/corrective-actions`),
  createCorrectiveAction:    (id, d)   => api.post(`/inspections/${id}/corrective-actions`, d),
  updateCorrectiveAction:    (caId, d) => api.put(`/inspections/corrective-actions/${caId}`, d),
};

export const documentsApi = {
  getAll:          (p)     => api.get('/documents', { params: p }),
  getById:         (id)    => api.get(`/documents/${id}`),
  upload:          (fd)    => api.post('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update:          (id, d) => api.put(`/documents/${id}`, d),
  delete:          (id)    => api.delete(`/documents/${id}`),
  getExpiryAlerts: ()      => api.get('/documents/expiry-alerts'),
  analyze:         (id)    => api.post(`/documents/${id}/analyze`),
};

export const notificationsApi = {
  getAll:        (p)  => api.get('/notifications', { params: p }),
  getUnreadCount:()   => api.get('/notifications/unread-count'),
  markRead:      (id) => api.put(`/notifications/${id}/read`),
  markAllRead:   ()   => api.put('/notifications/all/read'),
  delete:        (id) => api.delete(`/notifications/${id}`),
};

export const analyticsApi = {
  getDashboard:         ()  => api.get('/analytics/dashboard'),
  getComplianceTrend:   (p) => api.get('/analytics/compliance-trend', { params: p }),
  getMineRanking:       ()  => api.get('/analytics/mine-ranking'),
  getViolationAnalytics:(p) => api.get('/analytics/violations', { params: p }),
  getProductionAnalytics:() => api.get('/analytics/production'),
  getAuditLogs:         (p) => api.get('/analytics/audit-logs', { params: p }),
  getRecurringViolations:(p)=> api.get('/analytics/recurring-violations', { params: p }),
  getAnomalies:         ()  => api.get('/analytics/anomalies'),
  getDashboardExtras:   ()  => api.get('/analytics/extras'),
};

export const complianceApi = {
  getRecords:         (p)     => api.get('/compliance/records',                { params: p }),
  create:             (d)     => api.post('/compliance/records', d),
  update:             (id, d) => api.put(`/compliance/records/${id}`, d),
  getDashboard:       (p)     => api.get('/compliance/dashboard',               { params: p }),
  getDeadlines:       (p)     => api.get('/compliance/deadlines',               { params: p }),
  submitRecord:       (id, d) => api.post(`/compliance/records/${id}/submit`,                d || {}),
  startVerification:  (id)    => api.post(`/compliance/records/${id}/start-verification`),
  approveRecord:      (id, d) => api.post(`/compliance/records/${id}/approve`,              d || {}),
  rejectRecord:       (id, d) => api.post(`/compliance/records/${id}/reject`,               d),
  getMineScore:       (id)    => api.get(`/compliance/mine/${id}/score`),
  runAiAssessment:    (id)    => api.post(`/compliance/mine/${id}/ai-assessment`),
  getRegulations:     (p)     => api.get('/compliance/regulations',             { params: p }),
  createRegulation:   (d)     => api.post('/compliance/regulations', d),
};

export const reportsApi = {
  preview:       (p) => api.get('/reports/preview', { params: p }),
  downloadPDF:   (p) => api.get('/reports/pdf',   { params: p, responseType: 'blob' }),
  downloadExcel: (p) => api.get('/reports/excel', { params: p, responseType: 'blob' }),
};

// ── Global Search ─────────────────────────────────────────────────────────────
export const searchApi = {
  search: (q, limit = 5) => api.get('/search', { params: { q, limit } }),
};

export const aiApi = {
  getStatus:         ()       => api.get('/ai/status'),
  chat:              (d)      => api.post('/ai/chat', d),
  getSessions:       ()       => api.get('/ai/chat/sessions'),
  getChatHistory:    (sid)    => api.get(`/ai/chat/${sid}`),
  deleteSession:     (sid)    => api.delete(`/ai/chat/${sid}`),
  clearSession:      (sid)    => api.delete(`/ai/chat/${sid}/clear`),
  getRiskPrediction: (id)     => api.get(`/ai/risk/${id}`),
  getUsers:          ()       => api.get('/ai/users'),
  updateUser:        (id, d)  => api.put(`/ai/users/${id}`, d),
};

// ── NEW: AI Safety Vision ─────────────────────────────────────────────────────
export const visionApi = {
  health:       ()   => api.get('/vision/health'),
  ppeReference: ()   => api.get('/vision/ppe-reference'),
  /**
   * Detect PPE in an image file.
   * @param {File}   imageFile
   * @param {object} opts  { mine_type, mine_id, location, min_confidence }
   */
  detect: (imageFile, opts = {}) => {
    const fd = new FormData();
    fd.append('image', imageFile);
    if (opts.mine_type)       fd.append('mine_type',       opts.mine_type);
    if (opts.mine_id)         fd.append('mine_id',         opts.mine_id);
    if (opts.location)        fd.append('location',        opts.location);
    if (opts.min_confidence)  fd.append('min_confidence',  String(opts.min_confidence));
    return api.post('/vision/detect', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 45000,
    });
  },
};

// ── Contractors ───────────────────────────────────────────────────────────────
export const contractorsApi = {
  getAll:             (p)     => api.get('/contractors',                      { params: p }),
  getById:            (id)    => api.get(`/contractors/${id}`),
  getStats:           (p)     => api.get('/contractors/stats',                { params: p }),
  getExpiryAlerts:    (p)     => api.get('/contractors/expiry-alerts',        { params: p }),
  getWorkers:         (id, p) => api.get(`/contractors/${id}/workers`,        { params: p }),
  create:             (d)     => api.post('/contractors', d),
  update:             (id, d) => api.put(`/contractors/${id}`, d),
  recalculate:        (id)    => api.post(`/contractors/${id}/recalculate`),
  delete:             (id)    => api.delete(`/contractors/${id}`),
};

// ── Field Reports ─────────────────────────────────────────────────────────────
export const fieldReportsApi = {
  getAll:   (p)     => api.get('/field-reports', { params: p }),
  getById:  (id)    => api.get(`/field-reports/${id}`),
  getMap:   (p)     => api.get('/field-reports/map', { params: p }),
  create:   (fd)    => api.post('/field-reports', fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update:   (id, d) => api.put(`/field-reports/${id}`, d),
};

// ── Compliance Deadlines ──────────────────────────────────────────────────────
export const deadlinesApi = {
  getAll:     (p)     => api.get('/deadlines', { params: p }),
  getOverdue: (p)     => api.get('/deadlines/overdue', { params: p }),
  getUpcoming:(p)     => api.get('/deadlines/upcoming', { params: p }),
  create:     (d)     => api.post('/deadlines', d),
  update:     (id, d) => api.put(`/deadlines/${id}`, d),
};

// ── Risk Dashboard ────────────────────────────────────────────────────────────
export const riskApi = {
  getHighRisk:     ()       => api.get('/risk/high-risk'),
  getRoleBased:    ()       => api.get('/risk/role-based'),
  getGis:          (p)      => api.get('/risk/gis',                   { params: p }),
  getPrediction:   (mineId) => api.get(`/risk/predict/${mineId}`),
  getFullAnalysis: (mineId) => api.get(`/risk/analysis/${mineId}`),
};

export default api;

// ── OCR Document Extractor ────────────────────────────────────────────────────
export const ocrApi = {
  health:        ()          => api.get('/ocr/health'),
  extract:       (formData)  => api.post('/ocr/extract', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 90000,  // Gemini can take up to 45s; give headroom
  }),
  save:          (body)      => api.post('/ocr/save', body),
  getHistory:    (p)         => api.get('/ocr/history',     { params: p }),
  getById:       (id)        => api.get(`/ocr/history/${id}`),
  deleteHistory: (id)        => api.delete(`/ocr/history/${id}`),
};

// ── Disaster Alert System ─────────────────────────────────────────────────────
export const disasterApi = {
  getActive:    ()         => api.get('/disaster/active'),
  getAlerts:    (p)        => api.get('/disaster/alerts',  { params: p }),
  getById:      (id)       => api.get('/disaster/alerts',  { params: { id } }),
  getHistory:   (p)        => api.get('/disaster/history', { params: p }),
  getStats:     ()         => api.get('/disaster/stats'),
  acknowledge:  (id)       => api.post(`/disaster/acknowledge/${id}`),
  resolve:      (id, data) => api.post(`/disaster/resolve/${id}`, data),
  createManual: (d)        => api.post('/disaster/create', d),
  createTest:   ()         => api.post('/disaster/test'),
  pollNow:      ()         => api.post('/disaster/poll'),
  runRuleEngine:(p)        => api.post('/disaster/rule-engine', {}, { params: p }),
};

// ── Production Monitoring ─────────────────────────────────────────────────────
export const productionApi = {
  getDashboard: (p)     => api.get('/production/dashboard',  { params: p }),
  getStats:     (p)     => api.get('/production/stats',      { params: p }),
  getRecords:   (p)     => api.get('/production/records',    { params: p }),
  createRecord: (d)     => api.post('/production/records', d),
  updateRecord: (id, d) => api.put(`/production/records/${id}`, d),
  getTrends:    (p)     => api.get('/production/trends',     { params: p }),
  getTargets:   (p)     => api.get('/production/targets',    { params: p }),
  setTarget:    (d)     => api.post('/production/targets', d),
  getMachinery: (p)     => api.get('/production/machinery',  { params: p }),
  addMachine:   (d)     => api.post('/production/machinery', d),
  updateMachine:(id, d) => api.put(`/production/machinery/${id}`, d),
  getAnalysis:  (p)     => api.get('/production/analysis',   { params: p }),
};

// ── Worker Attendance ─────────────────────────────────────────────────────────
export const attendanceApi = {
  getAll:         (p)     => api.get('/attendance',           { params: p }),
  getById:        (id)    => api.get(`/attendance/${id}`),
  getDailySummary:(p)     => api.get('/attendance/summary',   { params: p }),
  // Daily session: workers + merged attendance for a mine/date/shift
  getSession:     (p)     => api.get('/attendance/session',   { params: p }),
  // Bulk save a full day's attendance in one call
  bulkSave:       (d)     => api.post('/attendance/bulk', d),
  // Mark all workers in a session to the same status
  markAll:        (d)     => api.post('/attendance/mark-all', d),
  create:         (d)     => api.post('/attendance', d),
  update:         (id, d) => api.put(`/attendance/${id}`, d),
};

// ── Workers Registry ──────────────────────────────────────────────────────────
export const workersApi = {
  getAll:              (p)          => api.get('/workers',                         { params: p }),
  getById:             (id)         => api.get(`/workers/${id}`),
  getStats:            (p)          => api.get('/workers/stats',                   { params: p }),
  getHistory:          (id, p)      => api.get(`/workers/${id}/history`,           { params: p }),
  getCertTypes:        ()           => api.get('/workers/cert-types'),
  getExpiringCerts:    (p)          => api.get('/workers/expiring-certs',          { params: p }),
  getCertifications:   (id)         => api.get(`/workers/${id}/certifications`),
  addCertification:    (id, d)      => api.post(`/workers/${id}/certifications`, d),
  updateCertification: (id, cid, d) => api.put(`/workers/${id}/certifications/${cid}`, d),
  deleteCertification: (id, cid)    => api.delete(`/workers/${id}/certifications/${cid}`),
  create:              (d)          => api.post('/workers', d),
  update:              (id, d)      => api.put(`/workers/${id}`, d),
};

// ── Underground Mine Plans ────────────────────────────────────────────────────
export const minePlansApi = {
  getAll:          (p)     => api.get('/mine-plans',              { params: p }),
  getById:         (id)    => api.get(`/mine-plans/${id}`),
  getStats:        ()      => api.get('/mine-plans/stats'),
  search:          (p)     => api.get('/mine-plans/search',       { params: p }),
  upload:          (fd)    => api.post('/mine-plans', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 }),
  updateApproval:  (id, d) => api.put(`/mine-plans/${id}/approval`, d),
  compareVersions: (id, otherId) => api.get(`/mine-plans/${id}/compare/${otherId}`),
  getLayers:       (id)    => api.get(`/mine-plans/${id}/layers`),
  saveLayer:       (id, d) => api.post(`/mine-plans/${id}/layers`, d),
  deleteLayer:     (id, lid) => api.delete(`/mine-plans/${id}/layers/${lid}`),
  getAccessLogs:   (id)    => api.get(`/mine-plans/${id}/logs`),
  getAccess:       (id)    => api.get(`/mine-plans/${id}/access`),
  updateAccess:    (id, d) => api.put(`/mine-plans/${id}/access`, d),
};
