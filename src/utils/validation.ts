import type {
  AttendanceRecord,
  AttendanceStatus,
  Department,
  Employee,
  EmployeeSalaryStructure,
  FamilyMember,
  LeaveRecord,
  LeaveTypeConfig,
  MedicalPolicyConfig,
  PayrollPeriod,
  PublicHoliday,
  SalaryComponent,
  SystemRole,
  User,
} from "../types";

export const AUTHORIZED_ADMIN_EXCEPTIONS = [
  "contactesfaye@gmail.com",
  "tesfayeteklufeyissa@gmail.com",
];

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  firstErrorField?: string;
  summaryMessage?: string;
}

export function buildValidationResult(
  errors: Record<string, string>,
  summaryMessage?: string
): ValidationResult {
  const keys = Object.keys(errors).filter((k) => Boolean(errors[k]));
  const cleanErrors: Record<string, string> = {};
  keys.forEach((k) => {
    cleanErrors[k] = errors[k];
  });
  return {
    valid: keys.length === 0,
    errors: cleanErrors,
    firstErrorField: keys[0],
    summaryMessage:
      summaryMessage ||
      (keys.length > 0
        ? `Please correct ${keys.length} highlighted ${keys.length === 1 ? "field" : "fields"} before submitting.`
        : undefined),
  };
}

/**
 * Automatically focuses and scrolls to the first invalid field inside an optional root container or document.
 */
export function focusFirstInvalidField(
  errors: Record<string, string>,
  rootEl?: HTMLElement | null
): void {
  const firstKey = Object.keys(errors).find((k) => Boolean(errors[k]));
  if (!firstKey || typeof document === "undefined") return;

  const scope: Document | HTMLElement = rootEl || document;
  const escaped =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(firstKey)
      : firstKey.replace(/[^a-zA-Z0-9_-]/g, "");

  const el =
    (scope.querySelector(`[data-field="${escaped}"]`) as HTMLElement | null) ||
    (scope.querySelector(`[name="${escaped}"]`) as HTMLElement | null) ||
    (scope.querySelector(`#${escaped}`) as HTMLElement | null);

  if (el) {
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      // Fallback for jsdom/non-layout environments
    }
    if (typeof el.focus === "function") {
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
    }
  }
}

// ======================================================
// Primitive Field Validators
// ======================================================

export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function isValidEmail(email: string): boolean {
  const trimmed = (email || "").trim();
  if (!trimmed) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

export function isAuthorizedCompanyEmail(email: string): boolean {
  const norm = (email || "").trim().toLowerCase();
  if (!isValidEmail(norm)) return false;
  if (AUTHORIZED_ADMIN_EXCEPTIONS.includes(norm)) return true;
  return norm.endsWith("@ethiopianre.com");
}

export function isValidDateString(dateStr: string): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return false;
  const [y, m, d] = dateStr.trim().split("-").map(Number);
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function isFutureDate(dateStr: string): boolean {
  if (!isValidDateString(dateStr)) return false;
  const todayStr = new Date().toISOString().split("T")[0];
  return dateStr.trim() > todayStr;
}

export function getAgeInYears(dobStr: string, refDateStr?: string): number {
  if (!isValidDateString(dobStr)) return -1;
  const [y, m, d] = dobStr.split("-").map(Number);
  const ref = refDateStr && isValidDateString(refDateStr)
    ? new Date(`${refDateStr}T00:00:00Z`)
    : new Date();
  let age = ref.getUTCFullYear() - y;
  const mDiff = ref.getUTCMonth() + 1 - m;
  if (mDiff < 0 || (mDiff === 0 && ref.getUTCDate() < d)) {
    age--;
  }
  return age;
}

export function isValidPhone(phone: string): boolean {
  const trimmed = (phone || "").trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/[^0-9]/g, "");
  return digits.length >= 9 && digits.length <= 15 && /^[+\d\s\-()]+$/.test(trimmed);
}

export function isValidUrl(url: string): boolean {
  const trimmed = (url || "").trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return Boolean(parsed.hostname && parsed.hostname.includes("."));
  } catch {
    return false;
  }
}

export function isValidTimeString(timeStr: string): boolean {
  if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr.trim())) return false;
  const [hh, mm] = timeStr.trim().split(":").map(Number);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

export function timeToMinutes(timeStr: string): number {
  const [hh, mm] = timeStr.split(":").map(Number);
  return hh * 60 + mm;
}

export function isNonNegativeNumber(val: unknown): boolean {
  const n = typeof val === "number" ? val : Number(val);
  return !Number.isNaN(n) && Number.isFinite(n) && n >= 0;
}

export function isPositiveNumber(val: unknown): boolean {
  const n = typeof val === "number" ? val : Number(val);
  return !Number.isNaN(n) && Number.isFinite(n) && n > 0;
}

// ======================================================
// File Upload Validation
// ======================================================

export interface FileValidationOptions {
  maxSizeMB?: number;
  allowedExtensions?: string[];
  allowedMimePrefixes?: string[];
}

