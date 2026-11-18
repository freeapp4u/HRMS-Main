import React, { useState, useEffect, useMemo } from "react";
import { 
  LeaveRecord, Employee, Department, PublicHoliday, CompanyConfig, User, ModulePermission,
  LeaveTypeConfig, LeaveYearConfig, EmployeeLeaveBalance, LeaveBalanceAdjustment, YearEndProcessingRecord 
} from "../types";
import { calculateWorkingDaysCount, checkLeaveOverlap, calculateEmployeeLeaveBalance } from "../utils/leaveUtils";
import { getDepartmentHeadManagedDeptIds, resolveOwnEmployeeRecord } from "../utils/rbacUtils";
import { formatReportDateTime, ReportExportPayload } from "../utils/reportBranding";
import CompanyReportHeader from "./reports/CompanyReportHeader";
import ReportPrintButton from "./reports/ReportPrintButton";
import ReportPDFExportButton from "./reports/ReportPDFExportButton";
import { 
  Plus, Search, Edit, Trash2, Calendar, CalendarDays, Check, X, Save, 
  FileSpreadsheet, RefreshCw, Calculator, Ban, Info, AlertTriangle,
  LayoutDashboard, FileText, CheckCircle2, ShieldAlert, Clock, ArrowRight,
  Sliders, Settings, ChevronRight, Download, Filter, UserCheck, Layers, Award, ShieldCheck, Upload, ExternalLink
} from "lucide-react";
import { uploadFileToStorage } from "../firebase";
import {
  validateLeaveApplicationForm,
  validateLeaveAdjustmentForm,
  validateLeaveTypeForm,
  validateLeaveYearForm,
  validateDocumentUpload,
  focusFirstInvalidField
} from "../utils/validation";
import { FormFieldError, ValidationSummary, fieldInputClass } from "./ui/FormFeedback";
import { useToast, ConfirmDialog } from "./ui/ToastProvider";

interface LeaveManagementProps {
  leaves: LeaveRecord[];
  employees: Employee[];
  departments: Department[];
  holidays: PublicHoliday[];
  companyConfig: CompanyConfig;
  currentUser: User | null;
  initialSubTab?: string;
  permissions?: ModulePermission;
  onAddLeave: (record: LeaveRecord) => boolean;
  onUpdateLeave: (record: LeaveRecord) => void;
  onDeleteLeave?: (id: string) => boolean;
  onUpdateConfig: (config: CompanyConfig) => void;
  onLogAction: (module: string, action: string, record: string, details: string) => void;
}

