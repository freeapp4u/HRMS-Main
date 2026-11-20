import React, { useState, useMemo, useEffect } from "react";
import {
  User,
  Employee,
  Department,
  AttendanceRecord,
  AttendanceStatus,
  HRRequest,
  ModulePermission,
  CompanyConfig,
} from "../../types";
import { Clock, CalendarDays, History, AlertCircle, Send, Lock, CheckCircle2 } from "lucide-react";
import { resolveOwnEmployeeRecord, UNAUTHORIZED_EMPLOYEE_RECORD_MSG } from "../../utils/rbacUtils";
import { validateHRRequestForm, focusFirstInvalidField } from "../../utils/validation";
import { FormFieldError, ValidationSummary, fieldInputClass } from "../ui/FormFeedback";
import { useToast } from "../ui/ToastProvider";
import ReportPrintButton from "../reports/ReportPrintButton";
import ReportPDFExportButton from "../reports/ReportPDFExportButton";
import { formatReportDateTime, ReportExportPayload } from "../../utils/reportBranding";

interface MyAttendanceViewProps {
  currentUser: User | null;
  employees: Employee[];
  departments: Department[];
  attendance: AttendanceRecord[];
  hrRequests: HRRequest[];
  companyConfig: CompanyConfig;
  permissions?: ModulePermission;
  initialSubTab?: string;
  requestedEmployeeId?: string | null;
  onSubmitHRRequest: (req: HRRequest) => Promise<boolean> | boolean;
  onSubTabChange?: (subTab: string) => void;
}

const SUBTABS = [
  { id: "daily", label: "Daily Attendance", icon: Clock },
  { id: "monthly", label: "Monthly Attendance Summary", icon: CalendarDays },
  { id: "history", label: "Attendance History", icon: History },
  { id: "correction", label: "Attendance Correction Request", icon: Send },
];

