import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
  getMultiFactorResolver,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  TotpMultiFactorGenerator,
} from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  listAll,
  getMetadata,
} from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBJntVr_yYCkDIwN7Ept3N6qYY2Lfz4m-M",
  authDomain: "hrms-main-2d0ac.firebaseapp.com",
  projectId: "hrms-main-2d0ac",
  storageBucket: "hrms-main-2d0ac.firebasestorage.app",
  messagingSenderId: "700649736414",
  appId: "1:700649736414:web:4c524018cb0c2131a09a4f"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
  getMultiFactorResolver,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  TotpMultiFactorGenerator,
};

// Critical connection verification check when authenticated
export async function verifyFirebaseConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    return true;
  } catch (error: any) {
    const code = error?.code || "";
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("the client is offline") || code === "unavailable") {
      console.warn("Firebase connection notice: Client is offline or project hrms-main-2d0ac unreachable.");
      return false;
    }
    // Missing test/connection document or unauthenticated pre-login check still confirms backend reachability
    if (code === "permission-denied" || code === "not-found") {
      return true;
    }
    return false;
  }
}

// Operational Error Logging Constants and Type definitions
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  code?: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

type ErrorNoticeListener = (info: FirestoreErrorInfo) => void;
const errorNoticeListeners = new Set<ErrorNoticeListener>();

export function subscribeFirestoreErrorNotices(listener: ErrorNoticeListener): () => void {
  errorNoticeListeners.add(listener);
  return () => {
    errorNoticeListeners.delete(listener);
  };
}

export function getFirebaseErrorMessage(error: unknown, fallback = "An unexpected Firebase error occurred."): string {
  const errObj = error as { code?: string; message?: string };
  const code = errObj?.code || "";
  const msg = errObj?.message || (error instanceof Error ? error.message : String(error));

  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password. Please check your credentials or register if you don't have an account yet.";
    case "auth/user-disabled":
      return "This account has been disabled in Firebase Authentication. Please contact your Administrator.";
    case "auth/email-already-in-use":
      return "This email address is already registered.";
    case "auth/invalid-email":
      return "Invalid email address format.";
    case "auth/weak-password":
      return "Password is too weak. Please use at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/operation-not-allowed":
      return "Email/Password sign-in is not yet enabled on the Firebase project (hrms-main-2d0ac). Enable it in Firebase Console -> Authentication -> Sign-in method.";
    case "auth/unauthorized-domain":
      return "This domain is not authorized in Firebase Authentication. Add this app domain in Firebase Console -> Authentication -> Settings -> Authorized domains.";
    case "auth/network-request-failed":
      return "Network error while contacting Firebase. Please check your internet connection.";
    case "auth/multi-factor-auth-required":
      return "Multi-factor authentication (MFA) verification is required to complete Administrator sign-in.";
    case "permission-denied":
      return "Permission denied by Firestore Security Rules. Verify your account role, email verification status, and deployed rules.";
    case "unavailable":
      return "Firebase backend is currently unreachable or offline. Local data remains available until connection resumes.";
    case "storage/unauthorized":
      return "Permission denied by Firebase Storage Security Rules. Ensure your account is verified and authorized to upload to this folder.";
    case "storage/canceled":
      return "File upload was canceled.";
    case "storage/quota-exceeded":
      return "Firebase Storage quota exceeded.";
    case "storage/unknown":
      return "Unknown Firebase Storage error. Verify Firebase Storage is enabled on project hrms-main-2d0ac.";
    default:
      return msg || fallback;
  }
}

/**
 * Handles Firestore security and execution exceptions by recording structured diagnostics
 * and notifying active UI listeners without silently swallowing permission failures.
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errObj = error as { code?: string; message?: string };
  const errInfo: FirestoreErrorInfo = {
    error: getFirebaseErrorMessage(error),
    code: errObj?.code,
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Notice: ', JSON.stringify(errInfo));
  errorNoticeListeners.forEach(listener => {
    try {
      listener(errInfo);
    } catch {
      // Ignore subscriber render faults
    }
  });
}

// ======================================================
// Firebase Storage Upload / Download / Delete Helpers
// ======================================================

export interface UploadedStorageFile {
  url: string;
  fullPath: string;
  name: string;
  size: number;
  contentType: string;
}

export async function uploadFileToStorage(
  folderPath: string,
  file: File | Blob,
  customFileName?: string
): Promise<UploadedStorageFile> {
  if (!auth.currentUser) {
    throw new Error("You must be signed in with a verified account to upload files to Firebase Storage.");
  }

  const rawName = customFileName || (file instanceof File ? file.name : `file_${Date.now()}`);
  const safeName = rawName.replace(/[^a-zA-Z0-9._\-]/g, "_");
  const cleanFolder = folderPath.replace(/^\/+|\/+$/g, "");
  const fullPath = `${cleanFolder}/${Date.now()}_${safeName}`;
  const fileRef = storageRef(storage, fullPath);

  try {
    const snapshot = await uploadBytes(fileRef, file, {
      contentType: file.type || "application/octet-stream"
    });
    const url = await getDownloadURL(snapshot.ref);
    return {
      url,
      fullPath: snapshot.ref.fullPath,
      name: rawName,
      size: file.size,
      contentType: file.type || "application/octet-stream"
    };
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "Failed to upload file to Firebase Storage."));
  }
}

export async function deleteFileFromStorage(urlOrPath: string): Promise<void> {
  if (!urlOrPath || !auth.currentUser) return;
  try {
    const fileRef = storageRef(storage, urlOrPath);
    await deleteObject(fileRef);
  } catch (err: any) {
    if (err?.code === "storage/object-not-found" || err?.code === "storage/invalid-argument") {
      return;
    }
    throw new Error(getFirebaseErrorMessage(err, "Failed to remove file from Firebase Storage."));
  }
}

export interface StorageDocumentItem {
  name: string;
  fullPath: string;
  url: string;
  size: number;
  contentType: string;
  updated?: string;
}

export async function listStorageFolderFiles(folderPath: string): Promise<StorageDocumentItem[]> {
  if (!auth.currentUser) return [];
  const cleanFolder = folderPath.replace(/^\/+|\/+$/g, "");
  const folderRef = storageRef(storage, cleanFolder);
  try {
    const res = await listAll(folderRef);
    const items = await Promise.all(
      res.items.map(async (itemRef) => {
        const [url, meta] = await Promise.all([
          getDownloadURL(itemRef),
          getMetadata(itemRef).catch(() => null),
        ]);
        return {
          name: itemRef.name.replace(/^\d+_/, ""),
          fullPath: itemRef.fullPath,
          url,
          size: meta?.size || 0,
          contentType: meta?.contentType || "application/octet-stream",
          updated: meta?.updated,
        };
      })
    );
    return items.sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
  } catch (err: any) {
    if (err?.code === "storage/object-not-found") {
      return [];
    }
    throw new Error(getFirebaseErrorMessage(err, "Failed to list documents from Firebase Storage."));
  }
}
