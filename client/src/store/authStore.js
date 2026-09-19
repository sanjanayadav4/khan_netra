import { create } from 'zustand';
import { authApi } from '../services/api';

/* ── Safe localStorage helpers ────────────────────────────────────── */
function getSavedToken() {
  const t = localStorage.getItem('token');
  // Guard against stale "undefined" / "null" strings from previous bad sessions
  return (t && t !== 'undefined' && t !== 'null') ? t : null;
}
function getSavedUser() {
  try {
    const u = localStorage.getItem('user');
    if (!u || u === 'undefined' || u === 'null') return null;
    return JSON.parse(u);
  } catch { return null; }
}

const useAuthStore = create((set, get) => ({
  user:            getSavedUser(),
  token:           getSavedToken(),
  isAuthenticated: !!getSavedToken(),
  loading: false,

  login: async (credentials) => {
    set({ loading: true });
    try {
      const res = await authApi.login(credentials);
      const payload = res?.data ?? res;
      const { user, token } = payload || {};
      if (!token || token === 'undefined') {
        throw new Error('Invalid token received from server');
      }
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, token, isAuthenticated: true, loading: false });
      return { success: true };
    } catch (err) {
      set({ loading: false });
      const data   = err.response?.data || {};
      const status = err.response?.status;
      // Map status codes from approval-based auth
      const code = status === 429 ? 'RATE_LIMITED' : (data.code || null);
      return {
        success: false,
        message: status === 429
          ? 'Too many login attempts. Please wait 15 minutes and try again.'
          : (data.message || 'Sign in failed.'),
        code,
        status,
      };
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ user: null, token: null, isAuthenticated: false });
  },

  refreshUser: async () => {
    try {
      const res = await authApi.getMe();
      // api.js interceptor unwraps res.data; handle both shapes
      const user = res.data ?? res;
      localStorage.setItem('user', JSON.stringify(user));
      set({ user });
    } catch {}
  },

  hasRole: (...roles) => {
    const user = get().user;
    return user && roles.includes(user.role);
  },

  canAccess: (requiredRoles) => {
    const user = get().user;
    if (!user) return false;
    if (!requiredRoles || requiredRoles.length === 0) return true;
    return requiredRoles.includes(user.role);
  },
}));

export default useAuthStore;