export default function MyAttendanceView({
  currentUser,
  employees,
  departments,
  attendance,
  hrRequests,
  companyConfig,
  permissions,
  initialSubTab,
  requestedEmployeeId,
  onSubmitHRRequest,
  onSubTabChange,
}: MyAttendanceViewProps) {
  const { showSuccess, showError } = useToast();
  const canExport = permissions ? permissions.actions.export : false;

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
    return visibleTabs[0]?.id || "daily";
  });

  useEffect(() => {
    if (initialSubTab && visibleTabs.some((t) => t.id === initialSubTab)) {
      setActiveSubTab(initialSubTab);
    } else if (!visibleTabs.some((t) => t.id === activeSubTab) && visibleTabs[0]) {
      setActiveSubTab(visibleTabs[0].id);
    }
  }, [initialSubTab, permissions]);

  const changeSubTab = (subTab: string) => {
    setActiveSubTab(subTab);
    if (onSubTabChange) {
      onSubTabChange(subTab);
    }
  };

  const todayIso = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [selectedMonth, setSelectedMonth] = useState(todayIso.substring(0, 7));

  // Correction Form
  const [corrDate, setCorrDate] = useState(todayIso);
  const [corrStatus, setCorrStatus] = useState<AttendanceStatus>("Present");
  const [corrCheckIn, setCorrCheckIn] = useState("08:30");
  const [corrCheckOut, setCorrCheckOut] = useState("17:00");
  const [corrReason, setCorrReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const myRecords = useMemo(() => {
    if (!myEmployee) return [];
    return attendance
      .filter((a) => !a.isDeleted && a.employeeId === myEmployee.employeeId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [attendance, myEmployee]);

  const dailyRecord = useMemo(
    () => myRecords.find((r) => r.date === selectedDate),
    [myRecords, selectedDate]
  );

  const monthlyRecords = useMemo(
    () => myRecords.filter((r) => r.date.startsWith(selectedMonth)),
    [myRecords, selectedMonth]
  );

  const monthlySummary = useMemo(() => {
    const present = monthlyRecords.filter((r) => r.status === "Present").length;
    const late = monthlyRecords.filter((r) => r.status === "Late").length;
    const halfDay = monthlyRecords.filter((r) => r.status === "Half Day").length;
    const absent = monthlyRecords.filter((r) => r.status === "Absent").length;
    const onLeave = monthlyRecords.filter((r) => r.status === "On Leave").length;
    const totalHours = monthlyRecords.reduce((s, r) => s + (r.workingHours || 0), 0);
    return { present, late, halfDay, absent, onLeave, totalHours: Math.round(totalHours * 100) / 100 };
  }, [monthlyRecords]);

  const myCorrectionRequests = useMemo(() => {
    if (!myEmployee) return [];
    return hrRequests
      .filter((r) => r.employeeId === myEmployee.employeeId && r.requestType === "attendance_correction")
      .sort((a, b) => (b.submittedDate || "").localeCompare(a.submittedDate || ""));
  }, [hrRequests, myEmployee]);

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
        <h2 className="text-sm font-bold text-slate-800">Employee Attendance Unavailable</h2>
        <p className="text-xs text-slate-500">Your account is not linked to an active Employee ID.</p>
      </div>
    );
  }

  const myDept = departments.find((d) => d.id === myEmployee.departmentId)?.name || "Department";

  const buildMyAttendanceReport = (): ReportExportPayload => ({
    filePrefix: `ESS_Attendance_${myEmployee.employeeId}`,
    reportTitle: `Personal Attendance Report — ${myEmployee.fullName}`,
    reportSubtitle: `Employee ID: ${myEmployee.employeeId}`,
    departmentOrUnit: myDept,
    generatedAt: formatReportDateTime(),
    generatedBy: currentUser?.fullName || myEmployee.fullName,
    orientation: "landscape",
    summaryMetrics: [
      { label: "Total Records", value: String(myRecords.length) },
      { label: "Selected Month", value: selectedMonth },
      { label: "Month Hours", value: `${monthlySummary.totalHours} hrs` },
    ],
    columns: [
      { header: "Date", align: "left" },
      { header: "Status", align: "center" },
      { header: "Check-In", align: "center" },
      { header: "Check-Out", align: "center" },
      { header: "Hours", align: "right" },
      { header: "Late", align: "center" },
      { header: "Remarks", align: "left" },
    ],
    rows: myRecords.map((r) => [
      r.date,
      r.status,
      r.checkInTime || "-",
      r.checkOutTime || "-",
      r.workingHours ?? 0,
      r.lateStatus,
      r.remarks || "-",
    ]),
  });

  const handleCorrectionSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;

    const validation = validateHRRequestForm({
      requestType: "attendance_correction",
      category: "Attendance Correction",
      subject: `Attendance Correction for ${corrDate}`,
      description: corrReason,
      attendanceDate: corrDate,
      requestedCheckIn: corrCheckIn,
      requestedCheckOut: corrCheckOut,
    });

    if (!validation.valid) {
      setErrors(validation.errors);
      focusFirstInvalidField(validation.errors, e.currentTarget);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const now = new Date().toISOString().replace("T", " ").substring(0, 19);
      const req: HRRequest = {
        id: `REQ_${Date.now()}`,
        employeeId: myEmployee.employeeId,
        employeeName: myEmployee.fullName,
        employeeEmail: currentUser?.email || myEmployee.email,
        departmentId: myEmployee.departmentId,
        ownerUid: currentUser?.id,
        requestType: "attendance_correction",
        category: "Attendance Correction",
        subject: `Attendance Correction — ${corrDate}`,
        description: corrReason.trim(),
        attendanceCorrection: {
          date: corrDate,
          requestedStatus: corrStatus,
          requestedCheckIn: corrCheckIn,
          requestedCheckOut: corrCheckOut,
        },
        status: "Pending",
        submittedDate: now,
        updatedDate: now,
      };
      const ok = await onSubmitHRRequest(req);
      if (ok) {
        showSuccess("Attendance correction request submitted to HR.");
        setCorrReason("");
      } else {
        showError("Could not submit attendance correction request.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
        <div>
          <h1 className="text-lg font-extrabold text-slate-800">My Attendance</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            View your daily check-in/out logs, monthly summaries, and submit attendance correction requests ({myEmployee.employeeId}).
          </p>
        </div>
        {canExport && (
          <div className="flex items-center gap-2">
            <ReportPrintButton printData={buildMyAttendanceReport} companyConfig={companyConfig} label="Print" />
            <ReportPDFExportButton reportData={buildMyAttendanceReport} companyConfig={companyConfig} label="Export PDF" />
          </div>
        )}
      </div>

      {/* 1. Daily Attendance */}
      {activeSubTab === "daily" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <h2 className="text-sm font-extrabold text-slate-800">Daily Attendance Record</h2>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
            />
          </div>

          {dailyRecord ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400">Status</span>
                <p className="font-black text-slate-800 mt-1">{dailyRecord.status}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400">Check-In</span>
                <p className="font-black text-slate-800 mt-1">{dailyRecord.checkInTime || "--:--"}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400">Check-Out</span>
                <p className="font-black text-slate-800 mt-1">{dailyRecord.checkOutTime || "--:--"}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400">Working Hours</span>
                <p className="font-black text-primary-custom mt-1">{dailyRecord.workingHours} hrs</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400">Late Flag</span>
                <p className="font-bold text-slate-700 mt-1">{dailyRecord.lateStatus}</p>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-slate-400 space-y-2">
              <p>No attendance entry logged for <strong>{selectedDate}</strong>.</p>
              {visibleTabs.some((t) => t.id === "correction") && (
                <button
                  type="button"
                  onClick={() => {
                    setCorrDate(selectedDate);
                    changeSubTab("correction");
                  }}
                  className="text-primary-custom font-bold hover:underline"
                >
                  Submit an Attendance Correction Request for this date
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2. Monthly Attendance Summary */}
      {activeSubTab === "monthly" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <h2 className="text-sm font-extrabold text-slate-800">Monthly Attendance Summary</h2>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
              <span className="text-[10px] font-bold uppercase text-emerald-700">Present</span>
              <p className="text-xl font-black text-emerald-800 mt-1">{monthlySummary.present}</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-center">
              <span className="text-[10px] font-bold uppercase text-amber-700">Late</span>
              <p className="text-xl font-black text-amber-800 mt-1">{monthlySummary.late}</p>
            </div>
            <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 text-center">
              <span className="text-[10px] font-bold uppercase text-sky-700">Half Day</span>
              <p className="text-xl font-black text-sky-800 mt-1">{monthlySummary.halfDay}</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-center">
              <span className="text-[10px] font-bold uppercase text-blue-700">On Leave</span>
              <p className="text-xl font-black text-blue-800 mt-1">{monthlySummary.onLeave}</p>
            </div>
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-center">
              <span className="text-[10px] font-bold uppercase text-rose-700">Absent</span>
              <p className="text-xl font-black text-rose-800 mt-1">{monthlySummary.absent}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-center">
              <span className="text-[10px] font-bold uppercase text-slate-600">Total Hours</span>
              <p className="text-xl font-black text-primary-custom mt-1">{monthlySummary.totalHours}</p>
            </div>
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Check-In</th>
                  <th className="px-4 py-2.5">Check-Out</th>
                  <th className="px-4 py-2.5 text-right">Hours</th>
                  <th className="px-4 py-2.5">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthlyRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      No attendance records found for {selectedMonth}.
                    </td>
                  </tr>
                ) : (
                  monthlyRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-bold text-slate-800">{r.date}</td>
                      <td className="px-4 py-2.5 font-semibold">{r.status}</td>
                      <td className="px-4 py-2.5">{r.checkInTime || "-"}</td>
                      <td className="px-4 py-2.5">{r.checkOutTime || "-"}</td>
                      <td className="px-4 py-2.5 text-right font-bold">{r.workingHours}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.remarks || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Attendance History */}
      {activeSubTab === "history" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-800">Complete Attendance History ({myRecords.length})</h2>
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Check-In</th>
                  <th className="px-4 py-2.5">Check-Out</th>
                  <th className="px-4 py-2.5 text-right">Hours</th>
                  <th className="px-4 py-2.5">Late</th>
                  <th className="px-4 py-2.5">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
                      No attendance history available.
                    </td>
                  </tr>
                ) : (
                  myRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-bold text-slate-800">{r.date}</td>
                      <td className="px-4 py-2.5 font-semibold">{r.status}</td>
                      <td className="px-4 py-2.5">{r.checkInTime || "-"}</td>
                      <td className="px-4 py-2.5">{r.checkOutTime || "-"}</td>
                      <td className="px-4 py-2.5 text-right font-bold">{r.workingHours}</td>
                      <td className="px-4 py-2.5">{r.lateStatus}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.remarks || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Attendance Correction Request */}
      {activeSubTab === "correction" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
            <div>
              <h2 className="text-sm font-extrabold text-slate-800">Attendance Correction Request</h2>
              <p className="text-[11px] text-slate-500">
                Request a log adjustment for a missed punch or system discrepancy. HR approval updates your official record.
              </p>
            </div>

            <form noValidate onSubmit={handleCorrectionSubmit} className="space-y-4">
              <ValidationSummary errors={errors} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Attendance Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    data-field="reqAttDate"
                    type="date"
                    value={corrDate}
                    onChange={(e) => {
                      setCorrDate(e.target.value);
                      if (errors.reqAttDate) setErrors((p) => ({ ...p, reqAttDate: "" }));
                    }}
                    className={fieldInputClass(Boolean(errors.reqAttDate), "w-full px-3 py-2 border rounded-lg text-xs")}
                  />
                  <FormFieldError error={errors.reqAttDate} />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Requested Status</label>
                  <select
                    value={corrStatus}
                    onChange={(e) => setCorrStatus(e.target.value as AttendanceStatus)}
                    className="w-full px-3 py-2 border rounded-lg text-xs bg-white font-semibold"
                  >
                    <option value="Present">Present</option>
                    <option value="Late">Late</option>
                    <option value="Half Day">Half Day</option>
                    <option value="On Leave">On Leave</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Requested Check-In</label>
                  <input
                    data-field="reqCheckIn"
                    type="time"
                    value={corrCheckIn}
                    onChange={(e) => {
                      setCorrCheckIn(e.target.value);
                      if (errors.reqCheckIn) setErrors((p) => ({ ...p, reqCheckIn: "" }));
                    }}
                    className={fieldInputClass(Boolean(errors.reqCheckIn), "w-full px-3 py-2 border rounded-lg text-xs")}
                  />
                  <FormFieldError error={errors.reqCheckIn} />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Requested Check-Out</label>
                  <input
                    data-field="reqCheckOut"
                    type="time"
                    value={corrCheckOut}
                    onChange={(e) => {
                      setCorrCheckOut(e.target.value);
                      if (errors.reqCheckOut) setErrors((p) => ({ ...p, reqCheckOut: "" }));
                    }}
                    className={fieldInputClass(Boolean(errors.reqCheckOut), "w-full px-3 py-2 border rounded-lg text-xs")}
                  />
                  <FormFieldError error={errors.reqCheckOut} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  Explanation / Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  data-field="reqDescription"
                  rows={3}
                  value={corrReason}
                  onChange={(e) => {
                    setCorrReason(e.target.value);
                    if (errors.reqDescription) setErrors((p) => ({ ...p, reqDescription: "" }));
                  }}
                  placeholder="Describe why this attendance correction is needed..."
                  className={fieldInputClass(Boolean(errors.reqDescription), "w-full px-3 py-2 border rounded-lg text-xs")}
                />
                <FormFieldError error={errors.reqDescription} />
              </div>

              <div className="flex justify-end pt-2 border-t">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-primary-custom text-white text-xs font-bold rounded-lg hover:opacity-95 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent-custom" />
                  <span>{submitting ? "Submitting..." : "Submit Correction Request"}</span>
                </button>
              </div>
            </form>
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
              My Correction Requests ({myCorrectionRequests.length})
            </h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {myCorrectionRequests.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">No correction requests submitted yet.</p>
              ) : (
                myCorrectionRequests.map((req) => (
                  <div key={req.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800">{req.attendanceCorrection?.date || req.submittedDate}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          req.status === "Approved"
                            ? "bg-emerald-100 text-emerald-700"
                            : req.status === "Rejected"
                            ? "bg-rose-100 text-rose-700"
                            : req.status === "Cancelled"
                            ? "bg-slate-200 text-slate-600"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      {req.attendanceCorrection?.requestedStatus} ({req.attendanceCorrection?.requestedCheckIn} - {req.attendanceCorrection?.requestedCheckOut})
                    </p>
                    <p className="text-[11px] text-slate-500">{req.description}</p>
                    {req.reviewComments && <p className="text-[10px] italic text-slate-500">HR Note: {req.reviewComments}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
