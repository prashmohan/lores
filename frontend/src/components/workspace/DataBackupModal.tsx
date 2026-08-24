import React, { useState, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Database,
  Download,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  FileCode,
  Users,
  GitMerge,
  Heart,
  Network,
  BookOpen,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { ImportSummaryRead } from '../../types/api';

export interface DataBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceName: string;
  onImportSuccess?: () => void;
}

export const DataBackupModal: React.FC<DataBackupModalProps> = ({
  isOpen,
  onClose,
  workspaceId,
  workspaceName,
  onImportSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [exportingFormat, setExportingFormat] = useState<'gedcom' | 'json' | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummaryRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleResetImport = () => {
    setSelectedFile(null);
    setImportSummary(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExportGedcom = async () => {
    setExportingFormat('gedcom');
    setError(null);
    try {
      const blob = await api.dataExchange.exportGedcom(workspaceId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName =
        workspaceName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') || 'family-tree';
      a.download = `${safeName}-${new Date().toISOString().slice(0, 10)}.ged`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to export GEDCOM file.');
      }
    } finally {
      setExportingFormat(null);
    }
  };

  const handleExportJson = async () => {
    setExportingFormat('json');
    setError(null);
    try {
      const blob = await api.dataExchange.exportJson(workspaceId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName =
        workspaceName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') || 'family-tree';
      a.download = `${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to export JSON archive.');
      }
    } finally {
      setExportingFormat(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
      setError(null);
      setImportSummary(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      const name = droppedFile.name.toLowerCase();
      if (name.endsWith('.ged') || name.endsWith('.gedcom') || name.endsWith('.json')) {
        setSelectedFile(droppedFile);
        setError(null);
        setImportSummary(null);
      } else {
        setError('Please drop a valid .ged, .gedcom, or .json file.');
      }
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setImporting(true);
    setError(null);
    setImportSummary(null);

    try {
      let summary: ImportSummaryRead;
      if (selectedFile.name.toLowerCase().endsWith('.json')) {
        summary = await api.dataExchange.importJson(workspaceId, selectedFile);
      } else {
        summary = await api.dataExchange.importGedcom(workspaceId, selectedFile);
      }
      setImportSummary(summary);
      onImportSuccess?.();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to import tree data.');
      }
    } finally {
      setImporting(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 transition-opacity" />
        <Dialog.Content
          className="fixed bottom-0 sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl z-50 max-h-[85vh] sm:max-h-[90vh] flex flex-col border-2 border-slate-200 focus:outline-none"
          aria-describedby="data-backup-description"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800">
                <Database className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <Dialog.Title className="text-xl font-extrabold text-slate-900 leading-tight">
                  Data & Backup
                </Dialog.Title>
                <p id="data-backup-description" className="text-xs text-slate-600 font-medium">
                  Export and import family tree records for <strong className="text-slate-800">{workspaceName}</strong>.
                </p>
              </div>
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Close data backup dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Navigation Tabs */}
          <div className="pt-4 shrink-0">
            <div
              role="tablist"
              aria-label="Data and Backup tabs"
              className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl border border-slate-200"
            >
              <button
                id="tab-export"
                type="button"
                role="tab"
                aria-selected={activeTab === 'export'}
                aria-controls="tabpanel-export"
                onClick={() => {
                  setActiveTab('export');
                  setError(null);
                }}
                className={`flex-1 min-h-[44px] py-2.5 px-4 rounded-xl text-sm font-extrabold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  activeTab === 'export'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Export Family Tree</span>
              </button>

              <button
                id="tab-import"
                type="button"
                role="tab"
                aria-selected={activeTab === 'import'}
                aria-controls="tabpanel-import"
                onClick={() => {
                  setActiveTab('import');
                  setError(null);
                }}
                className={`flex-1 min-h-[44px] py-2.5 px-4 rounded-xl text-sm font-extrabold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  activeTab === 'import'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <UploadCloud className="w-4 h-4 stroke-[2.5]" />
                <span>Import Family Tree</span>
              </button>
            </div>
          </div>

          {/* Feedback error alert */}
          {error && (
            <div
              role="alert"
              className="mt-4 p-3.5 bg-red-50 border-2 border-red-200 rounded-2xl text-red-800 text-xs font-semibold flex items-center gap-2 shrink-0"
            >
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Tab Panels */}
          <div className="flex-1 overflow-y-auto py-4">
            {/* Export Tab Panel */}
            {activeTab === 'export' && (
              <div
                id="tabpanel-export"
                role="tabpanel"
                aria-labelledby="tab-export"
                className="space-y-4"
              >
                {/* Card 1: GEDCOM */}
                <div className="bg-white border-2 border-slate-200 rounded-2xl p-5 hover:border-amber-400 transition-colors shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-800 shrink-0 mt-0.5">
                        <FileText className="w-5 h-5 stroke-[2.5]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-extrabold text-slate-900 text-base">
                            GEDCOM 7.0 / 5.5.1
                          </h3>
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md">
                            .ged
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium mt-1">
                          Universal genealogy format compatible with GrampsWeb, Gramps, Ancestry, and FamilySearch.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleExportGedcom}
                      disabled={exportingFormat !== null}
                      className="min-h-[44px] px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shrink-0 self-end sm:self-center"
                    >
                      {exportingFormat === 'gedcom' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4 stroke-[2.5]" />
                      )}
                      <span>{exportingFormat === 'gedcom' ? 'Exporting...' : 'Download GEDCOM'}</span>
                    </button>
                  </div>
                </div>

                {/* Card 2: Lores JSON Archive */}
                <div className="bg-white border-2 border-slate-200 rounded-2xl p-5 hover:border-amber-400 transition-colors shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-800 shrink-0 mt-0.5">
                        <FileCode className="w-5 h-5 stroke-[2.5]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-extrabold text-slate-900 text-base">
                            Lores JSON Archive
                          </h3>
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-sky-900 bg-sky-100 border border-sky-300 px-2 py-0.5 rounded-md">
                            .json
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium mt-1">
                          Complete lossless archive including people, unions, rich lore stories, tags, and workspace metadata.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleExportJson}
                      disabled={exportingFormat !== null}
                      className="min-h-[44px] px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shrink-0 self-end sm:self-center"
                    >
                      {exportingFormat === 'json' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4 stroke-[2.5]" />
                      )}
                      <span>{exportingFormat === 'json' ? 'Exporting...' : 'Download JSON'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Import Tab Panel */}
            {activeTab === 'import' && (
              <div
                id="tabpanel-import"
                role="tabpanel"
                aria-labelledby="tab-import"
                className="space-y-4"
              >
                {/* If Import Summary exists, display results */}
                {importSummary ? (
                  <div className="space-y-4">
                    {/* Success Header Banner */}
                    <div
                      role="status"
                      className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-2xl flex items-center gap-3 text-emerald-950"
                    >
                      <div className="w-9 h-9 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-emerald-700 stroke-[2.5]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-extrabold text-sm text-emerald-950">
                          Import Completed Successfully
                        </h4>
                        <p className="text-xs text-emerald-800 font-medium mt-0.5">
                          File: <span className="font-bold">{importSummary.filename}</span> ({importSummary.format.toUpperCase()})
                        </p>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3.5 flex flex-col items-center text-center">
                        <Users className="w-4 h-4 text-amber-700 mb-1" />
                        <span className="text-2xl font-extrabold text-slate-900">
                          {importSummary.people_created}
                        </span>
                        <span className="text-xs font-bold text-slate-600 mt-0.5">
                          People Created
                        </span>
                      </div>

                      <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3.5 flex flex-col items-center text-center">
                        <GitMerge className="w-4 h-4 text-purple-700 mb-1" />
                        <span className="text-2xl font-extrabold text-slate-900">
                          {importSummary.people_merged}
                        </span>
                        <span className="text-xs font-bold text-slate-600 mt-0.5">
                          People Merged
                        </span>
                      </div>

                      <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3.5 flex flex-col items-center text-center">
                        <Heart className="w-4 h-4 text-rose-700 mb-1" />
                        <span className="text-2xl font-extrabold text-slate-900">
                          {importSummary.unions_created}
                        </span>
                        <span className="text-xs font-bold text-slate-600 mt-0.5">
                          Unions Created
                        </span>
                      </div>

                      <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3.5 flex flex-col items-center text-center">
                        <Network className="w-4 h-4 text-sky-700 mb-1" />
                        <span className="text-2xl font-extrabold text-slate-900">
                          {importSummary.children_linked}
                        </span>
                        <span className="text-xs font-bold text-slate-600 mt-0.5">
                          Children Linked
                        </span>
                      </div>

                      <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3.5 flex flex-col items-center text-center col-span-2 sm:col-span-1">
                        <BookOpen className="w-4 h-4 text-emerald-700 mb-1" />
                        <span className="text-2xl font-extrabold text-slate-900">
                          {importSummary.lore_notes_created}
                        </span>
                        <span className="text-xs font-bold text-slate-600 mt-0.5">
                          Lore Stories Added
                        </span>
                      </div>
                    </div>

                    {/* Warnings list if any */}
                    {importSummary.warnings && importSummary.warnings.length > 0 && (
                      <div className="p-3.5 bg-amber-50 border-2 border-amber-200 rounded-2xl space-y-1.5">
                        <div className="flex items-center gap-1.5 text-amber-900 text-xs font-bold">
                          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                          <span>Warnings during import:</span>
                        </div>
                        <ul className="list-disc list-inside text-xs text-amber-800 space-y-0.5">
                          {importSummary.warnings.map((warn, index) => (
                            <li key={index}>{warn}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={handleResetImport}
                        className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                      >
                        Import Another File
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleImportSubmit} className="space-y-4">
                    {/* Drag and Drop Zone */}
                    <div
                      role="region"
                      aria-label="File upload dropzone"
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                        isDragging
                          ? 'border-amber-500 bg-amber-50/50 scale-[0.99]'
                          : 'border-slate-300 bg-slate-50/50 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        id="tree-file-upload"
                        type="file"
                        accept=".ged,.gedcom,.json"
                        onChange={handleFileChange}
                        className="sr-only"
                      />

                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800">
                          <UploadCloud className="w-6 h-6 stroke-[2.5]" />
                        </div>

                        <div>
                          <p className="text-sm font-extrabold text-slate-900">
                            Drag & drop a GEDCOM (.ged) or Lores Archive (.json)
                          </p>
                          <p className="text-xs text-slate-500 font-medium mt-0.5">
                            or click below to choose a file from your computer
                          </p>
                        </div>

                        <label
                          htmlFor="tree-file-upload"
                          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border-2 border-slate-300 text-slate-800 font-bold text-xs hover:bg-slate-100 shadow-xs transition-colors cursor-pointer"
                        >
                          Browse Files
                        </label>
                      </div>
                    </div>

                    {/* Selected File Feedback */}
                    {selectedFile && (
                      <div className="p-3.5 bg-slate-50 border-2 border-slate-200 rounded-2xl flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 shrink-0 font-bold text-xs">
                            {selectedFile.name.toLowerCase().endsWith('.json') ? 'JSON' : 'GED'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold text-slate-900 truncate">
                              {selectedFile.name}
                            </p>
                            <p className="text-[11px] text-slate-500 font-medium">
                              {formatFileSize(selectedFile.size)}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFile(null);
                            if (fileInputRef.current) {
                              fileInputRef.current.value = '';
                            }
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                          aria-label="Remove selected file"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Import Submit Button */}
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={!selectedFile || importing}
                        className="w-full min-h-[44px] px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm rounded-xl shadow transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                      >
                        {importing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <UploadCloud className="w-4 h-4 stroke-[2.5]" />
                        )}
                        <span>{importing ? 'Importing tree records...' : 'Upload & Import Tree'}</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-200 flex justify-end shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-6 py-2.5 rounded-xl border-2 border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition-colors cursor-pointer text-sm flex items-center justify-center"
            >
              Done
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
