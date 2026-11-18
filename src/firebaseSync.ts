import {
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  collection,
  getDocs,
  getDoc,
  query,
  where,
} from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "./firebase";
import type {
  User,
  Department,
  Employee,
  AttendanceRecord,
  LeaveRecord,
  PublicHoliday,
  CompanyConfig,
  ActivityLog,
  FamilyMember,
  MedicalExpense,
  SalaryComponent,
  TaxConfiguration,
  PayrollPeriod,
  EmployeeSalaryStructure,
  PayrollRecord,
  Payslip,
  PayslipDistributionLog,
  PayrollApproval,
  PayrollImportLog,
  PayrollSettings,
  EmailActivityLog,
  SystemRole,
  RolePermissions,
  HRRequest,
  EmployeeNotification,
  DriveAssociation,
} from "./types";
import type { AppState } from "./dbStore";

export interface FirestoreSyncResult {
  ok: boolean;
  code?: string;
  error?: string;
}

/**
 * Synchronizes a single document record to its corresponding Firestore collection.
 */
export async function syncRecordToFirestore(
  collectionName: string,
  id: string,
  data: any
): Promise<FirestoreSyncResult> {
  if (!auth.currentUser) {
    console.warn(`[Firestore Sync] Skipped write to ${collectionName}/${id}: No authenticated session.`);
    return { ok: false, code: "unauthenticated", error: "No active authenticated session." };
  }
  const cleanId = id.replace(/[^a-zA-Z0-9_\-]/g, "_");
  try {
    const docRef = doc(db, collectionName, cleanId);
    const sanitizedData = JSON.parse(JSON.stringify(data, (_, v) => (v === undefined ? null : v)));
    // Preserve explicit ownerUid if provided; never overwrite another employee's email with the operator's email
    if (auth.currentUser?.uid && sanitizedData.ownerUid === undefined) {
      sanitizedData.ownerUid = auth.currentUser.uid;
    }
    await setDoc(docRef, sanitizedData);
    return { ok: true };
  } catch (error: any) {
    handleFirestoreError(error, OperationType.WRITE, `${collectionName}/${cleanId}`);
    return {
      ok: false,
      code: error?.code,
      error: error?.message || "Failed to save record to cloud database.",
    };
  }
}

/**
 * Synchronizes a batch of document records to a Firestore collection using writeBatch,
 * respecting Firestore's 500-write limit per batch operation.
 */
export async function syncBatchRecordsToFirestore(
  collectionName: string,
  records: { id: string; data: any }[]
): Promise<{ successCount: number; failedCount: number; errors: string[] }> {
  if (records.length === 0) {
    return { successCount: 0, failedCount: 0, errors: [] };
  }

  if (!auth.currentUser) {
    console.warn(`[Firestore Sync] Skipped batch write to ${collectionName}: No authenticated session.`);
    return { successCount: records.length, failedCount: 0, errors: [] };
  }

  let successCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  const BATCH_SIZE = 450;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const chunk = records.slice(i, i + BATCH_SIZE);
    try {
      const batch = writeBatch(db);
      chunk.forEach((rec) => {
        const cleanId = rec.id.replace(/[^a-zA-Z0-9_\-]/g, "_");
        const docRef = doc(db, collectionName, cleanId);
        const sanitizedData = JSON.parse(JSON.stringify(rec.data, (_, v) => (v === undefined ? null : v)));
        if (auth.currentUser?.uid && sanitizedData.ownerUid === undefined) {
          sanitizedData.ownerUid = auth.currentUser.uid;
        }
        batch.set(docRef, sanitizedData);
      });
      await batch.commit();
      successCount += chunk.length;
    } catch (batchErr: any) {
      console.warn(
        `[Cloud Batch Sync Warning] Batch commit failed for ${collectionName}, falling back to individual writes:`,
        batchErr
      );
      for (const rec of chunk) {
        try {
          const cleanId = rec.id.replace(/[^a-zA-Z0-9_\-]/g, "_");
          const docRef = doc(db, collectionName, cleanId);
          const sanitizedData = JSON.parse(JSON.stringify(rec.data, (_, v) => (v === undefined ? null : v)));
          await setDoc(docRef, sanitizedData);
          successCount++;
        } catch (indErr: any) {
          failedCount++;
          const msg = `Record ${rec.id}: ${indErr?.message || String(indErr)}`;
          errors.push(msg);
          handleFirestoreError(indErr, OperationType.WRITE, `${collectionName}/${rec.id}`);
        }
      }
    }
  }

  return { successCount, failedCount, errors };
}

