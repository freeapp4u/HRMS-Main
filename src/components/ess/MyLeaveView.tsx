import React, { useState, useMemo, useEffect } from "react";
import {
  User,
  Employee,
  LeaveRecord,
  PublicHoliday,
  CompanyConfig,
  ModulePermission,
} from "../../types";
import { CalendarDays, PlusCircle, History, Wallet, ListChecks, CheckCircle2, XCircle, Lock, AlertCircle } from "lucide-react";
import { resolveOwnEmployeeRecord, UNAUTHORIZED_EMPLOYEE_RECORD_MSG } from "../../utils/rbacUtils";
import { calculateWorkingDaysCount, calculateEmployeeLeaveBalance } from "../../utils/leaveUtils";
import { validateLeaveApplicationForm, focusFirstInvalidField } from "../../utils/validation";
import { FormFieldError, ValidationSummary, fieldInputClass } from "../ui/FormFeedback";
import { useToast, ConfirmDialog } from "../ui/ToastProvider";

interface MyLeaveViewProps {
  currentUser: User | null;
  employees: Employee[];
  leaves: LeaveRecord[];
  holidays: PublicHoliday[];
  companyConfig: CompanyConfig;
  permissions?: ModulePermission;
  initialSubTab?: string;
  requestedEmployeeId?: string | null;
  onUpdateLeaves: (leaves: LeaveRecord[], syncItem?: LeaveRecord) => void;
  onLogAction: (module: string, action: string, record: string, details: string) => void;
}

const SUBTABS = [
  { id: "apply", label: "Apply for Leave", icon: PlusCircle },
  { id: "history", label: "My Leave History", icon: History },
  { id: "balances", label: "My Leave Balance", icon: Wallet },
  { id: "requests", label: "My Leave Requests", icon: ListChecks },
  { id: "status", label: "Leave Approval Status", icon: CheckCircle2 },
];