export default function LeaveManagement({
  leaves,
  employees,
  departments,
  holidays,
  companyConfig,
  currentUser,
  initialSubTab = "dashboard",
  permissions,
  onAddLeave,
  onUpdateLeave,
  onDeleteLeave,
  onUpdateConfig,
  onLogAction
}: LeaveManagementProps) {
  const canCreate = permissions ? permissions.actions.create : currentUser?.role !== "Auditor";
  const canEdit = permissions ? permissions.actions.edit : currentUser?.role !== "Auditor";
  const canDelete = permissions ? permissions.actions.delete : (currentUser?.role === "Administrator" || currentUser?.role === "HR Officer");
  const canApprove = permissions ? permissions.actions.approve : (currentUser?.role === "Administrator" || currentUser?.role === "HR Officer" || currentUser?.role === "Department Head");
  const canExport = permissions ? permissions.actions.export : true;

  const canViewSub = (subId: string) => {
    if (!permissions) {
      if (subId === "config") return currentUser?.role === "Administrator" || currentUser?.role === "Auditor";
      return true;
    }
    return permissions.submenus[subId] !== false;
  };

  const isEmployeeRole = currentUser?.role === "Employee";
  const isDeptHead = currentUser?.role === "Department Head";
  const effectiveScope = isEmployeeRole ? "own" : (permissions?.dataScope || (isDeptHead ? "team" : "all"));
  const managedDeptIds = useMemo(
    () => ((isDeptHead || effectiveScope === "team") ? getDepartmentHeadManagedDeptIds(currentUser, departments, employees) : []),
    [isDeptHead, effectiveScope, currentUser, departments, employees]
  );
  const ownEmp = useMemo(() => resolveOwnEmployeeRecord(currentUser, employees), [currentUser, employees]);
  const myEmpId = ownEmp?.employeeId || currentUser?.employeeId;

  const isRecordInScope = (employeeId: string) => {
    if (effectiveScope === "own") return Boolean(myEmpId && employeeId === myEmpId);
    if (effectiveScope === "team" && managedDeptIds.length > 0) {
      const emp = employees.find(e => e.employeeId === employeeId);
      return emp ? managedDeptIds.includes(emp.departmentId) : false;
    }
    return true;
  };

  // Navigation Subtab state (dashboard, applications, balances, calendar, config, reports)
  const [activeSubTab, setActiveSubTab] = useState<string>(() => {
    if (initialSubTab && ["dashboard", "applications", "balances", "calendar", "config", "reports"].includes(initialSubTab) && canViewSub(initialSubTab)) {
      return initialSubTab;
    }
    const firstAllowed = ["dashboard", "applications", "balances", "calendar", "config", "reports"].find(canViewSub);
    return firstAllowed || "dashboard";
  });

  useEffect(() => {
    if (initialSubTab && ["dashboard", "applications", "balances", "calendar", "config", "reports"].includes(initialSubTab) && canViewSub(initialSubTab)) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // System Configurations with Fallbacks
  const leaveTypesConfig: LeaveTypeConfig[] = useMemo(() => {
    if (companyConfig.leaveTypesConfig && companyConfig.leaveTypesConfig.length > 0) {
      return companyConfig.leaveTypesConfig;
    }
    // Fallback default list
    return Object.entries(companyConfig.leaveAllocations || {}).map(([name, count], index) => ({
      id: `LT00${index + 1}`,
      name,
      code: name.split(" ").map(w => w[0]).join("").toUpperCase(),
      description: `Configured ${name} for Ethiopian Reinsurance S.C.`,
      annualEntitlement: count,
      isPaid: !name.toLowerCase().includes("unpaid"),
      accrualRule: "Annual",
      carryForwardEligible: name.toLowerCase().includes("annual"),
      maxCarryForwardDays: name.toLowerCase().includes("annual") ? 10 : 0,
      expirationPeriodMonths: 12,
      requiresSupportingDocument: name.toLowerCase().includes("sick") || name.toLowerCase().includes("maternity"),
      status: "Active"
    }));
  }, [companyConfig]);

  const leaveYearConfig: LeaveYearConfig = useMemo(() => {
    return companyConfig.leaveYearConfig || {
      id: "LY2026",
      yearName: "2026",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      isCustomYear: false,
      workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      status: "Active",
      processedYearEnd: false
    };
  }, [companyConfig]);

  const activeLeaveTypes = useMemo(() => {
    return leaveTypesConfig.filter(lt => lt.status === "Active");
  }, [leaveTypesConfig]);

  const holidayDates = useMemo(() => holidays.map(h => h.date), [holidays]);

  // Adjustments & Audit Records State in LocalStorage
  const [manualAdjustments, setManualAdjustments] = useState<LeaveBalanceAdjustment[]>(() => {
    const saved = localStorage.getItem("ethiore_leave_adjustments");
    return saved ? JSON.parse(saved) : [];
  });

  const [yearEndRecords, setYearEndRecords] = useState<YearEndProcessingRecord[]>(() => {
    const saved = localStorage.getItem("ethiore_yearend_records");
    return saved ? JSON.parse(saved) : [];
  });

  const saveAdjustments = (items: LeaveBalanceAdjustment[]) => {
    setManualAdjustments(items);
    localStorage.setItem("ethiore_leave_adjustments", JSON.stringify(items));
  };

  const saveYearEndRecords = (items: YearEndProcessingRecord[]) => {
    setYearEndRecords(items);
    localStorage.setItem("ethiore_yearend_records", JSON.stringify(items));
  };

  // Compute Employee Balances
  const computedBalances: EmployeeLeaveBalance[] = useMemo(() => {
    const results: EmployeeLeaveBalance[] = [];
    const activeEmps = employees.filter(e => {
      if (e.status !== "Active") return false;
      if (currentUser?.role === "Employee") {
        return e.employeeId === currentUser.employeeId;
      }
      if (isDeptHead && managedDeptIds.length > 0) {
        return managedDeptIds.includes(e.departmentId);
      }
      return true;
    });
    const currentYear = leaveYearConfig.yearName || "2026";

    activeEmps.forEach(emp => {
      activeLeaveTypes.forEach(lt => {
        // Calculate sum of manual adjustments for this emp & leave type
        const adjSum = manualAdjustments
          .filter(a => a.employeeId === emp.employeeId && a.leaveTypeId === lt.id && a.leaveYear === currentYear)
          .reduce((sum, a) => sum + a.amount, 0);

        // Calculate carried forward from previous year if year end was processed
        const lastYearRecord = yearEndRecords.find(y => y.toYear === currentYear);
        let carried = 0;
        if (lastYearRecord) {
          const detail = lastYearRecord.details.find(d => d.employeeId === emp.employeeId && d.leaveType === lt.name);
          if (detail) {
            carried = detail.eligibleCarryForward;
          }
        }

        const bal = calculateEmployeeLeaveBalance(emp.employeeId, lt, currentYear, leaves, carried, adjSum);
        results.push(bal);
      });
    });

    return results;
  }, [employees, activeLeaveTypes, leaveYearConfig, leaves, manualAdjustments, yearEndRecords]);

  // ==========================================
  // COMMON MODALS & STATE (Applications)
  // ==========================================
  const [appSearchTerm, setAppSearchTerm] = useState("");
  const [appFilterType, setAppFilterType] = useState("");
  const [appFilterStatus, setAppFilterStatus] = useState("");

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRecord | null>(null);

  // Application Form Fields
  const [empIdInput, setEmpIdInput] = useState("");
  const [leaveType, setLeaveType] = useState("Annual Leave");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [halfDayPeriod, setHalfDayPeriod] = useState<"Morning" | "Afternoon">("Morning");
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [docUploading, setDocUploading] = useState(false);
  const [docUploadStatus, setDocUploadStatus] = useState("");
  const [leaveStatus, setLeaveStatus] = useState<any>("Active");
  const [adminBypass, setAdminBypass] = useState(false);

  const toast = useToast();
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Confirm Dialog state for Cancel / Delete / Year-End Re-run
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmText: string;
    variant: "danger" | "warning" | "primary";
    onConfirm: () => void;
  } | null>(null);

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleLeaveDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError("");
    setDocUploadStatus("");
    const fileCheck = validateDocumentUpload(file, {
      maxSizeMB: 10,
      allowedExtensions: ["pdf", "png", "jpg", "jpeg", "webp", "doc", "docx"]
    });
    if (!fileCheck.valid) {
      const msg = fileCheck.error || "Invalid supporting document file.";
      setFormError(msg);
      setFieldErrors((prev) => ({ ...prev, supportingDocumentUrl: msg }));
      toast.showError(msg, "File Validation Error");
      e.target.value = "";
      return;
    }
    setDocUploading(true);
    try {
      const targetEmp = empIdInput || currentUser?.employeeId || "general";
      const uploaded = await uploadFileToStorage(`leave_documents/${targetEmp}`, file);
      setDocUrl(uploaded.url);
      clearFieldError("supportingDocumentUrl");
      setDocUploadStatus(`Uploaded '${file.name}' to Firebase Storage.`);
      toast.showSuccess(`Uploaded '${file.name}' successfully.`, "Document Uploaded");
    } catch (err: any) {
      const msg = err?.message || "Failed to upload supporting document to Firebase Storage.";
      setFormError(msg);
      toast.showError(msg, "Upload Failed");
    } finally {
      setDocUploading(false);
      e.target.value = "";
    }
  };

  const activeEmployees = useMemo(() => employees.filter(e => {
    if (e.status !== "Active") return false;
    if (currentUser?.role === "Employee") return e.employeeId === currentUser.employeeId;
    if (isDeptHead && managedDeptIds.length > 0) return managedDeptIds.includes(e.departmentId);
    return true;
  }), [employees, currentUser, isDeptHead, managedDeptIds]);

  // Selected Employee's available balance preview
  const currentSelectedBalance = useMemo(() => {
    if (!empIdInput || !leaveType) return { total: 0, utilized: 0, remaining: 0 };
    const matchedBal = computedBalances.find(b => b.employeeId === empIdInput && b.leaveTypeName === leaveType);
    if (matchedBal) {
      return {
        total: matchedBal.openingBalance,
        utilized: matchedBal.leaveUtilized,
        remaining: matchedBal.remainingBalance
      };
    }
    const ltObj = activeLeaveTypes.find(t => t.name === leaveType);
    const ent = ltObj ? ltObj.annualEntitlement : 0;
    return { total: ent, utilized: 0, remaining: ent };
  }, [empIdInput, leaveType, computedBalances, activeLeaveTypes]);

  const computedWorkingDays = useMemo(() => {
    return calculateWorkingDaysCount(
      startDate,
      endDate,
      holidayDates,
      leaveYearConfig.workingDays || ["Mon", "Tue", "Wed", "Thu", "Fri"],
      isHalfDay
    );
  }, [startDate, endDate, holidayDates, leaveYearConfig, isHalfDay]);

  const resetForm = () => {
    setEmpIdInput(activeEmployees[0]?.employeeId || "");
    setLeaveType(activeLeaveTypes[0]?.name || "Annual Leave");
    setStartDate(new Date().toISOString().split("T")[0]);
    setEndDate(new Date().toISOString().split("T")[0]);
    setIsHalfDay(false);
    setHalfDayPeriod("Morning");
    setReason("");
    setRemarks("");
    setDocUrl("");
    setDocUploadStatus("");
    setLeaveStatus("Active");
    setAdminBypass(false);
    setFormError("");
    setFormSuccess("");
    setFieldErrors({});
  };

  const handleOpenAdd = () => {
    resetForm();
    setAddModalOpen(true);
  };

  const handleOpenEdit = (rec: LeaveRecord) => {
    setSelectedLeave(rec);
    setEmpIdInput(rec.employeeId);
    setLeaveType(rec.leaveType);
    setStartDate(rec.startDate);
    setEndDate(rec.endDate);
    setIsHalfDay(!!rec.isHalfDay);
    setHalfDayPeriod(rec.halfDayPeriod || "Morning");
    setReason(rec.reason);
    setRemarks(rec.remarks);
    setDocUrl(rec.supportingDocumentUrl || "");
    setDocUploadStatus("");
    setLeaveStatus(rec.status);
    setAdminBypass(false);
    setFormError("");
    setFormSuccess("");
    setFieldErrors({});
    setEditModalOpen(true);
  };

  const handleAddSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError("");
    setFormSuccess("");

    const empObj = employees.find(emp => emp.employeeId === empIdInput);
    const targetTypeObj = activeLeaveTypes.find(t => t.name === leaveType);

    const validation = validateLeaveApplicationForm({
      employeeId: empIdInput,
      leaveType,
      startDate,
      endDate,
      daysCount: computedWorkingDays,
      reason,
      supportingDocumentUrl: docUrl,
      leaveTypeConfig: targetTypeObj,
      remainingBalance: adminBypass ? undefined : currentSelectedBalance.remaining,
      existingLeaves: leaves,
      mode: "add"
    });

    if (!validation.valid) {
      setFieldErrors(validation.errors);
      setFormError(validation.summaryMessage || "Please correct the highlighted fields.");
      focusFirstInvalidField(validation.errors, e.currentTarget);
      return;
    }

    if (!empObj || empObj.status !== "Active") {
      const msg = "Selected employee is inactive or invalid.";
      setFieldErrors({ employeeId: msg });
      setFormError(msg);
      focusFirstInvalidField({ employeeId: msg }, e.currentTarget);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    const newRec: LeaveRecord = {
      id: `LVE_${Date.now()}`,
      employeeId: empIdInput,
      leaveType,
      startDate,
      endDate,
      daysCount: computedWorkingDays,
      isHalfDay,
      halfDayPeriod: isHalfDay ? halfDayPeriod : undefined,
      reason: reason.trim(),
      status: "Active",
      remarks,
      supportingDocumentUrl: docUrl.trim() || undefined,
      recordedBy: currentUser?.email || "system@ethiopianre.com",
      createdDate: new Date().toISOString().replace("T", " ").substring(0, 19),
      updatedDate: new Date().toISOString().replace("T", " ").substring(0, 19)
    };

    const ok = onAddLeave(newRec);
    setIsSubmitting(false);
    if (ok) {
      setFormSuccess("Leave application registered successfully!");
      toast.showSuccess(
        `Registered ${newRec.daysCount} day(s) of ${newRec.leaveType} for ${empObj.fullName}.`,
        "Leave Registered"
      );
      onLogAction(
        "Leave",
        "Leave Created",
        newRec.employeeId,
        `Registered ${newRec.daysCount} days of ${newRec.leaveType} for ${empObj.fullName}`
      );
      setAddModalOpen(false);
      resetForm();
    } else {
      setFormError("Could not create leave record due to permission or connection error.");
    }
  };

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting || !selectedLeave) return;
    setFormError("");
    setFormSuccess("");

    const empObj = employees.find(emp => emp.employeeId === empIdInput);
    if (!empObj) {
      const msg = "Employee folder does not exist.";
      setFieldErrors({ employeeId: msg });
      setFormError(msg);
      return;
    }

    const targetTypeObj = activeLeaveTypes.find(t => t.name === leaveType);
    const effectiveRemaining =
      selectedLeave.status !== "Cancelled" && selectedLeave.leaveType === leaveType
        ? currentSelectedBalance.remaining + (selectedLeave.daysCount || 0)
        : currentSelectedBalance.remaining;

    const validation = validateLeaveApplicationForm({
      recordId: selectedLeave.id,
      employeeId: empIdInput,
      leaveType,
      startDate,
      endDate,
      daysCount: computedWorkingDays,
      reason,
      supportingDocumentUrl: docUrl,
      leaveTypeConfig: targetTypeObj,
      remainingBalance: leaveStatus === "Cancelled" || adminBypass ? undefined : effectiveRemaining,
      existingLeaves: leaves,
      mode: "edit"
    });

    if (!validation.valid) {
      setFieldErrors(validation.errors);
      setFormError(validation.summaryMessage || "Please correct the highlighted fields.");
      focusFirstInvalidField(validation.errors, e.currentTarget);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    const updatedRec: LeaveRecord = {
      ...selectedLeave,
      leaveType,
      startDate,
      endDate,
      daysCount: computedWorkingDays,
      isHalfDay,
      halfDayPeriod: isHalfDay ? halfDayPeriod : undefined,
      reason: reason.trim(),
      status: leaveStatus,
      remarks,
      supportingDocumentUrl: docUrl.trim() || undefined,
      updatedDate: new Date().toISOString().replace("T", " ").substring(0, 19)
    };

    onUpdateLeave(updatedRec);
    setIsSubmitting(false);
    setFormSuccess("Leave record updated successfully!");
    toast.showSuccess(`Leave record updated for ${empObj.fullName}.`, "Leave Updated");
    onLogAction(
      "Leave",
      "Leave Updated",
      updatedRec.employeeId,
      `Updated leave entry of ${leaveType} for ${empObj.fullName}`
    );
    setEditModalOpen(false);
  };

  const handleCancelLeave = (rec: LeaveRecord) => {
    setConfirmState({
      isOpen: true,
      title: "Cancel Leave Application",
      message: (
        <span>
          Are you sure you want to cancel this <strong>{rec.leaveType}</strong> application ({rec.startDate} to {rec.endDate})?
          The deducted days ({rec.daysCount}) will be restored to the employee&apos;s available balance.
        </span>
      ),
      confirmText: "Yes, Cancel Leave",
      variant: "warning",
      onConfirm: () => {
        const updated = {
          ...rec,
          status: "Cancelled" as const,
          updatedDate: new Date().toISOString().replace("T", " ").substring(0, 19)
        };
        onUpdateLeave(updated);
        onLogAction(
          "Leave",
          "Leave Cancelled",
          rec.employeeId,
          `Cancelled leave record for employee ID ${rec.employeeId}`
        );
        toast.showInfo(`Leave application cancelled and ${rec.daysCount} day(s) restored.`, "Leave Cancelled");
        setConfirmState(null);
      }
    });
  };

  // ==========================================
  // BALANCE ADJUSTMENT MODAL STATE
  // ==========================================
  const [adjModalOpen, setAdjModalOpen] = useState(false);
  const [adjEmpId, setAdjEmpId] = useState("");
  const [adjLeaveType, setAdjLeaveType] = useState("Annual Leave");
  const [adjAmount, setAdjAmount] = useState<string>("0");
  const [adjReason, setAdjReason] = useState("");
  const [adjErrors, setAdjErrors] = useState<Record<string, string>>({});

  const clearAdjError = (key: string) => {
    setAdjErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleOpenAdjustment = (empId?: string, typeName?: string) => {
    setAdjEmpId(empId || activeEmployees[0]?.employeeId || "");
    setAdjLeaveType(typeName || activeLeaveTypes[0]?.name || "Annual Leave");
    setAdjAmount("0");
    setAdjReason("");
    setAdjErrors({});
    setAdjModalOpen(true);
  };

  const handleSaveAdjustment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const matchedType = activeLeaveTypes.find(t => t.name === adjLeaveType);
    const targetType = matchedType ? matchedType.id : "LT001";
    const prevBalObj = computedBalances.find(b => b.employeeId === adjEmpId && b.leaveTypeName === adjLeaveType);
    const prevRem = prevBalObj ? prevBalObj.remainingBalance : 0;

    const validation = validateLeaveAdjustmentForm({
      employeeId: adjEmpId,
      leaveTypeId: adjLeaveType,
      amount: String(adjAmount),
      reason: adjReason,
      currentRemaining: prevRem
    });

    if (!validation.valid) {
      setAdjErrors(validation.errors);
      focusFirstInvalidField(validation.errors, e.currentTarget);
      return;
    }

    const numericAmount = Number(adjAmount);
    const currentYear = leaveYearConfig.yearName || "2026";
    const newRem = Math.max(0, prevRem + numericAmount);

    const newAdj: LeaveBalanceAdjustment = {
      id: `ADJ_${Date.now()}`,
      employeeId: adjEmpId,
      leaveTypeId: targetType,
      leaveTypeName: adjLeaveType,
      leaveYear: currentYear,
      adjustmentType: "Manual Adjustment",
      amount: numericAmount,
      previousRemaining: prevRem,
      newRemaining: newRem,
      reason: adjReason.trim(),
      performedBy: currentUser?.email || "system@ethiopianre.com",
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19)
    };

    saveAdjustments([newAdj, ...manualAdjustments]);
    onLogAction("Leave", "Balance Adjustment", adjEmpId, `Manual balance adjustment of ${numericAmount > 0 ? "+" : ""}${numericAmount} days for ${adjLeaveType}. Reason: ${adjReason}`);
    toast.showSuccess(
      `Adjusted ${adjLeaveType} balance by ${numericAmount > 0 ? "+" : ""}${numericAmount} day(s) for ${adjEmpId}.`,
      "Balance Adjusted"
    );
    setAdjModalOpen(false);
  };

  // ==========================================
  // LEAVE CONFIGURATION MODALS & STATES
  // ==========================================
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<LeaveTypeConfig | null>(null);

  const [ltName, setLtName] = useState("");
  const [ltCode, setLtCode] = useState("");
  const [ltDesc, setLtDesc] = useState("");
  const [ltEntitlement, setLtEntitlement] = useState(30);
  const [ltPaid, setLtPaid] = useState(true);
  const [ltAccrual, setLtAccrual] = useState<"Annual" | "Monthly" | "Immediate">("Annual");
  const [ltCarryEligible, setLtCarryEligible] = useState(true);
  const [ltMaxCarry, setLtMaxCarry] = useState(10);
  const [ltExpMonths, setLtExpMonths] = useState(12);
  const [ltRequiresDoc, setLtRequiresDoc] = useState(false);
  const [ltStatus, setLtStatus] = useState<"Active" | "Inactive">("Active");
  const [ltErrors, setLtErrors] = useState<Record<string, string>>({});

  const clearLtError = (key: string) => {
    setLtErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleOpenTypeModal = (typeObj?: LeaveTypeConfig) => {
    setLtErrors({});
    if (typeObj) {
      setEditingType(typeObj);
      setLtName(typeObj.name);
      setLtCode(typeObj.code);
      setLtDesc(typeObj.description);
      setLtEntitlement(typeObj.annualEntitlement);
      setLtPaid(typeObj.isPaid);
      setLtAccrual(typeObj.accrualRule);
      setLtCarryEligible(typeObj.carryForwardEligible);
      setLtMaxCarry(typeObj.maxCarryForwardDays);
      setLtExpMonths(typeObj.expirationPeriodMonths);
      setLtRequiresDoc(typeObj.requiresSupportingDocument);
      setLtStatus(typeObj.status);
    } else {
      setEditingType(null);
      setLtName("");
      setLtCode("");
      setLtDesc("");
      setLtEntitlement(15);
      setLtPaid(true);
      setLtAccrual("Annual");
      setLtCarryEligible(false);
      setLtMaxCarry(0);
      setLtExpMonths(12);
      setLtRequiresDoc(false);
      setLtStatus("Active");
    }
    setTypeModalOpen(true);
  };

  const handleSaveTypeConfig = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const validation = validateLeaveTypeForm(
      {
        id: editingType?.id,
        name: ltName,
        code: ltCode,
        annualEntitlement: Number(ltEntitlement),
        maxCarryForwardDays: ltCarryEligible ? Number(ltMaxCarry) : 0,
        expirationPeriodMonths: Number(ltExpMonths)
      },
      leaveTypesConfig,
      editingType ? "edit" : "add"
    );

    if (!validation.valid) {
      setLtErrors(validation.errors);
      focusFirstInvalidField(validation.errors, e.currentTarget);
      return;
    }

    const updatedTypes = [...leaveTypesConfig];
    if (editingType) {
      const idx = updatedTypes.findIndex(t => t.id === editingType.id);
      if (idx !== -1) {
        updatedTypes[idx] = {
          ...editingType,
          name: ltName.trim(),
          code: ltCode.trim().toUpperCase(),
          description: ltDesc.trim(),
          annualEntitlement: Number(ltEntitlement),
          isPaid: ltPaid,
          accrualRule: ltAccrual,
          carryForwardEligible: ltCarryEligible,
          maxCarryForwardDays: ltCarryEligible ? Number(ltMaxCarry) : 0,
          expirationPeriodMonths: Number(ltExpMonths),
          requiresSupportingDocument: ltRequiresDoc,
          status: ltStatus
        };
      }
    } else {
      const newType: LeaveTypeConfig = {
        id: `LT_${Date.now()}`,
        name: ltName.trim(),
        code: ltCode.trim().toUpperCase(),
        description: ltDesc.trim(),
        annualEntitlement: Number(ltEntitlement),
        isPaid: ltPaid,
        accrualRule: ltAccrual,
        carryForwardEligible: ltCarryEligible,
        maxCarryForwardDays: ltCarryEligible ? Number(ltMaxCarry) : 0,
        expirationPeriodMonths: Number(ltExpMonths),
        requiresSupportingDocument: ltRequiresDoc,
        status: ltStatus
      };
      updatedTypes.push(newType);
    }

    const newAllocations = { ...companyConfig.leaveAllocations };
    updatedTypes.forEach(t => {
      newAllocations[t.name] = t.annualEntitlement;
    });

    const updatedCompanyConfig: CompanyConfig = {
      ...companyConfig,
      leaveAllocations: newAllocations,
      leaveTypesConfig: updatedTypes
    };

    onUpdateConfig(updatedCompanyConfig);
    onLogAction("LeaveConfig", editingType ? "Update Leave Type" : "Create Leave Type", ltName, "Updated leave type rules and entitlements");
    toast.showSuccess(`Leave policy "${ltName.trim()}" saved successfully.`, "Policy Updated");
    setTypeModalOpen(false);
  };

  // Leave Year & Working Days Form
  const [lyYearName, setLyYearName] = useState(leaveYearConfig.yearName);
  const [lyStart, setLyStart] = useState(leaveYearConfig.startDate);
  const [lyEnd, setLyEnd] = useState(leaveYearConfig.endDate);
  const [lyWorkingDays, setLyWorkingDays] = useState<string[]>(leaveYearConfig.workingDays || ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [lyErrors, setLyErrors] = useState<Record<string, string>>({});

  const clearLyError = (key: string) => {
    setLyErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSaveYearConfig = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const validation = validateLeaveYearForm({
      yearName: lyYearName,
      startDate: lyStart,
      endDate: lyEnd,
      workingDays: lyWorkingDays
    });
    if (!validation.valid) {
      setLyErrors(validation.errors);
      focusFirstInvalidField(validation.errors, e.currentTarget);
      toast.showWarning(validation.summaryMessage || "Check leave year configuration.", "Validation Error");
      return;
    }
    setLyErrors({});

    const updatedYearConfig: LeaveYearConfig = {
      ...leaveYearConfig,
      yearName: lyYearName.trim(),
      startDate: lyStart,
      endDate: lyEnd,
      workingDays: lyWorkingDays
    };

    onUpdateConfig({
      ...companyConfig,
      leaveYearConfig: updatedYearConfig
    });
    onLogAction("LeaveConfig", "Update Leave Year Policy", lyYearName, `Updated leave year schedule to ${lyStart} -> ${lyEnd} with working days ${lyWorkingDays.join(",")}`);
    toast.showSuccess("Leave Year & Working Day configuration saved successfully!", "Schedule Policy Saved");
  };

  // Year End Carry Forward Execution Modal State
  const [yearEndModalOpen, setYearEndModalOpen] = useState(false);
  const [yeFromYear, setYeFromYear] = useState("2025");
  const [yeToYear, setYeToYear] = useState("2026");

  const yearEndPreview = useMemo(() => {
    const detailsList: YearEndProcessingRecord["details"] = [];
    let totalCarried = 0;
    let totalExpired = 0;

    activeEmployees.forEach(emp => {
      const deptObj = departments.find(d => d.id === emp.departmentId);
      activeLeaveTypes.forEach(lt => {
        // Calculate utilized in previous year
        const prevUtilized = leaves
          .filter(r => r.employeeId === emp.employeeId && r.leaveType === lt.name && r.status !== "Cancelled" && (r.startDate && r.startDate.startsWith(yeFromYear)))
          .reduce((sum, r) => sum + r.daysCount, 0);

        const prevOpening = lt.annualEntitlement;
        const unused = Math.max(0, prevOpening - prevUtilized);

        let eligibleCarry = 0;
        let expired = 0;

        if (lt.carryForwardEligible && unused > 0) {
          eligibleCarry = Math.min(unused, lt.maxCarryForwardDays);
          expired = Math.max(0, unused - eligibleCarry);
        } else {
          expired = unused;
        }

        const newOpening = lt.annualEntitlement + eligibleCarry;

        totalCarried += eligibleCarry;
        totalExpired += expired;

        detailsList.push({
          employeeId: emp.employeeId,
          employeeName: emp.fullName,
          departmentName: deptObj ? deptObj.name : emp.departmentId,
          leaveType: lt.name,
          prevOpening,
          entitlement: lt.annualEntitlement,
          utilized: prevUtilized,
          unused,
          eligibleCarryForward: eligibleCarry,
          expired,
          newOpening
        });
      });
    });

    return {
      detailsList,
      totalCarried,
      totalExpired
    };
  }, [activeEmployees, activeLeaveTypes, leaves, departments, yeFromYear]);

  const commitYearEndTransition = () => {
    const newRecord: YearEndProcessingRecord = {
      id: `YE_${yeFromYear}_${yeToYear}_${Date.now()}`,
      fromYear: yeFromYear.trim(),
      toYear: yeToYear.trim(),
      processedDate: new Date().toISOString().replace("T", " ").substring(0, 19),
      processedBy: currentUser?.email || "contactesfaye@gmail.com",
      totalEmployeesProcessed: activeEmployees.length,
      totalCarriedForwardDays: yearEndPreview.totalCarried,
      totalExpiredDays: yearEndPreview.totalExpired,
      details: yearEndPreview.detailsList
    };

    const updatedRecords = [newRecord, ...yearEndRecords.filter(r => !(r.fromYear === yeFromYear && r.toYear === yeToYear))];
    saveYearEndRecords(updatedRecords);

    // Update Company Config year state
    onUpdateConfig({
      ...companyConfig,
      leaveYearConfig: {
        ...leaveYearConfig,
        yearName: yeToYear.trim(),
        processedYearEnd: true,
        processedDate: new Date().toISOString().replace("T", " ").substring(0, 19),
        processedBy: currentUser?.email || "contactesfaye@gmail.com"
      }
    });

    onLogAction("YearEndProcessing", "Year End Transition", `${yeFromYear}->${yeToYear}`, `Processed year-end carry forward: ${yearEndPreview.totalCarried} days carried forward, ${yearEndPreview.totalExpired} days expired across ${activeEmployees.length} employees`);
    toast.showSuccess(
      `Transferred ${yearEndPreview.totalCarried} eligible days into ${yeToYear} balances.`,
      "Year-End Processing Completed"
    );
    setYearEndModalOpen(false);
  };

  const handleExecuteYearEnd = () => {
    if (!yeFromYear.trim() || !yeToYear.trim() || yeFromYear.trim() === yeToYear.trim()) {
      toast.showError("Please specify distinct Previous and New leave year labels.", "Invalid Leave Years");
      return;
    }
    // Check if transition already processed
    const alreadyProcessed = yearEndRecords.some(r => r.fromYear === yeFromYear && r.toYear === yeToYear);
    if (alreadyProcessed) {
      setConfirmState({
        isOpen: true,
        title: "Recalculate Year-End Transition",
        message: (
          <span>
            Year-end transition from <strong>{yeFromYear}</strong> to <strong>{yeToYear}</strong> was previously processed.
            Recalculate and update transition audit records?
          </span>
        ),
        confirmText: "Yes, Recalculate",
        variant: "warning",
        onConfirm: () => {
          commitYearEndTransition();
          setConfirmState(null);
        }
      });
      return;
    }

    commitYearEndTransition();
  };

  // ==========================================
  // CALENDAR STATE
  // ==========================================
  const [calMonth, setCalMonth] = useState<number>(new Date().getMonth());
  const [calYear, setCalYear] = useState<number>(2026);
  const [calDeptFilter, setCalDeptFilter] = useState("");

  const daysInMonth = useMemo(() => {
    return new Date(calYear, calMonth + 1, 0).getDate();
  }, [calYear, calMonth]);

  const monthName = useMemo(() => {
    return new Date(calYear, calMonth, 1).toLocaleString("default", { month: "long" });
  }, [calYear, calMonth]);

  // Overlapping detection for calendar
  const calOverlaps = useMemo(() => {
    const activeLeaves = leaves.filter(l => l.status === "Active");
    const deptGrouped: { [dateStr: string]: { [deptId: string]: number } } = {};

    activeLeaves.forEach(l => {
      const emp = employees.find(e => e.employeeId === l.employeeId);
      if (!emp) return;
      const deptId = emp.departmentId;

      const curr = new Date(l.startDate);
      const end = new Date(l.endDate);
      while (curr <= end) {
        const dStr = curr.toISOString().split("T")[0];
        if (!deptGrouped[dStr]) deptGrouped[dStr] = {};
        deptGrouped[dStr][deptId] = (deptGrouped[dStr][deptId] || 0) + 1;
        curr.setDate(curr.getDate() + 1);
      }
    });

    const collisionDates: { date: string; deptName: string; count: number }[] = [];
    Object.entries(deptGrouped).forEach(([dStr, deptCounts]) => {
      Object.entries(deptCounts).forEach(([deptId, count]) => {
        if (count > 1) {
          const dObj = departments.find(d => d.id === deptId);
          collisionDates.push({
            date: dStr,
            deptName: dObj ? dObj.name : deptId,
            count
          });
        }
      });
    });

    return collisionDates;
  }, [leaves, employees, departments]);

  // ==========================================
  // REPORTS STATE
  // ==========================================
  const [reportType, setReportType] = useState<
    "employee" | "department" | "utilization" | "balance" | "expiration" | "yearend"
  >("yearend");
  const [reportDeptFilter, setReportDeptFilter] = useState("");

  const handleExportReportCSV = () => {
    let csv = "data:text/csv;charset=utf-8,";
    if (reportType === "yearend") {
      csv += "Employee ID,Employee Name,Department,Previous Year Opening,Annual Entitlement,Leave Utilized,Unused Balance,Eligible Carry Forward,Expired Balance,New Year Opening\r\n";
      const latestYe = yearEndRecords[0];
      const rows = latestYe ? latestYe.details : yearEndPreview.detailsList;
      rows.forEach(r => {
        csv += `"${r.employeeId}","${r.employeeName}","${r.departmentName}","${r.prevOpening}","${r.entitlement}","${r.utilized}","${r.unused}","${r.eligibleCarryForward}","${r.expired}","${r.newOpening}"\r\n`;
      });
    } else if (reportType === "balance") {
      csv += "Employee ID,Employee Name,Department,Leave Type,Opening Balance,Annual Entitlement,Carried Forward,Utilized,Expired,Remaining Balance\r\n";
      computedBalances.forEach(b => {
        const emp = employees.find(e => e.employeeId === b.employeeId);
        const dept = emp ? departments.find(d => d.id === emp.departmentId) : null;
        csv += `"${b.employeeId}","${emp?.fullName || b.employeeId}","${dept?.name || ""}","${b.leaveTypeName}","${b.openingBalance}","${b.annualEntitlement}","${b.carriedForwardBalance}","${b.leaveUtilized}","${b.expiredLeave}","${b.remainingBalance}"\r\n`;
      });
    } else {
      csv += "Employee ID,Leave Type,Start Date,End Date,Working Days,Status,Reason\r\n";
      leaves.forEach(l => {
        csv += `"${l.employeeId}","${l.leaveType}","${l.startDate}","${l.endDate}","${l.daysCount}","${l.status}","${l.reason}"\r\n`;
      });
    }

    const encoded = encodeURI(csv);
    const link = document.createElement("a");
    link.setAttribute("href", encoded);
    link.setAttribute("download", `ethiore_leave_report_${reportType}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const leaveReportTitleMap: Record<string, string> = {
    yearend: "Year-End Leave Carry-Forward Report",
    balance: "Employee Leave Balance Report",
    employee: "Employee Leave Applications Report",
    department: "Department Leave Utilization Report",
    utilization: "Annual Leave Utilization Report",
    expiration: "Leave Expiration & Carry-Forward Report",
  };

  const departmentLeaveSummary = useMemo(() => {
    return departments.map(dept => {
      const deptEmps = employees.filter(e => e.departmentId === dept.id);
      const empSet = new Set(deptEmps.map(e => e.employeeId));
      const deptLeaves = leaves.filter(l => empSet.has(l.employeeId));
      const workingDays = deptLeaves.reduce((s, l) => l.status !== "Cancelled" ? s + l.daysCount : s, 0);
      return {
        code: dept.code,
        name: dept.name,
        staffCount: deptEmps.length,
        totalRequests: deptLeaves.length,
        activeCount: deptLeaves.filter(l => l.status === "Active").length,
        completedCount: deptLeaves.filter(l => l.status === "Completed").length,
        workingDays
      };
    });
  }, [departments, employees, leaves]);

  const buildLeaveReportPayload = (): ReportExportPayload => {
    const deptLabel = departments.find(d => d.id === reportDeptFilter)?.name || "All Departments";
    const periodLabel = `${leaveYearConfig.yearName} (${leaveYearConfig.startDate} to ${leaveYearConfig.endDate})`;
    const generatedAt = formatReportDateTime();

    if (reportType === "yearend" || reportType === "expiration") {
      const rowsData = yearEndPreview.detailsList;
      return {
        reportTitle: leaveReportTitleMap[reportType],
        filePrefix: "Leave_Report",
        reportSubtitle: `Transition Preview (${yeFromYear} to ${yeToYear})`,
        reportingPeriod: periodLabel,
        departmentOrUnit: deptLabel,
        generatedAt,
        generatedBy: currentUser?.fullName || currentUser?.email,
        orientation: "landscape",
        summaryMetrics: [
          { label: "Records Evaluated", value: `${rowsData.length}` },
          { label: "Total Carried Forward", value: `${yearEndPreview.totalCarried} Days` },
          { label: "Total Expired", value: `${yearEndPreview.totalExpired} Days` }
        ],
        columns: [
          { header: "Employee ID" },
          { header: "Employee Name" },
          { header: "Department" },
          { header: "Leave Type" },
          { header: "Prev Opening", align: "center" },
          { header: "Entitlement", align: "center" },
          { header: "Utilized", align: "center" },
          { header: "Unused", align: "center" },
          { header: "Carry-Forward", align: "center" },
          { header: "Expired", align: "center" },
          { header: "New Opening", align: "center" }
        ],
        rows: rowsData.map(d => [
          d.employeeId,
          d.employeeName,
          d.departmentName,
          d.leaveType,
          `${d.prevOpening} d`,
          `${d.entitlement} d`,
          `${d.utilized} d`,
          `${d.unused} d`,
          `${d.eligibleCarryForward} d`,
          `${d.expired} d`,
          `${d.newOpening} d`
        ]),
        totalsRow: [
          "TOTAL",
          `${rowsData.length} Entries`,
          "",
          "",
          "",
          "",
          `${rowsData.reduce((s, r) => s + r.utilized, 0)} d`,
          `${rowsData.reduce((s, r) => s + r.unused, 0)} d`,
          `${yearEndPreview.totalCarried} d`,
          `${yearEndPreview.totalExpired} d`,
          ""
        ]
      };
    }

    if (reportType === "balance") {
      return {
        reportTitle: leaveReportTitleMap.balance,
        filePrefix: "Leave_Report",
        reportingPeriod: periodLabel,
        departmentOrUnit: deptLabel,
        generatedAt,
        generatedBy: currentUser?.fullName || currentUser?.email,
        orientation: "landscape",
        summaryMetrics: [
          { label: "Balance Records", value: `${computedBalances.length}` },
          { label: "Total Utilized", value: `${computedBalances.reduce((s, b) => s + b.leaveUtilized, 0)} Days` },
          { label: "Total Remaining", value: `${computedBalances.reduce((s, b) => s + b.remainingBalance, 0)} Days` }
        ],
        columns: [
          { header: "Employee ID" },
          { header: "Employee Name" },
          { header: "Department" },
          { header: "Leave Type" },
          { header: "Opening", align: "center" },
          { header: "Entitlement", align: "center" },
          { header: "Carried Fwd", align: "center" },
          { header: "Utilized", align: "center" },
          { header: "Remaining", align: "center" }
        ],
        rows: computedBalances.map(b => {
          const emp = employees.find(e => e.employeeId === b.employeeId);
          const dept = emp ? departments.find(d => d.id === emp.departmentId) : null;
          return [
            b.employeeId,
            emp?.fullName || b.employeeId,
            dept?.name || "-",
            b.leaveTypeName,
            `${b.openingBalance} d`,
            `${b.annualEntitlement} d`,
            `${b.carriedForwardBalance} d`,
            `${b.leaveUtilized} d`,
            `${b.remainingBalance} d`
          ];
        }),
        totalsRow: [
          "TOTAL",
          `${computedBalances.length} Records`,
          "",
          "",
          "",
          "",
          `${computedBalances.reduce((s, b) => s + b.carriedForwardBalance, 0)} d`,
          `${computedBalances.reduce((s, b) => s + b.leaveUtilized, 0)} d`,
          `${computedBalances.reduce((s, b) => s + b.remainingBalance, 0)} d`
        ]
      };
    }

    if (reportType === "department") {
      return {
        reportTitle: leaveReportTitleMap.department,
        filePrefix: "Leave_Report",
        reportingPeriod: periodLabel,
        departmentOrUnit: deptLabel,
        generatedAt,
        generatedBy: currentUser?.fullName || currentUser?.email,
        orientation: "portrait",
        columns: [
          { header: "Dept Code" },
          { header: "Department Name" },
          { header: "Staff", align: "center" },
          { header: "Leave Records", align: "center" },
          { header: "Active", align: "center" },
          { header: "Completed", align: "center" },
          { header: "Working Days", align: "center" }
        ],
        rows: departmentLeaveSummary.map(d => [
          d.code,
          d.name,
          d.staffCount,
          d.totalRequests,
          d.activeCount,
          d.completedCount,
          `${d.workingDays} d`
        ]),
        totalsRow: [
          "TOTAL",
          `${departmentLeaveSummary.length} Departments`,
          departmentLeaveSummary.reduce((s, d) => s + d.staffCount, 0),
          departmentLeaveSummary.reduce((s, d) => s + d.totalRequests, 0),
          departmentLeaveSummary.reduce((s, d) => s + d.activeCount, 0),
          departmentLeaveSummary.reduce((s, d) => s + d.completedCount, 0),
          `${departmentLeaveSummary.reduce((s, d) => s + d.workingDays, 0)} d`
        ]
      };
    }

    // employee or utilization
    const totalDays = leaves.reduce((s, l) => l.status !== "Cancelled" ? s + l.daysCount : s, 0);
    return {
      reportTitle: leaveReportTitleMap[reportType] || "Leave Management Report",
      filePrefix: "Leave_Report",
      reportingPeriod: periodLabel,
      departmentOrUnit: deptLabel,
      generatedAt,
      generatedBy: currentUser?.fullName || currentUser?.email,
      orientation: "landscape",
      summaryMetrics: [
        { label: "Leave Entries", value: `${leaves.length}` },
        { label: "Working Days Utilized", value: `${totalDays} Days` }
      ],
      columns: [
        { header: "Employee ID" },
        { header: "Employee Name" },
        { header: "Leave Type" },
        { header: "Start Date" },
        { header: "End Date" },
        { header: "Working Days", align: "center" },
        { header: "Status", align: "center" },
        { header: "Reason" }
      ],
      rows: leaves.map(l => {
        const empName = employees.find(e => e.employeeId === l.employeeId)?.fullName || l.employeeId;
        return [
          l.employeeId,
          empName,
          l.leaveType,
          l.startDate,
          l.endDate,
          `${l.daysCount} d`,
          l.status,
          l.reason || "-"
        ];
      }),
      totalsRow: [
        "TOTAL",
        `${leaves.length} Applications`,
        "",
        "",
        "",
        `${totalDays} d`,
        "",
        ""
      ]
    };
  };

  // ==========================================
  // RENDER CONTENT BY SUBMENU TAB
  // ==========================================
  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-amber-50 rounded-lg border border-amber-200 text-amber-600">
              <CalendarDays className="h-5 w-5" />
            </span>
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">Corporate Leave Management System</h1>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-primary-custom text-accent-custom uppercase tracking-wider">
              FY {leaveYearConfig.yearName}
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Ethiopian Reinsurance S.C. integrated leave management, accruals, calendar schedules, carry-forward, and expiration engine.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!canCreate && !canEdit && !canDelete && (
            <span className="bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[10px] uppercase px-2.5 py-1 rounded-full flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
              <span>Read-Only Mode</span>
            </span>
          )}
          {canApprove && canViewSub("config") && (
            <button
              onClick={() => {
                setActiveSubTab("config");
                setYearEndModalOpen(true);
              }}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-2xs"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Year-End Processing</span>
            </button>
          )}
          {canCreate && (
            <button
              onClick={handleOpenAdd}
              className="px-3.5 py-1.5 bg-primary-custom hover:opacity-95 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-2xs"
            >
              <Plus className="h-3.5 w-3.5 text-accent-custom" />
              <span>Book Leave Application</span>
            </button>
          )}
        </div>
      </div>

      {/* Submenu Tab Bar */}
      <div className="bg-white border-b border-slate-200 rounded-xl p-1 shadow-2xs flex items-center gap-1 overflow-x-auto text-xs font-bold">
        {[
          { id: "dashboard", label: "1. Leave Dashboard", icon: LayoutDashboard },
          { id: "applications", label: "2. Leave Applications", icon: FileText },
          { id: "balances", label: "3. Leave Balances", icon: Award },
          { id: "calendar", label: "4. Leave Calendar", icon: Calendar },
          { id: "config", label: "5. Leave Configuration", icon: Settings },
          { id: "reports", label: "6. Leave Reports", icon: FileSpreadsheet }
        ].map(tab => {
          if (!canViewSub(tab.id)) return null;
          const IconComp = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap ${
                isActive
                  ? "bg-primary-custom text-accent-custom shadow-xs font-extrabold"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <IconComp className="h-3.5 w-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================== */}
      {/* SUBMENU 1: LEAVE DASHBOARD */}
      {/* ========================================== */}
      {activeSubTab === "dashboard" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Executive Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Leaves Today</p>
                <p className="text-xl font-extrabold text-slate-800 mt-1">
                  {leaves.filter(l => {
                    const today = new Date().toISOString().split("T")[0];
                    return l.status === "Active" && l.startDate <= today && l.endDate >= today && isRecordInScope(l.employeeId);
                  }).length} Personnel
                </p>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                <UserCheck className="h-5 w-5" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Days Utilized YTD</p>
                <p className="text-xl font-extrabold text-slate-800 mt-1">
                  {leaves.filter(l => l.status !== "Cancelled" && isRecordInScope(l.employeeId)).reduce((s, l) => s + l.daysCount, 0)} Days
                </p>
              </div>
              <div className="p-3 bg-sky-50 text-sky-600 rounded-xl">
                <Clock className="h-5 w-5" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Configured Leave Types</p>
                <p className="text-xl font-extrabold text-slate-800 mt-1">
                  {activeLeaveTypes.length} Active Policies
                </p>
              </div>
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                <Layers className="h-5 w-5" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Carried Forward Balance</p>
                <p className="text-xl font-extrabold text-slate-800 mt-1">
                  {computedBalances.reduce((s, b) => s + b.carriedForwardBalance, 0)} Days
                </p>
              </div>
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                <Award className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Active Personnel Currently on Leave */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-emerald-600" /> Currently Active Leave Roster
                </h3>
                <button
                  onClick={() => setActiveSubTab("applications")}
                  className="text-xs font-bold text-sky-600 hover:underline flex items-center gap-1"
                >
                  View All Applications <ChevronRight className="h-3 w-3" />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase border-b">
                      <th className="p-3">Employee</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">Leave Type</th>
                      <th className="p-3">Date Range</th>
                      <th className="p-3 text-center">Days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leaves.filter(l => l.status === "Active" && isRecordInScope(l.employeeId)).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400 font-medium">
                          No active leave applications on schedule today.
                        </td>
                      </tr>
                    ) : (
                      leaves.filter(l => l.status === "Active" && isRecordInScope(l.employeeId)).slice(0, 5).map(l => {
                        const emp = employees.find(e => e.employeeId === l.employeeId);
                        const dept = emp ? departments.find(d => d.id === emp.departmentId) : null;
                        return (
                          <tr key={l.id} className="hover:bg-slate-50/50">
                            <td className="p-3">
                              <span className="font-bold text-slate-800 block">{emp?.fullName || l.employeeId}</span>
                              <span className="text-[10px] text-primary-custom font-semibold">{l.employeeId}</span>
                            </td>
                            <td className="p-3 font-semibold text-slate-500 uppercase">{dept?.code || "N/A"}</td>
                            <td className="p-3 font-bold text-sky-600 text-[10px] uppercase">{l.leaveType}</td>
                            <td className="p-3 text-slate-600">{l.startDate} to {l.endDate}</td>
                            <td className="p-3 text-center font-bold text-slate-800">{l.daysCount} d</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Leave Distribution Progress */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Layers className="h-4 w-4 text-amber-500" /> Policy Entitlements
              </h3>
              <div className="space-y-3">
                {activeLeaveTypes.map(lt => {
                  const isEmployee = currentUser?.role === "Employee";
                  const used = leaves.filter(l => l.leaveType === lt.name && l.status !== "Cancelled" && isRecordInScope(l.employeeId)).reduce((s, l) => s + l.daysCount, 0);
                  const total = lt.annualEntitlement * (isEmployee ? 1 : Math.max(1, activeEmployees.length));
                  const pct = Math.min(100, Math.round((used / (total || 1)) * 100));
                  return (
                    <div key={lt.id} className="space-y-1">
                      <div className="flex justify-between text-[11px] font-bold">
                        <span className="text-slate-700">{lt.name} ({lt.code})</span>
                        <span className="text-slate-500">{used} Days Utilized</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            pct > 80 ? "bg-rose-500" : pct > 50 ? "bg-amber-500" : "bg-sky-500"
                          }`}
                          style={{ width: `${Math.max(5, pct)}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* SUBMENU 2: LEAVE APPLICATIONS */}
      {/* ========================================== */}
      {activeSubTab === "applications" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Action & Filter Toolbar */}
          <div className="bg-white border rounded-xl p-4 shadow-2xs flex flex-col md:flex-row justify-between items-center gap-3">
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto flex-1">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search Employee ID or Name..."
                  value={appSearchTerm}
                  onChange={(e) => setAppSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 border rounded-lg text-xs ring-primary-custom"
                />
              </div>

              <select
                value={appFilterType}
                onChange={(e) => setAppFilterType(e.target.value)}
                className="px-3 py-1.5 border rounded-lg text-xs bg-white ring-primary-custom font-semibold"
              >
                <option value="">All Leave Types</option>
                {activeLeaveTypes.map(t => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>

              <select
                value={appFilterStatus}
                onChange={(e) => setAppFilterStatus(e.target.value)}
                className="px-3 py-1.5 border rounded-lg text-xs bg-white ring-primary-custom font-semibold"
              >
                <option value="">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              {canCreate && (
                <button
                  onClick={handleOpenAdd}
                  className="px-3.5 py-1.5 bg-primary-custom text-white text-xs font-bold rounded-lg hover:opacity-95 flex items-center gap-1 shadow-2xs transition-all"
                >
                  <Plus className="h-3.5 w-3.5 text-accent-custom" /> Book Leave
                </button>
              )}
            </div>
          </div>

          <div className="bg-white border rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-3">Employee</th>
                    <th className="px-5 py-3">Department</th>
                    <th className="px-5 py-3">Leave Type</th>
                    <th className="px-5 py-3">Date Range</th>
                    <th className="px-5 py-3 text-center">Working Days</th>
                    <th className="px-5 py-3 text-center">Status</th>
                    <th className="px-5 py-3">Reason / Ref</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leaves.filter(l => {
                    if (!isRecordInScope(l.employeeId)) return false;

                    const emp = employees.find(e => e.employeeId === l.employeeId);
                    const matchSearch = (emp?.fullName || l.employeeId).toLowerCase().includes(appSearchTerm.toLowerCase());
                    const matchType = appFilterType ? l.leaveType === appFilterType : true;
                    const matchStatus = appFilterStatus ? l.status === appFilterStatus : true;
                    return matchSearch && matchType && matchStatus;
                  }).length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 font-medium">
                        No leave applications match the current criteria.
                      </td>
                    </tr>
                  ) : (
                    leaves.filter(l => {
                      if (!isRecordInScope(l.employeeId)) return false;

                      const emp = employees.find(e => e.employeeId === l.employeeId);
                      const matchSearch = (emp?.fullName || l.employeeId).toLowerCase().includes(appSearchTerm.toLowerCase());
                      const matchType = appFilterType ? l.leaveType === appFilterType : true;
                      const matchStatus = appFilterStatus ? l.status === appFilterStatus : true;
                      return matchSearch && matchType && matchStatus;
                    }).map(l => {
                      const emp = employees.find(e => e.employeeId === l.employeeId);
                      const dept = emp ? departments.find(d => d.id === emp.departmentId) : null;
                      return (
                        <tr key={l.id} className="hover:bg-slate-50/50">
                          <td className="px-5 py-3">
                            <span className="font-bold text-slate-800 block">{emp?.fullName || l.employeeId}</span>
                            <span className="text-[10px] text-primary-custom font-bold">{l.employeeId}</span>
                          </td>
                          <td className="px-5 py-3 text-slate-500 font-semibold uppercase">{dept?.code || "N/A"}</td>
                          <td className="px-5 py-3 font-bold text-sky-600 text-[10px] uppercase">{l.leaveType}</td>
                          <td className="px-5 py-3 text-slate-600 font-medium">
                            {l.startDate} to {l.endDate}
                            {l.isHalfDay && (
                              <span className="ml-1.5 px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[9px] font-bold">
                                Half-Day ({l.halfDayPeriod})
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-center font-bold text-slate-800">{l.daysCount} d</td>
                          <td className="px-5 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              l.status === "Active" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                              l.status === "Completed" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                              "bg-rose-50 text-rose-700 border border-rose-200"
                            }`}>
                              {l.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-slate-500 max-w-[150px] truncate" title={l.reason}>
                            <div className="flex items-center gap-1.5">
                              <span className="truncate">{l.reason || "-"}</span>
                              {l.supportingDocumentUrl && (
                                <a
                                  href={l.supportingDocumentUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sky-600 hover:text-sky-800 shrink-0"
                                  title="View Supporting Document"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right space-x-1 whitespace-nowrap">
                            {(canEdit || canApprove || canDelete) ? (
                              <>
                                {canEdit && (
                                  <button
                                    onClick={() => handleOpenEdit(l)}
                                    className="p-1 text-slate-400 hover:text-amber-600 hover:bg-slate-100 rounded"
                                    title="Edit Application"
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {(canEdit || canApprove) && l.status !== "Cancelled" && (
                                  <button
                                    onClick={() => handleCancelLeave(l)}
                                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                                    title="Cancel Application"
                                  >
                                    <Ban className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    onClick={() => {
                                      setConfirmState({
                                        isOpen: true,
                                        title: "Delete Leave Record",
                                        message: (
                                          <span>
                                            Permanently delete this <strong>{l.leaveType}</strong> application for employee{" "}
                                            <strong>{l.employeeId}</strong> ({l.startDate} to {l.endDate})?
                                          </span>
                                        ),
                                        confirmText: "Delete Record",
                                        variant: "danger",
                                        onConfirm: () => {
                                          const ok = onDeleteLeave ? onDeleteLeave(l.id) : false;
                                          if (ok) {
                                            toast.showSuccess("Leave record deleted.", "Record Deleted");
                                          }
                                          setConfirmState(null);
                                        }
                                      });
                                    }}
                                    className="p-1 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded"
                                    title="Delete Record"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Read-Only</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* SUBMENU 3: LEAVE BALANCES */}
      {/* ========================================== */}
      {activeSubTab === "balances" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="bg-white border rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row justify-between items-center gap-3">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-500" /> Employee Leave Balance Register ({computedBalances.length} Records)
            </h3>
            <div className="flex items-center gap-2">
              {(canEdit || canApprove) && (
                <button
                  onClick={() => handleOpenAdjustment()}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-bold rounded-lg transition-all flex items-center gap-1 shadow-2xs"
                >
                  <Sliders className="h-3.5 w-3.5" /> Manual Balance Adjustment
                </button>
              )}
            </div>
          </div>

          <div className="bg-white border rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3">Employee ID</th>
                    <th className="px-4 py-3">Employee Name</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Leave Type</th>
                    <th className="px-4 py-3 text-center">Opening</th>
                    <th className="px-4 py-3 text-center">Entitlement</th>
                    <th className="px-4 py-3 text-center">Carried Forward</th>
                    <th className="px-4 py-3 text-center">Utilized</th>
                    <th className="px-4 py-3 text-center">Expired</th>
                    <th className="px-4 py-3 text-center bg-slate-100/70 font-extrabold">Remaining</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {computedBalances.map(bal => {
                    const emp = employees.find(e => e.employeeId === bal.employeeId);
                    const dept = emp ? departments.find(d => d.id === emp.departmentId) : null;
                    return (
                      <tr key={bal.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-bold text-primary-custom">{bal.employeeId}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{emp?.fullName || bal.employeeId}</td>
                        <td className="px-4 py-3 text-slate-500 font-medium uppercase">{dept?.name || "N/A"}</td>
                        <td className="px-4 py-3 font-bold text-sky-600 text-[10px] uppercase">{bal.leaveTypeName}</td>
                        <td className="px-4 py-3 text-center text-slate-600 font-semibold">{bal.openingBalance} d</td>
                        <td className="px-4 py-3 text-center text-slate-600">{bal.annualEntitlement} d</td>
                        <td className="px-4 py-3 text-center text-indigo-600 font-bold">{bal.carriedForwardBalance} d</td>
                        <td className="px-4 py-3 text-center text-rose-600 font-bold">{bal.leaveUtilized} d</td>
                        <td className="px-4 py-3 text-center text-slate-400 font-medium">{bal.expiredLeave} d</td>
                        <td className="px-4 py-3 text-center bg-slate-50 font-extrabold text-sm text-slate-900">
                          {bal.remainingBalance} d
                        </td>
                        <td className="px-4 py-3 text-right">
                          {(canEdit || canApprove) ? (
                            <button
                              onClick={() => handleOpenAdjustment(bal.employeeId, bal.leaveTypeName)}
                              className="p-1 px-2 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 transition-all"
                              title="Adjust Balance"
                            >
                              Adjust
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Read-Only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* SUBMENU 4: LEAVE CALENDAR */}
      {/* ========================================== */}
      {activeSubTab === "calendar" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="bg-white border rounded-xl p-4 shadow-2xs flex flex-col md:flex-row justify-between items-center gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (calMonth === 0) {
                    setCalMonth(11);
                    setCalYear(calYear - 1);
                  } else {
                    setCalMonth(calMonth - 1);
                  }
                }}
                className="p-1.5 border rounded-lg hover:bg-slate-50 font-bold text-xs"
              >
                &larr; Prev
              </button>
              <h2 className="text-sm font-extrabold text-slate-800 tracking-wide">
                {monthName} {calYear} Schedule
              </h2>
              <button
                onClick={() => {
                  if (calMonth === 11) {
                    setCalMonth(0);
                    setCalYear(calYear + 1);
                  } else {
                    setCalMonth(calMonth + 1);
                  }
                }}
                className="p-1.5 border rounded-lg hover:bg-slate-50 font-bold text-xs"
              >
                Next &rarr;
              </button>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={calDeptFilter}
                onChange={(e) => setCalDeptFilter(e.target.value)}
                className="px-3 py-1.5 border rounded-lg text-xs bg-white font-semibold"
              >
                <option value="">All Departments</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Overlapping Collision Banner */}
          {calOverlaps.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>
                <strong>Overlapping Schedule Notice:</strong> Multiple employees in <strong>{calOverlaps[0].deptName}</strong> are scheduled on leave on {calOverlaps[0].date}.
              </span>
            </div>
          )}

          {/* Calendar Grid */}
          <div className="bg-white border rounded-xl p-4 shadow-2xs overflow-x-auto">
            <div className="min-w-[800px]">
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-500 uppercase pb-2 border-b">
                <span>Sun</span>
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
              </div>

              <div className="grid grid-cols-7 gap-1 pt-2">
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                  const dateObj = new Date(calYear, calMonth, dayNum);
                  const dayOfWeek = dateObj.getDay();
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  const holiday = holidays.find(h => h.date === dateStr);

                  // Find active leaves on this day
                  const activeOnDay = leaves.filter(l => {
                    if (l.status === "Cancelled") return false;
                    const emp = employees.find(e => e.employeeId === l.employeeId);
                    if (calDeptFilter && emp?.departmentId !== calDeptFilter) return false;
                    return l.startDate <= dateStr && l.endDate >= dateStr;
                  });

                  return (
                    <div
                      key={dayNum}
                      className={`min-h-[90px] p-1.5 border rounded-lg flex flex-col justify-between text-left transition-all ${
                        isWeekend ? "bg-slate-50/70 border-slate-100" : "bg-white border-slate-200"
                      } ${holiday ? "bg-amber-50/60 border-amber-200" : ""}`}
                    >
                      <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className={holiday ? "text-amber-800 font-extrabold" : "text-slate-700"}>{dayNum}</span>
                        {holiday && (
                          <span className="p-0.5 bg-amber-200 text-amber-900 rounded text-[8px] font-black" title={holiday.name}>
                            Holiday
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 mt-1">
                        {activeOnDay.map(l => {
                          const emp = employees.find(e => e.employeeId === l.employeeId);
                          return (
                            <div
                              key={l.id}
                              className="p-1 bg-sky-50 border border-sky-200 text-sky-900 rounded text-[9px] font-extrabold truncate"
                              title={`${emp?.fullName} - ${l.leaveType}`}
                            >
                              {emp?.fullName?.split(" ")[0]} ({l.leaveType.split(" ")[0]})
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* SUBMENU 5: LEAVE CONFIGURATION */}
      {/* ========================================== */}
      {activeSubTab === "config" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Policy Section 1: Leave Types */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-primary-custom" /> Configured Leave Policies & Entitlements
                </h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Configure accruals, carry-forward caps, paid status, and documentation requirements.
                </p>
              </div>
              {canCreate && (
                <button
                  onClick={() => handleOpenTypeModal()}
                  className="px-3 py-1.5 bg-primary-custom text-white text-xs font-bold rounded-lg hover:opacity-95 flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5 text-accent-custom" /> Create Leave Type
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="p-3">Policy Name</th>
                    <th className="p-3">Code</th>
                    <th className="p-3 text-center">Entitlement</th>
                    <th className="p-3 text-center">Paid Status</th>
                    <th className="p-3 text-center">Carry-Forward Limit</th>
                    <th className="p-3 text-center">Doc Required</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leaveTypesConfig.map(lt => (
                    <tr key={lt.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-slate-800">{lt.name}</td>
                      <td className="p-3 font-bold text-primary-custom">{lt.code}</td>
                      <td className="p-3 text-center font-bold text-slate-800">{lt.annualEntitlement} Days</td>
                      <td className="p-3 text-center font-semibold">
                        {lt.isPaid ? (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 text-[10px]">Paid</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-rose-50 text-rose-700 rounded-full border border-rose-200 text-[10px]">Unpaid</span>
                        )}
                      </td>
                      <td className="p-3 text-center text-slate-600">
                        {lt.carryForwardEligible ? `${lt.maxCarryForwardDays} Days Max` : "No"}
                      </td>
                      <td className="p-3 text-center font-medium">
                        {lt.requiresSupportingDocument ? "Yes (Mandatory)" : "Optional"}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          lt.status === "Active" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500"
                        }`}>
                          {lt.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {canEdit ? (
                          <button
                            onClick={() => handleOpenTypeModal(lt)}
                            className="p-1 text-slate-400 hover:text-amber-600 hover:bg-slate-100 rounded"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Read-Only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Policy Section 2: Leave Year & Working Days */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="h-4 w-4 text-sky-600" /> Leave Year & Working Day Schedule Policy
            </h3>
            <form noValidate onSubmit={handleSaveYearConfig} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              <div className="md:col-span-3">
                <ValidationSummary errors={lyErrors} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Leave Year Name *</label>
                <input
                  type="text"
                  data-field="lyName"
                  value={lyYearName}
                  onChange={(e) => {
                    setLyYearName(e.target.value);
                    clearLyError("lyName");
                  }}
                  readOnly={!canEdit}
                  className={fieldInputClass(!!lyErrors.lyName, "w-full px-3 py-1.5 border rounded-lg text-xs font-bold read-only:bg-slate-50")}
                />
                <FormFieldError error={lyErrors.lyName} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Start Date *</label>
                <input
                  type="date"
                  data-field="lyStart"
                  value={lyStart}
                  onChange={(e) => {
                    setLyStart(e.target.value);
                    clearLyError("lyStart");
                  }}
                  readOnly={!canEdit}
                  className={fieldInputClass(!!lyErrors.lyStart, "w-full px-3 py-1.5 border rounded-lg text-xs font-bold read-only:bg-slate-50")}
                />
                <FormFieldError error={lyErrors.lyStart} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">End Date *</label>
                <input
                  type="date"
                  data-field="lyEnd"
                  value={lyEnd}
                  onChange={(e) => {
                    setLyEnd(e.target.value);
                    clearLyError("lyEnd");
                  }}
                  readOnly={!canEdit}
                  className={fieldInputClass(!!lyErrors.lyEnd, "w-full px-3 py-1.5 border rounded-lg text-xs font-bold read-only:bg-slate-50")}
                />
                <FormFieldError error={lyErrors.lyEnd} />
              </div>

              <div className="md:col-span-3 space-y-1 pt-2" data-field="lyWorkingDays">
                <label className="block text-xs font-bold text-slate-700">Company Working Days *</label>
                <div className="flex flex-wrap gap-2">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => (
                    <label key={day} className="flex items-center gap-1.5 px-3 py-1 border rounded-lg text-xs font-bold bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={lyWorkingDays.includes(day)}
                        disabled={!canEdit}
                        onChange={(e) => {
                          clearLyError("lyWorkingDays");
                          if (e.target.checked) {
                            setLyWorkingDays([...lyWorkingDays, day]);
                          } else {
                            setLyWorkingDays(lyWorkingDays.filter(d => d !== day));
                          }
                        }}
                      />
                      <span>{day}</span>
                    </label>
                  ))}
                </div>
                <FormFieldError error={lyErrors.lyWorkingDays} />
              </div>

              <div className="md:col-span-3 flex justify-end">
                {canEdit ? (
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary-custom text-white font-bold text-xs rounded-lg hover:opacity-95 flex items-center gap-1"
                  >
                    <Save className="h-4 w-4 text-accent-custom" /> Save Schedule Policy
                  </button>
                ) : (
                  <div className="w-full flex items-center gap-2 text-xs font-semibold text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600" />
                    <span>Read-Only Mode: Schedule rules and working days are locked.</span>
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* SUBMENU 6: LEAVE REPORTS */}
      {/* ========================================== */}
      {activeSubTab === "reports" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="bg-white border rounded-xl p-4 shadow-2xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 no-print">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-sky-50 text-sky-600 rounded-lg">
                <FileSpreadsheet className="h-4 w-4" />
              </span>
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Leave Reports &amp; Compliance</h3>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as any)}
                className="px-3 py-1.5 border rounded-lg text-xs bg-white font-bold text-slate-800"
              >
                <option value="yearend">Year-End Carry-Forward Report</option>
                <option value="balance">Employee Leave Balance Report</option>
                <option value="employee">Employee Leave Report</option>
                <option value="department">Department Leave Report</option>
                <option value="utilization">Annual Leave Utilization Report</option>
                <option value="expiration">Leave Expiration Report</option>
              </select>

              {canExport && (
                <>
                  <ReportPrintButton
                    printData={buildLeaveReportPayload}
                    companyConfig={companyConfig}
                    id="btn-print-leave-report"
                  />
                  <ReportPDFExportButton
                    reportData={buildLeaveReportPayload}
                    companyConfig={companyConfig}
                    id="btn-pdf-leave-report"
                  />
                  <button
                    type="button"
                    onClick={handleExportReportCSV}
                    className="px-3 py-1.5 bg-emerald-600 text-white font-bold text-xs rounded-lg hover:bg-emerald-700 flex items-center gap-1.5 shadow-2xs"
                  >
                    <Download className="h-3.5 w-3.5" /> Export Excel
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Branded Report Preview Canvas */}
          <div className="bg-white border rounded-xl p-6 sm:p-8 shadow-2xs printable-canvas">
            <CompanyReportHeader
              companyConfig={companyConfig}
              reportTitle={leaveReportTitleMap[reportType] || "Leave Management Report"}
              reportingPeriod={`${leaveYearConfig.yearName} (${leaveYearConfig.startDate} to ${leaveYearConfig.endDate})`}
              departmentOrUnit={departments.find(d => d.id === reportDeptFilter)?.name || "All Departments"}
              generatedBy={currentUser?.fullName || currentUser?.email}
            />

            <div className="overflow-x-auto">
              {(reportType === "yearend" || reportType === "expiration") && (
                <table className="w-full text-left text-xs border-collapse border">
                  <thead>
                    <tr className="bg-slate-50 border-b text-[10px] font-bold text-slate-500 uppercase">
                      <th className="p-3 border-r">Employee ID</th>
                      <th className="p-3 border-r">Employee Name</th>
                      <th className="p-3 border-r">Department</th>
                      <th className="p-3 border-r">Leave Type</th>
                      <th className="p-3 border-r text-center">Prev Opening</th>
                      <th className="p-3 border-r text-center">Entitlement</th>
                      <th className="p-3 border-r text-center">Utilized</th>
                      <th className="p-3 border-r text-center">Unused Balance</th>
                      <th className="p-3 border-r text-center font-bold text-indigo-600">Eligible Carry-Forward</th>
                      <th className="p-3 border-r text-center text-rose-600">Expired Balance</th>
                      <th className="p-3 text-center bg-slate-100 font-extrabold">New Year Opening</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {yearEndPreview.detailsList.map((d, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-3 border-r font-bold text-primary-custom">{d.employeeId}</td>
                        <td className="p-3 border-r font-semibold text-slate-800">{d.employeeName}</td>
                        <td className="p-3 border-r text-slate-500">{d.departmentName}</td>
                        <td className="p-3 border-r font-bold text-sky-600 text-[10px] uppercase">{d.leaveType}</td>
                        <td className="p-3 border-r text-center">{d.prevOpening} d</td>
                        <td className="p-3 border-r text-center">{d.entitlement} d</td>
                        <td className="p-3 border-r text-center text-rose-600 font-bold">{d.utilized} d</td>
                        <td className="p-3 border-r text-center font-bold text-slate-700">{d.unused} d</td>
                        <td className="p-3 border-r text-center font-extrabold text-indigo-600">{d.eligibleCarryForward} d</td>
                        <td className="p-3 border-r text-center font-bold text-slate-400">{d.expired} d</td>
                        <td className="p-3 text-center font-extrabold bg-slate-50 text-slate-900">{d.newOpening} d</td>
                      </tr>
                    ))}
                  </tbody>
                  {yearEndPreview.detailsList.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 border-slate-300 font-extrabold text-slate-900">
                        <td className="p-3 border-r" colSpan={6}>TOTAL ({yearEndPreview.detailsList.length} Records)</td>
                        <td className="p-3 border-r text-center">{yearEndPreview.detailsList.reduce((s, r) => s + r.utilized, 0)} d</td>
                        <td className="p-3 border-r text-center">{yearEndPreview.detailsList.reduce((s, r) => s + r.unused, 0)} d</td>
                        <td className="p-3 border-r text-center text-indigo-700">{yearEndPreview.totalCarried} d</td>
                        <td className="p-3 border-r text-center text-rose-700">{yearEndPreview.totalExpired} d</td>
                        <td className="p-3 text-center"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              {reportType === "balance" && (
                <table className="w-full text-left text-xs border-collapse border">
                  <thead>
                    <tr className="bg-slate-50 border-b text-[10px] font-bold text-slate-500 uppercase">
                      <th className="p-3 border-r">Employee ID</th>
                      <th className="p-3 border-r">Employee Name</th>
                      <th className="p-3 border-r">Department</th>
                      <th className="p-3 border-r">Leave Type</th>
                      <th className="p-3 border-r text-center">Opening</th>
                      <th className="p-3 border-r text-center">Entitlement</th>
                      <th className="p-3 border-r text-center">Carried Fwd</th>
                      <th className="p-3 border-r text-center">Utilized</th>
                      <th className="p-3 text-center font-extrabold">Remaining</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {computedBalances.map((b, idx) => {
                      const emp = employees.find(e => e.employeeId === b.employeeId);
                      const dept = emp ? departments.find(d => d.id === emp.departmentId) : null;
                      return (
                        <tr key={`${b.employeeId}-${b.leaveTypeName}-${idx}`} className="hover:bg-slate-50">
                          <td className="p-3 border-r font-bold text-primary-custom">{b.employeeId}</td>
                          <td className="p-3 border-r font-semibold text-slate-800">{emp?.fullName || b.employeeId}</td>
                          <td className="p-3 border-r text-slate-500">{dept?.name || "-"}</td>
                          <td className="p-3 border-r font-bold text-sky-600 text-[10px] uppercase">{b.leaveTypeName}</td>
                          <td className="p-3 border-r text-center">{b.openingBalance} d</td>
                          <td className="p-3 border-r text-center">{b.annualEntitlement} d</td>
                          <td className="p-3 border-r text-center text-indigo-600 font-bold">{b.carriedForwardBalance} d</td>
                          <td className="p-3 border-r text-center text-rose-600 font-bold">{b.leaveUtilized} d</td>
                          <td className="p-3 text-center font-extrabold text-emerald-700">{b.remainingBalance} d</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {reportType === "department" && (
                <table className="w-full text-left text-xs border-collapse border">
                  <thead>
                    <tr className="bg-slate-50 border-b text-[10px] font-bold text-slate-500 uppercase">
                      <th className="p-3 border-r">Dept Code</th>
                      <th className="p-3 border-r">Department Name</th>
                      <th className="p-3 border-r text-center">Staff</th>
                      <th className="p-3 border-r text-center">Leave Records</th>
                      <th className="p-3 border-r text-center">Active</th>
                      <th className="p-3 border-r text-center">Completed</th>
                      <th className="p-3 text-center font-extrabold">Working Days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {departmentLeaveSummary.map(d => (
                      <tr key={d.code} className="hover:bg-slate-50">
                        <td className="p-3 border-r font-bold text-primary-custom">{d.code}</td>
                        <td className="p-3 border-r font-semibold text-slate-800">{d.name}</td>
                        <td className="p-3 border-r text-center">{d.staffCount}</td>
                        <td className="p-3 border-r text-center font-bold">{d.totalRequests}</td>
                        <td className="p-3 border-r text-center text-emerald-700 font-bold">{d.activeCount}</td>
                        <td className="p-3 border-r text-center text-blue-700 font-bold">{d.completedCount}</td>
                        <td className="p-3 text-center font-extrabold">{d.workingDays} d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {(reportType === "employee" || reportType === "utilization") && (
                <table className="w-full text-left text-xs border-collapse border">
                  <thead>
                    <tr className="bg-slate-50 border-b text-[10px] font-bold text-slate-500 uppercase">
                      <th className="p-3 border-r">Employee ID</th>
                      <th className="p-3 border-r">Employee Name</th>
                      <th className="p-3 border-r">Leave Type</th>
                      <th className="p-3 border-r">Start Date</th>
                      <th className="p-3 border-r">End Date</th>
                      <th className="p-3 border-r text-center">Working Days</th>
                      <th className="p-3 border-r text-center">Status</th>
                      <th className="p-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leaves.map(l => {
                      const empName = employees.find(e => e.employeeId === l.employeeId)?.fullName || l.employeeId;
                      return (
                        <tr key={l.id} className="hover:bg-slate-50">
                          <td className="p-3 border-r font-bold text-primary-custom">{l.employeeId}</td>
                          <td className="p-3 border-r font-semibold text-slate-800">{empName}</td>
                          <td className="p-3 border-r font-bold text-sky-600 text-[10px] uppercase">{l.leaveType}</td>
                          <td className="p-3 border-r text-slate-600">{l.startDate}</td>
                          <td className="p-3 border-r text-slate-600">{l.endDate}</td>
                          <td className="p-3 border-r text-center font-bold text-slate-800">{l.daysCount} d</td>
                          <td className="p-3 border-r text-center">
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-bold text-[10px]">
                              {l.status}
                            </span>
                          </td>
                          <td className="p-3 text-slate-500">{l.reason || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {leaves.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 border-slate-300 font-extrabold text-slate-900">
                        <td className="p-3 border-r" colSpan={5}>TOTAL ({leaves.length} Applications)</td>
                        <td className="p-3 border-r text-center">
                          {leaves.reduce((s, l) => l.status !== "Cancelled" ? s + l.daysCount : s, 0)} d
                        </td>
                        <td className="p-3" colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: MANUAL BALANCE ADJUSTMENT */}
      {/* ========================================== */}
      {adjModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-primary-custom text-white px-5 py-3.5 border-b flex justify-between items-center">
              <h3 className="font-extrabold text-xs uppercase tracking-wider">Manual Balance Adjustment</h3>
              <button onClick={() => setAdjModalOpen(false)} className="text-white/80 hover:text-white rounded-full p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form noValidate onSubmit={handleSaveAdjustment} className="p-5 space-y-4">
              <ValidationSummary errors={adjErrors} />

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Select Employee *</label>
                <select
                  data-field="adjEmployeeId"
                  value={adjEmpId}
                  onChange={(e) => {
                    setAdjEmpId(e.target.value);
                    clearAdjError("adjEmployeeId");
                  }}
                  className={fieldInputClass(!!adjErrors.adjEmployeeId, "w-full px-3 py-2 border rounded-lg text-xs font-bold bg-white")}
                >
                  <option value="">-- Select Employee --</option>
                  {activeEmployees.map(e => (
                    <option key={e.employeeId} value={e.employeeId}>{e.fullName} ({e.employeeId})</option>
                  ))}
                </select>
                <FormFieldError error={adjErrors.adjEmployeeId} />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Leave Type *</label>
                <select
                  data-field="adjLeaveTypeId"
                  value={adjLeaveType}
                  onChange={(e) => {
                    setAdjLeaveType(e.target.value);
                    clearAdjError("adjLeaveTypeId");
                  }}
                  className={fieldInputClass(!!adjErrors.adjLeaveTypeId, "w-full px-3 py-2 border rounded-lg text-xs font-bold bg-white")}
                >
                  {activeLeaveTypes.map(t => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
                <FormFieldError error={adjErrors.adjLeaveTypeId} />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Adjustment Days (+ or -) *</label>
                <input
                  type="number"
                  step="0.5"
                  data-field="adjAmount"
                  value={adjAmount}
                  onChange={(e) => {
                    setAdjAmount(e.target.value);
                    clearAdjError("adjAmount");
                  }}
                  className={fieldInputClass(!!adjErrors.adjAmount, "w-full px-3 py-2 border rounded-lg text-xs font-bold")}
                />
                <FormFieldError error={adjErrors.adjAmount} />
                <span className="text-[10px] text-slate-400 block font-medium">Use positive numbers to add days, or negative numbers to deduct.</span>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Mandatory Justification / Reason *</label>
                <textarea
                  rows={2}
                  data-field="adjReason"
                  value={adjReason}
                  onChange={(e) => {
                    setAdjReason(e.target.value);
                    clearAdjError("adjReason");
                  }}
                  placeholder="Mandatory reason for balance adjustment..."
                  className={fieldInputClass(!!adjErrors.adjReason, "w-full px-3 py-2 border rounded-lg text-xs")}
                />
                <FormFieldError error={adjErrors.adjReason} />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setAdjModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-extrabold text-white bg-primary-custom hover:opacity-95 rounded-lg flex items-center gap-1"
                >
                  <Save className="h-4 w-4 text-accent-custom" /> Apply Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: YEAR END CARRY FORWARD ENGINE */}
      {/* ========================================== */}
      {yearEndModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-primary-custom text-white px-5 py-3.5 border-b flex justify-between items-center">
              <h3 className="font-extrabold text-xs uppercase tracking-wider flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-amber-400" /> Automated Year-End Carry-Forward Engine
              </h3>
              <button onClick={() => setYearEndModalOpen(false)} className="text-white/80 hover:text-white rounded-full p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Previous Leave Year</label>
                  <input
                    type="text"
                    value={yeFromYear}
                    onChange={(e) => setYeFromYear(e.target.value)}
                    className="w-full px-3 py-1.5 border rounded-lg text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">New Leave Year</label>
                  <input
                    type="text"
                    value={yeToYear}
                    onChange={(e) => setYeToYear(e.target.value)}
                    className="w-full px-3 py-1.5 border rounded-lg text-xs font-bold"
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-xs space-y-1">
                <p className="font-extrabold flex items-center gap-1">
                  <Info className="h-4 w-4 text-amber-600 shrink-0" />
                  Calculation Formula:
                </p>
                <p className="font-mono text-[11px]">
                  New Available Balance = Annual Entitlement + Eligible Carried-Forward Balance - Utilized
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                  Transition Preview Summary ({yearEndPreview.detailsList.length} Accounts)
                </h4>
                <div className="bg-slate-50 border rounded-lg p-3 grid grid-cols-3 text-center text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Employees</span>
                    <span className="font-extrabold text-slate-800">{activeEmployees.length} Active</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Carried Forward</span>
                    <span className="font-extrabold text-indigo-600">{yearEndPreview.totalCarried} Days</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Expired</span>
                    <span className="font-extrabold text-rose-600">{yearEndPreview.totalExpired} Days</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setYearEndModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteYearEnd}
                  className="px-4 py-1.5 text-xs font-extrabold text-slate-900 bg-amber-500 hover:bg-amber-600 rounded-lg flex items-center gap-1 shadow-2xs"
                >
                  <CheckCircle2 className="h-4 w-4" /> Execute Year-End Transition
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: LEAVE TYPE CONFIGURATION */}
      {/* ========================================== */}
      {typeModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-primary-custom text-white px-5 py-3.5 border-b flex justify-between items-center">
              <h3 className="font-extrabold text-xs uppercase tracking-wider">
                {editingType ? "Edit Leave Policy" : "Create New Leave Policy"}
              </h3>
              <button onClick={() => setTypeModalOpen(false)} className="text-white/80 hover:text-white rounded-full p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form noValidate onSubmit={handleSaveTypeConfig} className="p-5 space-y-4">
              <ValidationSummary errors={ltErrors} />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Policy Name *</label>
                  <input
                    type="text"
                    data-field="ltName"
                    value={ltName}
                    onChange={(e) => {
                      setLtName(e.target.value);
                      clearLtError("ltName");
                    }}
                    className={fieldInputClass(!!ltErrors.ltName, "w-full px-3 py-1.5 border rounded-lg text-xs font-bold")}
                  />
                  <FormFieldError error={ltErrors.ltName} />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Code *</label>
                  <input
                    type="text"
                    data-field="ltCode"
                    value={ltCode}
                    onChange={(e) => {
                      setLtCode(e.target.value);
                      clearLtError("ltCode");
                    }}
                    className={fieldInputClass(!!ltErrors.ltCode, "w-full px-3 py-1.5 border rounded-lg text-xs font-bold uppercase")}
                  />
                  <FormFieldError error={ltErrors.ltCode} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Annual Entitlement (Days) *</label>
                  <input
                    type="number"
                    data-field="ltEntitlement"
                    value={ltEntitlement}
                    onChange={(e) => {
                      setLtEntitlement(Number(e.target.value));
                      clearLtError("ltEntitlement");
                    }}
                    className={fieldInputClass(!!ltErrors.ltEntitlement, "w-full px-3 py-1.5 border rounded-lg text-xs font-bold")}
                  />
                  <FormFieldError error={ltErrors.ltEntitlement} />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Paid Status</label>
                  <select
                    value={ltPaid ? "Paid" : "Unpaid"}
                    onChange={(e) => setLtPaid(e.target.value === "Paid")}
                    className="w-full px-3 py-1.5 border rounded-lg text-xs font-bold bg-white"
                  >
                    <option value="Paid">Fully Paid Leave</option>
                    <option value="Unpaid">Unpaid Leave</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Accrual Policy</label>
                  <select
                    value={ltAccrual}
                    onChange={(e) => setLtAccrual(e.target.value as any)}
                    className="w-full px-3 py-1.5 border rounded-lg text-xs font-bold bg-white"
                  >
                    <option value="Annual">Annual Upfront</option>
                    <option value="Monthly">Monthly Pro-Rata</option>
                    <option value="Immediate">Immediate Grant</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Carry Forward Eligibility</label>
                  <select
                    value={ltCarryEligible ? "Yes" : "No"}
                    onChange={(e) => setLtCarryEligible(e.target.value === "Yes")}
                    className="w-full px-3 py-1.5 border rounded-lg text-xs font-bold bg-white"
                  >
                    <option value="Yes">Eligible for Carry-Forward</option>
                    <option value="No">Not Eligible (Use-it-or-lose-it)</option>
                  </select>
                </div>
              </div>

              {ltCarryEligible && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700">Max Carry Forward Days</label>
                    <input
                      type="number"
                      data-field="ltMaxCarry"
                      value={ltMaxCarry}
                      onChange={(e) => {
                        setLtMaxCarry(Number(e.target.value));
                        clearLtError("ltMaxCarry");
                      }}
                      className={fieldInputClass(!!ltErrors.ltMaxCarry, "w-full px-3 py-1.5 border rounded-lg text-xs font-bold")}
                    />
                    <FormFieldError error={ltErrors.ltMaxCarry} />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700">Expiration Period (Months)</label>
                    <select
                      data-field="ltExpireMonths"
                      value={ltExpMonths}
                      onChange={(e) => {
                        setLtExpMonths(Number(e.target.value));
                        clearLtError("ltExpireMonths");
                      }}
                      className={fieldInputClass(!!ltErrors.ltExpireMonths, "w-full px-3 py-1.5 border rounded-lg text-xs font-bold bg-white")}
                    >
                      <option value={6}>6 Months</option>
                      <option value={12}>12 Months (1 Year)</option>
                      <option value={24}>24 Months (2 Years)</option>
                      <option value={0}>Never Expire</option>
                    </select>
                    <FormFieldError error={ltErrors.ltExpireMonths} />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={ltRequiresDoc}
                    onChange={(e) => setLtRequiresDoc(e.target.checked)}
                  />
                  <span>Requires Supporting Document</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setTypeModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-extrabold text-white bg-primary-custom hover:opacity-95 rounded-lg flex items-center gap-1"
                >
                  <Save className="h-4 w-4 text-accent-custom" /> Save Policy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: ADD / EDIT LEAVE APPLICATION */}
      {/* ========================================== */}
      {(addModalOpen || editModalOpen) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-primary-custom text-white px-5 py-3.5 border-b flex justify-between items-center">
              <h3 className="font-extrabold text-xs uppercase tracking-wider">
                {editModalOpen ? "Edit Leave Application" : "Book Leave Application"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setAddModalOpen(false);
                  setEditModalOpen(false);
                }}
                className="text-white/80 hover:text-white rounded-full p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form noValidate onSubmit={editModalOpen ? handleEditSubmit : handleAddSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <ValidationSummary errors={fieldErrors} message={formError} />
              {formSuccess && (
                <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold">
                  {formSuccess}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Employee *</label>
                  <select
                    data-field="employeeId"
                    value={empIdInput}
                    onChange={(e) => {
                      setEmpIdInput(e.target.value);
                      clearFieldError("employeeId");
                    }}
                    disabled={editModalOpen}
                    className={fieldInputClass(!!fieldErrors.employeeId, "w-full px-3 py-1.5 border rounded-lg text-xs font-bold bg-white disabled:bg-slate-50")}
                  >
                    <option value="">-- Select Employee --</option>
                    {activeEmployees.map(emp => (
                      <option key={emp.employeeId} value={emp.employeeId}>
                        {emp.fullName} ({emp.employeeId})
                      </option>
                    ))}
                  </select>
                  <FormFieldError error={fieldErrors.employeeId} />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Leave Type *</label>
                  <select
                    data-field="leaveType"
                    value={leaveType}
                    onChange={(e) => {
                      setLeaveType(e.target.value);
                      clearFieldError("leaveType");
                      clearFieldError("daysCount");
                      clearFieldError("supportingDocumentUrl");
                    }}
                    className={fieldInputClass(!!fieldErrors.leaveType, "w-full px-3 py-1.5 border rounded-lg text-xs font-bold bg-white")}
                  >
                    <option value="">-- Select Leave Type --</option>
                    {activeLeaveTypes.map(lt => (
                      <option key={lt.id} value={lt.name}>{lt.name}</option>
                    ))}
                  </select>
                  <FormFieldError error={fieldErrors.leaveType} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Start Date *</label>
                  <input
                    type="date"
                    data-field="startDate"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      clearFieldError("startDate");
                      clearFieldError("endDate");
                      clearFieldError("daysCount");
                    }}
                    className={fieldInputClass(!!fieldErrors.startDate, "w-full px-3 py-1.5 border rounded-lg text-xs font-bold")}
                  />
                  <FormFieldError error={fieldErrors.startDate} />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">End Date *</label>
                  <input
                    type="date"
                    data-field="endDate"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      clearFieldError("endDate");
                      clearFieldError("startDate");
                      clearFieldError("daysCount");
                    }}
                    className={fieldInputClass(!!fieldErrors.endDate, "w-full px-3 py-1.5 border rounded-lg text-xs font-bold")}
                  />
                  <FormFieldError error={fieldErrors.endDate} />
                </div>
              </div>

              <div
                data-field="daysCount"
                className={`flex flex-wrap items-center justify-between gap-3 border rounded-lg p-3 text-xs ${
                  fieldErrors.daysCount ? "bg-rose-50/50 border-rose-400" : "bg-slate-50"
                }`}
              >
                <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isHalfDay}
                    onChange={(e) => {
                      setIsHalfDay(e.target.checked);
                      clearFieldError("daysCount");
                    }}
                  />
                  <span>Half-Day Leave</span>
                </label>
                {isHalfDay && (
                  <select
                    value={halfDayPeriod}
                    onChange={(e) => setHalfDayPeriod(e.target.value as "Morning" | "Afternoon")}
                    className="px-2 py-1 border rounded text-xs font-bold bg-white"
                  >
                    <option value="Morning">Morning</option>
                    <option value="Afternoon">Afternoon</option>
                  </select>
                )}
                <div className="ml-auto text-right">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Working Days / Remaining</span>
                  <span className="font-extrabold text-primary-custom">
                    {computedWorkingDays} d / {currentSelectedBalance.remaining} d
                  </span>
                </div>
              </div>
              <FormFieldError error={fieldErrors.daysCount} />

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Reason *</label>
                <textarea
                  rows={2}
                  data-field="reason"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    clearFieldError("reason");
                  }}
                  placeholder="Enter reason for leave request..."
                  className={fieldInputClass(!!fieldErrors.reason, "w-full px-3 py-1.5 border rounded-lg text-xs")}
                />
                <FormFieldError error={fieldErrors.reason} />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Supporting Document (Upload or URL)</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    data-field="supportingDocumentUrl"
                    value={docUrl}
                    onChange={(e) => {
                      setDocUrl(e.target.value);
                      clearFieldError("supportingDocumentUrl");
                    }}
                    placeholder="https://... or upload supporting file to Firebase Storage"
                    className={fieldInputClass(!!fieldErrors.supportingDocumentUrl, "flex-1 px-3 py-1.5 border rounded-lg text-xs")}
                  />
                  <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0">
                    {docUploading ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary-custom" />
                    ) : (
                      <Upload className="h-3.5 w-3.5 text-primary-custom" />
                    )}
                    <span>{docUploading ? "Uploading..." : "Upload File"}</span>
                    <input
                      type="file"
                      accept="image/*,.pdf,.doc,.docx"
                      onChange={handleLeaveDocUpload}
                      disabled={docUploading}
                      className="hidden"
                    />
                  </label>
                </div>
                <FormFieldError error={fieldErrors.supportingDocumentUrl} />
                {docUploadStatus && (
                  <p className="text-[11px] font-semibold text-emerald-700">{docUploadStatus}</p>
                )}
              </div>

              {editModalOpen && (canEdit || canApprove) && (
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Status</label>
                  <select
                    value={leaveStatus}
                    onChange={(e) => setLeaveStatus(e.target.value)}
                    className="w-full px-3 py-1.5 border rounded-lg text-xs font-bold bg-white"
                  >
                    <option value="Active">Active</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              )}

              {computedWorkingDays > currentSelectedBalance.remaining && canApprove && (
                <label className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-amber-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adminBypass}
                    onChange={(e) => {
                      setAdminBypass(e.target.checked);
                      clearFieldError("daysCount");
                    }}
                  />
                  <span>Admin Override: Allow leave exceeding available balance</span>
                </label>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setAddModalOpen(false);
                    setEditModalOpen(false);
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || docUploading}
                  className="px-3.5 py-1.5 text-xs font-extrabold text-white bg-primary-custom hover:opacity-95 rounded-lg flex items-center gap-1 disabled:opacity-50"
                >
                  <Save className="h-4 w-4 text-accent-custom" />
                  <span>{isSubmitting ? "Saving..." : editModalOpen ? "Update Leave" : "Submit Leave"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmState && (
        <ConfirmDialog
          isOpen={confirmState.isOpen}
          title={confirmState.title}
          message={confirmState.message}
          confirmText={confirmState.confirmText}
          variant={confirmState.variant}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}