/**
 * Deletes a document from the corresponding Firestore collection.
 */
export async function deleteRecordFromFirestore(
  collectionName: string,
  id: string
): Promise<FirestoreSyncResult> {
  if (!auth.currentUser) {
    console.warn(`[Firestore Sync] Skipped delete on ${collectionName}/${id}: No authenticated session.`);
    return { ok: false, code: "unauthenticated", error: "No active authenticated session." };
  }
  const cleanId = id.replace(/[^a-zA-Z0-9_\-]/g, "_");
  try {
    const docRef = doc(db, collectionName, cleanId);
    await deleteDoc(docRef);
    return { ok: true };
  } catch (error: any) {
    handleFirestoreError(error, OperationType.DELETE, `${collectionName}/${cleanId}`);
    return {
      ok: false,
      code: error?.code,
      error: error?.message || "Failed to delete record from cloud database.",
    };
  }
}

/**
 * Synchronizes a whole list of records to Firestore.
 */
export async function syncCollectionToFirestore(
  collectionName: string,
  records: any[],
  idKey: string
): Promise<void> {
  if (!auth.currentUser) {
    console.warn(`[Firestore Sync] Skipped collection sync for ${collectionName}: No authenticated session.`);
    return;
  }
  for (const record of records) {
    const id = record[idKey];
    if (id) {
      await syncRecordToFirestore(collectionName, String(id), record);
    }
  }
}

async function fetchCollectionSafe<T>(
  collectionName: string,
  filterField?: string,
  filterValue?: string
): Promise<T[] | null> {
  try {
    const colRef = collection(db, collectionName);
    const q =
      filterField && filterValue !== undefined
        ? query(colRef, where(filterField, "==", filterValue))
        : colRef;
    const snap = await getDocs(q);
    if (snap.empty) return [];
    return snap.docs.map((d) => d.data() as T);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, collectionName);
    return null;
  }
}

/**
 * Hydrates authorized workspace collections from Cloud Firestore on login/session restore.
 * Respects role-based Firestore Security Rules so Employee accounts strictly query only
 * their own employee-linked records and company-wide announcements/policies.
 */
