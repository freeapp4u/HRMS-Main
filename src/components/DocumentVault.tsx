import React, { useState, useEffect } from "react";
import {
  Upload,
  Trash2,
  Search,
  ExternalLink,
  FileText,
  CheckCircle2,
  RefreshCw,
  Link as LinkIcon,
  User as UserIcon,
  Landmark,
  ShieldCheck,
  AlertCircle,
  Download,
} from "lucide-react";
import {
  uploadFileToStorage,
  deleteFileFromStorage,
  listStorageFolderFiles,
  StorageDocumentItem,
} from "../firebase";
import { syncRecordToFirestore, deleteRecordFromFirestore } from "../firebaseSync";
import {
  Employee,
  Department,
  ModulePermission,
  User as AppUser,
  DriveAssociation,
  ESSDocumentCategory,
} from "../types";
import { getDepartmentHeadManagedDeptIds } from "../utils/rbacUtils";
import { useToast, ConfirmDialog } from "./ui/ToastProvider";
import { FormFieldError, fieldInputClass } from "./ui/FormFeedback";
import { validateDocumentUpload, focusFirstInvalidField } from "../utils/validation";

export type { DriveAssociation };

interface DocumentVaultProps {
  employees: Employee[];
  departments: Department[];
  users?: AppUser[];
  currentUser: AppUser | null;
  permissions?: ModulePermission;
  driveAssociations?: DriveAssociation[];
  onUpdateDriveAssociations?: (assocs: DriveAssociation[]) => void;
  onLogAction: (module: string, action: string, record: string, details: string) => void;
}

const ESS_DOCUMENT_CATEGORIES: ESSDocumentCategory[] = [
  "Employment Contract",
  "Appointment Letter",
  "Promotion & Transfer Letter",
  "Other Personal HR Document",
];

