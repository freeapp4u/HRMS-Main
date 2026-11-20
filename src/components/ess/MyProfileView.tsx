import React, { useState, useMemo, useEffect } from "react";
import {
  User,
  Employee,
  Department,
  DriveAssociation,
  HRRequest,
  ModulePermission,
} from "../../types";
import {
  User as UserIcon,
  Briefcase,
  Phone,
  Landmark,
  FileText,
  Send,
  Lock,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { resolveOwnEmployeeRecord, UNAUTHORIZED_EMPLOYEE_RECORD_MSG } from "../../utils/rbacUtils";
import { validateHRRequestForm, focusFirstInvalidField } from "../../utils/validation";
import { FormFieldError, ValidationSummary, fieldInputClass } from "../ui/FormFeedback";
import { useToast } from "../ui/ToastProvider";

interface MyProfileViewProps {
  currentUser: User | null;
  employees: Employee[];
  departments: Department[];
  driveAssociations: DriveAssociation[];
  hrRequests: HRRequest[];
  permissions?: ModulePermission;
  initialSubTab?: string;
  requestedEmployeeId?: string | null;
  onSubmitHRRequest: (req: HRRequest) => Promise<boolean> | boolean;
  onNavigate?: (tabId: string) => void;
  onSubTabChange?: (subTab: string) => void;
}

const SUBTABS = [
  { id: "personal_info", label: "Personal Information", icon: UserIcon },
  { id: "employment_info", label: "Employment Information", icon: Briefcase },
  { id: "contact_info", label: "Contact Information", icon: Phone },
  { id: "dept_position", label: "Department and Position", icon: Landmark },
  { id: "my_documents", label: "My Documents", icon: FileText },
  { id: "request_update", label: "Request Profile Update", icon: Send },
];

export default function MyProfileView({
  currentUser,
  employees,
  departments,
  driveAssociations,
  hrRequests,
  permissions,
  initialSubTab,
  requestedEmployeeId,
  onSubmitHRRequest,
  onNavigate,
  onSubTabChange,
}: MyProfileViewProps) {
  const { showSuccess, showError } = useToast();

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
    return visibleTabs[0]?.id || "personal_info";
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

  const [phoneNumber, setPhoneNumber] = useState(myEmployee?.phoneNumber || "");
  const [altPhoneNumber, setAltPhoneNumber] = useState(myEmployee?.altPhoneNumber || "");
  const [address, setAddress] = useState(myEmployee?.address || "");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (myEmployee) {
      setPhoneNumber(myEmployee.phoneNumber || "");
      setAltPhoneNumber(myEmployee.altPhoneNumber || "");
      setAddress(myEmployee.address || "");
    }
  }, [myEmployee?.employeeId]);

  const myDepartment = departments.find((d) => d.id === myEmployee?.departmentId);
  const parentDept = departments.find((d) => d.id === myDepartment?.parentDepartmentId);
  const myDocs = driveAssociations.filter(
    (d) => myEmployee && d.targetType === "Employee" && d.targetId === myEmployee.employeeId
  );
  const myProfileRequests = hrRequests
    .filter((r) => myEmployee && r.employeeId === myEmployee.employeeId && r.requestType === "profile_update")
    .sort((a, b) => (b.submittedDate || "").localeCompare(a.submittedDate || ""));

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
        <h2 className="text-sm font-bold text-slate-800">Employee Profile Not Linked</h2>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Your portal account ({currentUser?.email}) is not yet linked to an active Employee Master record. Please contact Human Resources or IT Support to complete your Employee ID association.
        </p>
      </div>
    );
  }

  const handleRequestUpdateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;

    const validation = validateHRRequestForm({
      requestType: "profile_update",
      category: "Contact & Profile Update",
      subject: "Employee Contact / Profile Update Request",
      description: reason,
      proposedPhoneNumber: phoneNumber,
      proposedAltPhoneNumber: altPhoneNumber,
      proposedAddress: address,
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
      const newReq: HRRequest = {
        id: `REQ_${Date.now()}`,
        employeeId: myEmployee.employeeId,
        employeeName: myEmployee.fullName,
        employeeEmail: currentUser?.email || myEmployee.email,
        departmentId: myEmployee.departmentId,
        ownerUid: currentUser?.id,
        requestType: "profile_update",
        category: "Contact & Profile Update",
        subject: `Profile Update Request — ${myEmployee.fullName}`,
        description: reason.trim(),
        proposedProfileChanges: {
          phoneNumber: phoneNumber.trim() || undefined,
          altPhoneNumber: altPhoneNumber.trim() || undefined,
          address: address.trim() || undefined,
        },
        status: "Pending",
        submittedDate: now,
        updatedDate: now,
      };
      const ok = await onSubmitHRRequest(newReq);
      if (ok) {
        showSuccess("Profile update request submitted for HR review.");
        setReason("");
      } else {
        showError("Unable to submit profile update request. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-primary-custom text-white flex items-center justify-center font-black text-lg border-2 border-accent-custom shadow-xs shrink-0">
            {myEmployee.fullName.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-extrabold text-slate-800">{myEmployee.fullName}</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {myEmployee.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {myEmployee.position} • {myDepartment?.name || "Department Assigned"} • ID: <span className="font-mono font-bold text-slate-700">{myEmployee.employeeId}</span>
            </p>
          </div>
        </div>
        <div className="text-xs bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-slate-600 flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-primary-custom" />
          <span>Self-Service Personal Profile</span>
        </div>
      </div>

      {/* 1. Personal Information */}
      {activeSubTab === "personal_info" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-800">Personal Information</h2>
              <p className="text-[11px] text-slate-500">Official personnel biographical record (Read-Only).</p>
            </div>
            <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded bg-slate-100 text-slate-600">
              Read-Only Record
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Employee ID</span>
              <span className="font-mono font-bold text-slate-800 mt-1 block">{myEmployee.employeeId}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">First Name</span>
              <span className="font-bold text-slate-800 mt-1 block">{myEmployee.firstName}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Middle Name</span>
              <span className="font-bold text-slate-800 mt-1 block">{myEmployee.middleName || "-"}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Last Name</span>
              <span className="font-bold text-slate-800 mt-1 block">{myEmployee.lastName}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Gender</span>
              <span className="font-bold text-slate-800 mt-1 block">{myEmployee.gender}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Date of Birth</span>
              <span className="font-bold text-slate-800 mt-1 block">{myEmployee.dob}</span>
            </div>
            <div className="md:col-span-2">
              <span className="block text-[10px] font-bold uppercase text-slate-400">Official Company Email</span>
              <span className="font-bold text-primary-custom mt-1 block">{myEmployee.email}</span>
            </div>
          </div>
        </div>
      )}

      {/* 2. Employment Information (Strictly Read-Only) */}
      {activeSubTab === "employment_info" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-800">Employment Information</h2>
              <p className="text-[11px] text-slate-500">Contractual status, appointment date, and classification managed by Human Resources.</p>
            </div>
            <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded bg-slate-100 text-slate-600">
              Read-Only Record
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Employment Type</span>
              <span className="font-bold text-slate-800 mt-1 block">{myEmployee.employmentType}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Hire Date</span>
              <span className="font-bold text-slate-800 mt-1 block">{myEmployee.hireDate}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Employment Status</span>
              <span className="font-bold text-emerald-700 mt-1 block">{myEmployee.status}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Staff Category</span>
              <span className="font-bold text-slate-800 mt-1 block">{myEmployee.category || "Regular Staff"}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Record Created</span>
              <span className="font-semibold text-slate-600 mt-1 block">{myEmployee.createdDate}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Last HR Verification</span>
              <span className="font-semibold text-slate-600 mt-1 block">{myEmployee.updatedDate}</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Contact Information */}
      {activeSubTab === "contact_info" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-800">Contact Information</h2>
              <p className="text-[11px] text-slate-500">Registered telephone numbers and residential address.</p>
            </div>
            {visibleTabs.some((t) => t.id === "request_update") && (
              <button
                type="button"
                onClick={() => changeSubTab("request_update")}
                className="px-3 py-1.5 bg-primary-custom text-white text-xs font-bold rounded-lg hover:opacity-95 flex items-center gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                Request Contact Update
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Official Work Email</span>
              <span className="font-bold text-slate-800 mt-1 block">{myEmployee.email}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Primary Phone Number</span>
              <span className="font-bold text-slate-800 mt-1 block">{myEmployee.phoneNumber || "-"}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Alternative Phone Number</span>
              <span className="font-bold text-slate-800 mt-1 block">{myEmployee.altPhoneNumber || "-"}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Residential Address</span>
              <span className="font-bold text-slate-800 mt-1 block">{myEmployee.address || "-"}</span>
            </div>
          </div>
        </div>
      )}

      {/* 4. Department and Position (Strictly Read-Only) */}
      {activeSubTab === "dept_position" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-800">Department and Position</h2>
              <p className="text-[11px] text-slate-500">Organizational unit placement and official job title (Read-Only).</p>
            </div>
            <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded bg-slate-100 text-slate-600">
              Read-Only Record
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Department Name</span>
              <span className="font-bold text-slate-800 mt-1 block">
                {myDepartment ? `${myDepartment.name} (${myDepartment.code})` : myEmployee.departmentId}
              </span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Position / Job Title</span>
              <span className="font-bold text-primary-custom mt-1 block">{myEmployee.position}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Parent Directorate / Unit</span>
              <span className="font-semibold text-slate-700 mt-1 block">
                {parentDept ? `${parentDept.name} (${parentDept.code})` : "Top-Level Directorate"}
              </span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">Department Mandate</span>
              <span className="font-medium text-slate-600 mt-1 block">
                {myDepartment?.description || "-"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 5. My Documents Shortcut */}
      {activeSubTab === "my_documents" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-800">My Personal HR Documents</h2>
              <p className="text-[11px] text-slate-500">Personnel files linked exclusively to your Employee ID.</p>
            </div>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate("documents_employment_contract")}
                className="text-xs font-bold text-primary-custom hover:underline"
              >
                Open Full My Documents Section
              </button>
            )}
          </div>

          {myDocs.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              No personal HR documents are currently linked to your profile.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {myDocs.map((docItem) => (
                <div key={docItem.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-slate-800">{docItem.fileName}</p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                      <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 font-bold border border-sky-200">
                        {docItem.documentCategory || "Other Personal HR Document"}
                      </span>
                      <span>Linked: {docItem.associatedDate}</span>
                    </div>
                  </div>
                  {docItem.webViewLink && (
                    <a
                      href={docItem.webViewLink}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-primary-custom hover:bg-slate-50 flex items-center gap-1"
                    >
                      View <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 6. Request Profile Update */}
      {activeSubTab === "request_update" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
            <div>
              <h2 className="text-sm font-extrabold text-slate-800">Request Profile Update</h2>
              <p className="text-[11px] text-slate-500">
                Submit updated contact details to Human Resources. Changes apply automatically upon HR approval.
              </p>
            </div>

            <form noValidate onSubmit={handleRequestUpdateSubmit} className="space-y-4">
              <ValidationSummary errors={errors} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Primary Phone Number</label>
                  <input
                    data-field="reqPhone"
                    type="text"
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value);
                      if (errors.reqPhone) setErrors((p) => ({ ...p, reqPhone: "" }));
                    }}
                    placeholder="+251 9xx xxx xxx"
                    className={fieldInputClass(Boolean(errors.reqPhone), "w-full px-3 py-2 border rounded-lg text-xs")}
                  />
                  <FormFieldError error={errors.reqPhone} />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Alternative Phone Number</label>
                  <input
                    data-field="reqAltPhone"
                    type="text"
                    value={altPhoneNumber}
                    onChange={(e) => {
                      setAltPhoneNumber(e.target.value);
                      if (errors.reqAltPhone) setErrors((p) => ({ ...p, reqAltPhone: "" }));
                    }}
                    placeholder="Optional secondary number"
                    className={fieldInputClass(Boolean(errors.reqAltPhone), "w-full px-3 py-2 border rounded-lg text-xs")}
                  />
                  <FormFieldError error={errors.reqAltPhone} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Residential Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Sub-city, Woreda, House No."
                  className="w-full px-3 py-2 border rounded-lg text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  Reason / Remarks <span className="text-rose-500">*</span>
                </label>
                <textarea
                  data-field="reqDescription"
                  rows={3}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (errors.reqDescription) setErrors((p) => ({ ...p, reqDescription: "" }));
                  }}
                  placeholder="Explain the profile update requested for HR verification..."
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
                  <Send className="h-3.5 w-3.5 text-accent-custom" />
                  <span>{submitting ? "Submitting..." : "Submit Profile Update Request"}</span>
                </button>
              </div>
            </form>
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
              Recent Profile Update Requests ({myProfileRequests.length})
            </h3>
            <div className="space-y-3 max-h-[380px] overflow-y-auto">
              {myProfileRequests.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No profile update requests submitted yet.</p>
              ) : (
                myProfileRequests.map((req) => (
                  <div key={req.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800">{req.submittedDate.split(" ")[0]}</span>
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
                    <p className="text-[11px] text-slate-600">{req.description}</p>
                    {req.reviewComments && (
                      <p className="text-[10px] text-slate-500 italic">HR Note: {req.reviewComments}</p>
                    )}
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
