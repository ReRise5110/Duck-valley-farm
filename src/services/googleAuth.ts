import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from './firebase';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar.events',
];

let cachedAccessToken: string | null = null;

export function isFirebaseAuthConfigured(): boolean {
  return isFirebaseConfigured() && Boolean(auth);
}

export function initGoogleAuth(
  onAuthState: (user: User | null, accessToken: string | null) => void
): () => void {
  if (!auth) {
    onAuthState(null, null);
    return () => {};
  }

  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedAccessToken = null;
      onAuthState(null, null);
    } else {
      onAuthState(user, cachedAccessToken);
    }
  });
}

function mapFirebaseAuthError(err: unknown): Error {
  const code = (err as { code?: string })?.code || '';
  if (code === 'auth/popup-blocked') {
    return new Error(
      'เบราว์เซอร์บล็อกหน้าต่างเข้าสู่ระบบ Google กรุณาอนุญาตป๊อปอัป (Pop-up) สำหรับเว็บไซต์นี้แล้วลองใหม่อีกครั้ง'
    );
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return new Error('ปิดหน้าต่างเข้าสู่ระบบ Google ก่อนเสร็จสิ้น กรุณาลองใหม่อีกครั้ง');
  }
  if (code === 'auth/unauthorized-domain') {
    return new Error(
      `โดเมนนี้ (${window.location.hostname}) ยังไม่ได้รับอนุญาตใน Firebase Authentication Authorized Domains`
    );
  }
  if (code === 'auth/operation-not-allowed') {
    return new Error(
      'ยังไม่ได้เปิดใช้งาน Google Sign-In Provider ใน Firebase Console (Authentication → Sign-in method)'
    );
  }
  if (code === 'auth/network-request-failed') {
    return new Error(
      'ไม่สามารถเชื่อมต่อเครือข่ายไปยังบริการยืนยันตัวตน Google ได้ กรุณาตรวจสอบอินเทอร์เน็ต'
    );
  }
  return err instanceof Error ? err : new Error('ไม่สามารถเข้าสู่ระบบ Google ได้');
}

/**
 * Standard Google Account Login (works with any Google account, persists session via Firebase Auth).
 * Does not grant or cache Workspace scopes — Workspace scopes are requested explicitly via signInWithGoogleWorkspace().
 */
export async function signInWithGoogleAccount(): Promise<{
  user: User;
  accessToken: string | null;
}> {
  if (!auth) {
    throw new Error('ยังไม่ได้ตั้งค่า Firebase Authentication ในสภาพแวดล้อมนี้');
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    const result = await signInWithPopup(auth, provider);
    cachedAccessToken = null;
    return { user: result.user, accessToken: null };
  } catch (err: unknown) {
    throw mapFirebaseAuthError(err);
  }
}

async function verifySheetsScopeGranted(token: string): Promise<void> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`
    );
    if (!res.ok) return;
    const info = (await res.json()) as { scope?: string };
    if (typeof info.scope === 'string') {
      const scopes = info.scope.split(/\s+/);
      const hasSheets = scopes.some(
        (s) =>
          s === 'https://www.googleapis.com/auth/spreadsheets' ||
          s === 'https://www.googleapis.com/auth/drive'
      );
      if (!hasSheets) {
        throw new Error(
          'คุณยังไม่ได้ติ๊กอนุญาตสิทธิ์ Google Sheets ในหน้าต่างยืนยัน กรุณากดเชื่อมต่ออีกครั้งแล้วติ๊กเลือกสิทธิ์ Google Sheets'
        );
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Google Sheets')) {
      throw err;
    }
    // Ignore transient network failures from tokeninfo check
  }
}

/**
 * Google Workspace OAuth Login (requests Sheets + Calendar scopes for Two-Way Sync).
 */
export async function signInWithGoogleWorkspace(): Promise<{
  user: User;
  accessToken: string;
}> {
  if (!auth) {
    throw new Error(
      'ยังไม่ได้เชื่อมโปรเจกต์ Google Cloud / Firebase สำหรับ OAuth ในสภาพแวดล้อมนี้ (สามารถใช้โหมดแก้ไขชีตในแอป, Export CSV หรือ Apps Script Webhook แทนได้ทันที)'
    );
  }

  const provider = new GoogleAuthProvider();
  WORKSPACE_SCOPES.forEach((scope) => provider.addScope(scope));
  provider.setCustomParameters({
    prompt: 'consent',
    include_granted_scopes: 'true',
    ...(auth.currentUser?.email ? { login_hint: auth.currentUser.email } : {}),
  });

  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error(
        'ไม่ได้รับสิทธิ์ Google Sheets / Calendar Access Token กรุณาติ๊กอนุญาตสิทธิ์แล้วลองใหม่อีกครั้ง'
      );
    }
    await verifySheetsScopeGranted(credential.accessToken);
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (err: unknown) {
    throw mapFirebaseAuthError(err);
  }
}

export function clearWorkspaceAccessToken(): void {
  cachedAccessToken = null;
}

export async function getAccessToken(): Promise<string | null> {
  return cachedAccessToken;
}

export async function signOutGoogleWorkspace(): Promise<void> {
  cachedAccessToken = null;
  if (auth) {
    await auth.signOut();
  }
}
