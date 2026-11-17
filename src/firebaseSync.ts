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
} from "./types";
import type { AppState } from "./dbStore";

/**
 * Synchronizes a single document record to its corresponding Firestore collection.
 */
export async function syncRecordToFirestore(collectionName: string, id: string, data: any): Promise<void> {
  if (!auth.currentUser) {
    console.warn(`[Firestore Sync] Skipped write to ${collectionName}/${id}: No authenticated session.`);
    return;
  }
  const cleanId = id.replace(/[^a-zA-Z0-9_\-]/g, "_");
  try {
    const docRef = doc(db, collectionName, cleanId);
    const sanitizedData = JSON.parse(JSON.stringify(data, (_, v) => v === undefined ? null : v));
    if (auth.currentUser?.uid && !sanitizedData.ownerUid) {
      sanitizedData.ownerUid = auth.currentUser.uid;
    }
    if (auth.currentUser?.email && !sanitizedData.employeeEmail) {
      sanitizedData.employeeEmail = auth.currentUser.email.trim().toLowerCase();
    }
    await setDoc(docRef, sanitizedData);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${collectionName}/${cleanId}`);
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
      chunk.forEach(rec => {
        const cleanId = rec.id.replace(/[^a-zA-Z0-9_\-]/g, "_");
        const docRef = doc(db, collectionName, cleanId);
        const sanitizedData = JSON.parse(JSON.stringify(rec.data, (_, v) => v === undefined ? null : v));
        if (auth.currentUser?.uid && !sanitizedData.ownerUid) {
          sanitizedData.ownerUid = auth.currentUser.uid;
        }
        if (auth.currentUser?.email && !sanitizedData.employeeEmail) {
          sanitizedData.employeeEmail = auth.currentUser.email.trim().toLowerCase();
        }
        batch.set(docRef, sanitizedData);
      });
      await batch.commit();
      successCount += chunk.length;
    } catch (batchErr: any) {
      console.warn(`[Cloud Batch Sync Warning] Batch commit failed for ${collectionName}, falling back to individual writes:`, batchErr);
      for (const rec of chunk) {
        try {
          const cleanId = rec.id.replace(/[^a-zA-Z0-9_\-]/g, "_");
          const docRef = doc(db, collectionName, cleanId);
          const sanitizedData = JSON.parse(JSON.stringify(rec.data, (_, v) => v === undefined ? null : v));
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
export async function deleteRecordFromFirestore(collectionName: string, id: string): Promise<void> {
  if (!auth.currentUser) {
    console.warn(`[Firestore Sync] Skipped delete on ${collectionName}/${id}: No authenticated session.`);
    return;
  }
  const cleanId = id.replace(/[^a-zA-Z0-9_\-]/g, "_");
  try {
    const docRef = doc(db, collectionName, cleanId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${collectionName}/${cleanId}`);
  }
}

/**
 * Synchronizes a whole list of records to Firestore.
 */
export async function syncCollectionToFirestore(collectionName: string, records: any[], idKey: string): Promise<void> {
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
  filterEmployeeId?: string
): Promise<T[] | null> {
  try {
    const colRef = collection(db, collectionName);
    const q = filterEmployeeId ? query(colRef, where("employeeId", "==", filterEmployeeId)) : colRef;
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs.map(d => d.data() as T);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, collectionName);
    return null;
  }
}