export default function DocumentVault({
  employees,
  departments,
  users = [],
  currentUser,
  permissions,
  driveAssociations,
  onUpdateDriveAssociations,
  onLogAction,
}: DocumentVaultProps) {
  const canCreate = permissions ? permissions.actions.create : currentUser?.role !== "Auditor";
  const canEdit = permissions ? permissions.actions.edit : currentUser?.role !== "Auditor";
  const canDelete = permissions ? permissions.actions.delete : currentUser?.role !== "Auditor";
  const isEmployee = currentUser?.role === "Employee";
  const isDeptHead = currentUser?.role === "Department Head";
  const managedDeptIds = isDeptHead
    ? getDepartmentHeadManagedDeptIds(currentUser, departments, employees)
    : [];

  const { showSuccess, showError } = useToast();

  // Firebase Storage Document Vault States
  const [storageFiles, setStorageFiles] = useState<StorageDocumentItem[]>([]);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageUploading, setStorageUploading] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storageSuccess, setStorageSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<StorageDocumentItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Associations States (sync with App.tsx prop if provided)
  const [localAssociations, setLocalAssociations] = useState<DriveAssociation[]>(() => {
    if (driveAssociations) return driveAssociations;
    try {
      const saved = localStorage.getItem("drive_associations");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const associations = driveAssociations ?? localAssociations;

  const [associatingFile, setAssociatingFile] = useState<StorageDocumentItem | null>(null);
  const [assocTargetType, setAssocTargetType] = useState<"Employee" | "Department">("Employee");
  const [assocTargetId, setAssocTargetId] = useState("");
  const [assocCategory, setAssocCategory] = useState<ESSDocumentCategory>("Other Personal HR Document");
  const [assocError, setAssocError] = useState("");
  const [confirmRemoveAssoc, setConfirmRemoveAssoc] = useState<DriveAssociation | null>(null);

  const loadStorageDocuments = async () => {
    if (isEmployee) {
      // Employees only view documents explicitly linked to their own Employee ID
      setStorageFiles([]);
      setStorageLoading(false);
      return;
    }
    setStorageLoading(true);
    setStorageError(null);
    try {
      const items = await listStorageFolderFiles("documents");
      setStorageFiles(items);
    } catch (err: any) {
      setStorageError(err?.message || "Could not load Firebase Storage documents.");
    } finally {
      setStorageLoading(false);
    }
  };

  useEffect(() => {
    loadStorageDocuments();
  }, [isEmployee]);

  const saveAssociations = (newAssocs: DriveAssociation[]) => {
    setLocalAssociations(newAssocs);
    if (onUpdateDriveAssociations) {
      onUpdateDriveAssociations(newAssocs);
    }
    try {
      localStorage.setItem("drive_associations", JSON.stringify(newAssocs));
    } catch {
      // Ignore quota errors
    }
  };

  const handleStorageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isEmployee || !canCreate) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setStorageError(null);
    setStorageSuccess(null);

    const fileCheck = validateDocumentUpload(file, { maxSizeMB: 10 });
    if (!fileCheck.valid) {
      const msg = fileCheck.error || "Invalid document file.";
      setStorageError(msg);
      showError(msg, "File Validation Failed");
      e.target.value = "";
      return;
    }

    setStorageUploading(true);
    try {
      await uploadFileToStorage("documents", file);
      onLogAction("DocumentVault", "Storage Upload", file.name, "Uploaded HR document to Firebase Storage (documents/)");
      const okMsg = `Uploaded '${file.name}' to document vault.`;
      setStorageSuccess(okMsg);
      showSuccess(okMsg);
      await loadStorageDocuments();
    } catch (err: any) {
      const errMsg = err?.message || "Failed to upload document to cloud storage.";
      setStorageError(errMsg);
      showError(errMsg, "Upload Failed");
    } finally {
      setStorageUploading(false);
      e.target.value = "";
    }
  };

  const handleConfirmDeleteFile = async () => {
    if (!confirmDeleteFile || isDeleting || isEmployee || !canDelete) return;
    const item = confirmDeleteFile;
    setIsDeleting(true);
    setStorageError(null);
    setStorageSuccess(null);
    try {
      await deleteFileFromStorage(item.fullPath);
      const removedAssocs = associations.filter((a) => a.fileId === item.fullPath);
      const updatedAssoc = associations.filter((a) => a.fileId !== item.fullPath);
      saveAssociations(updatedAssoc);
      removedAssocs.forEach((a) => deleteRecordFromFirestore("drive_associations", a.id));
      onLogAction("DocumentVault", "Storage Delete", item.name, "Deleted HR document from Firebase Storage");
      setStorageFiles((prev) => prev.filter((f) => f.fullPath !== item.fullPath));
      const msg = `Deleted '${item.name}' from document vault.`;
      setStorageSuccess(msg);
      showSuccess(msg);
      setConfirmDeleteFile(null);
    } catch (err: any) {
      const errMsg = err?.message || "Failed to delete document from cloud storage.";
      setStorageError(errMsg);
      showError(errMsg);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateAssociation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!associatingFile || isEmployee || !canEdit) return;
    if (!assocTargetId) {
      const errMsg = `Please select a target ${assocTargetType.toLowerCase()} to link this document.`;
      setAssocError(errMsg);
      focusFirstInvalidField({ assocTargetId: errMsg });
      return;
    }
    setAssocError("");

    const targetEmp =
      assocTargetType === "Employee"
        ? employees.find((emp) => emp.employeeId === assocTargetId)
        : undefined;
    const targetName =
      assocTargetType === "Employee"
        ? targetEmp?.fullName || "Unknown Employee"
        : departments.find((dept) => dept.id === assocTargetId)?.name || "Unknown Department";

    const linkedUser =
      assocTargetType === "Employee"
        ? users.find(
            (u) =>
              u.employeeId === assocTargetId ||
              (targetEmp && u.email.trim().toLowerCase() === targetEmp.email.trim().toLowerCase())
          )
        : undefined;

    const newAssoc: DriveAssociation = {
      id: `ASSOC_${Date.now()}`,
      fileId: associatingFile.fullPath,
      fileName: associatingFile.name,
      mimeType: associatingFile.contentType,
      webViewLink: associatingFile.url,
      targetType: assocTargetType,
      targetId: assocTargetId,
      documentCategory: assocTargetType === "Employee" ? assocCategory : undefined,
      ownerUid: linkedUser?.id,
      associatedBy: currentUser?.email || "Unknown",
      associatedDate: new Date().toLocaleDateString("en-US"),
    };

    const updated = [newAssoc, ...associations];
    saveAssociations(updated);
    syncRecordToFirestore("drive_associations", newAssoc.id, newAssoc);

    onLogAction(
      "DocumentVault",
      "Associate Document",
      associatingFile.name,
      `Linked document (${assocTargetType === "Employee" ? assocCategory : "Department"}) to ${targetName} (ID: ${assocTargetId})`
    );

    showSuccess(`Linked "${associatingFile.name}" to ${targetName}.`);
    setAssociatingFile(null);
    setAssocTargetId("");
  };

  const handleConfirmRemoveAssociation = () => {
    if (!confirmRemoveAssoc || isEmployee || !canDelete) return;
    const target = confirmRemoveAssoc;
    setConfirmRemoveAssoc(null);

    const updated = associations.filter((assoc) => assoc.id !== target.id);
    saveAssociations(updated);
    deleteRecordFromFirestore("drive_associations", target.id);
    onLogAction("DocumentVault", "Remove Association", target.fileName, "Removed internal link to system entity");
    showSuccess(`Removed document link for "${target.fileName}".`);
  };

  const formatBytes = (bytes?: number) => {
    if (bytes === undefined || isNaN(bytes)) return "N/A";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const visibleAssociations = associations.filter((assoc) => {
    if (isEmployee) {
      return Boolean(
        currentUser?.employeeId &&
          assoc.targetType === "Employee" &&
          assoc.targetId === currentUser.employeeId
      );
    }
    if (isDeptHead && managedDeptIds.length > 0) {
      if (assoc.targetType === "Department") return managedDeptIds.includes(assoc.targetId);
      const empObj = employees.find((e) => e.employeeId === assoc.targetId);
      return empObj ? managedDeptIds.includes(empObj.departmentId) : false;
    }
    return true;
  });

  const filteredStorageFiles = isEmployee
    ? []
    : storageFiles.filter(
        (item) => !searchQuery.trim() || item.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
      );

  return (
    <div className="space-y-6">
      {/* SECTION HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-sky-50 rounded text-sky-600">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h1 className="text-lg font-bold text-slate-800">HR Document Vault</h1>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Manage, store, and link personnel contracts, appointment letters, and company policies securely in Firebase Cloud Storage.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 border p-2 px-3 rounded-lg">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-emerald-700">Firebase Storage Active</span>
            <span className="text-[10px] font-mono text-slate-500">hrms-main-2d0ac.firebasestorage.app</span>
          </div>
        </div>
      </div>

      {storageError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-xl flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Storage Operation Notice</p>
            <p className="mt-0.5 text-[11px] font-normal">{storageError}</p>
          </div>
        </div>
      )}

      {storageSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-start gap-2.5">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <p className="text-[11px] font-semibold">{storageSuccess}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* FIREBASE STORAGE REPOSITORY CANVAS */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            {/* TOP CONTROLS */}
            <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-3 justify-between items-center bg-slate-50/50">
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search vault documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 border rounded-lg text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                {canCreate && !isEmployee && (
                  <label className="flex items-center gap-1.5 p-1.5 px-3 bg-primary-custom hover:opacity-95 text-white rounded-lg text-xs font-bold cursor-pointer transition-all shadow-2xs">
                    <Upload className="h-3.5 w-3.5 text-accent-custom" />
                    <span>{storageUploading ? "Uploading..." : "Upload HR Document"}</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={handleStorageUpload}
                      disabled={storageUploading}
                    />
                  </label>
                )}

                {!isEmployee && (
                  <button
                    type="button"
                    onClick={loadStorageDocuments}
                    className="p-1.5 bg-white hover:bg-slate-50 border rounded-lg text-slate-600"
                    title="Reload repository"
                  >
                    <RefreshCw className={`h-4 w-4 ${storageLoading ? "animate-spin" : ""}`} />
                  </button>
                )}
              </div>
            </div>

            {/* BREADCRUMB */}
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
              <span className="text-slate-400">Firebase Storage</span>
              <span>/</span>
              <span className="text-slate-700 font-bold bg-slate-100 p-0.5 px-2 rounded">
                {isEmployee ? "personal-documents" : "documents"}
              </span>
            </div>

            {/* FILES VIEW */}
            <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
              {storageLoading ? (
                <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="h-6 w-6 animate-spin text-sky-500" />
                  <span className="text-xs font-bold uppercase tracking-wider">Loading repository...</span>
                </div>
              ) : filteredStorageFiles.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <FileText className="h-10 w-10 mx-auto text-slate-300 stroke-1 mb-2" />
                  <span className="text-xs font-semibold block">No documents found in Firebase Storage.</span>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    {canCreate && !isEmployee
                      ? "Use Upload HR Document to store policies, contracts, and personnel forms."
                      : "Documents linked to your profile appear under Linked Documents."}
                  </span>
                </div>
              ) : (
                filteredStorageFiles.map((item) => (
                  <div
                    key={item.fullPath}
                    className="p-3.5 hover:bg-slate-50 flex items-center justify-between gap-4 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <FileText className="h-5 w-5 text-primary-custom shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-slate-800 block truncate">
                          {item.name}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5 font-medium">
                          <span>{formatBytes(item.size)}</span>
                          <span>•</span>
                          <span>{item.updated ? new Date(item.updated).toLocaleDateString() : "Stored"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 bg-white border rounded flex items-center gap-1 transition-all"
                        title="Open / Download Document"
                      >
                        <Download className="h-3 w-3" /> Open
                      </a>

                      {canEdit && !isEmployee && (
                        <button
                          type="button"
                          onClick={() => setAssociatingFile(item)}
                          className="p-1 px-2 text-[10px] font-bold text-sky-600 hover:text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded flex items-center gap-1 transition-all"
                          title="Link file to Employee/Department"
                        >
                          <LinkIcon className="h-3 w-3" /> Link
                        </button>
                      )}

                      {canDelete && !isEmployee && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteFile(item)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 bg-white border rounded hover:shadow-2xs transition-all"
                          title="Delete permanently"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ASSOCIATION DRAWER MODAL */}
          {associatingFile && !isEmployee && (
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-5 shadow-2xs space-y-4">
              <div className="flex justify-between items-start">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-black text-sky-600 tracking-wider">Internal Association Panel</span>
                  <h3 className="text-xs font-extrabold text-slate-800">
                    Link: <span className="font-bold text-slate-600">"{associatingFile.name}"</span>
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setAssociatingFile(null)}
                  className="text-xs font-semibold text-slate-400 hover:text-slate-600 px-2 py-0.5 rounded border bg-white"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleCreateAssociation} noValidate className="grid grid-cols-1 md:grid-cols-4 gap-3 items-start">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Target Entity Type</label>
                  <select
                    value={assocTargetType}
                    onChange={(e) => {
                      setAssocTargetType(e.target.value as any);
                      setAssocTargetId("");
                      setAssocError("");
                    }}
                    className="w-full text-xs p-1.5 border rounded bg-white text-slate-800"
                  >
                    <option value="Employee">Employee Record</option>
                    <option value="Department">Department Vault</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Select Specific Entity <span className="text-rose-500">*</span></label>
                  <select
                    data-field="assocTargetId"
                    value={assocTargetId}
                    onChange={(e) => {
                      setAssocTargetId(e.target.value);
                      if (assocError) setAssocError("");
                    }}
                    className={fieldInputClass(Boolean(assocError), "w-full text-xs p-1.5 border rounded bg-white text-slate-800")}
                  >
                    <option value="">-- Choose Target --</option>
                    {assocTargetType === "Employee"
                      ? employees.map((emp) => (
                          <option key={emp.employeeId} value={emp.employeeId}>
                            {emp.fullName} ({emp.position})
                          </option>
                        ))
                      : departments.map((dept) => (
                          <option key={dept.id} value={dept.id}>
                            {dept.name} ({dept.code})
                          </option>
                        ))}
                  </select>
                  <FormFieldError error={assocError} />
                </div>

                {assocTargetType === "Employee" && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Document Category</label>
                    <select
                      value={assocCategory}
                      onChange={(e) => setAssocCategory(e.target.value as ESSDocumentCategory)}
                      className="w-full text-xs p-1.5 border rounded bg-white text-slate-800"
                    >
                      {ESS_DOCUMENT_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="md:pt-5">
                  <button
                    type="submit"
                    className="w-full py-2 px-4 bg-sky-600 hover:bg-sky-700 text-white rounded font-bold text-xs flex items-center justify-center gap-1 transition-all shadow-2xs"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Establish Link
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* ACTIVE ASSOCIATIONS LIST */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
            <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <LinkIcon className="h-4 w-4 text-sky-500" /> Linked Documents ({visibleAssociations.length})
            </h2>

            <div className="space-y-3 max-h-[460px] overflow-y-auto">
              {visibleAssociations.length === 0 ? (
                <div className="text-center p-8 text-slate-400">
                  <LinkIcon className="h-8 w-8 mx-auto text-slate-200 mb-1.5 stroke-1" />
                  <p className="text-[11px] font-semibold">No active file associations</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {isEmployee
                      ? "Personal HR documents linked by Human Resources will appear here."
                      : 'Use the "Link" action on any stored file to map it to an employee or department.'}
                  </p>
                </div>
              ) : (
                visibleAssociations.map((assoc) => {
                  const employeeObj = employees.find((e) => e.employeeId === assoc.targetId);
                  const departmentObj = departments.find((d) => d.id === assoc.targetId);
                  const label =
                    assoc.targetType === "Employee"
                      ? employeeObj?.fullName || "Employee Record"
                      : departmentObj?.name || "Department Vault";

                  return (
                    <div key={assoc.id} className="p-3 bg-slate-50 border rounded-lg space-y-2 hover:border-slate-300 transition-all">
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-[10px] font-bold text-slate-700 truncate block max-w-[175px]" title={assoc.fileName}>
                          {assoc.fileName}
                        </span>
                        {canDelete && !isEmployee && (
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveAssoc(assoc)}
                            className="text-slate-400 hover:text-rose-600"
                            title="Remove link"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {assoc.documentCategory && (
                        <span className="inline-block px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 text-[9px] font-bold">
                          {assoc.documentCategory}
                        </span>
                      )}

                      <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[10px]">
                        <span className="font-bold uppercase tracking-wider flex items-center gap-1 text-[9px] text-slate-400">
                          {assoc.targetType === "Employee" ? (
                            <UserIcon className="h-3 w-3 text-sky-500" />
                          ) : (
                            <Landmark className="h-3 w-3 text-indigo-500" />
                          )}
                          {assoc.targetType} Link
                        </span>
                        <span className="font-bold text-slate-800">{label}</span>
                      </div>

                      <div className="flex justify-between items-center pt-1 text-[9px] text-slate-400">
                        <span>By: {assoc.associatedBy.split("@")[0]}</span>
                        {assoc.webViewLink && (
                          <a
                            href={assoc.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-600 hover:underline flex items-center gap-0.5 font-bold"
                          >
                            Open Document <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={Boolean(confirmDeleteFile)}
        title="Confirm Document Deletion"
        message={
          confirmDeleteFile ? (
            <>
              Permanently delete <strong>{confirmDeleteFile.name}</strong> from Firebase Cloud Storage and remove any linked associations? This cannot be undone.
            </>
          ) : null
        }
        confirmText="Confirm Delete"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleConfirmDeleteFile}
        onCancel={() => setConfirmDeleteFile(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(confirmRemoveAssoc)}
        title="Remove Document Link"
        message={
          confirmRemoveAssoc ? (
            <>
              Remove the association for <strong>{confirmRemoveAssoc.fileName}</strong>? The file itself remains in Firebase Storage.
            </>
          ) : null
        }
        confirmText="Remove Link"
        variant="warning"
        onConfirm={handleConfirmRemoveAssociation}
        onCancel={() => setConfirmRemoveAssoc(null)}
      />
    </div>
  );
}
