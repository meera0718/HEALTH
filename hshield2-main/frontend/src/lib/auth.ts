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
    return {
      id: 'usr_789421',
      email: 'investigator@gmail.com',
      name: 'Dr. Alexander Doe',
      role: 'INVESTIGATOR',
      authorized: true
    };
  },

  async loginWithCredentials(email: string, password: string): Promise<UserProfile> {
    const cleanEmail = email.trim().toLowerCase();

    // 1. Check Authorized Doctor Demo Account
    if ((cleanEmail === 'doctor_demo' || cleanEmail === 'doctor@gmail.com' || cleanEmail === 'doctor') && password === 'demo123') {
      const token = `hsx_jwt_doctor_token_${Date.now()}`;
      const profile: UserProfile = {
        id: 'usr_doc_9021',
        email: 'doctor_demo',
        name: 'Dr. Sarah Lin, MD',
        role: 'DOCTOR',
        authorized: true,
        token
      };
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(profile));
      return profile;
    }

    // 2. Check Authorized Security Investigator Account
    if ((cleanEmail === 'investigator@gmail.com' || cleanEmail === 'investigator') && password === 'investigate@123') {
      const token = `hsx_jwt_investigator_token_${Date.now()}`;
      const profile: UserProfile = {
        id: 'usr_789421',
        email: 'investigator@gmail.com',
        name: 'Dr. Alexander Doe',
        role: 'INVESTIGATOR',
        authorized: true,
        token
      };
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(profile));
      return profile;
    }

    // 3. Unauthorized Access Attempt handling
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    
    // Asynchronously log to security access-attempts audit endpoint
    try {
      await fetch('/api/v1/security/access-attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'UNAUTHORIZED_LOGIN_ATTEMPT',
          source: '192.168.1.105 (External Public IP)',
          timestamp,
          email_attempted: cleanEmail || 'unknown_user_47'
        })
      });
    } catch {
      // ignore offline fallback
    }

    const unauthPayload: UnauthorizedErrorPayload = {
      isUnauthorizedAttempt: true,
      account: cleanEmail || 'unknown_user_47',
      status: 'ACCESS DENIED',
      timestamp,
      source: '192.168.1.105 (External Public IP)',
      severity: 'HIGH'
    };

    const err = new Error(`UNAUTHORIZED ACCESS ATTEMPT DETECTED: Access denied for ${cleanEmail || 'unknown_user_47'}`);
    (err as any).unauthPayload = unauthPayload;
    throw err;
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
      const fallback: UserProfile = {
        id: 'usr_789421',
        email: 'investigator@gmail.com',
        name: 'Dr. Alexander Doe',
        role: 'INVESTIGATOR',
        authorized: true
      };
      localStorage.setItem(USER_KEY, JSON.stringify(fallback));
      return fallback;
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
  }
};
