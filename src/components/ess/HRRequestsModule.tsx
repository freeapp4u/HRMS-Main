import React, { useState, useMemo, useEffect } from "react";
import {
  User,
  Employee,
  HRRequest,
  HRRequestType,
  AttendanceStatus,
  ModulePermission,
} from "../../types";
import {
  ClipboardList,
  PlusCircle,
  ListChecks,
  Clock,
  CheckCircle2,
  XCircle,
  Lock,
  Send,
} from "lucide-react";
import { resolveOwnEmployeeRecord, UNAUTHORIZED_EMPLOYEE_RECORD_MSG } from "../../utils/rbacUtils";
import { validateHRRequestForm, focusFirstInvalidField } from "../../utils/validation";
import { FormFieldError, ValidationSummary, fieldInputClass } from "../ui/FormFeedback";
import { useToast, ConfirmDialog } from "../ui/ToastProvider";

interface HRRequestsModuleProps {
  currentUser: User | null;
  employees: Employee[];
  hrRequests: HRRequest[];
  permissions?: ModulePermission;
  initialSubTab?: string;
  requestedEmployeeId?: string | null;
  onSubmitHRRequest: (req: HRRequest) => Promise<boolean> | boolean;
  onCancelHRRequest: (req: HRRequest) => Promise<boolean> | boolean;
  onReviewHRRequest?: (
    req: HRRequest,
    decision: "Approved" | "Rejected",
    comments: string
  ) => Promise<boolean> | boolean;
}

