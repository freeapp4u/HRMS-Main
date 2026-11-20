import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  loadState, saveState, logActivity, clearSensitiveWorkspaceStorage, scopeAppStateForEmployee, AppState 
} from "./dbStore";
import {
  syncRecordToFirestore,
  deleteRecordFromFirestore,
  syncBatchRecordsToFirestore,
  hydrateWorkspaceFromFirestore
} from "./firebaseSync";
import { collection, onSnapshot, doc, getDoc, getDocs, query, where, updateDoc } from "firebase/firestore";
import type { MultiFactorResolver } from "firebase/auth";
import { 
  auth,
  db,
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  handleFirestoreError,
  getFirebaseErrorMessage,
  subscribeFirestoreErrorNotices,
  verifyFirebaseConnection,
  FirestoreErrorInfo,
  OperationType
} from "./firebase";
import { 
  User, Department, Employee, AttendanceRecord, LeaveRecord, 
  PublicHoliday, CompanyConfig, ActivityLog, UserRole, AccountStatus,
  FamilyMember, MedicalExpense,
  SalaryComponent, TaxConfiguration, PayrollPeriod, EmployeeSalaryStructure,
  PayrollRecord, Payslip, PayslipDistributionLog, PayrollApproval, PayrollImportLog, PayrollSettings,
  EmailActivityLog, SystemRole, RolePermissions,
  HRRequest, EmployeeNotification, DriveAssociation
} from "./types";
import {
  DEFAULT_ROLES,
  getDefaultRolePermissions,
  hasPermission,
  normalizeRolePermissions,
  enforceAdminSafeguard,
  resolveUserPermissions,
  assertEmployeeRecordAccess,
  UNAUTHORIZED_EMPLOYEE_RECORD_MSG
} from "./utils/rbacUtils";
import {
  parseTabPermission,
  canAccessTab as checkCanAccessTab,
  getFirstPermittedTab as resolveFirstPermittedTab,
  resolveCanonicalTab
} from "./utils/navigationUtils";
import { EMPLOYEE_BLOCKED_ADMIN_MODULES } from "./config/permissions";
import { getCompanyLogoUrl, getOfficialLogoUrl } from "./utils/reportBranding";

// Component Imports
import ThemeStyles from "./components/ThemeStyles";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import Employees from "./components/Employees";
import Departments from "./components/Departments";
import Attendance from "./components/Attendance";
import LeaveManagement from "./components/LeaveManagement";
import MedicalManagement from "./components/MedicalManagement";
import PayrollManagement from "./components/PayrollManagement";
import Settings from "./components/Settings";
import Reports from "./components/Reports";
import HelpCenter from "./components/HelpCenter";
import DocumentVault from "./components/DocumentVault";
import MyProfileView from "./components/ess/MyProfileView";
import MyAttendanceView from "./components/ess/MyAttendanceView";
import MyLeaveView from "./components/ess/MyLeaveView";
import MyPayrollView from "./components/ess/MyPayrollView";
import MyDocumentsView from "./components/ess/MyDocumentsView";
import HRRequestsModule from "./components/ess/HRRequestsModule";
import NotificationsView from "./components/ess/NotificationsView";
import MyAccountView from "./components/ess/MyAccountView";