export default function MyLeaveView({
  currentUser,
  employees,
  leaves,
  holidays,
  companyConfig,
  permissions,
  initialSubTab,
  requestedEmployeeId,
  onUpdateLeaves,
  onLogAction,
}: MyLeaveViewProps) {
  const { showSuccess, showError } = useToast();
  const canCreate = permissions ? permissions.actions.create : true;
  const canCancel = permissions ? permissions.actions.edit : true;

  const myEmployee = useMemo(
    () => resolveOwnEmployeeRecord(currentUser, employees),
    [currentUser, employees]
  );

  const isUnauthorizedTarget = Boolean(
    requestedEmployeeId && (!myEmployee || requestedEmployeeId !== myEmployee.employeeId)
  );

  const visibleTabs = SUBTABS.filter((t) => !permissions || permissions.submenus[t.id] !== false);
  const [activeSubTab, setActiveSubTab] = useState<string>(() => {
    if (initialSubTab && visibleTabs.some((t) => t.id === initialSubTab)) return initialSubTab;
    return visibleTabs[0]?.id || "apply";
  });

  useEffect(() => {
    if (initialSubTab && visibleTabs.some((t) => t.id === initialSubTab)) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const leaveTypesConfig = useMemo(() => {
    if (companyConfig.leaveTypesConfig && companyConfig.leaveTypesConfig.length > 0) {
      return companyConfig.leaveTypesConfig.filter((t) => t.status === "Active");
    }
    return Object.entries(companyConfig.leaveAllocations || { Annual: 20, Sick: 12 }).map(([name, val], idx) => ({
      id: `LT_${idx}`,
      name,
      code: name.substring(0, 3).toUpperCase(),
      description: `${name} Leave`,
      annualEntitlement: val,
      isPaid: true,
      accrualRule: "Annual" as const,
      carryForwardEligible: name === "Annual",
      maxCarryForwardDays: name === "Annual" ? 10 : 0,
      expirationPeriodMonths: 0,
      requiresSupportingDocument: false,
      status: "Active" as const,
    }));
  }, [companyConfig]);

  const leaveYear = companyConfig.leaveYearConfig?.yearName || String(new Date().getFullYear());
  const workingDays = companyConfig.leaveYearConfig?.workingDays || ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const holidayDates = useMemo(() => holidays.map((h) => h.date), [holidays]);

  const [leaveType, setLeaveType] = useState(leaveTypesConfig[0]?.name || "Annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [supportingDocUrl, setSupportingDocUrl] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmCancelLeave, setConfirmCancelLeave] = useState<LeaveRecord | null>(null);

  const myLeaves = useMemo(() => {
    if (!myEmployee) return [];
    return leaves
      .filter((l) => !l.isDeleted && l.employeeId === myEmployee.employeeId)
      .sort((a, b) => (b.createdDate || b.startDate).localeCompare(a.createdDate || a.startDate));
  }, [leaves, myEmployee]);

  const myBalances = useMemo(() => {
    if (!myEmployee) return [];
    return leaveTypesConfig.map((lt) =>
      calculateEmployeeLeaveBalance(myEmployee.employeeId, lt, leaveYear, myLeaves)
    );
  }, [leaveTypesConfig, myEmployee, leaveYear, myLeaves]);

  const selectedTypeConfig = leaveTypesConfig.find((t) => t.name === leaveType);
  const selectedBalance = myBalances.find((b) => b.leaveTypeName === leaveType);

  const daysCount = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return calculateWorkingDaysCount(startDate, endDate, holidayDates, workingDays, isHalfDay);
  }, [startDate, endDate, holidayDates, workingDays, isHalfDay]);

  if (isUnauthorizedTarget) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 flex items-start gap-3 text-rose-800">
        <Lock className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
        <div>
          <h2 className="text-sm font-black">Access Restricted</h2>
          <p className="text-xs font-semibold mt-1">{UNAUTHORIZED_EMPLOYEE_RECORD_MSG}</p>
        </div>
      </div>
    );
  }

  if (!myEmployee) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
        <AlertCircle className="h-8 w-8 text-amber-500 mx-auto" />
        <h2 className="text-sm font-bold text-slate-800">Leave Self-Service Unavailable</h2>
        <p className="text-xs text-slate-500">Your account is not linked to an active Employee Master record.</p>
      </div>
    );
  }

  const handleApplyLeave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canCreate) {
      showError("Leave creation is currently restricted for your account.");
      return;
    }

    const validation = validateLeaveApplicationForm({
      employeeId: myEmployee.employeeId,
      leaveType,
      startDate,
      endDate,
      daysCount,
      reason,
      supportingDocumentUrl: supportingDocUrl,
      leaveTypeConfig: selectedTypeConfig,
      remainingBalance: selectedBalance?.remainingBalance,
      existingLeaves: myLeaves,
      mode: "add",
    });

    if (!validation.valid) {
      setErrors(validation.errors);
      focusFirstInvalidField(validation.errors, e.currentTarget);
      return;
    }

    setErrors({});
    const now = new Date().toISOString().replace("T", " ").substring(0, 19);
    const newLeave: LeaveRecord = {
      id: `LV_${Date.now()}`,
      employeeId: myEmployee.employeeId,
      leaveType,
      startDate,
      endDate,
      daysCount,
      isHalfDay,
      reason: reason.trim(),
      status: "Active",
      remarks: "Submitted via Employee Self-Service",
      supportingDocumentUrl: supportingDocUrl.trim() || undefined,
      recordedBy: currentUser?.email || myEmployee.email,
      createdDate: now,
      updatedDate: now,
      ...( { employeeEmail: currentUser?.email || myEmployee.email, ownerUid: currentUser?.id } as any ),
    };

    onUpdateLeaves([newLeave, ...leaves], newLeave);
    onLogAction("Leave", "ESS Leave Submitted", myEmployee.employeeId, `Submitted ${leaveType} (${daysCount} days: ${startDate} to ${endDate})`);
    showSuccess(`Leave request submitted (${daysCount} working day(s)).`);
    setStartDate("");
    setEndDate("");
    setIsHalfDay(false);
    setReason("");
    setSupportingDocUrl("");
    setActiveSubTab("requests");
  };

  const executeCancelLeave = () => {
    if (!confirmCancelLeave || !canCancel) return;
    if (confirmCancelLeave.employeeId !== myEmployee.employeeId) {
      showError(UNAUTHORIZED_EMPLOYEE_RECORD_MSG);
      setConfirmCancelLeave(null);
      return;
    }
    const now = new Date().toISOString().replace("T", " ").substring(0, 19);
    const updatedItem: LeaveRecord = {
      ...confirmCancelLeave,
      status: "Cancelled",
      updatedDate: now,
    };
    const nextLeaves = leaves.map((l) => (l.id === confirmCancelLeave.id ? updatedItem : l));
    onUpdateLeaves(nextLeaves, updatedItem);
    onLogAction("Leave", "ESS Leave Cancelled", confirmCancelLeave.id, `Cancelled own leave request (${confirmCancelLeave.startDate} to ${confirmCancelLeave.endDate})`);
    showSuccess("Leave request cancelled.");
    setConfirmCancelLeave(null);
  };

  const activeLeaves = myLeaves.filter((l) => l.status === "Active");

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
        <div>
          <h1 className="text-lg font-extrabold text-slate-800">My Leave</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Apply for leave, monitor your balances for leave year {leaveYear}, and track request status ({myEmployee.employeeId}).
          </p>
        </div>
        <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 text-primary-custom" />
          <span>Active Requests: {activeLeaves.length}</span>
        </div>
      </div>

      {/* Submenu Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-white border border-slate-200 rounded-xl p-2 shadow-2xs">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                active ? "bg-primary-custom text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. Apply for Leave */}
      {activeSubTab === "apply" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
            <h2 className="text-sm font-extrabold text-slate-800">Apply for Leave</h2>
            <form noValidate onSubmit={handleApplyLeave} className="space-y-4">
              <ValidationSummary errors={errors} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Leave Type *</label>
                  <select
                    data-field="leaveType"
                    value={leaveType}
                    onChange={(e) => {
                      setLeaveType(e.target.value);
                      if (errors.leaveType) setErrors((p) => ({ ...p, leaveType: "" }));
                    }}
                    className={fieldInputClass(Boolean(errors.leaveType), "w-full px-3 py-2 border rounded-lg text-xs bg-white font-bold")}
                  >
                    {leaveTypesConfig.map((lt) => (
                      <option key={lt.id} value={lt.name}>
                        {lt.name} ({myBalances.find((b) => b.leaveTypeName === lt.name)?.remainingBalance ?? lt.annualEntitlement} days available)
                      </option>
                    ))}
                  </select>
                  <FormFieldError error={errors.leaveType} />
                </div>

                <div className="flex items-center pt-5">
                  <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isHalfDay}
                      onChange={(e) => {
                        setIsHalfDay(e.target.checked);
                        if (e.target.checked && startDate) setEndDate(startDate);
                      }}
                      className="h-4 w-4 rounded text-primary-custom"
                    />
                    <span>Half-Day Leave (0.5 day)</span>
                  </label>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Start Date *</label>
                  <input
                    data-field="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (isHalfDay) setEndDate(e.target.value);
                      if (errors.startDate) setErrors((p) => ({ ...p, startDate: "" }));
                    }}
                    className={fieldInputClass(Boolean(errors.startDate), "w-full px-3 py-2 border rounded-lg text-xs")}
                  />
                  <FormFieldError error={errors.startDate} />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">End Date *</label>
                  <input
                    data-field="endDate"
                    type="date"
                    value={endDate}
                    disabled={isHalfDay}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      if (errors.endDate) setErrors((p) => ({ ...p, endDate: "" }));
                    }}
                    className={fieldInputClass(Boolean(errors.endDate), "w-full px-3 py-2 border rounded-lg text-xs disabled:bg-slate-100")}
                  />
                  <FormFieldError error={errors.endDate} />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600">Calculated Working Days (excludes weekends &amp; public holidays)</span>
                <span className="font-black text-primary-custom text-sm">{daysCount} day(s)</span>
              </div>
              <FormFieldError error={errors.daysCount} />

              {selectedTypeConfig?.requiresSupportingDocument && (
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Supporting Document Reference / URL *</label>
                  <input
                    data-field="supportingDocumentUrl"
                    type="text"
                    value={supportingDocUrl}
                    onChange={(e) => {
                      setSupportingDocUrl(e.target.value);
                      if (errors.supportingDocumentUrl) setErrors((p) => ({ ...p, supportingDocumentUrl: "" }));
                    }}
                    placeholder="Medical certificate or official reference link"
                    className={fieldInputClass(Boolean(errors.supportingDocumentUrl), "w-full px-3 py-2 border rounded-lg text-xs")}
                  />
                  <FormFieldError error={errors.supportingDocumentUrl} />
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Reason *</label>
                <textarea
                  data-field="reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (errors.reason) setErrors((p) => ({ ...p, reason: "" }));
                  }}
                  placeholder="Provide reason for leave request..."
                  className={fieldInputClass(Boolean(errors.reason), "w-full px-3 py-2 border rounded-lg text-xs")}
                />
                <FormFieldError error={errors.reason} />
              </div>

              <div className="flex justify-end pt-2 border-t">
                <button
                  type="submit"
                  disabled={!canCreate}
                  className="px-4 py-2 bg-primary-custom text-white text-xs font-bold rounded-lg hover:opacity-95 disabled:opacity-50"
                >
                  Submit Leave Request
                </button>
              </div>
            </form>
          </div>

          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-3 shadow-2xs">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
              Available Balance Summary
            </h3>
            {myBalances.map((bal) => (
              <div key={bal.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-slate-800">{bal.leaveTypeName}</p>
                  <p className="text-[10px] text-slate-500">
                    Used {bal.leaveUtilized} of {bal.openingBalance} days
                  </p>
                </div>
                <span className="text-base font-black text-primary-custom">{bal.remainingBalance}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. My Leave History */}
      {activeSubTab === "history" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
          <h2 className="text-sm font-extrabold text-slate-800">My Leave History ({myLeaves.length})</h2>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500">
                  <th className="px-4 py-2.5">Leave Type</th>
                  <th className="px-4 py-2.5">Period</th>
                  <th className="px-4 py-2.5 text-center">Days</th>
                  <th className="px-4 py-2.5">Reason</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myLeaves.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-slate-400">No leave records found.</td>
                  </tr>
                ) : (
                  myLeaves.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-bold text-slate-800">{l.leaveType}</td>
                      <td className="px-4 py-2.5">{l.startDate} to {l.endDate}</td>
                      <td className="px-4 py-2.5 text-center font-bold">{l.daysCount}</td>
                      <td className="px-4 py-2.5 text-slate-600">{l.reason}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          l.status === "Active" ? "bg-emerald-100 text-emerald-700" :
                          l.status === "Completed" ? "bg-blue-100 text-blue-700" :
                          "bg-slate-200 text-slate-600"
                        }`}>
                          {l.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. My Leave Balance */}
      {activeSubTab === "balances" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
          <h2 className="text-sm font-extrabold text-slate-800">My Leave Balance ({leaveYear})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {myBalances.map((b) => (
              <div key={b.id} className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-sm text-slate-800">{b.leaveTypeName}</h3>
                  <span className="text-lg font-black text-primary-custom">{b.remainingBalance} d</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] pt-2 border-t border-slate-200">
                  <div>
                    <span className="text-slate-400 block">Entitlement</span>
                    <span className="font-bold text-slate-700">{b.annualEntitlement} d</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Carried Fwd</span>
                    <span className="font-bold text-slate-700">{b.carriedForwardBalance} d</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Utilized</span>
                    <span className="font-bold text-slate-700">{b.leaveUtilized} d</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. My Leave Requests */}
      {activeSubTab === "requests" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
          <h2 className="text-sm font-extrabold text-slate-800">My Leave Requests</h2>
          {myLeaves.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">You have not submitted any leave requests.</div>
          ) : (
            <div className="space-y-3">
              {myLeaves.map((l) => (
                <div key={l.id} className="p-4 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-800">{l.leaveType}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        l.status === "Active" ? "bg-emerald-100 text-emerald-700" :
                        l.status === "Completed" ? "bg-blue-100 text-blue-700" :
                        "bg-slate-200 text-slate-600"
                      }`}>
                        {l.status}
                      </span>
                    </div>
                    <p className="text-slate-600">{l.startDate} to {l.endDate} ({l.daysCount} working day(s))</p>
                    <p className="text-[11px] text-slate-500">{l.reason}</p>
                  </div>
                  {canCancel && l.status === "Active" && (
                    <button
                      type="button"
                      onClick={() => setConfirmCancelLeave(l)}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold flex items-center gap-1 self-start sm:self-center"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Cancel Request
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. Leave Approval Status */}
      {activeSubTab === "status" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
          <h2 className="text-sm font-extrabold text-slate-800">Leave Approval Status Tracker</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-[10px] font-bold uppercase text-emerald-700">Active / Approved</span>
              <p className="text-2xl font-black text-emerald-800 mt-1">{myLeaves.filter((l) => l.status === "Active").length}</p>
            </div>
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
              <span className="text-[10px] font-bold uppercase text-blue-700">Completed</span>
              <p className="text-2xl font-black text-blue-800 mt-1">{myLeaves.filter((l) => l.status === "Completed").length}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-100 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-600">Cancelled</span>
              <p className="text-2xl font-black text-slate-700 mt-1">{myLeaves.filter((l) => l.status === "Cancelled").length}</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {myLeaves.map((l) => (
              <div key={l.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-slate-800">{l.leaveType} ({l.startDate} – {l.endDate})</p>
                  <p className="text-[11px] text-slate-500">Updated: {l.updatedDate || l.createdDate}</p>
                </div>
                <span className="font-bold text-slate-700">{l.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmCancelLeave)}
        title="Cancel Leave Request"
        message={
          confirmCancelLeave ? (
            <>
              Are you sure you want to cancel your <strong>{confirmCancelLeave.leaveType}</strong> request for{" "}
              <strong>{confirmCancelLeave.startDate}</strong> to <strong>{confirmCancelLeave.endDate}</strong>?
            </>
          ) : null
        }
        confirmText="Cancel Leave"
        variant="warning"
        onConfirm={executeCancelLeave}
        onCancel={() => setConfirmCancelLeave(null)}
      />
    </div>
  );
}
