import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  ModelPlanItem,
  HourlyRecord,
  ShiftPlanConfig,
  ProductionKpiState,
  ActionLogEntry,
} from '../types/production';

// Minimum required Google Workspace scope for creating, reading, updating, and deleting app files on Google Drive
export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));

// Flag to indicate if we are in the middle of a sign-in flow
let isSigningIn = false;
// Cache the access token in memory only (NEVER store in localStorage or sessionStorage)
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('ไม่สามารถรับ Access Token จาก Google Authentication ได้');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};

// ============================================================================
// GOOGLE DRIVE DATA STRUCTURES & API HELPERS
// ============================================================================

export interface HistoricalShiftSnapshot {
  id: string;
  driveFileId?: string;
  savedAtIso: string;
  savedAtDisplay: string;
  shiftConfig: ShiftPlanConfig;
  models: ModelPlanItem[];
  hourlyRecordsA: HourlyRecord[];
  hourlyRecordsB: HourlyRecord[];
  kpiState: ProductionKpiState;
  actionLogs: ActionLogEntry[];
  summaryNote?: string;
}

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
}

/**
 * List files created by this app in the user's Google Drive
 */
export async function listAppDriveFiles(): Promise<DriveFileMeta[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('NO_ACCESS_TOKEN');

  const query = encodeURIComponent("trashed = false and name contains 'IE_Production'");
  const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime,size,webViewLink)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime desc&pageSize=50`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 || res.status === 403) {
    cachedAccessToken = null;
    throw new Error('NO_ACCESS_TOKEN');
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive API Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return (data.files || []) as DriveFileMeta[];
}

/**
 * Read JSON content of a specific file from Google Drive
 */
export async function readDriveJsonFile<T>(fileId: string): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error('NO_ACCESS_TOKEN');

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 || res.status === 403) {
    cachedAccessToken = null;
    throw new Error('NO_ACCESS_TOKEN');
  }
  if (!res.ok) {
    throw new Error(`ไม่สามารถอ่านไฟล์จาก Google Drive ได้ (${res.status})`);
  }

  return (await res.json()) as T;
}

/**
 * Create a new file on Google Drive (Multipart upload)
 */
export async function createDriveFile(
  fileName: string,
  content: string,
  mimeType: string = 'application/json'
): Promise<DriveFileMeta> {
  const token = await getAccessToken();
  if (!token) throw new Error('NO_ACCESS_TOKEN');

  const metadata = {
    name: fileName,
    mimeType,
    description: 'IE Production Plan & Hourly Tracking Historical Data for Pivot Analysis',
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${mimeType}; charset=UTF-8\r\n\r\n` +
    content +
    closeDelimiter;

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body: multipartRequestBody,
    }
  );

  if (res.status === 401 || res.status === 403) {
    cachedAccessToken = null;
    throw new Error('NO_ACCESS_TOKEN');
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ไม่สามารถสร้างไฟล์บน Google Drive ได้ (${res.status}): ${errText}`);
  }

  return (await res.json()) as DriveFileMeta;
}

/**
 * Update (overwrite) an existing file on Google Drive.
 * IMPORTANT: Callers MUST obtain explicit user confirmation before invoking this function!
 */
export async function updateDriveFileContent(
  fileId: string,
  content: string,
  mimeType: string = 'application/json'
): Promise<DriveFileMeta> {
  const token = await getAccessToken();
  if (!token) throw new Error('NO_ACCESS_TOKEN');

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,name,mimeType,modifiedTime,size,webViewLink`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `${mimeType}; charset=UTF-8`,
      },
      body: content,
    }
  );

  if (res.status === 401 || res.status === 403) {
    cachedAccessToken = null;
    throw new Error('NO_ACCESS_TOKEN');
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ไม่สามารถอัปเดตไฟล์บน Google Drive ได้ (${res.status}): ${errText}`);
  }

  return (await res.json()) as DriveFileMeta;
}

/**
 * Delete a file from Google Drive.
 * IMPORTANT: Callers MUST obtain explicit user confirmation before invoking this function!
 */
export async function deleteDriveFile(fileId: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('NO_ACCESS_TOKEN');

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401 || res.status === 403) {
    cachedAccessToken = null;
    throw new Error('NO_ACCESS_TOKEN');
  }
  if (!res.ok && res.status !== 204) {
    const errText = await res.text();
    throw new Error(`ไม่สามารถลบไฟล์จาก Google Drive ได้ (${res.status}): ${errText}`);
  }
}
