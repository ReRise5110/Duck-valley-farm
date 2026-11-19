import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { FarmData } from '../types/farm';
import { db, handleFirestoreError, OperationType } from './firebase';

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val !== undefined) {
        result[key] = stripUndefinedDeep(val);
      }
    }
    return result as T;
  }
  return value;
}

function buildMutableFarmFields(farm: FarmData) {
  return stripUndefinedDeep({
    name: (farm.name || 'ฟาร์มเป็ด').slice(0, 120),
    location: (farm.location || '').slice(0, 200),
    farmerName: (farm.farmerName || '').slice(0, 120),
    farmerAvatar: farm.farmerAvatar || 'ribbon',
    season: farm.season || 'Spring',
    farmDay: Math.max(1, Math.min(100000, Math.round(farm.farmDay || 1))),
    lastSyncedAt: (farm.lastSyncedAt || 'ยังไม่ซิงค์').slice(0, 80),
    googleSheetId: (farm.googleSheetId || '').slice(0, 300),
    googleSheetTitle: (farm.googleSheetTitle || '').slice(0, 200),
    appsScriptWebhookUrl: (farm.appsScriptWebhookUrl || '').slice(0, 500),
    lineNotifyEnabled: Boolean(farm.lineNotifyEnabled),
    barns: Array.isArray(farm.barns) ? farm.barns : [],
    calendarEvents: Array.isArray(farm.calendarEvents) ? farm.calendarEvents : [],
    feedFormulas: Array.isArray(farm.feedFormulas) ? farm.feedFormulas : [],
    feedSilos: Array.isArray(farm.feedSilos) ? farm.feedSilos : [],
    feedLogs: Array.isArray(farm.feedLogs) ? farm.feedLogs : [],
    environments: Array.isArray(farm.environments) ? farm.environments : [],
    salesRecords: Array.isArray(farm.salesRecords) ? farm.salesRecords : [],
    closedBatches: Array.isArray(farm.closedBatches) ? farm.closedBatches : [],
    syncLogs: Array.isArray(farm.syncLogs) ? farm.syncLogs : [],
  });
}

function docDataToFarmData(raw: Record<string, unknown>, docId: string): FarmData {
  return {
    id: typeof raw.id === 'string' ? raw.id : docId,
    name: typeof raw.name === 'string' ? raw.name : 'ฟาร์มเป็ด',
    location: typeof raw.location === 'string' ? raw.location : '',
    farmerName: typeof raw.farmerName === 'string' ? raw.farmerName : '',
    farmerAvatar:
      raw.farmerAvatar === 'sunhat' ||
      raw.farmerAvatar === 'ribbon' ||
      raw.farmerAvatar === 'straw' ||
      raw.farmerAvatar === 'bandana'
        ? raw.farmerAvatar
        : 'ribbon',
    season:
      raw.season === 'Spring' || raw.season === 'Summer' || raw.season === 'Autumn'
        ? raw.season
        : 'Spring',
    farmDay: typeof raw.farmDay === 'number' ? raw.farmDay : 1,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString().slice(0, 10),
    lastSyncedAt: typeof raw.lastSyncedAt === 'string' ? raw.lastSyncedAt : 'ยังไม่ซิงค์',
    googleSheetId: typeof raw.googleSheetId === 'string' ? raw.googleSheetId : '',
    googleSheetTitle: typeof raw.googleSheetTitle === 'string' ? raw.googleSheetTitle : '',
    appsScriptWebhookUrl:
      typeof raw.appsScriptWebhookUrl === 'string' ? raw.appsScriptWebhookUrl : '',
    lineNotifyEnabled: Boolean(raw.lineNotifyEnabled),
    barns: Array.isArray(raw.barns) ? (raw.barns as FarmData['barns']) : [],
    calendarEvents: Array.isArray(raw.calendarEvents)
      ? (raw.calendarEvents as FarmData['calendarEvents'])
      : [],
    feedFormulas: Array.isArray(raw.feedFormulas)
      ? (raw.feedFormulas as FarmData['feedFormulas'])
      : [],
    feedSilos: Array.isArray(raw.feedSilos) ? (raw.feedSilos as FarmData['feedSilos']) : [],
    feedLogs: Array.isArray(raw.feedLogs) ? (raw.feedLogs as FarmData['feedLogs']) : [],
    environments: Array.isArray(raw.environments)
      ? (raw.environments as FarmData['environments'])
      : [],
    salesRecords: Array.isArray(raw.salesRecords)
      ? (raw.salesRecords as FarmData['salesRecords'])
      : [],
    closedBatches: Array.isArray(raw.closedBatches)
      ? (raw.closedBatches as NonNullable<FarmData['closedBatches']>)
      : [],
    syncLogs: Array.isArray(raw.syncLogs) ? (raw.syncLogs as FarmData['syncLogs']) : [],
  };
}

export async function ensureUserProfile(user: User): Promise<void> {
  if (!db) return;
  const path = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  const email = (user.email || '').slice(0, 320);
  const displayName = (user.displayName || user.email || 'Google User').slice(0, 200);

  let snap;
  try {
    snap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (!snap.exists()) {
    try {
      await setDoc(userRef, {
        uid: user.uid,
        email,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  } else {
    const existingData = snap.data();
    if (existingData.email !== email || existingData.displayName !== displayName) {
      try {
        await updateDoc(userRef, {
          email,
          displayName,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }
  }
}

export function subscribeUserFarms(
  uid: string,
  onFarms: (farms: FarmData[]) => void,
  onError: (error: Error) => void
): () => void {
  if (!db) {
    onFarms([]);
    return () => {};
  }

  const farmsPath = `users/${uid}/farms`;
  const farmsQuery = query(collection(db, 'users', uid, 'farms'), where('ownerId', '==', uid));

  return onSnapshot(
    farmsQuery,
    (snapshot) => {
      const farms = snapshot.docs
        .map((docSnap) => docDataToFarmData(docSnap.data() as Record<string, unknown>, docSnap.id))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      onFarms(farms);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, farmsPath);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function createUserFarm(user: User, farm: FarmData): Promise<void> {
  if (!db) return;
  await ensureUserProfile(user);
  const path = `users/${user.uid}/farms/${farm.id}`;
  const farmRef = doc(db, 'users', user.uid, 'farms', farm.id);
  const payload = {
    id: farm.id,
    ownerId: user.uid,
    createdAt: (farm.createdAt || new Date().toISOString().slice(0, 10)).slice(0, 40),
    ...buildMutableFarmFields(farm),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(farmRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateUserFarm(uid: string, farm: FarmData): Promise<void> {
  if (!db) return;
  const path = `users/${uid}/farms/${farm.id}`;
  const farmRef = doc(db, 'users', uid, 'farms', farm.id);
  const mutableFields = {
    ...buildMutableFarmFields(farm),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(farmRef, mutableFields);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteUserFarm(uid: string, farmId: string): Promise<void> {
  if (!db) return;
  const path = `users/${uid}/farms/${farmId}`;
  const farmRef = doc(db, 'users', uid, 'farms', farmId);

  try {
    await deleteDoc(farmRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