export async function hydrateWorkspaceFromFirestore(user: User): Promise<Partial<AppState>> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) {
    return {};
  }

  const hydrated: Partial<AppState> = {};
  const isStaffOrAuditor =
    user.role === "Administrator" ||
    user.role === "HR Officer" ||
    user.role === "Auditor";
  const isDeptHead = user.role === "Department Head";
  const isEmployee = user.role === "Employee";
  const scopedEmpId = isEmployee ? user.employeeId : undefined;

  // Shared configuration & policy collections readable by all verified signed-in users
  const [
    remoteDepts,
    remoteHolidays,
    remoteRoles,
    remoteRolePerms,
    remoteComponents,
    remotePeriods,
    remoteTaxSnap,
    remotePayrollSettingsSnap,
    remoteConfigSnap,
    remoteAnnouncements,
  ] = await Promise.all([
    fetchCollectionSafe<Department>("departments"),
    fetchCollectionSafe<PublicHoliday>("holidays"),
    fetchCollectionSafe<SystemRole>("roles"),
    fetchCollectionSafe<RolePermissions>("role_permissions"),
    fetchCollectionSafe<SalaryComponent>("salary_components"),
    fetchCollectionSafe<PayrollPeriod>("payroll_periods"),
    getDocs(collection(db, "tax_configurations")).catch((err) => {
      handleFirestoreError(err, OperationType.LIST, "tax_configurations");
      return null;
    }),
    getDocs(collection(db, "payroll_settings")).catch((err) => {
      handleFirestoreError(err, OperationType.LIST, "payroll_settings");
      return null;
    }),
    getDoc(doc(db, "config", "company_config")).catch((err) => {
      handleFirestoreError(err, OperationType.GET, "config/company_config");
      return null;
    }),
    fetchCollectionSafe<EmployeeNotification>("notifications", "category", "announcement"),
  ]);

  if (remoteDepts && remoteDepts.length > 0) hydrated.departments = remoteDepts;
  if (remoteHolidays && remoteHolidays.length > 0) hydrated.holidays = remoteHolidays;
  if (remoteRoles && remoteRoles.length > 0) hydrated.roles = remoteRoles;
  if (remoteRolePerms && remoteRolePerms.length > 0) hydrated.rolePermissions = remoteRolePerms;
  if (remoteComponents && remoteComponents.length > 0) hydrated.salaryComponents = remoteComponents;
  if (remotePeriods && remotePeriods.length > 0) hydrated.payrollPeriods = remotePeriods;
  if (remoteTaxSnap && !remoteTaxSnap.empty) {
    hydrated.taxConfig = remoteTaxSnap.docs[0].data() as TaxConfiguration;
  }
  if (remotePayrollSettingsSnap && !remotePayrollSettingsSnap.empty) {
    hydrated.payrollSettings = remotePayrollSettingsSnap.docs[0].data() as PayrollSettings;
  }
  if (remoteConfigSnap && remoteConfigSnap.exists()) {
    hydrated.config = remoteConfigSnap.data() as CompanyConfig;
  }

  let combinedNotifications: EmployeeNotification[] = remoteAnnouncements ? [...remoteAnnouncements] : [];

  // Employees & scoped operational records
  if (isStaffOrAuditor || isDeptHead) {
    const [
      remoteEmployees,
      remoteAttendance,
      remoteLeaves,
      remoteFamily,
      remoteMedical,
      remoteHRRequests,
      remoteAllNotifs,
      remoteDriveAssocs,
    ] = await Promise.all([
      fetchCollectionSafe<Employee>("employees"),
      fetchCollectionSafe<AttendanceRecord>("attendance"),
      fetchCollectionSafe<LeaveRecord>("leaves"),
      fetchCollectionSafe<FamilyMember>("family_members"),
      fetchCollectionSafe<MedicalExpense>("medical_expenses"),
      fetchCollectionSafe<HRRequest>("hr_requests"),
      isStaffOrAuditor
        ? fetchCollectionSafe<EmployeeNotification>("notifications")
        : fetchCollectionSafe<EmployeeNotification>(
            "notifications",
            "recipientEmployeeId",
            user.employeeId || "__NONE__"
          ),
      fetchCollectionSafe<DriveAssociation>("drive_associations"),
    ]);

    if (remoteEmployees && remoteEmployees.length > 0) {
      hydrated.employees = remoteEmployees.filter((e) => !(e as any).isDeleted);
    }
    if (remoteAttendance && remoteAttendance.length > 0) {
      hydrated.attendance = remoteAttendance.filter((a) => !(a as any).isDeleted);
    }
    if (remoteLeaves && remoteLeaves.length > 0) {
      hydrated.leaves = remoteLeaves.filter((l) => !(l as any).isDeleted);
    }
    if (remoteFamily) hydrated.familyMembers = remoteFamily;
    if (remoteMedical) hydrated.medicalExpenses = remoteMedical;
    if (remoteHRRequests) hydrated.hrRequests = remoteHRRequests;
    if (remoteDriveAssocs) hydrated.driveAssociations = remoteDriveAssocs;
    if (remoteAllNotifs) {
      const map = new Map<string, EmployeeNotification>();
      combinedNotifications.forEach((n) => map.set(n.id, n));
      remoteAllNotifs.forEach((n) => map.set(n.id, n));
      combinedNotifications = Array.from(map.values());
    }
  } else if (isEmployee) {
    if (scopedEmpId) {
      const [
        remoteOwnEmpSnap,
        remoteAttendance,
        remoteLeaves,
        remoteFamily,
        remoteMedical,
        remoteStructures,
        remotePayroll,
        remotePayslips,
        remoteHRRequests,
        remotePersonalNotifs,
        remoteOwnDriveAssocs,
      ] = await Promise.all([
        getDoc(doc(db, "employees", scopedEmpId.replace(/[^a-zA-Z0-9_\-]/g, "_"))).catch((err) => {
          handleFirestoreError(err, OperationType.GET, `employees/${scopedEmpId}`);
          return null;
        }),
        fetchCollectionSafe<AttendanceRecord>("attendance", "employeeId", scopedEmpId),
        fetchCollectionSafe<LeaveRecord>("leaves", "employeeId", scopedEmpId),
        fetchCollectionSafe<FamilyMember>("family_members", "employeeId", scopedEmpId),
        fetchCollectionSafe<MedicalExpense>("medical_expenses", "employeeId", scopedEmpId),
        fetchCollectionSafe<EmployeeSalaryStructure>("employee_salary_structures", "employeeId", scopedEmpId),
        fetchCollectionSafe<PayrollRecord>("payroll_records", "employeeId", scopedEmpId),
        fetchCollectionSafe<Payslip>("payslips", "employeeId", scopedEmpId),
        fetchCollectionSafe<HRRequest>("hr_requests", "employeeId", scopedEmpId),
        fetchCollectionSafe<EmployeeNotification>("notifications", "recipientEmployeeId", scopedEmpId),
        getDocs(
          query(
            collection(db, "drive_associations"),
            where("targetType", "==", "Employee"),
            where("targetId", "==", scopedEmpId)
          )
        )
          .then((snap) => (snap.empty ? [] : snap.docs.map((d) => d.data() as DriveAssociation)))
          .catch((err) => {
            handleFirestoreError(err, OperationType.LIST, "drive_associations");
            return null;
          }),
      ]);

      hydrated.employees =
        remoteOwnEmpSnap && remoteOwnEmpSnap.exists() && !(remoteOwnEmpSnap.data() as any).isDeleted
          ? [remoteOwnEmpSnap.data() as Employee]
          : [];
      hydrated.attendance = remoteAttendance ? remoteAttendance.filter((a) => !(a as any).isDeleted) : [];
      hydrated.leaves = remoteLeaves ? remoteLeaves.filter((l) => !(l as any).isDeleted) : [];
      hydrated.familyMembers = remoteFamily || [];
      hydrated.medicalExpenses = remoteMedical || [];
      hydrated.salaryStructures = remoteStructures || [];
      hydrated.payrollRecords = remotePayroll ? remotePayroll.filter((p) => !(p as any).isDeleted) : [];
      hydrated.payslips = remotePayslips || [];
      hydrated.hrRequests = remoteHRRequests || [];
      hydrated.driveAssociations = (remoteOwnDriveAssocs || []).filter(
        (d) => d.targetType === "Employee" && d.targetId === scopedEmpId
      );

      if (remotePersonalNotifs) {
        const map = new Map<string, EmployeeNotification>();
        combinedNotifications.forEach((n) => map.set(n.id, n));
        remotePersonalNotifs.forEach((n) => map.set(n.id, n));
        combinedNotifications = Array.from(map.values());
      }
    } else {
      // Unlinked Employee account: strictly zero access to any employee records
      hydrated.employees = [];
      hydrated.attendance = [];
      hydrated.leaves = [];
      hydrated.familyMembers = [];
      hydrated.medicalExpenses = [];
      hydrated.salaryStructures = [];
      hydrated.payrollRecords = [];
      hydrated.payslips = [];
      hydrated.hrRequests = [];
      hydrated.driveAssociations = [];
    }
  }

  hydrated.notifications = combinedNotifications.sort((a, b) =>
    (b.createdDate || "").localeCompare(a.createdDate || "")
  );

  // Staff & Auditor privileged collections
  if (isStaffOrAuditor) {
    const [
      remoteUsers,
      remoteLogs,
      remoteEmailLogs,
      remoteStructures,
      remotePayrollRecords,
      remotePayslips,
      remoteDistributionLogs,
      remoteApprovals,
      remoteImportLogs,
    ] = await Promise.all([
      fetchCollectionSafe<User>("users"),
      fetchCollectionSafe<ActivityLog>("logs"),
      fetchCollectionSafe<EmailActivityLog>("email_logs"),
      fetchCollectionSafe<EmployeeSalaryStructure>("employee_salary_structures"),
      fetchCollectionSafe<PayrollRecord>("payroll_records"),
      fetchCollectionSafe<Payslip>("payslips"),
      fetchCollectionSafe<PayslipDistributionLog>("payslip_distribution_logs"),
      fetchCollectionSafe<PayrollApproval>("payroll_approvals"),
      fetchCollectionSafe<PayrollImportLog>("payroll_import_logs"),
    ]);

    if (remoteUsers && remoteUsers.length > 0) hydrated.users = remoteUsers;
    if (remoteLogs) hydrated.logs = remoteLogs;
    if (remoteEmailLogs) hydrated.emailLogs = remoteEmailLogs;
    if (remoteStructures) hydrated.salaryStructures = remoteStructures;
    if (remotePayrollRecords) hydrated.payrollRecords = remotePayrollRecords.filter((p) => !(p as any).isDeleted);
    if (remotePayslips) hydrated.payslips = remotePayslips;
    if (remoteDistributionLogs) hydrated.payslipDistributionLogs = remoteDistributionLogs;
    if (remoteApprovals) hydrated.payrollApprovals = remoteApprovals;
    if (remoteImportLogs) hydrated.payrollImportLogs = remoteImportLogs;
  } else if (isEmployee) {
    hydrated.users = [user];
    hydrated.logs = [];
    hydrated.emailLogs = [];
    hydrated.payslipDistributionLogs = [];
    hydrated.payrollApprovals = [];
    hydrated.payrollImportLogs = [];
  }

  return hydrated;
}