/**
 * Hydrates authorized workspace collections from Cloud Firestore on login/session restore.
 * Respects role-based Firestore Security Rules so Employee accounts only query their own records
 * and preserves local seed/offline data for collections not yet populated in the new Firebase project.
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
  ] = await Promise.all([
    fetchCollectionSafe<Department>("departments"),
    fetchCollectionSafe<PublicHoliday>("holidays"),
    fetchCollectionSafe<SystemRole>("roles"),
    fetchCollectionSafe<RolePermissions>("role_permissions"),
    fetchCollectionSafe<SalaryComponent>("salary_components"),
    fetchCollectionSafe<PayrollPeriod>("payroll_periods"),
    getDocs(collection(db, "tax_configurations")).catch(err => {
      handleFirestoreError(err, OperationType.LIST, "tax_configurations");
      return null;
    }),
    getDocs(collection(db, "payroll_settings")).catch(err => {
      handleFirestoreError(err, OperationType.LIST, "payroll_settings");
      return null;
    }),
    getDoc(doc(db, "config", "company_config")).catch(err => {
      handleFirestoreError(err, OperationType.GET, "config/company_config");
      return null;
    }),
  ]);

  if (remoteDepts) hydrated.departments = remoteDepts;
  if (remoteHolidays) hydrated.holidays = remoteHolidays;
  if (remoteRoles) hydrated.roles = remoteRoles;
  if (remoteRolePerms) hydrated.rolePermissions = remoteRolePerms;
  if (remoteComponents) hydrated.salaryComponents = remoteComponents;
  if (remotePeriods) hydrated.payrollPeriods = remotePeriods;
  if (remoteTaxSnap && !remoteTaxSnap.empty) {
    hydrated.taxConfig = remoteTaxSnap.docs[0].data() as TaxConfiguration;
  }
  if (remotePayrollSettingsSnap && !remotePayrollSettingsSnap.empty) {
    hydrated.payrollSettings = remotePayrollSettingsSnap.docs[0].data() as PayrollSettings;
  }
  if (remoteConfigSnap && remoteConfigSnap.exists()) {
    hydrated.config = remoteConfigSnap.data() as CompanyConfig;
  }

  // Employees & scoped operational records
  if (isStaffOrAuditor || isDeptHead) {
    const [
      remoteEmployees,
      remoteAttendance,
      remoteLeaves,
      remoteFamily,
      remoteMedical,
    ] = await Promise.all([
      fetchCollectionSafe<Employee>("employees"),
      fetchCollectionSafe<AttendanceRecord>("attendance"),
      fetchCollectionSafe<LeaveRecord>("leaves"),
      fetchCollectionSafe<FamilyMember>("family_members"),
      fetchCollectionSafe<MedicalExpense>("medical_expenses"),
    ]);

    if (remoteEmployees) {
      hydrated.employees = remoteEmployees.filter(e => !(e as any).isDeleted);
    }
    if (remoteAttendance) {
      hydrated.attendance = remoteAttendance.filter(a => !(a as any).isDeleted);
    }
    if (remoteLeaves) {
      hydrated.leaves = remoteLeaves.filter(l => !(l as any).isDeleted);
    }
    if (remoteFamily) hydrated.familyMembers = remoteFamily;
    if (remoteMedical) hydrated.medicalExpenses = remoteMedical;
  } else if (isEmployee && scopedEmpId) {
    const [
      remoteOwnEmpSnap,
      remoteAttendance,
      remoteLeaves,
      remoteFamily,
      remoteMedical,
      remoteStructures,
      remotePayroll,
      remotePayslips,
    ] = await Promise.all([
      getDoc(doc(db, "employees", scopedEmpId.replace(/[^a-zA-Z0-9_\-]/g, "_"))).catch(err => {
        handleFirestoreError(err, OperationType.GET, `employees/${scopedEmpId}`);
        return null;
      }),
      fetchCollectionSafe<AttendanceRecord>("attendance", scopedEmpId),
      fetchCollectionSafe<LeaveRecord>("leaves", scopedEmpId),
      fetchCollectionSafe<FamilyMember>("family_members", scopedEmpId),
      fetchCollectionSafe<MedicalExpense>("medical_expenses", scopedEmpId),
      fetchCollectionSafe<EmployeeSalaryStructure>("employee_salary_structures", scopedEmpId),
      fetchCollectionSafe<PayrollRecord>("payroll_records", scopedEmpId),
      fetchCollectionSafe<Payslip>("payslips", scopedEmpId),
    ]);

    if (remoteOwnEmpSnap && remoteOwnEmpSnap.exists()) {
      const empData = remoteOwnEmpSnap.data() as Employee;
      if (!(empData as any).isDeleted) hydrated.employees = [empData];
    }
    if (remoteAttendance) hydrated.attendance = remoteAttendance.filter(a => !(a as any).isDeleted);
    if (remoteLeaves) hydrated.leaves = remoteLeaves.filter(l => !(l as any).isDeleted);
    if (remoteFamily) hydrated.familyMembers = remoteFamily;
    if (remoteMedical) hydrated.medicalExpenses = remoteMedical;
    if (remoteStructures) hydrated.salaryStructures = remoteStructures;
    if (remotePayroll) hydrated.payrollRecords = remotePayroll.filter(p => !(p as any).isDeleted);
    if (remotePayslips) hydrated.payslips = remotePayslips;
  }

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

    if (remoteUsers) hydrated.users = remoteUsers;
    if (remoteLogs) hydrated.logs = remoteLogs;
    if (remoteEmailLogs) hydrated.emailLogs = remoteEmailLogs;
    if (remoteStructures) hydrated.salaryStructures = remoteStructures;
    if (remotePayrollRecords) hydrated.payrollRecords = remotePayrollRecords.filter(p => !(p as any).isDeleted);
    if (remotePayslips) hydrated.payslips = remotePayslips;
    if (remoteDistributionLogs) hydrated.payslipDistributionLogs = remoteDistributionLogs;
    if (remoteApprovals) hydrated.payrollApprovals = remoteApprovals;
    if (remoteImportLogs) hydrated.payrollImportLogs = remoteImportLogs;
  }

  return hydrated;
}
