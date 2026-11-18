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
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { getFirestore, doc, getDocFromServer, updateDoc } from "firebase/firestore";
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
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateDoc,
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

export function getFirebaseErrorMessage(
  error: unknown,
  fallback = "An unexpected service error occurred. Please try again.",
  userRole?: string
): string {
  const errObj = error as { code?: string; message?: string };
  const code = errObj?.code || "";
  const rawMsg = errObj?.message || (error instanceof Error ? error.message : String(error));
  const lowerMsg = rawMsg.toLowerCase();
  const isAdmin = userRole === "Administrator";

  // Network / offline fallback detection even when code is absent
  if (!code && (lowerMsg.includes("offline") || lowerMsg.includes("network") || lowerMsg.includes("failed to fetch"))) {
    return "Network connection unavailable. Please verify your internet connection and retry.";
  }

  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password. Please check your credentials or register if you do not have an account yet.";
    case "auth/user-disabled":
      return "This account has been disabled. Please contact your System Administrator.";
    case "auth/email-already-in-use":
      return "This email address is already registered. Please sign in or reset your password.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password is too weak. Please use at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many unsuccessful attempts. Please wait a few minutes before trying again.";
    case "auth/operation-not-allowed":
      return isAdmin
        ? "Email/Password sign-in is not enabled in Firebase Authentication (Code: auth/operation-not-allowed)."
        : "Sign-in method is currently unavailable. Please contact your System Administrator.";
    case "auth/unauthorized-domain":
      return isAdmin
        ? "Application domain is not listed under Firebase Authorized Domains (Code: auth/unauthorized-domain)."
        : "Portal domain authorization error. Please contact your System Administrator.";
    case "auth/network-request-failed":
      return "Network error while contacting authentication service. Please check your internet connection.";
    case "auth/multi-factor-auth-required":
      return "Two-factor authentication (TOTP) verification is required to complete Administrator sign-in.";
    case "auth/invalid-verification-code":
      return "The verification code entered is invalid or expired. Enter the latest 6-digit code from your authenticator app.";
    case "auth/requires-recent-login":
      return "For your security, please sign out and sign back in before performing this sensitive action.";

    // Firestore Database Errors
    case "permission-denied":
      if (isAdmin) {
        return "Permission denied by Firestore Security Rules. Verify account verification status and deployed rules (Code: permission-denied).";
      }
      if (userRole === "Auditor") {
        return "Read-only Auditor access: you do not have permission to create, modify, or delete records.";
      }
      if (userRole === "Employee") {
        return "Access restricted: you can only view and manage your own linked employee records.";
      }
      return "You do not have permission to perform this action. Please contact your Administrator if access is required.";
    case "unauthenticated":
      return "Your session has expired or is unauthenticated. Please sign in again.";
    case "unavailable":
      return "Cloud database is temporarily unreachable or offline. Check your internet connection and retry.";
    case "deadline-exceeded":
      return "The request timed out before the server responded. Please check your connection and try again.";
    case "already-exists":
      return "This record already exists. Duplicate entries are not allowed.";
    case "not-found":
      return isAdmin
        ? "The requested record or reference document was not found in Cloud Firestore (Code: not-found)."
        : "The requested record could not be found. It may have been removed or moved.";
    case "failed-precondition":
      return isAdmin
        ? "Database precondition or index requirement failed (Code: failed-precondition)."
        : "This operation cannot be completed in the current state. Refresh the page and try again.";
    case "aborted":
      return "The operation conflicted with another update and was aborted. Please retry.";
    case "resource-exhausted":
      return "Service request limit exceeded. Please wait a moment and try again.";
    case "invalid-argument":
      return "Some submitted data is invalid or formatted incorrectly. Please check your inputs.";
    case "cancelled":
      return "The database operation was cancelled before completion.";

    // Firebase Storage Errors
    case "storage/unauthorized":
      return isAdmin
        ? "Upload or access blocked by Firebase Storage Security Rules (Code: storage/unauthorized)."
        : "You are not authorized to upload or access this document. Ensure your email is verified.";
    case "storage/canceled":
      return "File upload was canceled before completion.";
    case "storage/quota-exceeded":
      return "Document storage quota has been reached. Please contact your System Administrator.";
    case "storage/object-not-found":
      return "The requested document file could not be found in storage.";
    case "storage/retry-limit-exceeded":
      return "File upload timed out after multiple retries. Check your network speed and try again.";
    case "storage/invalid-checksum":
    case "storage/server-file-wrong-size":
      return "File integrity verification failed during upload. Please try uploading the file again.";
    case "storage/unknown":
      return isAdmin
        ? "Unexpected Firebase Storage error (Code: storage/unknown). Verify Storage bucket configuration."
        : "File upload failed due to a storage service error. Please try again.";

    default: {
      // Never expose API keys, project IDs, or stack traces to end users
      if (
        lowerMsg.includes("aizasy") ||
        lowerMsg.includes("firebase:") ||
        lowerMsg.includes("firestore/") ||
        lowerMsg.includes("stack")
      ) {
        return isAdmin && code ? `${fallback} (Code: ${code})` : fallback;
      }
      return rawMsg || fallback;
    }
  }
}

/**
 * Handles Firestore security and execution exceptions by recording structured diagnostics
 * and notifying active UI listeners without silently swallowing permission failures.
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  userRole?: string
) {
  const errObj = error as { code?: string; message?: string };
  const errInfo: FirestoreErrorInfo = {
    error: getFirebaseErrorMessage(error, "Cloud synchronization encountered an error.", userRole),
    code: errObj?.code,
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
    },
    operationType,
    path: userRole === "Administrator" || !userRole ? path : null,
  };
  console.warn("Firestore Operation Notice:", errInfo.code || "error", errInfo.operationType, path || "");
  errorNoticeListeners.forEach((listener) => {
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
    throw new Error("You must be signed in with a verified account to upload files.");
  }
  if (!file || file.size <= 0) {
    throw new Error("Cannot upload an empty file. Please choose a valid document.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("File exceeds the 10 MB maximum upload limit.");
  }

  const rawName = customFileName || (file instanceof File ? file.name : `file_${Date.now()}`);
  const safeName = rawName.replace(/[^a-zA-Z0-9._\-]/g, "_");
  const cleanFolder = folderPath.replace(/^\/+|\/+$/g, "");
  const fullPath = `${cleanFolder}/${Date.now()}_${safeName}`;
  const fileRef = storageRef(storage, fullPath);

  try {
    const snapshot = await uploadBytes(fileRef, file, {
      contentType: file.type || "application/octet-stream",
    });
    const url = await getDownloadURL(snapshot.ref);
    return {
      url,
      fullPath: snapshot.ref.fullPath,
      name: rawName,
      size: file.size,
      contentType: file.type || "application/octet-stream",
    };
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "Failed to upload file to cloud storage."));
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
    throw new Error(getFirebaseErrorMessage(err, "Failed to remove file from cloud storage."));
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
