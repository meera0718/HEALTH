import { supabase } from './supabase';

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  role: 'INVESTIGATOR' | 'DOCTOR' | 'SECURITY_ADMIN' | 'UNAUTHORIZED';
  authorized: boolean;
  token?: string;
}

export interface UnauthorizedErrorPayload {
  isUnauthorizedAttempt: true;
  account: string;
  status: string;
  timestamp: string;
  source: string;
  severity: string;
}

const TOKEN_KEY = 'hsx_jwt_token';
const USER_KEY = 'hsx_user_profile';

export const auth = {
  isAuthenticated(): boolean {
    const token = localStorage.getItem(TOKEN_KEY);
    return !!token;
  },

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  getCurrentUser(): UserProfile | null {
    const userStr = localStorage.getItem(USER_KEY);
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch {
        // ignore
      }
    }
    return null;
  },

  async loginWithCredentials(email: string, password: string): Promise<UserProfile> {
    const cleanEmail = email.trim().toLowerCase();

    // Use backend to securely authenticate via Supabase Token API and verify Investigator status
    try {
      const res = await fetch('/api/v1/auth/password-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password })
      });

      if (!res.ok) {
        let errorMsg = 'Account not registered';
        try {
          const errJson = await res.json();
          if (errJson.detail) errorMsg = errJson.detail;
        } catch (_) {}
        const err = new Error(errorMsg);
        
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        const unauthPayload: UnauthorizedErrorPayload = {
          isUnauthorizedAttempt: true,
          account: cleanEmail || 'unknown_user_47',
          status: 'ACCESS DENIED',
          timestamp,
          source: '192.168.1.105 (External Public IP)',
          severity: 'HIGH'
        };
        (err as any).unauthPayload = unauthPayload;
        throw err;
      }

      const data = await res.json();
      const profile: UserProfile = data.user_profile;
      localStorage.setItem(TOKEN_KEY, profile.token || `hsx_jwt_${cleanEmail}`);
      localStorage.setItem(USER_KEY, JSON.stringify(profile));
      return profile;

    } catch (err: any) {
      if (err.unauthPayload) throw err;
      throw new Error(`UNAUTHORIZED ACCESS ATTEMPT DETECTED: Access denied for ${cleanEmail}`);
    }
  },

  async registerFace(accountId: string, faceImageB64?: string): Promise<{ success: boolean; message: string }> {
    const cleanAccount = accountId.trim();
    if (!cleanAccount) {
      throw new Error('Please enter an Account ID for face registration.');
    }

    try {
      const res = await fetch('/api/v1/auth/register-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: cleanAccount,
          face_image_b64: faceImageB64 || 'registration_camera_capture'
        })
      });

      if (!res.ok) {
        let errorMsg = `Face registration failed for ${cleanAccount}.`;
        try {
          const errJson = await res.json();
          if (errJson.detail) errorMsg = errJson.detail;
        } catch (_) {}
        throw new Error(errorMsg);
      }

      return await res.json();
    } catch (err: any) {
      throw err;
    }
  },

  async checkFaceStatus(accountId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/v1/auth/face-status/${encodeURIComponent(accountId.trim())}`);
      if (res.ok) {
        const data = await res.json();
        return !!data.registered;
      }
    } catch (_) {}
    return false;
  },

  async loginWithFace(accountId: string, faceImageB64?: string, livenessPassed: boolean = true): Promise<UserProfile> {
    const cleanAccount = accountId.trim();
    if (!cleanAccount) {
      throw new Error('Please enter a Doctor, Patient, or User ID for face verification.');
    }

    try {
      const res = await fetch('/api/v1/auth/verify-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: cleanAccount,
          face_image_b64: faceImageB64 || 'live_camera_capture',
          liveness_passed: livenessPassed
        })
      });

      if (!res.ok) {
        let errorMsg = `Face verification failed for ${cleanAccount}.`;
        try {
          const errJson = await res.json();
          if (errJson.detail) errorMsg = errJson.detail;
        } catch (_) {}
        throw new Error(errorMsg);
      }

      const data = await res.json();
      const profile: UserProfile = data.user_profile;
      localStorage.setItem(TOKEN_KEY, profile.token || `hsx_jwt_${cleanAccount}`);
      localStorage.setItem(USER_KEY, JSON.stringify(profile));
      return profile;
    } catch (err: any) {
      throw err;
    }
  },

  async checkPersistedSession(): Promise<UserProfile | null> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;

    try {
      const res = await fetch('/api/v1/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const profile: UserProfile = await res.json();
        if (!profile.name) {
          profile.name = profile.role === 'DOCTOR' ? 'Dr. Sarah Lin, MD' : 'Dr. Alexander Doe';
        }
        localStorage.setItem(USER_KEY, JSON.stringify(profile));
        return profile;
      }
    } catch {
      // no fallback
    }
    
    // Check if there is a cached user profile from a successful login
    const userStr = localStorage.getItem(USER_KEY);
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch {
        // ignore
      }
    }
    
    return null;
  },

  async logout(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  async getInvestigators(): Promise<Array<{account_id: string, full_name: string}>> {
    try {
      const res = await fetch('/api/v1/auth/investigators');
      if (res.ok) {
        return await res.json();
      }
    } catch (_) {}
    return [];
  },

  async addInvestigator(email: string, password: string, fullName: string): Promise<void> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error('Not authenticated');

    const res = await fetch('/api/v1/auth/investigators', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ email, password, full_name: fullName })
    });
    if (!res.ok) {
      let errorMsg = 'Failed to add investigator';
      try {
        const errJson = await res.json();
        if (errJson.detail) errorMsg = errJson.detail;
      } catch (_) {}
      throw new Error(errorMsg);
    }
  },

  async removeInvestigator(accountId: string): Promise<void> {
    const token = this.getToken();
    const res = await fetch(`/api/v1/auth/investigators/${encodeURIComponent(accountId)}`, {
      method: 'DELETE',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    });
    if (!res.ok) {
      let errorMsg = 'Failed to remove investigator';
      try {
        const errJson = await res.json();
        if (errJson.detail) errorMsg = errJson.detail;
      } catch (_) {}
      throw new Error(errorMsg);
    }
  }
};