export function validateDocumentUpload(
  file: File | null | undefined,
  options: FileValidationOptions = {}
): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: "Please select a file to upload." };
  }
  if (file.size <= 0) {
    return { valid: false, error: `The selected file "${file.name}" is empty (0 bytes). Please choose a valid file.` };
  }
  const maxSizeMB = options.maxSizeMB ?? 10;
  if (file.size > maxSizeMB * 1024 * 1024) {
    return {
      valid: false,
      error: `File "${file.name}" exceeds the maximum allowed size of ${maxSizeMB} MB.`,
    };
  }
  const allowedExts = options.allowedExtensions ?? [
    "pdf",
    "png",
    "jpg",
    "jpeg",
    "webp",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "csv",
    "txt",
  ];
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (allowedExts.length > 0 && !allowedExts.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported file type ".${ext || "unknown"}". Allowed formats: ${allowedExts.join(", ").toUpperCase()}.`,
    };
  }
  return { valid: true };
}

// ======================================================
// Authentication & Profile Validators
// ======================================================

export function validateLoginForm(email: string, password: string): ValidationResult {
  const errors: Record<string, string> = {};
  const trimmedEmail = email.trim().toLowerCase();

  if (!trimmedEmail) {
    errors.loginEmail = "Company email address is required.";
  } else if (!isValidEmail(trimmedEmail)) {
    errors.loginEmail = "Please enter a valid email address.";
  } else if (!isAuthorizedCompanyEmail(trimmedEmail)) {
    errors.loginEmail =
      "Access is restricted to official Ethiopian Reinsurance email addresses (@ethiopianre.com) or authorized administrators.";
  }

  if (!password) {
    errors.loginPassword = "Password is required.";
  }

  return buildValidationResult(errors);
}

export function validateRegisterForm(input: {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  existingUsers: User[];
}): ValidationResult {
  const errors: Record<string, string> = {};
  const trimmedName = input.fullName.trim();
  const emailNorm = input.email.trim().toLowerCase();

  if (!trimmedName) {
    errors.regFullName = "Full name is required.";
  } else if (trimmedName.length < 2) {
    errors.regFullName = "Full name must be at least 2 characters.";
  }

  if (!emailNorm) {
    errors.regEmail = "Company email address is required.";
  } else if (!isValidEmail(emailNorm)) {
    errors.regEmail = "Please enter a valid email address.";
  } else if (!isAuthorizedCompanyEmail(emailNorm)) {
    errors.regEmail =
      "Registration is restricted to official Ethiopian Reinsurance email addresses (@ethiopianre.com).";
  } else if (input.existingUsers.some((u) => u.email.trim().toLowerCase() === emailNorm)) {
    errors.regEmail = "This email address is already registered. Please sign in or reset your password.";
  }

  if (!input.password) {
    errors.regPassword = "Password is required.";
  } else if (input.password.length < 6) {
    errors.regPassword = "Password must be at least 6 characters long.";
  }

  if (!input.confirmPassword) {
    errors.regConfirmPassword = "Please confirm your password.";
  } else if (input.password && input.password !== input.confirmPassword) {
    errors.regConfirmPassword = "Passwords do not match. Re-enter the same password.";
  }

  return buildValidationResult(errors);
}

export function validateForgotPasswordForm(email: string): ValidationResult {
  const errors: Record<string, string> = {};
  const norm = email.trim().toLowerCase();
  if (!norm) {
    errors.resetEmail = "Please enter your registered company email address.";
  } else if (!isValidEmail(norm)) {
    errors.resetEmail = "Please enter a valid email address.";
  } else if (!isAuthorizedCompanyEmail(norm)) {
    errors.resetEmail =
      "Password reset is restricted to registered @ethiopianre.com accounts or authorized administrators.";
  }
  return buildValidationResult(errors);
}

export function validateProfileForm(
  fullName: string,
  email: string,
  currentUserId: string,
  existingUsers: User[]
): ValidationResult {
  const errors: Record<string, string> = {};
  const emailNorm = email.trim().toLowerCase();

  if (!fullName.trim()) {
    errors.profileName = "Full name is required.";
  } else if (fullName.trim().length < 2) {
    errors.profileName = "Full name must be at least 2 characters.";
  }

  if (!emailNorm) {
    errors.profileEmail = "Email address is required.";
  } else if (!isValidEmail(emailNorm)) {
    errors.profileEmail = "Please enter a valid email address.";
  } else if (!isAuthorizedCompanyEmail(emailNorm)) {
    errors.profileEmail = "Email must be an official @ethiopianre.com address.";
  } else if (existingUsers.some((u) => u.id !== currentUserId && u.email.trim().toLowerCase() === emailNorm)) {
    errors.profileEmail = "This email address is already assigned to another account.";
  }

  return buildValidationResult(errors);
}

export function validatePasswordChangeForm(input: {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}): ValidationResult {
  const errors: Record<string, string> = {};
  if (!input.oldPassword) {
    errors.oldPassword = "Current password is required.";
  }
  if (!input.newPassword) {
    errors.newPassword = "New password is required.";
  } else if (input.newPassword.length < 6) {
    errors.newPassword = "New password must be at least 6 characters long.";
  } else if (input.oldPassword && input.newPassword === input.oldPassword) {
    errors.newPassword = "New password must be different from your current password.";
  }
  if (!input.confirmPassword) {
    errors.confirmPassword = "Please confirm your new password.";
  } else if (input.newPassword && input.newPassword !== input.confirmPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }
  return buildValidationResult(errors);
}

// ======================================================
// Employee Master Validation
// ======================================================

export function validateEmployeeForm(
  input: {
    employeeId: string;
    firstName: string;
    middleName: string;
    lastName: string;
    gender: string;
    dob: string;
    email: string;
    phoneNumber: string;
    altPhoneNumber?: string;
    address: string;
    departmentId: string;
    position: string;
    employmentType: string;
    hireDate: string;
    status: string;
  },
  existingEmployees: Employee[],
  departments: Department[],
  mode: "add" | "edit"
): ValidationResult {
  const errors: Record<string, string> = {};
  const empId = input.employeeId.trim();
  const emailNorm = input.email.trim().toLowerCase();

  if (mode === "add") {
    if (!empId) {
      errors.employeeId = "Employee ID is required.";
    } else if (!/^[a-zA-Z0-9_-]{2,32}$/.test(empId)) {
      errors.employeeId = "Employee ID must be 2–32 characters (letters, numbers, '-' or '_').";
    } else if (existingEmployees.some((e) => e.employeeId.trim().toLowerCase() === empId.toLowerCase())) {
      errors.employeeId = "This employee already exists. Please use a unique Employee ID.";
    }
  }

  if (!input.firstName.trim()) {
    errors.firstName = "First name is required.";
  }
  if (!input.lastName.trim()) {
    errors.lastName = "Last name is required.";
  }

  if (!input.gender) {
    errors.gender = "Gender is required.";
  }

  if (!input.dob) {
    errors.dob = "Date of birth is required.";
  } else if (!isValidDateString(input.dob)) {
    errors.dob = "Please enter a valid date of birth.";
  } else if (isFutureDate(input.dob)) {
    errors.dob = "Date of birth cannot be in the future.";
  } else if (getAgeInYears(input.dob) < 16) {
    errors.dob = "Employee must be at least 16 years old.";
  }

  if (!emailNorm) {
    errors.email = "Official company email address is required.";
  } else if (!isValidEmail(emailNorm)) {
    errors.email = "Please enter a valid email address.";
  } else if (!isAuthorizedCompanyEmail(emailNorm)) {
    errors.email = "Work email must use the @ethiopianre.com domain (or an authorized exception address).";
  } else if (
    existingEmployees.some(
      (e) =>
        e.email.trim().toLowerCase() === emailNorm &&
        e.employeeId.trim().toLowerCase() !== empId.toLowerCase()
    )
  ) {
    errors.email = "This email address is already assigned to another employee.";
  }

  if (!input.phoneNumber.trim()) {
    errors.phoneNumber = "Phone number is required.";
  } else if (!isValidPhone(input.phoneNumber)) {
    errors.phoneNumber = "Please enter a valid phone number (9–15 digits).";
  }

  if (input.altPhoneNumber && input.altPhoneNumber.trim() && !isValidPhone(input.altPhoneNumber)) {
    errors.altPhoneNumber = "Please enter a valid alternative phone number.";
  }

  if (!input.departmentId) {
    errors.departmentId = "The selected department is required.";
  } else {
    const dept = departments.find((d) => d.id === input.departmentId);
    if (!dept) {
      errors.departmentId = "Selected department does not exist.";
    } else if (dept.status === "Inactive" && mode === "add") {
      errors.departmentId = `Department "${dept.name}" is inactive. Select an active department.`;
    }
  }

  if (!input.position.trim()) {
    errors.position = "Job position / title is required.";
  }

  if (!input.hireDate) {
    errors.hireDate = "Hire date is required.";
  } else if (!isValidDateString(input.hireDate)) {
    errors.hireDate = "Please enter a valid hire date.";
  } else if (isValidDateString(input.dob) && input.hireDate < input.dob) {
    errors.hireDate = "Hire date cannot be earlier than date of birth.";
  } else if (isValidDateString(input.dob) && getAgeInYears(input.dob, input.hireDate) < 16) {
    errors.hireDate = "Employee must be at least 16 years old at the hire date.";
  }

  return buildValidationResult(errors);
}

// ======================================================
// Department Validation
// ======================================================

export function validateDepartmentForm(
  input: {
    id?: string;
    name: string;
    code: string;
    status: "Active" | "Inactive";
    parentDepartmentId?: string;
  },
  existingDepartments: Department[],
  employees: Employee[],
  mode: "add" | "edit"
): ValidationResult {
  const errors: Record<string, string> = {};
  const trimmedName = input.name.trim();
  const trimmedCode = input.code.trim().toUpperCase();

  if (!trimmedName) {
    errors.name = "Department name is required.";
  } else if (trimmedName.length < 2) {
    errors.name = "Department name must be at least 2 characters.";
  } else if (
    existingDepartments.some(
      (d) =>
        d.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
        (mode === "add" || d.id !== input.id)
    )
  ) {
    errors.name = "A department with this name already exists.";
  }

  if (!trimmedCode) {
    errors.code = "Department code is required.";
  } else if (!/^[A-Z0-9_-]{2,16}$/.test(trimmedCode)) {
    errors.code = "Department code must be 2–16 letters or numbers (e.g., FIN, HR, TECH).";
  } else if (
    existingDepartments.some(
      (d) =>
        d.code.trim().toLowerCase() === trimmedCode.toLowerCase() &&
        (mode === "add" || d.id !== input.id)
    )
  ) {
    errors.code = "This department code is already in use.";
  }

  if (mode === "edit" && input.id && input.parentDepartmentId === input.id) {
    errors.parentDepartmentId = "A department cannot be its own parent department.";
  }

  if (mode === "edit" && input.id && input.status === "Inactive") {
    const activeEmpsCount = employees.filter(
      (e) => e.departmentId === input.id && e.status === "Active"
    ).length;
    if (activeEmpsCount > 0) {
      errors.status = `Cannot set department to Inactive while ${activeEmpsCount} active employee(s) are assigned to it. Reassign employees first.`;
    }
  }

  return buildValidationResult(errors);
}

// ======================================================
// Attendance Validation
// ======================================================

export function validateAttendanceForm(
  input: {
    id?: string;
    employeeId: string;
    date: string;
    checkInTime: string;
    checkOutTime: string;
    status: AttendanceStatus;
    workingHours: number;
  },
  existingAttendance: AttendanceRecord[],
  mode: "add" | "edit"
): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.employeeId) {
    errors.employeeId = "Please select an employee.";
  }

  if (!input.date) {
    errors.date = "Attendance date is required.";
  } else if (!isValidDateString(input.date)) {
    errors.date = "Please enter a valid attendance date.";
  } else if (isFutureDate(input.date)) {
    errors.date = "Attendance date cannot be in the future.";
  } else if (
    input.employeeId &&
    existingAttendance.some(
      (a) =>
        a.employeeId === input.employeeId &&
        a.date === input.date &&
        (mode === "add" || a.id !== input.id)
    )
  ) {
    errors.date = "An attendance record already exists for this employee on the selected date.";
  }

  const requiresTimes =
    input.status === "Present" || input.status === "Late" || input.status === "Half Day";

  if (requiresTimes) {
    if (!input.checkInTime || !isValidTimeString(input.checkInTime)) {
      errors.checkInTime = "Valid check-in time (HH:MM) is required.";
    }
    if (!input.checkOutTime || !isValidTimeString(input.checkOutTime)) {
      errors.checkOutTime = "Valid check-out time (HH:MM) is required.";
    }
    if (
      isValidTimeString(input.checkInTime) &&
      isValidTimeString(input.checkOutTime) &&
      timeToMinutes(input.checkOutTime) <= timeToMinutes(input.checkInTime)
    ) {
      errors.checkOutTime = "Check-out time must be later than check-in time.";
    }
  }

  if (!isNonNegativeNumber(input.workingHours)) {
    errors.workingHours = "Working hours must be 0 or greater.";
  } else if (Number(input.workingHours) > 24) {
    errors.workingHours = "Working hours cannot exceed 24 hours per day.";
  }

  return buildValidationResult(errors);
}

// ======================================================
// Leave Management Validators
// ======================================================

export function validateLeaveApplicationForm(input: {
  recordId?: string;
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  supportingDocumentUrl?: string;
  leaveTypeConfig?: LeaveTypeConfig;
  remainingBalance?: number;
  existingLeaves: LeaveRecord[];
  mode: "add" | "edit";
}): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.employeeId) {
    errors.employeeId = "Please select an employee.";
  }
  if (!input.leaveType) {
    errors.leaveType = "Please select a leave type.";
  }
  if (!input.startDate) {
    errors.startDate = "Start date is required.";
  } else if (!isValidDateString(input.startDate)) {
    errors.startDate = "Please enter a valid start date.";
  }

  if (!input.endDate) {
    errors.endDate = "End date is required.";
  } else if (!isValidDateString(input.endDate)) {
    errors.endDate = "Please enter a valid end date.";
  } else if (isValidDateString(input.startDate) && input.endDate < input.startDate) {
    errors.endDate = "End date cannot be earlier than start date.";
  }

  if (
    isValidDateString(input.startDate) &&
    isValidDateString(input.endDate) &&
    input.endDate >= input.startDate &&
    input.daysCount <= 0
  ) {
    errors.endDate =
      "Selected date range contains 0 working days (only weekends or public holidays). Choose at least one working day.";
  }

  if (!input.reason.trim()) {
    errors.reason = "Please provide a reason for this leave request.";
  } else if (input.reason.trim().length < 3) {
    errors.reason = "Reason must be at least 3 characters long.";
  }

  if (input.leaveTypeConfig?.requiresSupportingDocument && !input.supportingDocumentUrl?.trim()) {
    errors.supportingDocumentUrl = `A supporting document reference or attachment is required for ${input.leaveType}.`;
  }

  // Overlap check against Active/Completed leaves for the same employee
  if (
    input.employeeId &&
    isValidDateString(input.startDate) &&
    isValidDateString(input.endDate) &&
    input.endDate >= input.startDate
  ) {
    const overlapping = input.existingLeaves.find(
      (l) =>
        l.employeeId === input.employeeId &&
        l.status !== "Cancelled" &&
        (input.mode === "add" || l.id !== input.recordId) &&
        !(input.endDate < l.startDate || input.startDate > l.endDate)
    );
    if (overlapping) {
      errors.startDate = `Leave dates overlap with an existing ${overlapping.leaveType} record (${overlapping.startDate} to ${overlapping.endDate}).`;
    }
  }

  // Remaining balance check (when balance tracking applies)
  if (
    typeof input.remainingBalance === "number" &&
    input.daysCount > 0 &&
    input.daysCount > input.remainingBalance
  ) {
    errors.daysCount = `Insufficient ${input.leaveType} balance. Requested ${input.daysCount} day(s), but only ${input.remainingBalance} day(s) remain.`;
  }

  return buildValidationResult(errors);
}

export function validateLeaveAdjustmentForm(input: {
  employeeId: string;
  leaveTypeId: string;
  amount: string;
  reason: string;
  currentRemaining?: number;
}): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.employeeId) errors.adjEmployeeId = "Please select an employee.";
  if (!input.leaveTypeId) errors.adjLeaveTypeId = "Please select a leave type.";

  const numAmount = Number(input.amount);
  if (input.amount.trim() === "" || Number.isNaN(numAmount) || !Number.isFinite(numAmount)) {
    errors.adjAmount = "Enter a valid numeric adjustment value.";
  } else if (numAmount === 0) {
    errors.adjAmount = "Adjustment amount cannot be zero.";
  } else if (
    typeof input.currentRemaining === "number" &&
    input.currentRemaining + numAmount < 0
  ) {
    errors.adjAmount = `Deduction exceeds current remaining balance (${input.currentRemaining} days).`;
  }

  if (!input.reason.trim()) {
    errors.adjReason = "A clear justification reason is required for leave balance adjustments.";
  }

  return buildValidationResult(errors);
}

export function validateLeaveTypeForm(
  input: {
    id?: string;
    name: string;
    code: string;
    annualEntitlement: number;
    maxCarryForwardDays: number;
    expirationPeriodMonths: number;
  },
  existingTypes: LeaveTypeConfig[],
  mode: "add" | "edit"
): ValidationResult {
  const errors: Record<string, string> = {};
  const trimmedName = input.name.trim();
  const trimmedCode = input.code.trim().toUpperCase();

  if (!trimmedName) {
    errors.ltName = "Leave type name is required.";
  } else if (
    existingTypes.some(
      (t) => t.name.trim().toLowerCase() === trimmedName.toLowerCase() && (mode === "add" || t.id !== input.id)
    )
  ) {
    errors.ltName = "A leave type with this name already exists.";
  }

  if (!trimmedCode) {
    errors.ltCode = "Leave code is required.";
  } else if (!/^[A-Z0-9_-]{2,12}$/.test(trimmedCode)) {
    errors.ltCode = "Leave code must be 2–12 letters or numbers (e.g., AL, SL).";
  } else if (
    existingTypes.some(
      (t) => t.code.trim().toLowerCase() === trimmedCode.toLowerCase() && (mode === "add" || t.id !== input.id)
    )
  ) {
    errors.ltCode = "This leave code is already assigned.";
  }

  if (!isNonNegativeNumber(input.annualEntitlement)) {
    errors.ltEntitlement = "Annual entitlement must be 0 or greater.";
  }
  if (!isNonNegativeNumber(input.maxCarryForwardDays)) {
    errors.ltMaxCarry = "Max carry-forward days must be 0 or greater.";
  }
  if (!isNonNegativeNumber(input.expirationPeriodMonths)) {
    errors.ltExpireMonths = "Expiration period must be 0 or greater.";
  }

  return buildValidationResult(errors);
}

export function validateLeaveYearForm(input: {
  yearName: string;
  startDate: string;
  endDate: string;
  workingDays: string[];
}): ValidationResult {
  const errors: Record<string, string> = {};
  if (!input.yearName.trim()) {
    errors.lyName = "Leave year label is required.";
  }
  if (!isValidDateString(input.startDate)) {
    errors.lyStart = "Please enter a valid start date.";
  }
  if (!isValidDateString(input.endDate)) {
    errors.lyEnd = "Please enter a valid end date.";
  } else if (isValidDateString(input.startDate) && input.endDate <= input.startDate) {
    errors.lyEnd = "Leave year end date must be after start date.";
  }
  if (!input.workingDays || input.workingDays.length === 0) {
    errors.lyWorkingDays = "Select at least one working day per week.";
  }
  return buildValidationResult(errors);
}

// ======================================================
// Medical Management Validators
// ======================================================

export function validateMedicalClaimForm(input: {
  employeeId: string;
  beneficiaryType: "Employee" | "Family Member";
  familyMemberId: string;
  medicalService: string;
  facilityName: string;
  expenseDate: string;
  invoiceNumber: string;
  amountETB: string;
  familyMembers: FamilyMember[];
  policy: MedicalPolicyConfig;
  remainingFamilyAllocation?: number;
  existingInvoiceNumbers?: string[];
  mode: "add" | "edit";
}): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.employeeId) {
    errors.claimEmpId = "Please select an employee.";
  }

  if (input.beneficiaryType === "Family Member") {
    if (!input.familyMemberId) {
      errors.claimFamilyMemberId = "Please select the family member beneficiary.";
    } else {
      const fm = input.familyMembers.find((f) => f.id === input.familyMemberId);
      if (!fm) {
        errors.claimFamilyMemberId = "Selected family member record was not found.";
      } else if (fm.status !== "Active" || !fm.medicalEligibility) {
        errors.claimFamilyMemberId = `${fm.fullName} is currently ineligible or inactive for medical claims.`;
      }
    }
  }

  if (!input.medicalService.trim()) {
    errors.claimService = "Medical service or diagnosis description is required.";
  }

  if (!input.facilityName.trim()) {
    errors.claimFacility = "Hospital or clinic name is required.";
  }

  if (!input.expenseDate) {
    errors.claimDate = "Expense date is required.";
  } else if (!isValidDateString(input.expenseDate)) {
    errors.claimDate = "Please enter a valid expense date.";
  } else if (isFutureDate(input.expenseDate)) {
    errors.claimDate = "Expense date cannot be in the future.";
  }

  if (input.policy.requiresInvoiceNumber && !input.invoiceNumber.trim()) {
    errors.claimInvoice = "Receipt / Invoice number is required by company medical policy.";
  } else if (
    input.mode === "add" &&
    input.invoiceNumber.trim() &&
    input.existingInvoiceNumbers?.some(
      (inv) => inv.trim().toLowerCase() === input.invoiceNumber.trim().toLowerCase()
    )
  ) {
    errors.claimInvoice = `Invoice number "${input.invoiceNumber.trim()}" has already been claimed. Duplicate invoices are not allowed.`;
  }

  const amt = Number(input.amountETB);
  if (!input.amountETB.trim() || Number.isNaN(amt) || !Number.isFinite(amt) || amt <= 0) {
    errors.claimAmount = "Claim amount must be greater than 0 ETB.";
  } else if (
    input.beneficiaryType === "Family Member" &&
    typeof input.remainingFamilyAllocation === "number" &&
    amt > input.remainingFamilyAllocation
  ) {
    errors.claimAmount = `Claim (${amt.toLocaleString()} ETB) exceeds remaining family medical allocation (${input.remainingFamilyAllocation.toLocaleString()} ETB).`;
  }

  return buildValidationResult(errors);
}

export function validateMedicalFamilyForm(input: {
  employeeId: string;
  fullName: string;
  relationship: string;
  gender: string;
  dob: string;
  phoneNumber?: string;
}): ValidationResult {
  const errors: Record<string, string> = {};
  if (!input.employeeId) errors.famEmpId = "Employee selection is required.";
  if (!input.fullName.trim()) errors.famFullName = "Dependent full name is required.";
  if (!input.relationship) errors.famRelationship = "Relationship is required.";
  if (!input.gender) errors.famGender = "Gender is required.";
  if (!input.dob) {
    errors.famDob = "Date of birth is required.";
  } else if (!isValidDateString(input.dob)) {
    errors.famDob = "Please enter a valid date of birth.";
  } else if (isFutureDate(input.dob)) {
    errors.famDob = "Date of birth cannot be in the future.";
  }
  if (input.phoneNumber && input.phoneNumber.trim() && !isValidPhone(input.phoneNumber)) {
    errors.famPhone = "Please enter a valid phone number.";
  }
  return buildValidationResult(errors);
}

export function validateMedicalPolicyForm(input: {
  defaultFamilyAllocationETB: number;
  currencySymbol: string;
}): ValidationResult {
  const errors: Record<string, string> = {};
  if (!isPositiveNumber(input.defaultFamilyAllocationETB)) {
    errors.policyAllocation = "Annual family allocation limit must be greater than 0.";
  }
  if (!input.currencySymbol.trim()) {
    errors.policyCurrency = "Currency symbol is required (e.g. ETB).";
  }
  return buildValidationResult(errors);
}

// ======================================================
// Payroll Management Validators
// ======================================================

export function validatePayrollComponentForm(
  input: {
    id?: string;
    name: string;
    code: string;
    calculationMethod: string;
    calculationValue: string;
    effectiveDate: string;
  },
  existingComponents: SalaryComponent[],
  mode: "add" | "edit"
): ValidationResult {
  const errors: Record<string, string> = {};
  const trimmedName = input.name.trim();
  const trimmedCode = input.code.trim().toUpperCase();

  if (!trimmedName) {
    errors.compName = "Component name is required.";
  } else if (
    existingComponents.some(
      (c) => c.name.trim().toLowerCase() === trimmedName.toLowerCase() && (mode === "add" || c.id !== input.id)
    )
  ) {
    errors.compName = "A salary component with this name already exists.";
  }

  if (!trimmedCode) {
    errors.compCode = "Component code is required.";
  } else if (!/^[A-Z0-9_-]{2,20}$/.test(trimmedCode)) {
    errors.compCode = "Code must be 2–20 uppercase letters, numbers, or '_' (e.g. TRANS_ALLOW).";
  } else if (
    existingComponents.some(
      (c) => c.code.trim().toLowerCase() === trimmedCode.toLowerCase() && (mode === "add" || c.id !== input.id)
    )
  ) {
    errors.compCode = "This component code is already in use.";
  }

  const val = Number(input.calculationValue || 0);
  if (Number.isNaN(val) || !Number.isFinite(val) || val < 0) {
    errors.compValue = "Calculation value must be 0 or greater.";
  } else if (input.calculationMethod === "Percentage" && val > 100) {
    errors.compValue = "Percentage rate cannot exceed 100%.";
  }

  if (!input.effectiveDate || !isValidDateString(input.effectiveDate)) {
    errors.compEffectiveDate = "Please enter a valid effective date.";
  }

  return buildValidationResult(errors);
}

export function validatePayrollPeriodForm(
  input: {
    id?: string;
    periodName: string;
    startDate: string;
    endDate: string;
    paymentDate: string;
  },
  existingPeriods: PayrollPeriod[],
  mode: "add" | "edit"
): ValidationResult {
  const errors: Record<string, string> = {};
  const name = input.periodName.trim();

  if (!name) {
    errors.pName = "Payroll period name is required (e.g., March 2026).";
  } else if (
    existingPeriods.some(
      (p) => p.periodName.trim().toLowerCase() === name.toLowerCase() && (mode === "add" || p.id !== input.id)
    )
  ) {
    errors.pName = `Payroll period "${name}" already exists.`;
  }

  if (!input.startDate || !isValidDateString(input.startDate)) {
    errors.pStart = "Valid period start date is required.";
  }
  if (!input.endDate || !isValidDateString(input.endDate)) {
    errors.pEnd = "Valid period end date is required.";
  } else if (isValidDateString(input.startDate) && input.endDate < input.startDate) {
    errors.pEnd = "End date cannot be earlier than start date.";
  }

  if (!input.paymentDate || !isValidDateString(input.paymentDate)) {
    errors.pPayment = "Valid payment date is required.";
  } else if (isValidDateString(input.startDate) && input.paymentDate < input.startDate) {
    errors.pPayment = "Payment date cannot be earlier than period start date.";
  }

  return buildValidationResult(errors);
}

export function validateSalarySetupForm(input: {
  employeeId?: string;
  basicSalary: string;
  positionAllowance: string;
  transportAllowance: string;
  housingAllowance: string;
  responsibilityAllowance: string;
  telephoneAllowance: string;
  overtimeAmount: string;
  otherEarnings: string;
  effectiveDate: string;
  recurringDeductions?: Record<string, string>;
}): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.employeeId) {
    errors.structEmployee = "An employee must be selected.";
  }

  const basic = Number(input.basicSalary);
  if (input.basicSalary.trim() === "" || Number.isNaN(basic) || basic <= 0) {
    errors.structBasic = "Basic salary must be greater than 0 ETB.";
  }

  const checkNonNeg = (key: string, valStr: string, label: string) => {
    const n = Number(valStr || 0);
    if (Number.isNaN(n) || !Number.isFinite(n) || n < 0) {
      errors[key] = `${label} cannot be negative.`;
    }
  };

  checkNonNeg("structPos", input.positionAllowance, "Position allowance");
  checkNonNeg("structTrans", input.transportAllowance, "Transport allowance");
  checkNonNeg("structHouse", input.housingAllowance, "Housing allowance");
  checkNonNeg("structResp", input.responsibilityAllowance, "Responsibility allowance");
  checkNonNeg("structTel", input.telephoneAllowance, "Telephone allowance");
  checkNonNeg("structOvertime", input.overtimeAmount, "Overtime amount");
  checkNonNeg("structOther", input.otherEarnings, "Other earnings");

  if (input.recurringDeductions) {
    Object.entries(input.recurringDeductions).forEach(([code, v]) => {
      const n = Number(v || 0);
      if (Number.isNaN(n) || !Number.isFinite(n) || n < 0) {
        errors[`ded_${code}`] = `Deduction "${code}" cannot be negative.`;
      }
    });
  }

  if (!input.effectiveDate || !isValidDateString(input.effectiveDate)) {
    errors.structEffDate = "Valid effective date is required.";
  }

  return buildValidationResult(errors);
}

export function validateBulkSalaryUpdateForm(input: {
  bulkValue: string;
  bulkMode: "PercentIncrease" | "FixedAdd" | "SetFixed";
  targetCount: number;
}): ValidationResult {
  const errors: Record<string, string> = {};
  const val = Number(input.bulkValue);
  if (input.targetCount <= 0) {
    errors.bulkDept = "No employees match the selected bulk update filter.";
  }
  if (input.bulkValue.trim() === "" || Number.isNaN(val) || !Number.isFinite(val)) {
    errors.bulkValue = "Please enter a valid numeric adjustment value.";
  } else if (val <= 0) {
    errors.bulkValue = "Adjustment value must be greater than 0.";
  } else if (input.bulkMode === "PercentIncrease" && val > 500) {
    errors.bulkValue = "Percentage increase cannot exceed 500% in a single bulk operation.";
  }
  return buildValidationResult(errors);
}

// ======================================================
// Settings, Users, Holidays & Roles Validators
// ======================================================

export function validateCompanyProfileForm(input: {
  displayName: string;
  legalName: string;
  shortName: string;
  email: string;
  website: string;
}): ValidationResult {
  const errors: Record<string, string> = {};
  if (!input.displayName.trim()) {
    errors.displayName = "Company display name is required.";
  }
  if (!input.legalName.trim()) {
    errors.legalName = "Registered legal name is required.";
  }
  if (!input.shortName.trim()) {
    errors.shortName = "Abbreviation / short name is required.";
  }
  if (input.email.trim() && !isValidEmail(input.email)) {
    errors.companyEmail = "Please enter a valid company contact email address.";
  }
  if (input.website.trim() && !isValidUrl(input.website)) {
    errors.companyWebsite = "Please enter a valid website URL (e.g. https://www.ethiopianre.com).";
  }
  return buildValidationResult(errors);
}

export function validateHolidayForm(
  input: { name: string; date: string },
  existingHolidays: PublicHoliday[]
): ValidationResult {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) {
    errors.holName = "Holiday name is required.";
  }
  if (!input.date) {
    errors.holDate = "Holiday date is required.";
  } else if (!isValidDateString(input.date)) {
    errors.holDate = "Please enter a valid holiday date.";
  } else if (existingHolidays.some((h) => h.date === input.date)) {
    errors.holDate = "A public holiday is already registered on this date.";
  }
  return buildValidationResult(errors);
}

export function validateUserAccountForm(input: {
  editingUser: User | null;
  fullName: string;
  email: string;
  password: string;
  role: string;
  status: string;
  employeeId?: string;
  existingUsers: User[];
  roles: SystemRole[];
  currentUser: User | null;
}): ValidationResult {
  const errors: Record<string, string> = {};
  const emailNorm = input.email.trim().toLowerCase();

  if (!input.fullName.trim()) {
    errors.uName = "Full name is required.";
  } else if (input.fullName.trim().length < 2) {
    errors.uName = "Full name must be at least 2 characters.";
  }

  if (!emailNorm) {
    errors.uEmail = "Company email address is required.";
  } else if (!isValidEmail(emailNorm)) {
    errors.uEmail = "Please enter a valid email address.";
  } else if (!isAuthorizedCompanyEmail(emailNorm)) {
    errors.uEmail =
      "Email must belong to @ethiopianre.com (or be an authorized administrator exception).";
  } else if (
    input.existingUsers.some(
      (u) =>
        u.email.trim().toLowerCase() === emailNorm &&
        (!input.editingUser || u.id !== input.editingUser.id)
    )
  ) {
    errors.uEmail = "A user account with this email address already exists.";
  }

  if (!input.editingUser) {
    if (!input.password) {
      errors.uPass = "Initial password is required.";
    } else if (input.password.length < 6) {
      errors.uPass = "Password must be at least 6 characters long.";
    }
  } else if (input.password && input.password.length < 6) {
    errors.uPass = "New password must be at least 6 characters long.";
  }

  if (!input.role) {
    errors.uRole = "Please select a role.";
  } else {
    const roleObj = input.roles.find((r) => r.id === input.role || r.name === input.role);
    if (roleObj && roleObj.status === "Inactive") {
      errors.uRole = `The role "${roleObj.name}" is currently inactive. Activate it first or choose an active role.`;
    }
  }

  if (input.editingUser && input.currentUser && input.editingUser.id === input.currentUser.id) {
    if (input.role !== input.editingUser.role) {
      errors.uRole = "You cannot change your own Administrator role from this screen.";
    }
    if (input.status !== "Active") {
      errors.uStatus = "You cannot deactivate or suspend your own currently active account.";
    }
  }

  // Last active Administrator safeguard
  if (input.editingUser && input.editingUser.role === "Administrator") {
    const otherActiveAdmins = input.existingUsers.filter(
      (u) => u.id !== input.editingUser!.id && u.role === "Administrator" && u.status === "Active"
    );
    if (otherActiveAdmins.length === 0 && (input.role !== "Administrator" || input.status !== "Active")) {
      errors.uRole = "Cannot downgrade or deactivate the last active System Administrator.";
    }
  }

  return buildValidationResult(errors);
}

export function validateRoleModalForm(
  input: {
    editingRole: SystemRole | null;
    roleName: string;
    roleDesc: string;
  },
  existingRoles: SystemRole[]
): ValidationResult {
  const errors: Record<string, string> = {};
  const trimmedName = input.roleName.trim();

  if (!trimmedName) {
    errors.roleName = "Role name is required.";
  } else {
    const candidateId = trimmedName.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
    if (!candidateId) {
      errors.roleName = "Role name must contain alphanumeric characters.";
    } else if (input.editingRole) {
      const updatedName = input.editingRole.isSystem ? input.editingRole.name : trimmedName;
      if (
        existingRoles.some(
          (r) => r.id !== input.editingRole!.id && r.name.trim().toLowerCase() === updatedName.toLowerCase()
        )
      ) {
        errors.roleName = `A role named "${updatedName}" already exists.`;
      }
    } else {
      if (
        existingRoles.some(
          (r) =>
            r.id.toLowerCase() === candidateId.toLowerCase() ||
            r.name.trim().toLowerCase() === trimmedName.toLowerCase()
        )
      ) {
        errors.roleName = `Role "${trimmedName}" already exists.`;
      }
    }
  }

  if (!input.roleDesc.trim()) {
    errors.roleDesc = "Please provide a brief description of this role's responsibilities.";
  }

  return buildValidationResult(errors);
}

// ======================================================
// HR Requests & Notifications Validators
// ======================================================

export function validateHRRequestForm(input: {
  requestType: "profile_update" | "attendance_correction" | "general_hr";
  category: string;
  subject: string;
  description: string;
  proposedPhoneNumber?: string;
  proposedAltPhoneNumber?: string;
  proposedAddress?: string;
  attendanceDate?: string;
  requestedCheckIn?: string;
  requestedCheckOut?: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.category.trim()) {
    errors.reqCategory = "Please select a request category.";
  }
  if (!input.subject.trim()) {
    errors.reqSubject = "Request subject is required.";
  } else if (input.subject.trim().length < 3) {
    errors.reqSubject = "Subject must be at least 3 characters long.";
  }

  if (!input.description.trim()) {
    errors.reqDescription = "Please enter details explaining your request.";
  } else if (input.description.trim().length < 5) {
    errors.reqDescription = "Description must be at least 5 characters long.";
  }

  if (input.requestType === "profile_update") {
    const hasChange =
      Boolean(input.proposedPhoneNumber?.trim()) ||
      Boolean(input.proposedAltPhoneNumber?.trim()) ||
      Boolean(input.proposedAddress?.trim());

    if (!hasChange) {
      errors.reqPhone = "Provide at least one updated contact detail (phone, alternative phone, or address).";
    }
    if (input.proposedPhoneNumber && input.proposedPhoneNumber.trim() && !isValidPhone(input.proposedPhoneNumber)) {
      errors.reqPhone = "Please enter a valid primary phone number (9–15 digits).";
    }
    if (input.proposedAltPhoneNumber && input.proposedAltPhoneNumber.trim() && !isValidPhone(input.proposedAltPhoneNumber)) {
      errors.reqAltPhone = "Please enter a valid alternative phone number (9–15 digits).";
    }
  }

  if (input.requestType === "attendance_correction") {
    if (!input.attendanceDate) {
      errors.reqAttDate = "Please select the attendance date to correct.";
    } else if (!isValidDateString(input.attendanceDate)) {
      errors.reqAttDate = "Please enter a valid attendance date.";
    } else if (isFutureDate(input.attendanceDate)) {
      errors.reqAttDate = "Attendance correction date cannot be in the future.";
    }

    if (input.requestedCheckIn && !isValidTimeString(input.requestedCheckIn)) {
      errors.reqCheckIn = "Please enter a valid check-in time (HH:MM).";
    }
    if (input.requestedCheckOut && !isValidTimeString(input.requestedCheckOut)) {
      errors.reqCheckOut = "Please enter a valid check-out time (HH:MM).";
    }
    if (
      input.requestedCheckIn &&
      input.requestedCheckOut &&
      isValidTimeString(input.requestedCheckIn) &&
      isValidTimeString(input.requestedCheckOut) &&
      timeToMinutes(input.requestedCheckOut) <= timeToMinutes(input.requestedCheckIn)
    ) {
      errors.reqCheckOut = "Requested check-out time must be later than check-in time.";
    }
  }

  return buildValidationResult(errors);
}

export function validateAnnouncementForm(input: {
  title: string;
  message: string;
}): ValidationResult {
  const errors: Record<string, string> = {};
  if (!input.title.trim()) {
    errors.annTitle = "Announcement title is required.";
  } else if (input.title.trim().length < 3) {
    errors.annTitle = "Announcement title must be at least 3 characters.";
  }
  if (!input.message.trim()) {
    errors.annMessage = "Announcement message content is required.";
  } else if (input.message.trim().length < 5) {
    errors.annMessage = "Announcement message must be at least 5 characters.";
  }
  return buildValidationResult(errors);
}