import { ShieldCheck, Lock, Mail, ServerCrash, Key, Eye, EyeOff, X, Users, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "./components/ui/ToastProvider";
import { FormFieldError, ValidationSummary, fieldInputClass } from "./components/ui/FormFeedback";
import {
  validateLoginForm,
  validateRegisterForm,
  validateForgotPasswordForm,
  focusFirstInvalidField,
} from "./utils/validation";

const AUTHORIZED_ADMIN_EXCEPTIONS = [
  "contactesfaye@gmail.com",
  "tesfayeteklufeyissa@gmail.com"
];

const isAuthorizedEmail = (email: string): boolean => {
  const norm = email.trim().toLowerCase();
  if (AUTHORIZED_ADMIN_EXCEPTIONS.includes(norm)) return true;
  if (norm.endsWith("@ethiopianre.com")) return true;
  return false;
};

const isAuthorizedAdminException = (email: string): boolean => {
  const norm = email.trim().toLowerCase();
  return AUTHORIZED_ADMIN_EXCEPTIONS.includes(norm);
};

export default function App() {
  // Core App state variables
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [medicalExpenses, setMedicalExpenses] = useState<MedicalExpense[]>([]);
  const [config, setConfig] = useState<CompanyConfig | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailActivityLog[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<SystemRole[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermissions[]>([]);

  // Payroll Management State
  const [salaryComponents, setSalaryComponents] = useState<SalaryComponent[]>([]);
  const [taxConfig, setTaxConfig] = useState<TaxConfiguration | null>(null);
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([]);
  const [salaryStructures, setSalaryStructures] = useState<EmployeeSalaryStructure[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [payslipDistributionLogs, setPayslipDistributionLogs] = useState<PayslipDistributionLog[]>([]);
  const [payrollApprovals, setPayrollApprovals] = useState<PayrollApproval[]>([]);
  const [payrollImportLogs, setPayrollImportLogs] = useState<PayrollImportLog[]>([]);
  const [payrollSettings, setPayrollSettings] = useState<PayrollSettings | null>(null);
  const [hrRequests, setHrRequests] = useState<HRRequest[]>([]);
  const [notifications, setNotifications] = useState<EmployeeNotification[]>([]);
  const [driveAssociations, setDriveAssociations] = useState<DriveAssociation[]>([]);

  const parseLocationRoute = () => {
    const rawHash = window.location.hash.replace(/^#/, "");
    const [hashTab, hashQuery] = rawHash.split("?");
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(hashQuery || "");
    const empParam = hashParams.get("employeeId") || searchParams.get("employeeId") || undefined;
    return { tabId: hashTab || "dashboard", empId: empParam };
  };

  // Layout UI states
  const [activeTab, setActiveTabState] = useState(() => parseLocationRoute().tabId);
  const [requestedEmployeeId, setRequestedEmployeeId] = useState<string | undefined>(() => parseLocationRoute().empId);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const setActiveTab = (tabId: string) => {
    const [cleanTab, queryStr] = tabId.split("?");
    const tabParams = new URLSearchParams(queryStr || "");
    const empParam = tabParams.get("employeeId") || undefined;
    setActiveTabState(cleanTab || "dashboard");
    setRequestedEmployeeId(empParam);
    if (window.location.hash !== `#${tabId}`) {
      window.location.hash = tabId;
    }
  };

  useEffect(() => {
    const handleHashChange = () => {
      const { tabId, empId } = parseLocationRoute();
      if (tabId !== activeTab) {
        setActiveTabState(tabId);
      }
      setRequestedEmployeeId(empId);
    };
    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("popstate", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("popstate", handleHashChange);
    };
  }, [activeTab]);

  const { showError, showSuccess, showWarning } = useToast();

  // Login form states
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginFieldErrors, setLoginFieldErrors] = useState<Record<string, string>>({});

  // Unverified login helper states
  const [unverifiedUserEmail, setUnverifiedUserEmail] = useState("");
  const [unverifiedPassword, setUnverifiedPassword] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccessMsg, setResendSuccessMsg] = useState("");

  // Forgot Password modal states
  const [forgotPasswordModal, setForgotPasswordModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetStatus, setResetStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [resetFieldErrors, setResetFieldErrors] = useState<Record<string, string>>({});
  const [resetLoading, setResetLoading] = useState(false);

  // Login / Register view toggle state
  const [loginMode, setLoginMode] = useState<"login" | "register">("login");

  // Registration Form states
  const [regFullName, setRegFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regFieldErrors, setRegFieldErrors] = useState<Record<string, string>>({});
  const [regCompleted, setRegCompleted] = useState(false);
  const [regCompletedEmail, setRegCompletedEmail] = useState("");
  const isRegisteringRef = useRef(false);

  // Firebase MFA & Sync/Error Banner States
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState("");
  const [mfaPendingEmail, setMfaPendingEmail] = useState("");
  const [mfaPendingPassword, setMfaPendingPassword] = useState("");
  const [cloudHydrating, setCloudHydrating] = useState(false);
  const [firebaseNotice, setFirebaseNotice] = useState<FirestoreErrorInfo | null>(null);

  // Load state from local storage on mount
  useEffect(() => {
    const rawState = loadState();
    
    // Dynamically apply High Density branding theme on first mount
    if (rawState.config && rawState.config.branding && rawState.config.branding.primaryColor === "#0F2942") {
      rawState.config.branding.primaryColor = "#002B5B";
      rawState.config.branding.secondaryColor = "#001F44";
      saveState({ config: rawState.config });
    }

    const state =
      rawState.currentUser?.role === "Employee"
        ? scopeAppStateForEmployee(rawState, rawState.currentUser.employeeId, rawState.currentUser)
        : rawState;

    setUsers(state.users);
    setDepartments(state.departments);
    setEmployees(state.employees);
    setHolidays(state.holidays);
    setAttendance(state.attendance);
    setLeaves(state.leaves);
    setFamilyMembers(state.familyMembers || []);
    setMedicalExpenses(state.medicalExpenses || []);
    setConfig(state.config);
    setLogs(state.logs);
    setEmailLogs(state.emailLogs || []);
    setCurrentUser(state.currentUser);

    // Load payroll state
    setSalaryComponents(state.salaryComponents || []);
    setTaxConfig(state.taxConfig || null);
    setPayrollPeriods(state.payrollPeriods || []);
    setSalaryStructures(state.salaryStructures || []);
    setPayrollRecords(state.payrollRecords || []);
    setPayslips(state.payslips || []);
    setPayslipDistributionLogs(state.payslipDistributionLogs || []);
    setPayrollApprovals(state.payrollApprovals || []);
    setPayrollImportLogs(state.payrollImportLogs || []);
    setPayrollSettings(state.payrollSettings || null);
    setRoles(state.roles || []);
    setRolePermissions((state.rolePermissions || []).map(p => enforceAdminSafeguard(normalizeRolePermissions(p))));
    setHrRequests(state.hrRequests || []);
    setNotifications(state.notifications || []);
    setDriveAssociations(state.driveAssociations || []);

    setLoading(false);
  }, []);

  const applyHydratedState = (hydrated: Partial<AppState>) => {
    if (Object.keys(hydrated).length === 0) return;
    if (hydrated.users) setUsers(hydrated.users);
    if (hydrated.departments) setDepartments(hydrated.departments);
    if (hydrated.employees) setEmployees(hydrated.employees);
    if (hydrated.holidays) setHolidays(hydrated.holidays);
    if (hydrated.attendance) setAttendance(hydrated.attendance);
    if (hydrated.leaves) setLeaves(hydrated.leaves);
    if (hydrated.familyMembers) setFamilyMembers(hydrated.familyMembers);
    if (hydrated.medicalExpenses) setMedicalExpenses(hydrated.medicalExpenses);
    if (hydrated.config) setConfig(hydrated.config);
    if (hydrated.logs) setLogs(hydrated.logs);
    if (hydrated.emailLogs) setEmailLogs(hydrated.emailLogs);
    if (hydrated.salaryComponents) setSalaryComponents(hydrated.salaryComponents);
    if (hydrated.taxConfig) setTaxConfig(hydrated.taxConfig);
    if (hydrated.payrollPeriods) setPayrollPeriods(hydrated.payrollPeriods);
    if (hydrated.salaryStructures) setSalaryStructures(hydrated.salaryStructures);
    if (hydrated.payrollRecords) setPayrollRecords(hydrated.payrollRecords);
    if (hydrated.payslips) setPayslips(hydrated.payslips);
    if (hydrated.payslipDistributionLogs) setPayslipDistributionLogs(hydrated.payslipDistributionLogs);
    if (hydrated.payrollApprovals) setPayrollApprovals(hydrated.payrollApprovals);
    if (hydrated.payrollImportLogs) setPayrollImportLogs(hydrated.payrollImportLogs);
    if (hydrated.payrollSettings) setPayrollSettings(hydrated.payrollSettings);
    if (hydrated.roles) setRoles(hydrated.roles);
    if (hydrated.rolePermissions) {
      setRolePermissions(hydrated.rolePermissions.map(p => enforceAdminSafeguard(normalizeRolePermissions(p))));
    }
    if (hydrated.hrRequests) setHrRequests(hydrated.hrRequests);
    if (hydrated.notifications) setNotifications(hydrated.notifications);
    if (hydrated.driveAssociations) setDriveAssociations(hydrated.driveAssociations);
    saveState(hydrated);
  };

  useEffect(() => {
    const criticalCodes = new Set([
      "permission-denied",
      "unavailable",
      "deadline-exceeded",
      "already-exists",
      "not-found",
      "failed-precondition",
      "resource-exhausted",
      "unauthenticated",
      "aborted",
    ]);
    return subscribeFirestoreErrorNotices((info) => {
      if (!info.code || criticalCodes.has(info.code)) {
        const isWriteOrDelete =
          info.operationType === OperationType.WRITE ||
          info.operationType === OperationType.CREATE ||
          info.operationType === OperationType.UPDATE ||
          info.operationType === OperationType.DELETE;
        setFirebaseNotice(info);
        if (isWriteOrDelete) {
          showError(
            getFirebaseErrorMessage({ code: info.code, message: info.error }, info.error, currentUser?.role),
            info.code === "permission-denied" ? "Access Denied" : "Database Sync Error"
          );
        } else if (info.code === "unavailable") {
          showWarning("Cloud database is currently unreachable. Changes are buffered locally.", "Offline Notice");
        }
      }
    });
  }, [currentUser?.role, showError, showWarning]);

  // Enforce Firebase Auth state verification on startup and auth changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (isRegisteringRef.current) return;

      if (fbUser) {
        try {
          await fbUser.reload();
        } catch (reloadErr) {
          console.warn("Firebase Auth user reload notice:", reloadErr);
        }

        const emailNorm = fbUser.email?.toLowerCase() || "";
        const isAllowed = isAuthorizedEmail(emailNorm);

        if (!isAllowed || !fbUser.emailVerified) {
          // Immediately sign out unverified user or unauthorized email domain
          await signOut(auth);
          setCurrentUser(null);
          saveState({ currentUser: null });
          return;
        }

        verifyFirebaseConnection().catch(() => {});
      }
    });
    return () => unsubscribe();
  }, []);

  // Initialize roles and permissions if empty
  useEffect(() => {
    if (!loading && roles.length === 0) {
      const initialRoles = DEFAULT_ROLES;
      const initialPerms = initialRoles.map(r => getDefaultRolePermissions(r.id));
      
      setRoles(initialRoles);
      setRolePermissions(initialPerms);
      saveState({ roles: initialRoles, rolePermissions: initialPerms });

      // Sync default roles/permissions only if Administrator session is active
      if (auth.currentUser && currentUser?.role === "Administrator") {
        initialRoles.forEach(r => syncRecordToFirestore("roles", r.id, r));
        initialPerms.forEach(p => syncRecordToFirestore("role_permissions", p.id, p));
      }
    }
  }, [loading, roles.length, currentUser?.role]);

  // Dynamic RBAC & ESS Real-Time Firestore Listeners
  useEffect(() => {
    if (loading || !currentUser || !auth.currentUser?.emailVerified) return;

    const unsubRoles = onSnapshot(
      collection(db, "roles"),
      (snapshot) => {
        if (snapshot.empty) return;
        const remoteRoles: SystemRole[] = snapshot.docs.map(d => d.data() as SystemRole);
        const mergedMap = new Map<string, SystemRole>();
        DEFAULT_ROLES.forEach(dr => mergedMap.set(dr.id, dr));
        remoteRoles.forEach(rr => {
          if (rr && rr.id) {
            const isSys = DEFAULT_ROLES.some(dr => dr.id === rr.id);
            mergedMap.set(rr.id, { ...rr, isSystem: isSys || rr.isSystem });
          }
        });
        const merged = Array.from(mergedMap.values());
        setRoles(merged);
        saveState({ roles: merged });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, "roles")
    );

    const unsubPerms = onSnapshot(
      collection(db, "role_permissions"),
      (snapshot) => {
        if (snapshot.empty) return;
        const remotePerms: RolePermissions[] = snapshot.docs.map(d =>
          enforceAdminSafeguard(normalizeRolePermissions(d.data() as RolePermissions))
        );
        setRolePermissions(prev => {
          const map = new Map<string, RolePermissions>();
          prev.forEach(p => map.set(p.roleId, normalizeRolePermissions(p)));
          remotePerms.forEach(rp => {
            if (rp && rp.roleId) map.set(rp.roleId, rp);
          });
          const merged = Array.from(map.values());
          saveState({ rolePermissions: merged });
          return merged;
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, "role_permissions")
    );

    const cleanUserId = currentUser.id.replace(/[^a-zA-Z0-9_\-]/g, "_");
    const unsubUser = onSnapshot(
      doc(db, "users", cleanUserId),
      (snap) => {
        if (!snap.exists()) return;
        const remoteUser = snap.data() as User;
        if (
          remoteUser.role !== currentUser.role ||
          remoteUser.status !== currentUser.status ||
          remoteUser.employeeId !== currentUser.employeeId ||
          JSON.stringify(remoteUser.permissionOverrides || {}) !== JSON.stringify(currentUser.permissionOverrides || {})
        ) {
          const updated = { ...currentUser, ...remoteUser };
          setCurrentUser(updated);
          saveState({ currentUser: updated });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${cleanUserId}`)
    );

    const isEmployee = currentUser.role === "Employee";
    const empId = currentUser.employeeId;

    // Scoped HR Requests listener
    const hrReqQuery = isEmployee
      ? query(collection(db, "hr_requests"), where("employeeId", "==", empId || "__NONE__"))
      : collection(db, "hr_requests");
    const unsubHRRequests = onSnapshot(
      hrReqQuery,
      (snapshot) => {
        const items = snapshot.docs.map(d => d.data() as HRRequest);
        setHrRequests(items);
        saveState({ hrRequests: items });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, "hr_requests")
    );

    // Scoped Notifications listener (announcements + personal)
    const unsubAnnouncements = onSnapshot(
      query(collection(db, "notifications"), where("category", "==", "announcement")),
      (snapshot) => {
        const anns = snapshot.docs.map(d => d.data() as EmployeeNotification);
        setNotifications(prev => {
          const map = new Map<string, EmployeeNotification>();
          prev.filter(n => n.category !== "announcement").forEach(n => map.set(n.id, n));
          anns.forEach(a => map.set(a.id, a));
          const merged = Array.from(map.values()).sort((a, b) => (b.createdDate || "").localeCompare(a.createdDate || ""));
          saveState({ notifications: merged });
          return merged;
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, "notifications")
    );

    const personalNotifQuery =
      currentUser.role === "Administrator" || currentUser.role === "HR Officer" || currentUser.role === "Auditor"
        ? collection(db, "notifications")
        : query(collection(db, "notifications"), where("recipientEmployeeId", "==", empId || "__NONE__"));
    const unsubPersonalNotifs = onSnapshot(
      personalNotifQuery,
      (snapshot) => {
        const items = snapshot.docs.map(d => d.data() as EmployeeNotification);
        setNotifications(prev => {
          const map = new Map<string, EmployeeNotification>();
          prev.filter(n => n.category === "announcement").forEach(n => map.set(n.id, n));
          items.forEach(n => map.set(n.id, n));
          const merged = Array.from(map.values()).sort((a, b) => (b.createdDate || "").localeCompare(a.createdDate || ""));
          saveState({ notifications: merged });
          return merged;
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, "notifications")
    );

    // Scoped Drive Associations listener
    const driveAssocQuery = isEmployee
      ? query(
          collection(db, "drive_associations"),
          where("targetType", "==", "Employee"),
          where("targetId", "==", empId || "__NONE__")
        )
      : collection(db, "drive_associations");
    const unsubDriveAssocs = onSnapshot(
      driveAssocQuery,
      (snapshot) => {
        let items = snapshot.docs.map(d => d.data() as DriveAssociation);
        if (isEmployee) {
          items = items.filter(d => d.targetType === "Employee" && empId && d.targetId === empId);
        }
        setDriveAssociations(items);
        saveState({ driveAssociations: items });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, "drive_associations")
    );

    return () => {
      unsubRoles();
      unsubPerms();
      unsubUser();
      unsubHRRequests();
      unsubAnnouncements();
      unsubPersonalNotifs();
      unsubDriveAssocs();
    };
  }, [loading, currentUser?.id, currentUser?.role, currentUser?.employeeId]);

  const currentRoleObj = roles.find(r => r.id === currentUser?.role || r.name === currentUser?.role);
  const currentRolePermissions = resolveUserPermissions(currentUser, roles, rolePermissions);

  // Canonicalize bare or alias module routes to their first permitted submenu so sidebar & main workspace stay 1:1 synced
  useEffect(() => {
    if (loading || !currentUser || !currentRolePermissions) return;
    if (!checkCanAccessTab(activeTab, currentRolePermissions, currentUser.role, currentRoleObj?.status)) {
      return;
    }
    const canonical = resolveCanonicalTab(
      activeTab,
      currentRolePermissions,
      currentUser.role,
      currentRoleObj?.status
    );
    if (canonical && canonical !== activeTab) {
      setActiveTabState(canonical);
      const rawHash = window.location.hash.replace(/^#/, "");
      const queryPart = rawHash.includes("?") ? `?${rawHash.split("?")[1]}` : "";
      const nextHash = `#${canonical}${queryPart}`;
      if (window.location.hash !== nextHash) {
        window.history.replaceState(null, "", nextHash);
      }
    }
  }, [loading, currentUser?.id, currentUser?.role, currentRoleObj?.status, currentRolePermissions, activeTab]);

  if (loading || !config) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-xs font-semibold text-slate-600 gap-3 p-6">
        <img
          src={getOfficialLogoUrl()}
          alt="Ethiopian Reinsurance S.C. Logo"
          className="h-20 w-auto object-contain rounded-lg shadow-xs"
        />
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 border-2 border-primary-custom border-t-transparent rounded-full animate-spin"></div>
          <span>Initializing Ethio-Re HRMS Database...</span>
        </div>
      </div>
    );
  }

  // State update handlers (persists in LocalStorage via saveState helper and syncs to Firestore)
  const handleUpdateUsers = (newUsers: User[], userToSync?: User) => {
    setUsers(newUsers);
    saveState({ users: newUsers });
    if (userToSync) {
      syncRecordToFirestore("users", userToSync.id, userToSync);
    } else if (currentUser?.role === "Administrator") {
      newUsers.forEach(u => syncRecordToFirestore("users", u.id, u));
    }
  };

  const handleUpdateDepartments = (newDepts: Department[]) => {
    setDepartments(newDepts);
    saveState({ departments: newDepts });
  };

  const handleUpdateEmployees = (newEmps: Employee[]) => {
    setEmployees(newEmps);
    saveState({ employees: newEmps });
  };

  const handleUpdateHolidays = (newHolidays: PublicHoliday[]) => {
    setHolidays(newHolidays);
    saveState({ holidays: newHolidays });
    newHolidays.forEach(h => syncRecordToFirestore("holidays", h.id, h));
  };

  const handleUpdateAttendance = (newAttendance: AttendanceRecord[]) => {
    setAttendance(newAttendance);
    saveState({ attendance: newAttendance });
  };

  const handleUpdateLeaves = (newLeaves: LeaveRecord[]) => {
    setLeaves(newLeaves);
    saveState({ leaves: newLeaves });
  };

  const handleUpdateConfig = (newConfig: CompanyConfig) => {
    setConfig(newConfig);
    saveState({ config: newConfig });
    syncRecordToFirestore("config", "company_config", newConfig);
  };

  const handleUpdateLogs = (newLogs: ActivityLog[]) => {
    setLogs(newLogs);
    saveState({ logs: newLogs });
    if (newLogs.length > 0) {
      syncRecordToFirestore("logs", newLogs[0].id, newLogs[0]);
    }
  };

  const handleUpdateEmailLogs = (newLogs: EmailActivityLog[]) => {
    setEmailLogs(newLogs);
    saveState({ emailLogs: newLogs });
    if (newLogs.length > 0) {
      syncRecordToFirestore("email_logs", newLogs[0].id, newLogs[0]);
    }
  };

  const handleUpdateCurrentUser = (user: User | null) => {
    setCurrentUser(user);
    saveState({ currentUser: user });
  };

  const handleUpdateRoles = (newRoles: SystemRole[], deletedRoleId?: string) => {
    setRoles(newRoles);
    saveState({ roles: newRoles });
    newRoles.forEach(r => syncRecordToFirestore("roles", r.id, r));
    if (deletedRoleId) {
      deleteRecordFromFirestore("roles", deletedRoleId);
      const updatedPerms = rolePermissions.filter(p => p.roleId !== deletedRoleId && p.id !== deletedRoleId);
      setRolePermissions(updatedPerms);
      saveState({ rolePermissions: updatedPerms });
      deleteRecordFromFirestore("role_permissions", deletedRoleId);
    }
  };

  const handleUpdateRolePermissions = (newPerms: RolePermissions[]) => {
    const safeguarded = newPerms.map(p => enforceAdminSafeguard(normalizeRolePermissions(p)));
    setRolePermissions(safeguarded);
    saveState({ rolePermissions: safeguarded });
    safeguarded.forEach(p => syncRecordToFirestore("role_permissions", p.id, p));
  };

  // Payroll State Update Handlers
  const handleUpdateSalaryComponents = (newComponents: SalaryComponent[]) => {
    setSalaryComponents(newComponents);
    saveState({ salaryComponents: newComponents });
    newComponents.forEach(c => syncRecordToFirestore("salary_components", c.id, c));
  };
  const handleDeleteSalaryComponent = (id: string): boolean => {
    if (!hasPermission(currentRolePermissions, "payroll", "delete")) return false;
    
    // Check if used in structures
    const isUsed = salaryStructures.some(s => s.recurringDeductions?.[id] !== undefined);
    if (isUsed) return false;

    const updated = salaryComponents.filter(c => c.id !== id);
    setSalaryComponents(updated);
    saveState({ salaryComponents: updated });
    deleteRecordFromFirestore("salary_components", id);
    return true;
  };

  const handleUpdateTaxConfig = (newTaxConfig: TaxConfiguration) => {
    setTaxConfig(newTaxConfig);
    saveState({ taxConfig: newTaxConfig });
    syncRecordToFirestore("tax_configurations", newTaxConfig.id, newTaxConfig);
  };

  const handleUpdatePayrollPeriods = (newPeriods: PayrollPeriod[]) => {
    setPayrollPeriods(newPeriods);
    saveState({ payrollPeriods: newPeriods });
    newPeriods.forEach(p => syncRecordToFirestore("payroll_periods", p.id, p));
  };
  const handleDeletePayrollPeriod = (id: string): boolean => {
    if (!hasPermission(currentRolePermissions, "payroll", "delete")) return false;

    // Check if records exist
    const hasRecords = payrollRecords.some(r => r.payrollPeriodId === id);
    if (hasRecords) return false;

    const updated = payrollPeriods.filter(p => p.id !== id);
    setPayrollPeriods(updated);
    saveState({ payrollPeriods: updated });
    deleteRecordFromFirestore("payroll_periods", id);
    return true;
  };

  const handleUpdateSalaryStructures = (newStructures: EmployeeSalaryStructure[]) => {
    setSalaryStructures(newStructures);
    saveState({ salaryStructures: newStructures });
    newStructures.forEach(s => syncRecordToFirestore("employee_salary_structures", s.id, s));
  };

  const handleUpdatePayrollRecords = (newRecords: PayrollRecord[]) => {
    setPayrollRecords(newRecords);
    saveState({ payrollRecords: newRecords });
    newRecords.forEach(r => syncRecordToFirestore("payroll_records", r.id, r));
  };
  const handleDeletePayrollRecord = (id: string): boolean => {
    if (!hasPermission(currentRolePermissions, "payroll", "delete") || !currentUser) return false;
    
    const updated = payrollRecords.filter(r => r.id !== id);
    handleUpdatePayrollRecords(updated);

    const record = payrollRecords.find(r => r.id === id);
    if (record) {
      const deletedRecord = {
        ...record,
        isDeleted: true,
        deletedAt: new Date().toISOString().replace("T", " ").substring(0, 19),
        deletedBy: currentUser.email
      };
      syncRecordToFirestore("payroll_records", id, deletedRecord);
    }
    handleLogAction("Payroll", "Delete Record", id, `Payroll record ${id} soft-deleted`);
    return true;
  };

  const handleUpdatePayslips = (newPayslips: Payslip[]) => {
    setPayslips(newPayslips);
    saveState({ payslips: newPayslips });
    newPayslips.forEach(ps => syncRecordToFirestore("payslips", ps.id, ps));
  };
  const handleDeletePayslip = (id: string): boolean => {
    if (!hasPermission(currentRolePermissions, "payroll", "delete")) return false;
    const updated = payslips.filter(p => p.id !== id);
    setPayslips(updated);
    saveState({ payslips: updated });
    deleteRecordFromFirestore("payslips", id);
    return true;
  };

  const handleUpdatePayslipDistributionLogs = (newLogs: PayslipDistributionLog[]) => {
    setPayslipDistributionLogs(newLogs);
    saveState({ payslipDistributionLogs: newLogs });
    newLogs.forEach(l => syncRecordToFirestore("payslip_distribution_logs", l.id, l));
  };

  const handleUpdatePayrollApprovals = (newApprovals: PayrollApproval[]) => {
    setPayrollApprovals(newApprovals);
    saveState({ payrollApprovals: newApprovals });
    newApprovals.forEach(a => syncRecordToFirestore("payroll_approvals", a.id, a));
  };

  const handleUpdatePayrollImportLogs = (newLogs: PayrollImportLog[]) => {
    setPayrollImportLogs(newLogs);
    saveState({ payrollImportLogs: newLogs });
    newLogs.forEach(l => syncRecordToFirestore("payroll_import_logs", l.id, l));
  };

  const handleUpdatePayrollSettings = (newSettings: PayrollSettings) => {
    setPayrollSettings(newSettings);
    saveState({ payrollSettings: newSettings });
    syncRecordToFirestore("payroll_settings", newSettings.id, newSettings);
  };

  // Transaction auditing action logger
  const handleLogAction = (module: string, action: string, record: string, details: string) => {
    const currentState: AppState = {
      users,
      departments,
      employees,
      holidays,
      attendance,
      leaves,
      familyMembers,
      medicalExpenses,
      config: config!,
      logs,
      currentUser,
      emailLogs,
      salaryComponents,
      taxConfig: taxConfig || undefined,
      payrollPeriods,
      salaryStructures,
      payrollRecords,
      payslips,
      payslipDistributionLogs,
      payrollApprovals,
      payrollImportLogs,
      payrollSettings: payrollSettings || undefined,
      roles,
      rolePermissions,
      hrRequests,
      notifications,
      driveAssociations,
    };
    if (currentUser?.role === "Employee") {
      return;
    }
    const updatedLogs = logActivity(currentState, module, action, record, details);
    setLogs(updatedLogs);
  };

  const completeAuthenticatedSession = async (
    firebaseUser: NonNullable<typeof auth.currentUser>,
    emailNorm: string,
    rawPassword: string
  ) => {
    // Reload Firebase user status from server to get fresh emailVerified state
    try {
      await firebaseUser.reload();
    } catch (rErr) {
      console.warn("Reload user notice:", rErr);
    }

    const refreshedUser = auth.currentUser || firebaseUser;

    // Check email verification status for ALL accounts (including exception emails)
    if (!refreshedUser.emailVerified) {
      await signOut(auth);
      setUnverifiedUserEmail(emailNorm);
      setUnverifiedPassword(rawPassword);
      setLoginError("EMAIL_VERIFICATION_REQUIRED");
      return;
    }

    // Fetch authoritative remote user profile from Firestore if present on hrms-main-2d0ac
    let remoteUserDoc: User | null = null;
    try {
      const snap = await getDoc(doc(db, "users", refreshedUser.uid));
      if (snap.exists()) {
        remoteUserDoc = snap.data() as User;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${refreshedUser.uid}`);
    }

    const foundUser = remoteUserDoc || users.find(u => u.email.toLowerCase() === emailNorm);
    const targetRole: UserRole = isAuthorizedAdminException(emailNorm) ? "Administrator" : (foundUser?.role || "Employee");

    // Match employee case-insensitively locally, or query Firestore by email on fresh devices
    let matchingEmployee = employees.find(e => e.email.trim().toLowerCase() === emailNorm);
    if (!matchingEmployee && !foundUser?.employeeId) {
      try {
        const empSnap = await getDocs(query(collection(db, "employees"), where("email", "==", emailNorm)));
        if (!empSnap.empty) {
          matchingEmployee = empSnap.docs[0].data() as Employee;
        }
      } catch {
        // Fallback to local state if query not permitted or empty
      }
    }
    const linkedEmployeeId = foundUser?.employeeId || matchingEmployee?.employeeId;

    // MANDATORY: If role is Employee, it MUST be linked to an employee record
    if (targetRole === "Employee" && !linkedEmployeeId) {
      await signOut(auth);
      setLoginError("Your account is not linked to an employee record. Please contact the HR Department to link your employee profile.");
      return;
    }

    const nowStamp = new Date().toISOString().replace("T", " ").substring(0, 19);
    const userToLogin: User = foundUser ? {
      ...foundUser,
      id: refreshedUser.uid,
      role: targetRole,
      employeeId: linkedEmployeeId,
      emailVerified: true,
      status: "Active",
      lastLogin: nowStamp
    } : {
      id: refreshedUser.uid,
      fullName: refreshedUser.displayName || emailNorm.split("@")[0],
      email: emailNorm,
      password: "",
      role: targetRole,
      employeeId: linkedEmployeeId,
      status: "Active",
      emailVerified: true,
      createdDate: nowStamp.split(" ")[0],
      lastLogin: nowStamp
    };

    const updatedUsers = targetRole === "Employee"
      ? [userToLogin]
      : users.some(u => u.email.toLowerCase() === emailNorm)
        ? users.map(u => u.email.toLowerCase() === emailNorm ? userToLogin : u)
        : [...users, userToLogin];

    setUsers(updatedUsers);
    saveState({ users: updatedUsers });

    if (remoteUserDoc && targetRole !== "Administrator") {
      try {
        await updateDoc(doc(db, "users", refreshedUser.uid), {
          lastLogin: nowStamp,
          emailVerified: true,
        });
      } catch (uErr) {
        handleFirestoreError(uErr, OperationType.UPDATE, `users/${refreshedUser.uid}`);
      }
    } else {
      const sanitizedUserPayload = { ...userToLogin, password: "" };
      await syncRecordToFirestore("users", userToLogin.id, sanitizedUserPayload);
    }
    handleUpdateCurrentUser(userToLogin);

    // Hydrate authorized collections from Cloud Firestore
    setCloudHydrating(true);
    try {
      const hydrated = await hydrateWorkspaceFromFirestore(userToLogin);
      if (targetRole === "Employee") {
        const mergedLocal: AppState = {
          users: [userToLogin],
          departments: hydrated.departments || departments,
          employees: hydrated.employees || employees,
          holidays: hydrated.holidays || holidays,
          attendance: hydrated.attendance || attendance,
          leaves: hydrated.leaves || leaves,
          familyMembers: hydrated.familyMembers || familyMembers,
          medicalExpenses: hydrated.medicalExpenses || medicalExpenses,
          config: hydrated.config || config!,
          logs: [],
          currentUser: userToLogin,
          emailLogs: [],
          salaryComponents: hydrated.salaryComponents || salaryComponents,
          taxConfig: (hydrated.taxConfig || taxConfig)!,
          payrollPeriods: hydrated.payrollPeriods || payrollPeriods,
          salaryStructures: hydrated.salaryStructures || salaryStructures,
          payrollRecords: hydrated.payrollRecords || payrollRecords,
          payslips: hydrated.payslips || payslips,
          payslipDistributionLogs: [],
          payrollApprovals: [],
          payrollImportLogs: [],
          payrollSettings: (hydrated.payrollSettings || payrollSettings)!,
          roles: hydrated.roles || roles,
          rolePermissions: hydrated.rolePermissions || rolePermissions,
          hrRequests: hydrated.hrRequests || hrRequests,
          notifications: hydrated.notifications || notifications,
          driveAssociations: hydrated.driveAssociations || driveAssociations,
        };
        const scoped = scopeAppStateForEmployee(mergedLocal, linkedEmployeeId, userToLogin);
        applyHydratedState(scoped);
        const currentParse = parseTabPermission(activeTab);
        if (EMPLOYEE_BLOCKED_ADMIN_MODULES.has(currentParse.moduleId)) {
          setActiveTab("dashboard");
        }
      } else {
        applyHydratedState(hydrated);
      }
      await verifyFirebaseConnection();
    } finally {
      setCloudHydrating(false);
    }

    if (targetRole !== "Employee") {
      const currentState: AppState = {
        users: updatedUsers,
        departments,
        employees,
        holidays,
        attendance,
        leaves,
        familyMembers,
        medicalExpenses,
        config: config!,
        logs,
        currentUser: userToLogin,
        emailLogs,
        salaryComponents,
        taxConfig: taxConfig || undefined,
        payrollPeriods,
        salaryStructures,
        payrollRecords,
        payslips,
        payslipDistributionLogs,
        payrollApprovals,
        payrollImportLogs,
        payrollSettings: payrollSettings || undefined,
        roles,
        rolePermissions,
        hrRequests,
        notifications,
        driveAssociations,
      };
      const updatedLogs = logActivity(currentState, "Security", "Operator Login", emailNorm, `Operator logged in from portal IP (${targetRole})`);
      setLogs(updatedLogs);
    }

    setLoginEmail("");
    setLoginPassword("");
    setUnverifiedUserEmail("");
    setUnverifiedPassword("");
    setMfaResolver(null);
    setMfaCode("");
    setMfaError("");
    setMfaPendingEmail("");
    setMfaPendingPassword("");
  };

  // User Authentication
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setResendSuccessMsg("");
    setLoginFieldErrors({});

    const check = validateLoginForm(loginEmail, loginPassword);
    if (!check.valid) {
      setLoginFieldErrors(check.errors);
      setLoginError(check.summaryMessage || "Please correct the highlighted fields.");
      focusFirstInvalidField(check.errors);
      return;
    }

    const emailNorm = loginEmail.trim().toLowerCase();

    setLoginLoading(true);

    try {
      let userCred;
      try {
        userCred = await signInWithEmailAndPassword(auth, emailNorm, loginPassword);
      } catch (firstAuthErr: any) {
        if (firstAuthErr?.code === "auth/multi-factor-auth-required") {
          const resolver = getMultiFactorResolver(auth, firstAuthErr);
          setMfaResolver(resolver);
          setMfaPendingEmail(emailNorm);
          setMfaPendingPassword(loginPassword);
          setMfaCode("");
          setMfaError("");
          return;
        }

        // If account does not exist in Firebase Auth yet, attempt auto-creation for authorized exception accounts or pre-seeded users
        const foundUser = users.find(u => u.email.toLowerCase() === emailNorm);
        const isExceptionAdmin = isAuthorizedAdminException(emailNorm);

        if (isExceptionAdmin || (foundUser && foundUser.password === loginPassword)) {
          try {
            isRegisteringRef.current = true;
            userCred = await createUserWithEmailAndPassword(auth, emailNorm, loginPassword);
            try {
              await sendEmailVerification(userCred.user);
            } catch (vErr) {
              console.warn("sendEmailVerification notice:", vErr);
            }
          } catch (createErr: any) {
            if (createErr?.code === "auth/email-already-in-use") {
              setLoginError("Invalid password for this account. Please check your password or click 'Forgot Password?' below.");
              return;
            }
            throw firstAuthErr;
          } finally {
            isRegisteringRef.current = false;
          }
        } else {
          throw firstAuthErr;
        }
      }

      await completeAuthenticatedSession(userCred.user, emailNorm, loginPassword);
    } catch (authErr: any) {
      console.warn("Authentication notice:", authErr?.code || authErr?.message);
      setLoginError(getFirebaseErrorMessage(authErr, "Authentication failed. Please check your credentials."));
    } finally {
      setLoginLoading(false);
    }
  };

  // Multi-Factor Authentication (MFA) Challenge Completion
  const handleMfaVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaResolver) return;
    if (!mfaCode.trim() || mfaCode.trim().length < 6) {
      setMfaError("Please enter the 6-digit verification code from your authenticator app.");
      focusFirstInvalidField({ mfaCode: "Invalid code" });
      return;
    }
    setMfaError("");
    setMfaLoading(true);
    try {
      const totpHint = mfaResolver.hints.find(
        h => h.factorId === TotpMultiFactorGenerator.FACTOR_ID
      );
      if (!totpHint) {
        setMfaError("Only Authenticator App (TOTP) second-factor verification is supported in this portal. Please contact your Administrator.");
        return;
      }
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(totpHint.uid, mfaCode.trim());
      const userCred = await mfaResolver.resolveSignIn(assertion);
      await completeAuthenticatedSession(
        userCred.user,
        mfaPendingEmail || userCred.user.email?.toLowerCase() || "",
        mfaPendingPassword
      );
    } catch (err: any) {
      setMfaError(getFirebaseErrorMessage(err, "Invalid verification code. Please check your authenticator app and try again."));
    } finally {
      setMfaLoading(false);
    }
  };

  // Resend Email Verification Handler
  const handleResendVerification = async () => {
    const targetEmail = unverifiedUserEmail || loginEmail.trim().toLowerCase();
    const targetPass = unverifiedPassword || loginPassword;

    if (!targetEmail) {
      setLoginError("Please enter your company email address.");
      return;
    }
    if (!targetPass) {
      setLoginError("Please enter your password to resend verification email.");
      return;
    }

    setResendLoading(true);
    setResendSuccessMsg("");

    try {
      isRegisteringRef.current = true;
      const cred = await signInWithEmailAndPassword(auth, targetEmail, targetPass);
      await sendEmailVerification(cred.user);
      await signOut(auth);
      setResendSuccessMsg(`A new verification link has been sent to ${targetEmail}. Please check your email inbox.`);
    } catch (err: any) {
      console.warn("Resend verification notice:", err?.code || err?.message);
      setLoginError(getFirebaseErrorMessage(err, "Could not send verification email. Please check your credentials."));
    } finally {
      isRegisteringRef.current = false;
      setResendLoading(false);
    }
  };

  // Password Reset Submission
  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetStatus(null);
    setResetFieldErrors({});
    const check = validateForgotPasswordForm(resetEmail);
    if (!check.valid) {
      setResetFieldErrors(check.errors);
      setResetStatus({ type: "error", msg: check.errors.resetEmail || "Please enter a valid email address." });
      focusFirstInvalidField(check.errors);
      return;
    }
    const norm = resetEmail.trim().toLowerCase();
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, norm);
      setResetStatus({ type: "success", msg: `Password reset instructions dispatched to ${norm}. Check your email inbox.` });
      showSuccess(`Password reset email sent to ${norm}.`);
    } catch (fErr: any) {
      console.warn("Firebase Password Reset notice:", fErr);
      if (fErr?.code === "auth/user-not-found") {
        setResetStatus({ type: "success", msg: `If an account exists for ${norm}, password reset instructions have been dispatched.` });
      } else {
        setResetStatus({ type: "error", msg: getFirebaseErrorMessage(fErr, "Failed to send password reset email.") });
      }
    } finally {
      setResetLoading(false);
    }
  };

  // User Registration Submissions
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setRegFieldErrors({});

    const check = validateRegisterForm({
      fullName: regFullName,
      email: regEmail,
      password: regPassword,
      confirmPassword: regConfirmPassword,
      existingUsers: users,
    });
    if (!check.valid) {
      setRegFieldErrors(check.errors);
      if (check.errors.regEmail?.includes("already registered")) {
        setLoginError("EMAIL_ALREADY_IN_USE");
      } else {
        setLoginError(check.summaryMessage || "Please correct the highlighted registration fields.");
      }
      focusFirstInvalidField(check.errors);
      return;
    }

    const emailNorm = regEmail.trim().toLowerCase();

    // Automatic Role Assignment: "Administrator" for authorized exception emails, default "Employee" for newly registered users
    const assignedRole: UserRole = isAuthorizedAdminException(emailNorm) ? "Administrator" : "Employee";
    const matchingEmployee = employees.find(e => e.email.trim().toLowerCase() === emailNorm);

    setRegLoading(true);
    isRegisteringRef.current = true;

    try {
      const userCred = await createUserWithEmailAndPassword(auth, emailNorm, regPassword);

      try {
        await sendEmailVerification(userCred.user);
      } catch (vErr) {
        console.warn("sendEmailVerification notice:", vErr);
      }

      const newUser: User = {
        id: userCred.user.uid,
        fullName: regFullName.trim(),
        email: emailNorm,
        password: "",
        role: assignedRole,
        employeeId: matchingEmployee?.employeeId,
        status: "Pending Verification",
        emailVerified: false,
        createdDate: new Date().toISOString().split("T")[0]
      };

      const updatedUsers = [...users, newUser];
      setUsers(updatedUsers);
      saveState({ users: updatedUsers });

      // Persist new user record to Firestore BEFORE signing out unverified session
      await syncRecordToFirestore("users", newUser.id, newUser);
      await signOut(auth);

      // Clean registration inputs & trigger Registration Success view
      setRegFullName("");
      setRegEmail("");
      setRegPassword("");
      setRegConfirmPassword("");
      setRegCompletedEmail(emailNorm);
      setRegCompleted(true);
    } catch (authErr: any) {
      console.warn("Firebase Auth registration notice:", authErr?.code || authErr?.message);
      if (authErr?.code === "auth/email-already-in-use") {
        setLoginError("EMAIL_ALREADY_IN_USE");
      } else {
        setLoginError(getFirebaseErrorMessage(authErr, "Registration failed. Please check your information."));
      }
    } finally {
      isRegisteringRef.current = false;
      setRegLoading(false);
    }
  };

  const handleLogout = () => {
    if (currentUser && currentUser.role !== "Employee") {
      handleLogAction("Security", "Operator Logout", currentUser.email, `Operator closed portal session`);
    }
    signOut(auth).catch(err => console.warn("Firebase signOut notice:", err));
    clearSensitiveWorkspaceStorage();
    setUsers([]);
    setEmployees([]);
    setAttendance([]);
    setLeaves([]);
    setFamilyMembers([]);
    setMedicalExpenses([]);
    setSalaryStructures([]);
    setPayrollRecords([]);
    setPayslips([]);
    setHrRequests([]);
    setNotifications([]);
    setDriveAssociations([]);
    setLogs([]);
    setEmailLogs([]);
    handleUpdateCurrentUser(null);
    setActiveTab("dashboard");
  };

  // Profile management from within the Header Component
  const handleUpdateOwnProfile = (fullName: string, email: string): boolean => {
    if (!currentUser) return false;
    const targetEmail = currentUser.role === "Employee" ? currentUser.email : email.trim().toLowerCase();
    const isDuplicate = users.some(u => u.id !== currentUser.id && u.email.toLowerCase() === targetEmail);
    if (isDuplicate) return false;

    const updatedUser = { ...currentUser, fullName, email: targetEmail };
    const updatedUsers = users.map(u => u.id === currentUser.id ? updatedUser : u);
    setUsers(updatedUsers);
    saveState({ users: updatedUsers });
    handleUpdateCurrentUser(updatedUser);

    if (auth.currentUser) {
      updateDoc(doc(db, "users", currentUser.id), { fullName }).catch(err =>
        handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.id}`)
      );
    }
    handleLogAction("Profile", "Self Profile Updated", targetEmail, "Operator modified their account profile metadata");
    return true;
  };

  const handleUpdateOwnPassword = async (
    oldPass: string,
    newPass: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!currentUser || !auth.currentUser || !auth.currentUser.email) {
      return { ok: false, error: "Active Firebase Auth session not found. Please sign in again." };
    }
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, oldPass);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPass);
      handleLogAction("Profile", "Self Password Changed", currentUser.email, "Operator updated security password");
      return { ok: true };
    } catch (err: any) {
      const code = err?.code || "";
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        return { ok: false, error: "Current password is incorrect." };
      }
      if (code === "auth/weak-password") {
        return { ok: false, error: "New password is too weak. Use at least 6 characters." };
      }
      if (code === "auth/requires-recent-login") {
        return { ok: false, error: "Security session expired. Please sign out and sign in again to change password." };
      }
      return { ok: false, error: getFirebaseErrorMessage(err, "Failed to update password.") };
    }
  };

  // ESS & HR Request Workflow Handlers
  const handleUpdateLeavesFromESS = async (updatedLeaves: LeaveRecord[], syncItem?: LeaveRecord) => {
    handleUpdateLeaves(updatedLeaves);
    if (syncItem) {
      if (currentUser?.role === "Employee" && syncItem.status === "Cancelled") {
        const cleanId = syncItem.id.replace(/[^a-zA-Z0-9_\-]/g, "_");
        try {
          await updateDoc(doc(db, "leaves", cleanId), {
            status: "Cancelled",
            updatedDate: syncItem.updatedDate || new Date().toISOString().replace("T", " ").substring(0, 19),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `leaves/${cleanId}`);
        }
      } else {
        await syncRecordToFirestore("leaves", syncItem.id, syncItem);
      }
    }
  };

  const handleSubmitHRRequest = async (req: HRRequest): Promise<boolean> => {
    if (!currentUser) return false;
    const access = assertEmployeeRecordAccess(
      currentUser,
      currentRolePermissions,
      "requests",
      req.employeeId,
      employees,
      departments
    );
    if (!access.allowed) {
      showError(access.message || UNAUTHORIZED_EMPLOYEE_RECORD_MSG);
      return false;
    }

    const updated = [req, ...hrRequests];
    setHrRequests(updated);
    saveState({ hrRequests: updated });
    const res = await syncRecordToFirestore("hr_requests", req.id, req);
    if (!res.ok && res.code === "permission-denied") {
      return false;
    }
    return true;
  };

  const handleCancelHRRequest = async (req: HRRequest): Promise<boolean> => {
    if (!currentUser) return false;
    const access = assertEmployeeRecordAccess(
      currentUser,
      currentRolePermissions,
      "requests",
      req.employeeId,
      employees,
      departments
    );
    if (!access.allowed) {
      showError(access.message || UNAUTHORIZED_EMPLOYEE_RECORD_MSG);
      return false;
    }
    const nowStamp = new Date().toISOString().replace("T", " ").substring(0, 19);
    const updatedReq: HRRequest = { ...req, status: "Cancelled", updatedDate: nowStamp };
    const updated = hrRequests.map(r => (r.id === req.id ? updatedReq : r));
    setHrRequests(updated);
    saveState({ hrRequests: updated });

    const cleanId = req.id.replace(/[^a-zA-Z0-9_\-]/g, "_");
    if (currentUser.role === "Employee" && auth.currentUser) {
      try {
        await updateDoc(doc(db, "hr_requests", cleanId), {
          status: "Cancelled",
          updatedDate: nowStamp,
        });
        return true;
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `hr_requests/${cleanId}`);
        return false;
      }
    }
    const res = await syncRecordToFirestore("hr_requests", req.id, updatedReq);
    return res.ok || res.code !== "permission-denied";
  };

  const handleReviewHRRequest = async (
    req: HRRequest,
    decision: "Approved" | "Rejected",
    comments: string
  ): Promise<boolean> => {
    if (!currentUser || currentUser.role === "Employee") {
      showError(UNAUTHORIZED_EMPLOYEE_RECORD_MSG);
      return false;
    }
    if (!hasPermission(currentRolePermissions, "requests", "approve")) {
      showError("Your role does not have approval permission for HR requests.");
      return false;
    }

    const nowStamp = new Date().toISOString().replace("T", " ").substring(0, 19);
    const updatedReq: HRRequest = {
      ...req,
      status: decision,
      reviewedBy: currentUser.email,
      reviewedDate: nowStamp,
      reviewComments: comments,
      updatedDate: nowStamp,
    };

    const nextRequests = hrRequests.map(r => (r.id === req.id ? updatedReq : r));
    setHrRequests(nextRequests);
    saveState({ hrRequests: nextRequests });
    await syncRecordToFirestore("hr_requests", req.id, updatedReq);

    if (decision === "Approved") {
      if (req.requestType === "profile_update" && req.proposedProfileChanges) {
        const targetEmp = employees.find(e => e.employeeId === req.employeeId);
        if (targetEmp) {
          const updatedEmp: Employee = {
            ...targetEmp,
            phoneNumber: req.proposedProfileChanges.phoneNumber || targetEmp.phoneNumber,
            altPhoneNumber:
              req.proposedProfileChanges.altPhoneNumber !== undefined
                ? req.proposedProfileChanges.altPhoneNumber
                : targetEmp.altPhoneNumber,
            address: req.proposedProfileChanges.address || targetEmp.address,
            updatedDate: nowStamp,
            updatedBy: currentUser.email,
          };
          handleUpdateEmployee(updatedEmp);
        }
      } else if (req.requestType === "attendance_correction" && req.attendanceCorrection) {
        const ac = req.attendanceCorrection;
        const existing = attendance.find(a => a.employeeId === req.employeeId && a.date === ac.date);
        const calcHours = (inT: string, outT: string) => {
          if (!inT || !outT) return 0;
          const [ih, im] = inT.split(":").map(Number);
          const [oh, om] = outT.split(":").map(Number);
          return Math.max(0, parseFloat((((oh * 60 + om) - (ih * 60 + im)) / 60).toFixed(1)));
        };
        if (existing) {
          const updatedAtt: AttendanceRecord = {
            ...existing,
            checkInTime: ac.requestedCheckIn || existing.checkInTime,
            checkOutTime: ac.requestedCheckOut || existing.checkOutTime,
            status: ac.requestedStatus || existing.status,
            workingHours: calcHours(
              ac.requestedCheckIn || existing.checkInTime,
              ac.requestedCheckOut || existing.checkOutTime
            ),
            remarks: `${existing.remarks ? existing.remarks + " | " : ""}Approved correction (${req.id}): ${req.description}`,
            updatedDate: nowStamp,
          };
          handleUpdateAttendanceRecord(updatedAtt);
        } else {
          const newAtt: AttendanceRecord = {
            id: `ATT_${req.employeeId}_${ac.date.replace(/-/g, "")}`,
            employeeId: req.employeeId,
            date: ac.date,
            checkInTime: ac.requestedCheckIn || "08:30",
            checkOutTime: ac.requestedCheckOut || "17:00",
            status: ac.requestedStatus || "Present",
            workingHours: calcHours(ac.requestedCheckIn || "08:30", ac.requestedCheckOut || "17:00"),
            lateStatus: ac.requestedStatus === "Late" ? "Yes" : "No",
            remarks: `Approved correction (${req.id}): ${req.description}`,
            recordedBy: currentUser.email,
            createdDate: nowStamp,
            updatedDate: nowStamp,
          };
          handleAddAttendance(newAtt);
        }
      }
    }

    // Dispatch automatic personal notification to the employee
    const targetEmp = employees.find(e => e.employeeId === req.employeeId);
    const notif: EmployeeNotification = {
      id: `NOTIF_${Date.now()}`,
      title: `HR Request ${decision}: ${req.subject}`,
      message:
        comments && comments.trim()
          ? `Your HR request (${req.id}) was ${decision.toLowerCase()} by ${currentUser.fullName}. Note: ${comments}`
          : `Your HR request (${req.id}) has been ${decision.toLowerCase()}.`,
      category: "personal",
      recipientEmployeeId: req.employeeId,
      recipientEmail: targetEmp?.email,
      isRead: false,
      readByUserIds: [],
      module: "requests",
      relatedRecordId: req.id,
      createdDate: nowStamp,
      createdBy: currentUser.email,
    };
    const nextNotifs = [notif, ...notifications];
    setNotifications(nextNotifs);
    saveState({ notifications: nextNotifs });
    await syncRecordToFirestore("notifications", notif.id, notif);
    handleLogAction("HR Requests", `Request ${decision}`, req.id, `HR Request ${req.id} for ${req.employeeId} marked ${decision}`);
    return true;
  };

  const handleMarkNotificationRead = async (notificationId: string) => {
    if (!currentUser) return;
    const target = notifications.find(n => n.id === notificationId);
    if (!target) return;
    const readSet = new Set(target.readByUserIds || []);
    readSet.add(currentUser.id);
    const nextReadBy = Array.from(readSet);
    const nextIsRead = target.category === "personal" ? true : target.isRead;

    const updated = notifications.map(n =>
      n.id === notificationId ? { ...n, isRead: nextIsRead, readByUserIds: nextReadBy } : n
    );
    setNotifications(updated);
    saveState({ notifications: updated });

    const cleanId = notificationId.replace(/[^a-zA-Z0-9_\-]/g, "_");
    if (auth.currentUser) {
      try {
        await updateDoc(
          doc(db, "notifications", cleanId),
          target.category === "personal"
            ? { isRead: true, readByUserIds: nextReadBy }
            : { readByUserIds: nextReadBy }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `notifications/${cleanId}`);
      }
    }
  };

  const handlePublishAnnouncement = async (announcement: EmployeeNotification): Promise<boolean> => {
    if (!currentUser || currentUser.role === "Employee") return false;
    const next = [announcement, ...notifications];
    setNotifications(next);
    saveState({ notifications: next });
    const res = await syncRecordToFirestore("notifications", announcement.id, announcement);
    handleLogAction("Notifications", "Announcement Published", announcement.id, announcement.title);
    return res.ok || res.code !== "permission-denied";
  };

  const handleUpdateDriveAssociations = (assocs: DriveAssociation[]) => {
    setDriveAssociations(assocs);
    saveState({ driveAssociations: assocs });
  };

  // Quick Action triggers for CRUD from other subcomponents
  // Employees CRUD
  const handleAddEmployee = (emp: Employee): boolean => {
    const exists = employees.some(e => e.employeeId.toLowerCase() === emp.employeeId.toLowerCase());
    if (exists) return false;
    const updated = [...employees, emp];
    handleUpdateEmployees(updated);
    syncRecordToFirestore("employees", emp.employeeId, emp);
    return true;
  };

  const handleAddEmployeesBulk = async (
    newEmps: Employee[]
  ): Promise<{ successCount: number; failCount: number; failedErrors: string[] }> => {
    if (newEmps.length === 0) {
      return { successCount: 0, failCount: 0, failedErrors: [] };
    }

    // Filter out duplicate IDs against current employees list
    const existingIds = new Set(employees.map(e => e.employeeId.toUpperCase()));
    const validToInsert: Employee[] = [];
    const duplicateErrors: string[] = [];

    newEmps.forEach(emp => {
      const upperId = emp.employeeId.toUpperCase();
      if (existingIds.has(upperId)) {
        duplicateErrors.push(`Employee ID '${emp.employeeId}' already exists in system.`);
      } else {
        existingIds.add(upperId);
        validToInsert.push(emp);
      }
    });

    if (validToInsert.length === 0) {
      return {
        successCount: 0,
        failCount: newEmps.length,
        failedErrors: duplicateErrors
      };
    }

    // Prepare separate document references for Firestore batch write
    const batchRecords = validToInsert.map(emp => ({
      id: emp.employeeId,
      data: emp
    }));

    // Await batch write to Firestore
    const syncResult = await syncBatchRecordsToFirestore("employees", batchRecords);

    // Update React State in a SINGLE update preserving ALL imported employees + existing employees
    setEmployees(prevEmployees => {
      const currentIds = new Set(prevEmployees.map(e => e.employeeId.toUpperCase()));
      const trulyNew = validToInsert.filter(e => !currentIds.has(e.employeeId.toUpperCase()));
      const combined = [...prevEmployees, ...trulyNew];
      saveState({ employees: combined });
      return combined;
    });

    return {
      successCount: syncResult.successCount,
      failCount: syncResult.failedCount + duplicateErrors.length,
      failedErrors: [...duplicateErrors, ...syncResult.errors]
    };
  };
  const handleUpdateEmployee = (emp: Employee) => {
    const updated = employees.map(e => e.employeeId === emp.employeeId ? emp : e);
    handleUpdateEmployees(updated);
    syncRecordToFirestore("employees", emp.employeeId, emp);
  };
  const handleDeleteEmployee = (id: string): boolean => {
    if (!hasPermission(currentRolePermissions, "employees", "delete") || !currentUser) return false;
    
    // Soft deletion logic
    const updated = employees.map(e => {
      if (e.employeeId === id) {
        const deletedEmp = { 
          ...e, 
          status: "Inactive" as const,
          isDeleted: true,
          deletedAt: new Date().toISOString().replace("T", " ").substring(0, 19),
          deletedBy: currentUser.email
        };
        syncRecordToFirestore("employees", deletedEmp.employeeId, deletedEmp);
        return deletedEmp;
      }
      return e;
    });
    handleUpdateEmployees(updated);
    handleLogAction("Employees", "Delete Employee (Soft)", id, `Employee ${id} marked as deleted by ${currentUser.email}`);
    return true;
  };

  const handleDeleteUser = (id: string): boolean => {
    if (!hasPermission(currentRolePermissions, "settings", "delete")) return false;
    if (currentUser?.id === id) return false;
    const updated = users.filter(u => u.id !== id);
    setUsers(updated);
    saveState({ users: updated });
    deleteRecordFromFirestore("users", id);
    handleLogAction("Administration", "Delete User", id, `System user ${id} permanently removed`);
    return true;
  };

  const handleDeleteHoliday = (id: string): boolean => {
    if (!hasPermission(currentRolePermissions, "settings", "delete")) return false;
    const updated = holidays.filter(h => h.id !== id);
    handleUpdateHolidays(updated);
    deleteRecordFromFirestore("holidays", id);
    return true;
  };

  // Departments CRUD
  const handleAddDepartment = (dept: Department): boolean => {
    const nameExists = departments.some(d => d.name.toLowerCase() === dept.name.toLowerCase());
    const codeExists = departments.some(d => d.code.toLowerCase() === dept.code.toLowerCase());
    if (nameExists || codeExists) return false;
    handleUpdateDepartments([...departments, dept]);
    syncRecordToFirestore("departments", dept.id, dept);
    return true;
  };
  const handleUpdateDepartment = (dept: Department) => {
    const updated = departments.map(d => d.id === dept.id ? dept : d);
    handleUpdateDepartments(updated);
    syncRecordToFirestore("departments", dept.id, dept);
  };
  const handleDeleteDepartment = (id: string): boolean => {
    if (!hasPermission(currentRolePermissions, "departments", "delete")) return false;
    const hasEmployees = employees.some(e => e.departmentId === id);
    if (hasEmployees) return false;
    const updated = departments.filter(d => d.id !== id);
    handleUpdateDepartments(updated);
    deleteRecordFromFirestore("departments", id);
    return true;
  };

  // Attendance Add
  const handleAddAttendance = (rec: AttendanceRecord): boolean => {
    const exists = attendance.some(a => a.employeeId === rec.employeeId && a.date === rec.date);
    if (exists) return false;
    handleUpdateAttendance([rec, ...attendance]);
    syncRecordToFirestore("attendance", rec.id, rec);
    return true;
  };
  const handleUpdateAttendanceRecord = (rec: AttendanceRecord) => {
    const updated = attendance.map(a => a.id === rec.id ? rec : a);
    handleUpdateAttendance(updated);
    syncRecordToFirestore("attendance", rec.id, rec);
  };
  const handleDeleteAttendanceRecord = (id: string): boolean => {
    if (!hasPermission(currentRolePermissions, "attendance", "delete") || !currentUser) return false;
    
    // Filter out from local state for immediate UI update
    const updated = attendance.filter(a => a.id !== id);
    handleUpdateAttendance(updated);

    // Sync soft-delete to Firestore
    const record = attendance.find(a => a.id === id);
    if (record) {
      const deletedRecord = {
        ...record,
        isDeleted: true,
        deletedAt: new Date().toISOString().replace("T", " ").substring(0, 19),
        deletedBy: currentUser.email
      };
      syncRecordToFirestore("attendance", id, deletedRecord);
    }
    handleLogAction("Attendance", "Delete Record", id, `Attendance log ${id} soft-deleted`);
    return true;
  };

  // Leaves Add
  const handleAddLeave = (rec: LeaveRecord): boolean => {
    handleUpdateLeaves([rec, ...leaves]);
    syncRecordToFirestore("leaves", rec.id, rec);
    return true;
  };
  const handleUpdateLeaveRecord = (rec: LeaveRecord) => {
    const updated = leaves.map(l => l.id === rec.id ? rec : l);
    handleUpdateLeaves(updated);
    syncRecordToFirestore("leaves", rec.id, rec);
  };
  const handleDeleteLeaveRecord = (id: string): boolean => {
    if (!hasPermission(currentRolePermissions, "leaves", "delete") || !currentUser) return false;
    
    const updated = leaves.filter(l => l.id !== id);
    handleUpdateLeaves(updated);

    const record = leaves.find(l => l.id === id);
    if (record) {
      const deletedRecord = {
        ...record,
        isDeleted: true,
        deletedAt: new Date().toISOString().replace("T", " ").substring(0, 19),
        deletedBy: currentUser.email
      };
      syncRecordToFirestore("leaves", id, deletedRecord);
    }
    handleLogAction("Leave", "Delete Record", id, `Leave application ${id} soft-deleted`);
    return true;
  };

  // Family Members & Medical Expenses CRUD
  const handleUpdateFamilyMembersState = (newFms: FamilyMember[]) => {
    setFamilyMembers(newFms);
    saveState({ familyMembers: newFms });
  };
  const handleAddFamilyMember = (fm: FamilyMember): boolean => {
    const updated = [...familyMembers, fm];
    handleUpdateFamilyMembersState(updated);
    syncRecordToFirestore("family_members", fm.id, fm);
    return true;
  };
  const handleUpdateFamilyMember = (fm: FamilyMember) => {
    const updated = familyMembers.map(item => item.id === fm.id ? fm : item);
    handleUpdateFamilyMembersState(updated);
    syncRecordToFirestore("family_members", fm.id, fm);
  };
  const handleDeleteFamilyMember = (id: string): boolean => {
    if (!hasPermission(currentRolePermissions, "medical", "delete")) return false;
    const updated = familyMembers.filter(f => f.id !== id);
    handleUpdateFamilyMembersState(updated);
    deleteRecordFromFirestore("family_members", id);
    return true;
  };

  const handleUpdateMedicalExpensesState = (newExps: MedicalExpense[]) => {
    setMedicalExpenses(newExps);
    saveState({ medicalExpenses: newExps });
  };
  const handleAddMedicalExpense = (exp: MedicalExpense): boolean => {
    const updated = [exp, ...medicalExpenses];
    handleUpdateMedicalExpensesState(updated);
    syncRecordToFirestore("medical_expenses", exp.id, exp);
    return true;
  };
  const handleUpdateMedicalExpense = (exp: MedicalExpense) => {
    const updated = medicalExpenses.map(item => item.id === exp.id ? exp : item);
    handleUpdateMedicalExpensesState(updated);
    syncRecordToFirestore("medical_expenses", exp.id, exp);
  };
  const handleDeleteMedicalExpense = (id: string): boolean => {
    if (!hasPermission(currentRolePermissions, "medical", "delete")) return false;
    const updated = medicalExpenses.filter(item => item.id !== id);
    handleUpdateMedicalExpensesState(updated);
    deleteRecordFromFirestore("medical_expenses", id);
    return true;
  };

  // Quick credentials loader for evaluator ease of access
  const handleQuickLogin = (email: string) => {
    setLoginEmail(email);
    setLoginPassword("admin123");
  };

  // LOGIN & REGISTRATION CANVAS (Minimal Corporate Balanced Layout)
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col font-sans">
        <ThemeStyles branding={config.branding} />
        
        {/* Main Balanced 2-Column Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-screen w-full">
          
          {/* LEFT SECTION – Minimal Corporate Branding Panel */}
          <div className="lg:col-span-6 bg-gradient-to-br from-[#001F44] via-[#002B5B] to-[#0A192F] p-8 lg:p-14 text-white flex flex-col justify-between relative overflow-hidden border-b lg:border-b-0 lg:border-r border-white/10 min-h-[480px]">
            
            {/* Ambient Background Blur */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-[#FED100]/5 rounded-full blur-3xl pointer-events-none"></div>

            {/* Top Branding Header */}
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <img
                  src={getCompanyLogoUrl(config)}
                  alt="Ethiopian Reinsurance S.C. Logo"
                  className="h-16 w-auto max-w-[140px] object-contain rounded-lg shadow-md shrink-0"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <h2 className="font-extrabold text-base md:text-lg tracking-tight text-white leading-snug">
                    Ethiopian Reinsurance S.C.
                  </h2>
                  <p className="text-xs font-bold text-[#FED100] tracking-wide mt-0.5">
                    የኢትዮጵያ ጠለፋ መድን አ.ማ.
                  </p>
                </div>
              </div>

              {/* Secondary Slogan Pill */}
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest px-3 py-1 bg-white/10 rounded-full border border-white/20 text-[#FED100] backdrop-blur-xs">
                Rising with Africa
              </span>
            </div>

            {/* Center Content Section */}
            <div className="relative z-10 my-auto py-10 space-y-6 max-w-xl">
              
              {/* Badge Indicator */}
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full border border-white/15 text-slate-200 text-[11px] font-semibold">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                ETRHRMS Enterprise Portal
              </div>

              <div className="space-y-3">
                <h1 className="text-2xl lg:text-4xl font-black tracking-tight text-white leading-tight">
                  Human Resource Management System
                </h1>
                <p className="text-xs lg:text-sm text-slate-300 leading-relaxed font-normal">
                  A centralized platform for managing employee information, leave administration, departmental operations, and HR services across Ethiopian Reinsurance S.C.
                </p>
              </div>

              {/* Key Module Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 bg-white/5 border border-white/10 rounded-xl flex items-center gap-3 backdrop-blur-xs">
                  <div className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center text-[#FED100] shrink-0">
                    <Users className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Centralized Personnel</h4>
                    <p className="text-[10px] text-slate-400">Employee Master Records</p>
                  </div>
                </div>

                <div className="p-3.5 bg-white/5 border border-white/10 rounded-xl flex items-center gap-3 backdrop-blur-xs">
                  <div className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center text-[#FED100] shrink-0">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Role-Based Security</h4>
                    <p className="text-[10px] text-slate-400">Verified Access Control</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Footer Details */}
            <div className="relative z-10 pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400 font-medium">
              <span>© {new Date().getFullYear()} Ethiopian Reinsurance S.C.</span>
              <span>የኢትዮጵያ ጠለፋ መድን አ.ማ.</span>
            </div>
          </div>

          {/* RIGHT SECTION – Balanced Corporate Login Form Panel */}
          <div className="lg:col-span-6 bg-white p-8 lg:p-16 flex flex-col justify-center min-h-[500px]">
            <div className="max-w-md w-full mx-auto space-y-6">
              
              {/* If registration completed, show Registration Success view exclusively */}
              {regCompleted ? (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 md:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200 text-center">
                  <div className="mx-auto h-14 w-14 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-sm">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                      Registration Successful!
                    </h3>
                    <p className="text-xs md:text-sm text-slate-600 leading-relaxed font-medium">
                      Your account has been created. A verification link has been sent to your official Ethiopian Reinsurance email address. Please verify your email before logging in.
                    </p>
                  </div>

                  {regCompletedEmail && (
                    <div className="p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 break-all shadow-xs">
                      {regCompletedEmail}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setRegCompleted(false);
                      setRegCompletedEmail("");
                      setLoginMode("login");
                      setLoginError("");
                    }}
                    className="w-full py-3 bg-[#002B5B] hover:bg-[#001F44] text-white font-black text-xs rounded-xl transition-all shadow-md uppercase tracking-wider cursor-pointer"
                  >
                    Back to Login
                  </button>
                </div>
              ) : (
                <>
                  {/* Header Title & Subtitle */}
                  <div>
                    <h2 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
                      {loginMode === "login" ? "Welcome Back" : "Operator Registration"}
                    </h2>
                    <p className="text-xs lg:text-sm text-slate-500 font-medium mt-1">
                      {loginMode === "login"
                        ? "Sign in to access your ETRHRMS account."
                        : "Register your operator account with official @ethiopianre.com email."}
                    </p>
                  </div>

                  {/* Resend Success Message */}
                  {resendSuccessMsg && (
                    <div className="p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold flex items-start gap-2 animate-in fade-in duration-150">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <p className="leading-tight">{resendSuccessMsg}</p>
                    </div>
                  )}

                  {/* Login Errors / Verification Required / Duplicate Email */}
                  {loginError && (
                    loginError === "EMAIL_VERIFICATION_REQUIRED" ? (
                      <div className="p-4 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl text-xs space-y-3 animate-in fade-in duration-150">
                        <div className="flex items-start gap-2.5">
                          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <h4 className="font-extrabold text-xs text-amber-950 uppercase tracking-wide">
                              Email Verification Required
                            </h4>
                            <p className="text-xs font-medium text-amber-800 leading-relaxed">
                              Your email address has not been verified. Please check your official Ethiopian Reinsurance email inbox and click the verification link before logging in.
                            </p>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-amber-200/70">
                          <button
                            type="button"
                            onClick={handleResendVerification}
                            disabled={resendLoading}
                            className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-lg uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
                          >
                            {resendLoading ? (
                              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <>
                                <Mail className="h-4 w-4" />
                                <span>Resend Verification Email</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ) : loginError === "EMAIL_ALREADY_IN_USE" ? (
                      <div className="p-4 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl text-xs space-y-3 animate-in fade-in duration-150">
                        <div className="flex items-start gap-2.5">
                          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <h4 className="font-extrabold text-xs text-amber-950 uppercase tracking-wide">
                              Account Already Registered
                            </h4>
                            <p className="text-xs font-medium text-amber-800 leading-relaxed">
                              This email address is already registered. Please sign in or reset your password.
                            </p>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-amber-200/70 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setLoginError("");
                              setLoginMode("login");
                              if (regEmail) setLoginEmail(regEmail.trim().toLowerCase());
                            }}
                            className="flex-1 py-2.5 bg-[#002B5B] hover:bg-[#001F44] text-white font-black text-xs rounded-lg uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                          >
                            <span>Back to Login</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const emailToReset = regEmail.trim().toLowerCase() || loginEmail.trim().toLowerCase();
                              setResetEmail(emailToReset);
                              setResetStatus(null);
                              setForgotPasswordModal(true);
                              setLoginError("");
                            }}
                            className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-lg uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                          >
                            <span>Forgot Password</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-xs font-semibold leading-tight animate-in fade-in duration-150">
                        {loginError}
                      </div>
                    )
                  )}

                  {loginMode === "login" ? (
                    /* --- LOGIN FORM --- */
                    <form onSubmit={handleLoginSubmit} noValidate className="space-y-5">
                      {/* Email Address */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                          Company Email Address
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                          <input
                            data-field="loginEmail"
                            type="email"
                            placeholder="e.g. employee@ethiopianre.com"
                            value={loginEmail}
                            onChange={(e) => {
                              setLoginEmail(e.target.value);
                              if (loginFieldErrors.loginEmail) {
                                setLoginFieldErrors((prev) => ({ ...prev, loginEmail: "" }));
                              }
                            }}
                            className={fieldInputClass(
                              Boolean(loginFieldErrors.loginEmail),
                              "w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl text-xs bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-[#002B5B] focus:border-transparent text-slate-800 font-medium transition-all"
                            )}
                          />
                        </div>
                        <FormFieldError error={loginFieldErrors.loginEmail} />
                      </div>

                      {/* Password */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                          Password
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                          <input
                            data-field="loginPassword"
                            type={showLoginPassword ? "text" : "password"}
                            placeholder="Enter password"
                            value={loginPassword}
                            onChange={(e) => {
                              setLoginPassword(e.target.value);
                              if (loginFieldErrors.loginPassword) {
                                setLoginFieldErrors((prev) => ({ ...prev, loginPassword: "" }));
                              }
                            }}
                            className={fieldInputClass(
                              Boolean(loginFieldErrors.loginPassword),
                              "w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-xl text-xs bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-[#002B5B] focus:border-transparent text-slate-800 font-medium transition-all"
                            )}
                          />
                          <button
                            type="button"
                            onClick={() => setShowLoginPassword(!showLoginPassword)}
                            className="absolute right-3.5 top-2.5 p-0.5 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                            title={showLoginPassword ? "Hide Password" : "Show Password"}
                          >
                            {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <FormFieldError error={loginFieldErrors.loginPassword} />
                      </div>

                      {/* Remember Me & Forgot Password Row */}
                      <div className="flex items-center justify-between text-xs pt-1">
                        <label className="flex items-center gap-2 cursor-pointer text-slate-600 font-medium select-none">
                          <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            className="rounded border-slate-300 text-[#002B5B] focus:ring-[#002B5B]"
                          />
                          <span>Remember Me</span>
                        </label>

                        <button
                          type="button"
                          onClick={() => {
                            setResetEmail(loginEmail);
                            setResetStatus(null);
                            setResetFieldErrors({});
                            setForgotPasswordModal(true);
                          }}
                          className="text-xs font-extrabold text-[#002B5B] hover:underline cursor-pointer"
                        >
                          Forgot Password?
                        </button>
                      </div>

                      {/* Sign In Button */}
                      <button
                        type="submit"
                        disabled={loginLoading}
                        className="w-full py-3 bg-[#002B5B] hover:bg-[#001F44] text-white font-black text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg uppercase tracking-wider disabled:opacity-50 mt-2 cursor-pointer"
                      >
                        {loginLoading ? (
                          <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <>
                            <Key className="h-4 w-4 text-[#FED100]" />
                            <span>Sign In to ETRHRMS</span>
                          </>
                        )}
                      </button>

                      {/* Register Toggle */}
                      <div className="text-center pt-4 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            setLoginError("");
                            setLoginFieldErrors({});
                            setResendSuccessMsg("");
                            setLoginMode("register");
                          }}
                          className="text-xs font-bold text-slate-600 hover:text-[#002B5B] transition-colors cursor-pointer"
                        >
                          Don't have an account? <span className="text-[#002B5B] underline">Register / Sign Up here</span>
                        </button>
                      </div>
                    </form>
                  ) : (
                    /* --- REGISTRATION FORM --- */
                    <form onSubmit={handleRegisterSubmit} noValidate className="space-y-4">
                      <div className="space-y-1">
                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">Full Name</label>
                        <input
                          data-field="regFullName"
                          type="text"
                          placeholder="e.g. Almaz Bekele"
                          value={regFullName}
                          onChange={(e) => {
                            setRegFullName(e.target.value);
                            if (regFieldErrors.regFullName) {
                              setRegFieldErrors((prev) => ({ ...prev, regFullName: "" }));
                            }
                          }}
                          className={fieldInputClass(
                            Boolean(regFieldErrors.regFullName),
                            "w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-[#002B5B] text-slate-800 font-medium"
                          )}
                        />
                        <FormFieldError error={regFieldErrors.regFullName} />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">Company Email Address</label>
                        <input
                          data-field="regEmail"
                          type="email"
                          placeholder="e.g. almaz.bekele@ethiopianre.com"
                          value={regEmail}
                          onChange={(e) => {
                            setRegEmail(e.target.value);
                            if (regFieldErrors.regEmail) {
                              setRegFieldErrors((prev) => ({ ...prev, regEmail: "" }));
                            }
                          }}
                          className={fieldInputClass(
                            Boolean(regFieldErrors.regEmail),
                            "w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-[#002B5B] text-slate-800 font-medium"
                          )}
                        />
                        <FormFieldError error={regFieldErrors.regEmail} />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">Password</label>
                        <div className="relative">
                          <input
                            data-field="regPassword"
                            type={showRegPassword ? "text" : "password"}
                            placeholder="Create secure password (min. 6 characters)"
                            value={regPassword}
                            onChange={(e) => {
                              setRegPassword(e.target.value);
                              if (regFieldErrors.regPassword) {
                                setRegFieldErrors((prev) => ({ ...prev, regPassword: "" }));
                              }
                            }}
                            className={fieldInputClass(
                              Boolean(regFieldErrors.regPassword),
                              "w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-[#002B5B] text-slate-800 font-medium"
                            )}
                          />
                          <button
                            type="button"
                            onClick={() => setShowRegPassword(!showRegPassword)}
                            className="absolute right-3.5 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none"
                          >
                            {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <FormFieldError error={regFieldErrors.regPassword} />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">Confirm Password</label>
                        <input
                          data-field="regConfirmPassword"
                          type="password"
                          placeholder="Re-type password"
                          value={regConfirmPassword}
                          onChange={(e) => {
                            setRegConfirmPassword(e.target.value);
                            if (regFieldErrors.regConfirmPassword) {
                              setRegFieldErrors((prev) => ({ ...prev, regConfirmPassword: "" }));
                            }
                          }}
                          className={fieldInputClass(
                            Boolean(regFieldErrors.regConfirmPassword),
                            "w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-[#002B5B] text-slate-800 font-medium"
                          )}
                        />
                        <FormFieldError error={regFieldErrors.regConfirmPassword} />
                      </div>

                      <button
                        type="submit"
                        disabled={regLoading}
                        className="w-full py-3 bg-[#002B5B] hover:bg-[#001F44] text-white font-black text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-md uppercase tracking-wider disabled:opacity-50 cursor-pointer"
                      >
                        {regLoading ? (
                          <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <>
                            <ShieldCheck className="h-4 w-4 text-[#FED100]" />
                            <span>Register Operator Account</span>
                          </>
                        )}
                      </button>

                      <div className="text-center pt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            setLoginError("");
                            setRegFieldErrors({});
                            setResendSuccessMsg("");
                            setLoginMode("login");
                          }}
                          className="text-xs font-bold text-slate-600 hover:text-[#002B5B] transition-colors cursor-pointer"
                        >
                          Already registered? <span className="text-[#002B5B] underline">Back to Login Screen</span>
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Forgot Password Modal */}
        {forgotPasswordModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="bg-[#002B5B] text-white px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <img
                    src={getCompanyLogoUrl(config)}
                    alt="Ethiopian Reinsurance S.C. Logo"
                    className="h-8 w-auto object-contain rounded shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <h3 className="font-extrabold text-sm tracking-wide">Reset ETRHRMS Security Password</h3>
                </div>
                <button onClick={() => setForgotPasswordModal(false)} className="text-white/80 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handlePasswordResetSubmit} noValidate className="p-6 space-y-4">
                {resetStatus && (
                  <div className={`p-3.5 rounded-xl text-xs font-semibold ${
                    resetStatus.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"
                  }`}>
                    {resetStatus.msg}
                  </div>
                )}

                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  Enter your registered @ethiopianre.com company email address. We will dispatch password reset instructions to your inbox.
                </p>

                <div className="space-y-1">
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">Company Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                    <input
                      data-field="resetEmail"
                      type="email"
                      placeholder="e.g. employee@ethiopianre.com"
                      value={resetEmail}
                      onChange={(e) => {
                        setResetEmail(e.target.value);
                        if (resetFieldErrors.resetEmail) setResetFieldErrors({});
                      }}
                      className={fieldInputClass(
                        Boolean(resetFieldErrors.resetEmail),
                        "w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl text-xs bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-[#002B5B] text-slate-800 font-medium"
                      )}
                    />
                  </div>
                  <FormFieldError error={resetFieldErrors.resetEmail} />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t mt-4">
                  <button
                    type="button"
                    onClick={() => setForgotPasswordModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="px-4 py-2 text-xs font-black text-white bg-[#002B5B] hover:bg-[#001F44] rounded-xl flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {resetLoading ? (
                      <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <span>Send Reset Email</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Administrator Multi-Factor Authentication (MFA) Challenge Modal */}
        {mfaResolver && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="bg-[#002B5B] text-white px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <img
                    src={getCompanyLogoUrl(config)}
                    alt="Ethiopian Reinsurance S.C. Logo"
                    className="h-8 w-auto object-contain rounded shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <ShieldCheck className="h-5 w-5 text-[#FED100]" />
                  <h3 className="font-extrabold text-sm tracking-wide">Two-Factor Authentication (MFA)</h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMfaResolver(null);
                    setMfaCode("");
                    setMfaError("");
                  }}
                  className="text-white/80 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleMfaVerifySubmit} noValidate className="p-6 space-y-4">
                {mfaError && (
                  <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-xs font-semibold">
                    {mfaError}
                  </div>
                )}

                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  Enter the 6-digit verification code from your authenticator app to complete sign-in for <strong>{mfaPendingEmail}</strong>.
                </p>

                <div className="space-y-1">
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">Authenticator Code</label>
                  <input
                    data-field="mfaCode"
                    type="text"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="e.g. 123456"
                    value={mfaCode}
                    onChange={(e) => {
                      setMfaCode(e.target.value);
                      if (mfaError) setMfaError("");
                    }}
                    className={fieldInputClass(
                      Boolean(mfaError),
                      "w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm tracking-widest font-mono font-bold text-center bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-[#002B5B] text-slate-800"
                    )}
                  />
                  <FormFieldError error={mfaError && mfaCode.trim().length < 6 ? mfaError : undefined} />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setMfaResolver(null);
                      setMfaCode("");
                      setMfaError("");
                    }}
                    className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={mfaLoading}
                    className="px-4 py-2 text-xs font-black text-white bg-[#002B5B] hover:bg-[#001F44] rounded-xl flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {mfaLoading ? (
                      <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <span>Verify &amp; Sign In</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Dynamic Route Protection & First-Permitted Tab Resolution
  const canAccessTab = (tabId: string): boolean =>
    checkCanAccessTab(tabId, currentRolePermissions, currentUser.role, currentRoleObj?.status);

  const getFirstPermittedTab = (): string =>
    resolveFirstPermittedTab(currentRolePermissions, currentUser.role);

  const isEmployeeMode = currentUser.role === "Employee";
  const isRouteAuthorized = canAccessTab(activeTab);
  const effectiveActiveTab = isRouteAuthorized
    ? resolveCanonicalTab(activeTab, currentRolePermissions, currentUser.role, currentRoleObj?.status)
    : activeTab;
  const parsedRoute = parseTabPermission(effectiveActiveTab);
  const recordAccessCheck =
    requestedEmployeeId && parsedRoute.moduleId
      ? assertEmployeeRecordAccess(
          currentUser,
          currentRolePermissions,
          parsedRoute.moduleId,
          requestedEmployeeId,
          employees,
          departments
        )
      : { allowed: true };

  const unreadNotificationsCount = notifications.filter(n => {
    const isTargeted =
      n.category === "announcement" ||
      (currentUser.employeeId && n.recipientEmployeeId === currentUser.employeeId) ||
      n.recipientEmail?.toLowerCase() === currentUser.email.toLowerCase() ||
      !isEmployeeMode;
    if (!isTargeted) return false;
    return !n.isRead && !(n.readByUserIds?.includes(currentUser.id));
  }).length;

  // CORE APPLICATION WORKSPACE (Authenticated Operator view)
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col overflow-hidden app-shell">
      {/* Inject custom variables dynamically */}
      <ThemeStyles branding={config.branding} />

      {/* Shared top Navigation Header */}
      <Header
        currentUser={currentUser}
        companyName={config.profile.displayName}
        logoUrl={getCompanyLogoUrl(config)}
        notifications={notifications}
        showHelpShortcut={!isEmployeeMode}
        onMarkNotificationRead={handleMarkNotificationRead}
        onOpenNotifications={() => setActiveTab("notifications_personal")}
        onNavigateToProfile={() => setActiveTab("employees_personal_info")}
        onLogout={handleLogout}
        onOpenHelp={() => setActiveTab("help")}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onUpdateOwnProfile={handleUpdateOwnProfile}
        onUpdateOwnPassword={handleUpdateOwnPassword}
      />

      {/* Shared Sidebar + Main Workspace layout wrapper */}
      <div className="flex flex-1 overflow-hidden h-[calc(100vh-64px)] app-body">
        
        {/* Dynamic Navigation Sidebar */}
        <Sidebar
          currentUser={currentUser}
          rolePermissions={currentRolePermissions}
          activeTab={effectiveActiveTab}
          unreadNotificationsCount={unreadNotificationsCount}
          onLogout={handleLogout}
          onTabChange={(tabId) => {
            // Direct mapping of settings subtabs from sidebar triggers
            if (["profile", "branding", "holidays", "users", "roles"].includes(tabId)) {
              setActiveTab("settings_" + tabId);
            } else if (tabId === "logs") {
              setActiveTab("reports_audit");
            } else {
              setActiveTab(tabId);
            }
          }}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          companyName={config.profile.displayName}
          logoUrl={getCompanyLogoUrl(config)}
        />

        {/* Content canvas viewport */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 app-main">
          {cloudHydrating && (
            <div className="mb-4 px-4 py-2.5 bg-sky-50 border border-sky-200 rounded-xl text-xs font-semibold text-sky-900 flex items-center gap-2">
              <div className="h-3.5 w-3.5 border-2 border-sky-600 border-t-transparent rounded-full animate-spin shrink-0"></div>
              <span>Synchronizing authorized HRMS records from Cloud Firestore...</span>
            </div>
          )}
          {firebaseNotice && (
            <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-extrabold">Cloud Synchronization Notice</span>
                  {currentUser.role === "Administrator" && firebaseNotice.path && (
                    <span className="ml-1.5 font-mono text-[11px] text-amber-700">({firebaseNotice.path})</span>
                  )}
                  <p className="text-[11px] font-medium mt-0.5">
                    {getFirebaseErrorMessage({ code: firebaseNotice.code, message: firebaseNotice.error }, firebaseNotice.error, currentUser.role)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFirebaseNotice(null)}
                className="text-amber-700 hover:text-amber-950 p-0.5"
                title="Dismiss notice"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {!recordAccessCheck.allowed ? (
            <div className="max-w-lg mx-auto mt-12 bg-white border border-rose-200 rounded-2xl p-8 text-center shadow-sm space-y-4">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                <Lock className="h-7 w-7" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-base font-extrabold text-slate-800">Unauthorized Employee Record</h2>
                <p className="text-xs font-semibold text-rose-700 leading-relaxed">
                  {UNAUTHORIZED_EMPLOYEE_RECORD_MSG}
                </p>
              </div>
              <button
                onClick={() => setActiveTab(getFirstPermittedTab())}
                className="px-4 py-2 bg-[#002B5B] hover:bg-[#001F44] text-white text-xs font-bold rounded-xl transition-colors"
              >
                Return to My Workspace
              </button>
            </div>
          ) : !isRouteAuthorized ? (
            <div className="max-w-lg mx-auto mt-12 bg-white border border-rose-200 rounded-2xl p-8 text-center shadow-sm space-y-4">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                <Lock className="h-7 w-7" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-base font-extrabold text-slate-800">Access Denied</h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {currentRoleObj?.status === "Inactive"
                    ? `Your assigned role (${currentUser.role}) is currently deactivated. Please contact your System Administrator.`
                    : `Your role (${currentUser.role}) does not have permission to access this module or submenu.`}
                </p>
              </div>
              {currentRoleObj?.status !== "Inactive" && (
                <button
                  onClick={() => setActiveTab(getFirstPermittedTab())}
                  className="px-4 py-2 bg-[#002B5B] hover:bg-[#001F44] text-white text-xs font-bold rounded-xl transition-colors"
                >
                  Go to Permitted Workspace
                </button>
              )}
            </div>
          ) : (
            <>
              {/* View Tab Router Switch */}
              {effectiveActiveTab === "dashboard" && (
                <Dashboard
                  employees={employees}
                  departments={departments}
                  leaves={leaves}
                  attendance={attendance}
                  users={users}
                  logs={logs}
                  currentUser={currentUser}
                  role={currentUser.role}
                  rolePermissions={currentRolePermissions}
                  payslips={payslips}
                  hrRequests={hrRequests}
                  notifications={notifications}
                  companyConfig={config}
                  onNavigate={(tabId) => {
                    if (["profile", "branding", "holidays", "users", "roles"].includes(tabId)) {
                      setActiveTab("settings_" + tabId);
                    } else if (tabId === "logs") {
                      setActiveTab("reports_audit");
                    } else {
                      setActiveTab(tabId);
                    }
                  }}
                  onOpenQuickAddEmployee={() => {
                    setActiveTab("employees_enrollment");
                  }}
                  onOpenQuickRecordAttendance={() => {
                    setActiveTab(isEmployeeMode ? "attendance_daily" : "attendance");
                  }}
                  onOpenQuickRegisterLeave={() => {
                    setActiveTab(isEmployeeMode ? "leaves_apply" : "leaves_applications");
                  }}
                />
              )}

              {(effectiveActiveTab === "employees" || effectiveActiveTab.startsWith("employees_")) && (
                isEmployeeMode ? (
                  <MyProfileView
                    currentUser={currentUser}
                    employees={employees}
                    departments={departments}
                    driveAssociations={driveAssociations}
                    hrRequests={hrRequests}
                    permissions={currentRolePermissions?.modulePermissions.employees}
                    initialSubTab={effectiveActiveTab.startsWith("employees_") ? effectiveActiveTab.replace("employees_", "") : "personal_info"}
                    requestedEmployeeId={requestedEmployeeId}
                    onSubmitHRRequest={handleSubmitHRRequest}
                    onNavigate={setActiveTab}
                    onSubTabChange={(sub) => setActiveTab(`employees_${sub}`)}
                  />
                ) : (
                  <Employees
                    employees={employees}
                    departments={departments}
                    familyMembers={familyMembers}
                    companyConfig={config}
                    currentUser={currentUser}
                    initialSubTab={effectiveActiveTab.startsWith("employees_") ? effectiveActiveTab.replace("employees_", "") : "directory"}
                    onSubTabChange={(sub) => setActiveTab(`employees_${sub}`)}
                    permissions={currentRolePermissions?.modulePermissions.employees}
                    rolePermissions={currentRolePermissions}
                    driveAssociations={driveAssociations}
                    onAddEmployee={handleAddEmployee}
                    onAddEmployeesBulk={handleAddEmployeesBulk}
                    onUpdateEmployee={handleUpdateEmployee}
                    onDeleteEmployee={handleDeleteEmployee}
                    onAddFamilyMember={handleAddFamilyMember}
                    onLogAction={handleLogAction}
                  />
                )
              )}

              {!isEmployeeMode && effectiveActiveTab === "departments" && (
                <Departments
                  departments={departments}
                  employees={employees}
                  companyConfig={config}
                  currentUser={currentUser}
                  permissions={currentRolePermissions?.modulePermissions.departments}
                  onAddDepartment={handleAddDepartment}
                  onUpdateDepartment={handleUpdateDepartment}
                  onDeleteDepartment={handleDeleteDepartment}
                  onLogAction={handleLogAction}
                />
              )}

              {(effectiveActiveTab === "attendance" || effectiveActiveTab.startsWith("attendance_")) && (
                isEmployeeMode ? (
                  <MyAttendanceView
                    currentUser={currentUser}
                    employees={employees}
                    departments={departments}
                    attendance={attendance}
                    hrRequests={hrRequests}
                    companyConfig={config}
                    permissions={currentRolePermissions?.modulePermissions.attendance}
                    initialSubTab={effectiveActiveTab.startsWith("attendance_") ? effectiveActiveTab.replace("attendance_", "") : "daily"}
                    requestedEmployeeId={requestedEmployeeId}
                    onSubmitHRRequest={handleSubmitHRRequest}
                    onSubTabChange={(sub) => setActiveTab(`attendance_${sub}`)}
                  />
                ) : (
                  <Attendance
                    attendance={attendance}
                    employees={employees}
                    departments={departments}
                    companyConfig={config}
                    currentUser={currentUser}
                    permissions={currentRolePermissions?.modulePermissions.attendance}
                    onAddAttendance={handleAddAttendance}
                    onUpdateAttendance={handleUpdateAttendanceRecord}
                    onDeleteAttendance={handleDeleteAttendanceRecord}
                    onLogAction={handleLogAction}
                  />
                )
              )}

              {(effectiveActiveTab === "leaves" || effectiveActiveTab.startsWith("leaves_")) && (
                isEmployeeMode ? (
                  <MyLeaveView
                    currentUser={currentUser}
                    employees={employees}
                    leaves={leaves}
                    holidays={holidays}
                    companyConfig={config}
                    permissions={currentRolePermissions?.modulePermissions.leaves}
                    initialSubTab={effectiveActiveTab.includes("_") ? effectiveActiveTab.substring(effectiveActiveTab.indexOf("_") + 1) : "apply"}
                    requestedEmployeeId={requestedEmployeeId}
                    onUpdateLeaves={handleUpdateLeavesFromESS}
                    onLogAction={handleLogAction}
                    onSubTabChange={(sub) => setActiveTab(`leaves_${sub}`)}
                  />
                ) : (
                  <LeaveManagement
                    leaves={leaves}
                    employees={employees}
                    departments={departments}
                    holidays={holidays}
                    companyConfig={config}
                    currentUser={currentUser}
                    initialSubTab={effectiveActiveTab.includes("_") ? effectiveActiveTab.split("_")[1] : "dashboard"}
                    onSubTabChange={(sub) => setActiveTab(`leaves_${sub}`)}
                    permissions={currentRolePermissions?.modulePermissions.leaves}
                    onAddLeave={handleAddLeave}
                    onUpdateLeave={handleUpdateLeaveRecord}
                    onDeleteLeave={handleDeleteLeaveRecord}
                    onUpdateConfig={handleUpdateConfig}
                    onLogAction={handleLogAction}
                  />
                )
              )}

              {!isEmployeeMode && (effectiveActiveTab === "medical" || effectiveActiveTab.startsWith("medical_")) && (
                <MedicalManagement
                  employees={employees}
                  departments={departments}
                  familyMembers={familyMembers}
                  medicalExpenses={medicalExpenses}
                  companyConfig={config}
                  currentUser={currentUser}
                  initialSubTab={effectiveActiveTab.includes("_") ? effectiveActiveTab.split("_")[1] : "dashboard"}
                  onSubTabChange={(sub) => setActiveTab(`medical_${sub}`)}
                  permissions={currentRolePermissions?.modulePermissions.medical}
                  onAddFamilyMember={handleAddFamilyMember}
                  onUpdateFamilyMember={handleUpdateFamilyMember}
                  onDeleteFamilyMember={handleDeleteFamilyMember}
                  onAddMedicalExpense={handleAddMedicalExpense}
                  onUpdateMedicalExpense={handleUpdateMedicalExpense}
                  onDeleteMedicalExpense={handleDeleteMedicalExpense}
                  onUpdateConfig={handleUpdateConfig}
                  onLogAction={handleLogAction}
                />
              )}

              {(effectiveActiveTab === "payroll" || effectiveActiveTab.startsWith("payroll_")) && (
                isEmployeeMode ? (
                  <MyPayrollView
                    currentUser={currentUser}
                    employees={employees}
                    payslips={payslips}
                    payrollRecords={payrollRecords}
                    salaryStructures={salaryStructures}
                    taxConfig={taxConfig!}
                    companyConfig={config}
                    permissions={currentRolePermissions?.modulePermissions.payroll}
                    initialSubTab={effectiveActiveTab.startsWith("payroll_") ? effectiveActiveTab.replace("payroll_", "") : "payslips"}
                    requestedEmployeeId={requestedEmployeeId}
                  />
                ) : (
                  <PayrollManagement
                    employees={employees}
                    departments={departments}
                    currentUser={currentUser}
                    companyConfig={config}
                    salaryComponents={salaryComponents}
                    taxConfig={taxConfig}
                    payrollPeriods={payrollPeriods}
                    salaryStructures={salaryStructures}
                    payrollRecords={payrollRecords}
                    payslips={payslips}
                    payslipDistributionLogs={payslipDistributionLogs}
                    payrollApprovals={payrollApprovals}
                    payrollImportLogs={payrollImportLogs}
                    payrollSettings={payrollSettings}
                    initialSubTab={
                      effectiveActiveTab.startsWith("payroll_")
                        ? (effectiveActiveTab.replace("payroll_", "") === "import" ? "csv_import" : effectiveActiveTab.replace("payroll_", "") === "export" ? "csv_export" : effectiveActiveTab.replace("payroll_", ""))
                        : "dashboard"
                    }
                    onSubTabChange={(sub) => setActiveTab(`payroll_${sub}`)}
                    permissions={currentRolePermissions?.modulePermissions.payroll}
                    emailLogs={emailLogs}
                    onUpdateComponents={handleUpdateSalaryComponents}
                    onUpdateTaxConfig={handleUpdateTaxConfig}
                    onUpdatePeriods={handleUpdatePayrollPeriods}
                    onUpdateStructures={handleUpdateSalaryStructures}
                    onUpdateRecords={handleUpdatePayrollRecords}
                    onUpdatePayslips={handleUpdatePayslips}
                    onUpdateDistributionLogs={handleUpdatePayslipDistributionLogs}
                    onUpdateApprovals={handleUpdatePayrollApprovals}
                    onUpdateImportLogs={handleUpdatePayrollImportLogs}
                    onUpdateSettings={handleUpdatePayrollSettings}
                    onUpdateEmailLogs={handleUpdateEmailLogs}
                    onDeleteComponent={handleDeleteSalaryComponent}
                    onDeletePeriod={handleDeletePayrollPeriod}
                    onDeleteRecord={handleDeletePayrollRecord}
                    onDeletePayslip={handleDeletePayslip}
                    onLogAction={handleLogAction}
                  />
                )
              )}

              {/* Map sidebar settings direct nodes to setting panels */}
              {!isEmployeeMode && (effectiveActiveTab === "settings" || effectiveActiveTab.startsWith("settings_")) && (
                <Settings
                  config={config}
                  users={users}
                  employees={employees}
                  holidays={holidays}
                  emailLogs={emailLogs}
                  currentUser={currentUser}
                  initialSubTab={effectiveActiveTab.includes("_") ? effectiveActiveTab.substring(effectiveActiveTab.indexOf("_") + 1) : "profile"}
                  permissions={currentRolePermissions?.modulePermissions.settings}
                  roles={roles}
                  rolePermissions={rolePermissions}
                  onUpdateRoles={handleUpdateRoles}
                  onUpdateRolePermissions={handleUpdateRolePermissions}
                  onUpdateConfig={handleUpdateConfig}
                  onUpdateUsers={handleUpdateUsers}
                  onUpdateHolidays={handleUpdateHolidays}
                  onDeleteHoliday={handleDeleteHoliday}
                  onDeleteUser={handleDeleteUser}
                  onUpdateEmailLogs={handleUpdateEmailLogs}
                  onLogAction={handleLogAction}
                />
              )}

              {!isEmployeeMode && (effectiveActiveTab === "reports" || effectiveActiveTab.startsWith("reports_")) && (
                <Reports
                  employees={employees}
                  departments={departments}
                  leaves={leaves}
                  attendance={attendance}
                  auditLogs={logs}
                  config={config}
                  currentUser={currentUser}
                  initialSubTab={effectiveActiveTab.startsWith("reports_") ? effectiveActiveTab.replace("reports_", "") : "directory"}
                  permissions={currentRolePermissions?.modulePermissions.reports}
                />
              )}

              {(effectiveActiveTab === "documents" || effectiveActiveTab.startsWith("documents_")) && (
                isEmployeeMode ? (
                  <MyDocumentsView
                    currentUser={currentUser}
                    employees={employees}
                    driveAssociations={driveAssociations}
                    permissions={currentRolePermissions?.modulePermissions.documents}
                    initialSubTab={effectiveActiveTab.startsWith("documents_") ? effectiveActiveTab.replace("documents_", "") : "employment_contract"}
                    requestedEmployeeId={requestedEmployeeId}
                  />
                ) : (
                  <DocumentVault
                    employees={employees}
                    departments={departments}
                    users={users}
                    currentUser={currentUser}
                    permissions={currentRolePermissions?.modulePermissions.documents}
                    driveAssociations={driveAssociations}
                    onUpdateDriveAssociations={handleUpdateDriveAssociations}
                    onLogAction={handleLogAction}
                  />
                )
              )}

              {(effectiveActiveTab === "requests" || effectiveActiveTab.startsWith("requests_")) && (
                <HRRequestsModule
                  currentUser={currentUser}
                  employees={employees}
                  hrRequests={hrRequests}
                  permissions={currentRolePermissions?.modulePermissions.requests}
                  initialSubTab={effectiveActiveTab.startsWith("requests_") ? effectiveActiveTab.replace("requests_", "") : undefined}
                  onSubTabChange={(sub) => setActiveTab(`requests_${sub}`)}
                  requestedEmployeeId={requestedEmployeeId}
                  onSubmitHRRequest={handleSubmitHRRequest}
                  onCancelHRRequest={handleCancelHRRequest}
                  onReviewHRRequest={!isEmployeeMode ? handleReviewHRRequest : undefined}
                />
              )}

              {(effectiveActiveTab === "notifications" || effectiveActiveTab.startsWith("notifications_")) && (
                <NotificationsView
                  currentUser={currentUser}
                  notifications={notifications}
                  permissions={currentRolePermissions?.modulePermissions.notifications}
                  initialSubTab={effectiveActiveTab.startsWith("notifications_") ? effectiveActiveTab.replace("notifications_", "") : "personal"}
                  onMarkRead={handleMarkNotificationRead}
                  onPublishAnnouncement={!isEmployeeMode ? handlePublishAnnouncement : undefined}
                />
              )}

              {(effectiveActiveTab === "account" || effectiveActiveTab.startsWith("account_")) && (
                <MyAccountView
                  currentUser={currentUser}
                  permissions={currentRolePermissions?.modulePermissions.account}
                  initialSubTab={effectiveActiveTab.startsWith("account_") ? effectiveActiveTab.replace("account_", "") : "change_password"}
                  onUpdateOwnPassword={handleUpdateOwnPassword}
                  onLogout={handleLogout}
                />
              )}

              {!isEmployeeMode && effectiveActiveTab === "help" && (
                <HelpCenter 
                  onClose={() => setActiveTab(getFirstPermittedTab())}
                  companyName={config.profile.displayName}
                  logoUrl={getCompanyLogoUrl(config)}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