export default function HRRequestsModule({
  currentUser,
  employees,
  hrRequests,
  permissions,
  initialSubTab,
  requestedEmployeeId,
  onSubmitHRRequest,
  onCancelHRRequest,
  onReviewHRRequest,
}: HRRequestsModuleProps) {
  const { showSuccess, showError } = useToast();
  const isEmployee = currentUser?.role === "Employee";
  const canApprove = !isEmployee && (permissions ? permissions.actions.approve : currentUser?.role === "Administrator" || currentUser?.role === "HR Officer");
  const canCreate = permissions ? permissions.actions.create : true;

  const myEmployee = useMemo(
    () => resolveOwnEmployeeRecord(currentUser, employees),
    [currentUser, employees]
  );

  const isUnauthorizedTarget = Boolean(
    isEmployee && requestedEmployeeId && (!myEmployee || requestedEmployeeId !== myEmployee.employeeId)
  );

  const allTabs = [
    ...(canApprove ? [{ id: "review_queue", label: "HR Approval Queue", icon: ClipboardList }] : []),
    { id: "submit", label: "Submit HR Request", icon: PlusCircle },
    { id: "my_requests", label: isEmployee ? "My Submitted Requests" : "Submitted Requests", icon: ListChecks },
    { id: "status", label: "Request Status", icon: Clock },
  ];

  const visibleTabs = allTabs.filter((t) => !permissions || permissions.submenus[t.id] !== false);
  const [activeSubTab, setActiveSubTab] = useState<string>(() => {
    if (initialSubTab && visibleTabs.some((t) => t.id === initialSubTab)) return initialSubTab;
    return visibleTabs[0]?.id || "submit";
  });

  useEffect(() => {
    if (initialSubTab && visibleTabs.some((t) => t.id === initialSubTab)) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Request submission form
  const [requestType, setRequestType] = useState<HRRequestType>("general_hr");
  const [category, setCategory] = useState("Employment Verification Letter");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [phoneNumber, setPhoneNumber] = useState(myEmployee?.phoneNumber || "");
  const [altPhoneNumber, setAltPhoneNumber] = useState(myEmployee?.altPhoneNumber || "");
  const [address, setAddress] = useState(myEmployee?.address || "");
  const [attDate, setAttDate] = useState(new Date().toISOString().split("T")[0]);
  const [attStatus, setAttStatus] = useState<AttendanceStatus>("Present");
  const [checkIn, setCheckIn] = useState("08:30");
  const [checkOut, setCheckOut] = useState("17:00");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Review state
  const [reviewingReq, setReviewingReq] = useState<HRRequest | null>(null);
  const [reviewComments, setReviewComments] = useState("");
  const [confirmCancelReq, setConfirmCancelReq] = useState<HRRequest | null>(null);

  const myRequests = useMemo(() => {
    const empId = myEmployee?.employeeId || currentUser?.employeeId;
    return hrRequests
      .filter((r) => (empId ? r.employeeId === empId : r.ownerUid === currentUser?.id))
      .sort((a, b) => (b.submittedDate || "").localeCompare(a.submittedDate || ""));
  }, [hrRequests, myEmployee, currentUser]);

  const reviewQueueRequests = useMemo(() => {
    return [...hrRequests].sort((a, b) => (b.submittedDate || "").localeCompare(a.submittedDate || ""));
  }, [hrRequests]);

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canCreate || submitting) return;
    if (!myEmployee && isEmployee) {
      showError("Your account must be linked to an Employee Master record before submitting HR requests.");
      return;
    }

    const validation = validateHRRequestForm({
      requestType,
      category,
      subject,
      description,
      proposedPhoneNumber: phoneNumber,
      proposedAltPhoneNumber: altPhoneNumber,
      proposedAddress: address,
      attendanceDate: attDate,
      requestedCheckIn: checkIn,
      requestedCheckOut: checkOut,
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
        employeeId: myEmployee?.employeeId || currentUser?.employeeId || currentUser?.id || "EMP",
        employeeName: myEmployee?.fullName || currentUser?.fullName || "Staff Member",
        employeeEmail: currentUser?.email || myEmployee?.email,
        departmentId: myEmployee?.departmentId,
        ownerUid: currentUser?.id,
        requestType,
        category: category.trim(),
        subject: subject.trim(),
        description: description.trim(),
        proposedProfileChanges:
          requestType === "profile_update"
            ? {
                phoneNumber: phoneNumber.trim() || undefined,
                altPhoneNumber: altPhoneNumber.trim() || undefined,
                address: address.trim() || undefined,
              }
            : undefined,
        attendanceCorrection:
          requestType === "attendance_correction"
            ? {
                date: attDate,
                requestedStatus: attStatus,
                requestedCheckIn: checkIn,
                requestedCheckOut: checkOut,
              }
            : undefined,
        status: "Pending",
        submittedDate: now,
        updatedDate: now,
      };
      const ok = await onSubmitHRRequest(req);
      if (ok) {
        showSuccess("HR Request submitted successfully.");
        setSubject("");
        setDescription("");
        setActiveSubTab("my_requests");
      } else {
        showError("Unable to submit HR request. Please retry.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (decision: "Approved" | "Rejected") => {
    if (!reviewingReq || !onReviewHRRequest) return;
    const ok = await onReviewHRRequest(reviewingReq, decision, reviewComments.trim());
    if (ok) {
      showSuccess(`Request ${reviewingReq.id} marked as ${decision}.`);
      setReviewingReq(null);
      setReviewComments("");
    } else {
      showError("Failed to update HR request status.");
    }
  };

  const statusBadge = (status: HRRequest["status"]) => {
    if (status === "Approved") return "bg-emerald-100 text-emerald-700";
    if (status === "Rejected") return "bg-rose-100 text-rose-700";
    if (status === "Cancelled") return "bg-slate-200 text-slate-600";
    return "bg-amber-100 text-amber-800";
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
        <div>
          <h1 className="text-lg font-extrabold text-slate-800">{isEmployee ? "My Requests" : "HR Requests & Workflows"}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isEmployee
              ? "Submit HR inquiries, profile update requests, or attendance corrections and monitor approval status."
              : "Review and approve employee HR service requests, profile updates, and attendance corrections."}
          </p>
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

      {/* HR Approval Queue (Admin / HR Officer) */}
      {activeSubTab === "review_queue" && canApprove && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
          <h2 className="text-sm font-extrabold text-slate-800">
            HR Approval Queue ({reviewQueueRequests.filter((r) => r.status === "Pending").length} Pending)
          </h2>
          {reviewQueueRequests.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">No HR requests in queue.</p>
          ) : (
            <div className="space-y-3">
              {reviewQueueRequests.map((req) => (
                <div key={req.id} className="p-4 border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-slate-800">{req.subject}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${statusBadge(req.status)}`}>
                        {req.status}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[9px] font-bold uppercase">
                        {req.category}
                      </span>
                    </div>
                    <p className="text-slate-600 font-semibold">
                      {req.employeeName} ({req.employeeId}) • Submitted: {req.submittedDate}
                    </p>
                    <p className="text-slate-500">{req.description}</p>
                    {req.proposedProfileChanges && (
                      <p className="text-[11px] text-sky-700 font-semibold">
                        Requested Profile Changes: Phone: {req.proposedProfileChanges.phoneNumber || "-"} | Alt: {req.proposedProfileChanges.altPhoneNumber || "-"} | Address: {req.proposedProfileChanges.address || "-"}
                      </p>
                    )}
                    {req.attendanceCorrection && (
                      <p className="text-[11px] text-sky-700 font-semibold">
                        Requested Attendance: {req.attendanceCorrection.date} • {req.attendanceCorrection.requestedStatus} ({req.attendanceCorrection.requestedCheckIn} – {req.attendanceCorrection.requestedCheckOut})
                      </p>
                    )}
                    {req.reviewComments && (
                      <p className="text-[10px] italic text-slate-500">Review Note: {req.reviewComments}</p>
                    )}
                  </div>

                  {req.status === "Pending" && (
                    <button
                      type="button"
                      onClick={() => {
                        setReviewingReq(req);
                        setReviewComments("");
                      }}
                      className="px-3.5 py-2 bg-primary-custom text-white text-xs font-bold rounded-lg hover:opacity-95 shrink-0"
                    >
                      Review &amp; Decide
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Submit HR Request */}
      {activeSubTab === "submit" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs max-w-3xl">
          <h2 className="text-sm font-extrabold text-slate-800">Submit HR Request</h2>
          <form noValidate onSubmit={handleSubmit} className="space-y-4">
            <ValidationSummary errors={errors} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Request Type *</label>
                <select
                  value={requestType}
                  onChange={(e) => {
                    const nextType = e.target.value as HRRequestType;
                    setRequestType(nextType);
                    setCategory(
                      nextType === "profile_update"
                        ? "Contact & Profile Update"
                        : nextType === "attendance_correction"
                        ? "Attendance Correction"
                        : "Employment Verification Letter"
                    );
                  }}
                  className="w-full px-3 py-2 border rounded-lg text-xs bg-white font-bold"
                >
                  <option value="general_hr">General HR Request</option>
                  <option value="profile_update">Profile Update Request</option>
                  <option value="attendance_correction">Attendance Correction Request</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Category *</label>
                <input
                  data-field="reqCategory"
                  type="text"
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    if (errors.reqCategory) setErrors((p) => ({ ...p, reqCategory: "" }));
                  }}
                  className={fieldInputClass(Boolean(errors.reqCategory), "w-full px-3 py-2 border rounded-lg text-xs")}
                />
                <FormFieldError error={errors.reqCategory} />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">Subject *</label>
              <input
                data-field="reqSubject"
                type="text"
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  if (errors.reqSubject) setErrors((p) => ({ ...p, reqSubject: "" }));
                }}
                placeholder="Brief title for your HR request"
                className={fieldInputClass(Boolean(errors.reqSubject), "w-full px-3 py-2 border rounded-lg text-xs")}
              />
              <FormFieldError error={errors.reqSubject} />
            </div>

            {requestType === "profile_update" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 border rounded-lg">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">New Phone</label>
                  <input
                    data-field="reqPhone"
                    type="text"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className={fieldInputClass(Boolean(errors.reqPhone), "w-full px-2.5 py-1.5 border rounded text-xs bg-white")}
                  />
                  <FormFieldError error={errors.reqPhone} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">Alt Phone</label>
                  <input
                    data-field="reqAltPhone"
                    type="text"
                    value={altPhoneNumber}
                    onChange={(e) => setAltPhoneNumber(e.target.value)}
                    className={fieldInputClass(Boolean(errors.reqAltPhone), "w-full px-2.5 py-1.5 border rounded text-xs bg-white")}
                  />
                  <FormFieldError error={errors.reqAltPhone} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">Address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-2.5 py-1.5 border rounded text-xs bg-white"
                  />
                </div>
              </div>
            )}

            {requestType === "attendance_correction" && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 bg-slate-50 border rounded-lg">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">Date *</label>
                  <input
                    data-field="reqAttDate"
                    type="date"
                    value={attDate}
                    onChange={(e) => setAttDate(e.target.value)}
                    className={fieldInputClass(Boolean(errors.reqAttDate), "w-full px-2.5 py-1.5 border rounded text-xs bg-white")}
                  />
                  <FormFieldError error={errors.reqAttDate} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">Status</label>
                  <select
                    value={attStatus}
                    onChange={(e) => setAttStatus(e.target.value as AttendanceStatus)}
                    className="w-full px-2.5 py-1.5 border rounded text-xs bg-white"
                  >
                    <option value="Present">Present</option>
                    <option value="Late">Late</option>
                    <option value="Half Day">Half Day</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">Check-In</label>
                  <input
                    data-field="reqCheckIn"
                    type="time"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    className={fieldInputClass(Boolean(errors.reqCheckIn), "w-full px-2.5 py-1.5 border rounded text-xs bg-white")}
                  />
                  <FormFieldError error={errors.reqCheckIn} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">Check-Out</label>
                  <input
                    data-field="reqCheckOut"
                    type="time"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    className={fieldInputClass(Boolean(errors.reqCheckOut), "w-full px-2.5 py-1.5 border rounded text-xs bg-white")}
                  />
                  <FormFieldError error={errors.reqCheckOut} />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">Request Details *</label>
              <textarea
                data-field="reqDescription"
                rows={4}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (errors.reqDescription) setErrors((p) => ({ ...p, reqDescription: "" }));
                }}
                placeholder="Provide clear details for the HR team..."
                className={fieldInputClass(Boolean(errors.reqDescription), "w-full px-3 py-2 border rounded-lg text-xs")}
              />
              <FormFieldError error={errors.reqDescription} />
            </div>

            <div className="flex justify-end pt-2 border-t">
              <button
                type="submit"
                disabled={!canCreate || submitting}
                className="px-4 py-2 bg-primary-custom text-white text-xs font-bold rounded-lg hover:opacity-95 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5 text-accent-custom" />
                <span>{submitting ? "Submitting..." : "Submit HR Request"}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* My Submitted Requests */}
      {activeSubTab === "my_requests" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
          <h2 className="text-sm font-extrabold text-slate-800">My Submitted Requests ({myRequests.length})</h2>
          {myRequests.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">You have not submitted any HR requests yet.</p>
          ) : (
            <div className="space-y-3">
              {myRequests.map((req) => (
                <div key={req.id} className="p-4 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-800">{req.subject}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${statusBadge(req.status)}`}>
                        {req.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {req.category} • Submitted: {req.submittedDate}
                    </p>
                    <p className="text-slate-600">{req.description}</p>
                    {req.reviewComments && <p className="text-[11px] italic text-slate-500">HR Response: {req.reviewComments}</p>}
                  </div>
                  {req.status === "Pending" && (
                    <button
                      type="button"
                      onClick={() => setConfirmCancelReq(req)}
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

      {/* Request Status Summary */}
      {activeSubTab === "status" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 shadow-2xs">
          <h2 className="text-sm font-extrabold text-slate-800">Request Status Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
              <span className="text-[10px] font-bold uppercase text-amber-700">Pending</span>
              <p className="text-2xl font-black text-amber-800 mt-1">{myRequests.filter((r) => r.status === "Pending").length}</p>
            </div>
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-[10px] font-bold uppercase text-emerald-700">Approved</span>
              <p className="text-2xl font-black text-emerald-800 mt-1">{myRequests.filter((r) => r.status === "Approved").length}</p>
            </div>
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
              <span className="text-[10px] font-bold uppercase text-rose-700">Rejected</span>
              <p className="text-2xl font-black text-rose-800 mt-1">{myRequests.filter((r) => r.status === "Rejected").length}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-100 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-600">Cancelled</span>
              <p className="text-2xl font-black text-slate-700 mt-1">{myRequests.filter((r) => r.status === "Cancelled").length}</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {myRequests.map((r) => (
              <div key={r.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-slate-800">{r.subject}</p>
                  <p className="text-[11px] text-slate-500">Updated: {r.updatedDate}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusBadge(r.status)}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review Decision Modal */}
      {reviewingReq && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="bg-primary-custom text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-wider">Review HR Request</h3>
              <button onClick={() => setReviewingReq(null)} className="text-white/80 hover:text-white text-xs font-bold">
                Close
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div>
                <p className="font-extrabold text-slate-800">{reviewingReq.subject}</p>
                <p className="text-slate-500 mt-0.5">{reviewingReq.employeeName} ({reviewingReq.employeeId})</p>
                <p className="text-slate-700 mt-2 bg-slate-50 p-3 rounded-lg border">{reviewingReq.description}</p>
              </div>
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">HR Review Comments</label>
                <textarea
                  rows={3}
                  value={reviewComments}
                  onChange={(e) => setReviewComments(e.target.value)}
                  placeholder="Optional approval notes or rejection reason..."
                  className="w-full px-3 py-2 border rounded-lg text-xs"
                />
              </div>
              <div className="flex gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => handleDecision("Rejected")}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg flex items-center justify-center gap-1"
                >
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </button>
                <button
                  type="button"
                  onClick={() => handleDecision("Approved")}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg flex items-center justify-center gap-1"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve &amp; Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmCancelReq)}
        title="Cancel HR Request"
        message={
          confirmCancelReq ? (
            <>
              Are you sure you want to cancel your request <strong>{confirmCancelReq.subject}</strong>?
            </>
          ) : null
        }
        confirmText="Cancel Request"
        variant="warning"
        onConfirm={async () => {
          if (confirmCancelReq) {
            await onCancelHRRequest(confirmCancelReq);
            showSuccess("HR Request cancelled.");
          }
          setConfirmCancelReq(null);
        }}
        onCancel={() => setConfirmCancelReq(null)}
      />
    </div>
  );
}
