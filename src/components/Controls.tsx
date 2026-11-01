import React, { useMemo } from 'react';
import Papa from 'papaparse';
import { useAppStore } from '../Store';
import { Play, Pause, Square, Download, Trash2, CheckCircle2, ShieldAlert, AlertTriangle, Layers } from 'lucide-react';

export function Controls() {
  const {
    contacts,
    apiKeys,
    isProcessing,
    isPaused,
    startProcessing,
    pauseProcessing,
    resumeProcessing,
    stopProcessing,
    clearContacts,
    showToast,
  } = useAppStore();

  const total = contacts.length;
  if (total === 0) return null;

  const activeKey = apiKeys.find(k => k.status === 'active' || k.status === 'unchecked');

  const handleStart = () => {
    if (!activeKey) {
      showToast({
        type: 'error',
        title: 'No Active API Key',
        description: 'Please add a valid Apify API token in the sidebar before starting.',
      });
      return;
    }
    startProcessing();
  };

  // Single-pass computation for stats
  const { found, notFound, catchAll, unknownCount, noMx, processed, errors } = useMemo(() => {
    let f = 0;
    let nf = 0;
    let ca = 0;
    let unk = 0;
    let nm = 0;
    let proc = 0;
    let err = 0;

    for (let i = 0; i < contacts.length; i++) {
      const s = contacts[i].status;
      if (s === 'found') {
        f++;
        proc++;
      } else if (s === 'not_found') {
        nf++;
        proc++;
      } else if (s === 'catch_all') {
        ca++;
        proc++;
      } else if (s === 'unknown') {
        unk++;
        proc++;
      } else if (s === 'skipped_no_mx') {
        nm++;
        proc++;
      } else if (s === 'error') {
        err++;
        proc++;
      } else if (s === 'skipped_missing_info') {
        proc++;
      }
    }

    return {
      found: f,
      notFound: nf,
      catchAll: ca,
      unknownCount: unk,
      noMx: nm,
      processed: proc,
      errors: err,
    };
  }, [contacts]);

  const percentage = total > 0 ? (processed / total) * 100 : 0;

  const handleExport = (onlyFound: boolean) => {
    let toExport = contacts;
    if (onlyFound) {
      toExport = contacts.filter(c => c.status === 'found');
      if (toExport.length === 0) {
        showToast({
          type: 'info',
          title: 'No Deliverable Emails Found Yet',
          description: 'Wait for verification to complete or check more contacts.',
        });
        return;
      }
    }

    const exportData = toExport.map(c => ({
      ...c.originalData,
      VerifiedEmail: c.email,
      VerificationStatus: c.status,
      LastError: c.lastError || '',
    }));

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `veriflow_${onlyFound ? 'found_emails' : 'all_contacts'}_${Date.now()}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);

    showToast({
      type: 'success',
      title: 'Export Downloaded',
      description: `Saved ${toExport.length} contacts to CSV.`,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Top Bar: Progress & Micro-Stat Cards */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono tracking-tight text-slate-900 tabular-nums">
              {percentage.toFixed(1)}%
            </span>
            <span className="text-xs font-mono font-medium text-slate-500 uppercase tracking-wider">
              ({processed} / {total} processed)
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Sequential stop-on-match engine active with catch-all early bailout
          </div>
        </div>

        {/* Micro Stat Cards */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Found */}
          <div className="px-3 py-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/60 shadow-2xs">
            <div className="flex items-center gap-1.5 text-emerald-800 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span className="font-mono text-sm font-bold tabular-nums">{found}</span>
            </div>
            <div className="text-[10px] uppercase font-mono font-medium text-emerald-600/80">
              Deliverable
            </div>
          </div>

          {/* Catch All */}
          {catchAll > 0 && (
            <div className="px-3 py-1.5 rounded-xl border border-purple-200/80 bg-purple-50/60 shadow-2xs">
              <div className="flex items-center gap-1.5 text-purple-800 text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                <span className="font-mono text-sm font-bold tabular-nums">{catchAll}</span>
              </div>
              <div className="text-[10px] uppercase font-mono font-medium text-purple-600/80">
                Catch-All
              </div>
            </div>
          )}

          {/* Unknown Domain */}
          {unknownCount > 0 && (
            <div className="px-3 py-1.5 rounded-xl border border-amber-200/80 bg-amber-50/60 shadow-2xs">
              <div className="flex items-center gap-1.5 text-amber-800 text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                <span className="font-mono text-sm font-bold tabular-nums">{unknownCount}</span>
              </div>
              <div className="text-[10px] uppercase font-mono font-medium text-amber-700/80">
                Unknown
              </div>
            </div>
          )}

          {/* No MX */}
          {noMx > 0 && (
            <div className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 shadow-2xs">
              <div className="flex items-center gap-1.5 text-slate-700 text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                <span className="font-mono text-sm font-bold tabular-nums">{noMx}</span>
              </div>
              <div className="text-[10px] uppercase font-mono font-medium text-slate-500">
                No MX ($0)
              </div>
            </div>
          )}

          {/* Not Found */}
          <div className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
            <div className="flex items-center gap-1.5 text-slate-600 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
              <span className="font-mono text-sm font-bold tabular-nums">{notFound}</span>
            </div>
            <div className="text-[10px] uppercase font-mono font-medium text-slate-400">
              Not Found
            </div>
          </div>

          {/* Errors */}
          {errors > 0 && (
            <div className="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 shadow-2xs">
              <div className="flex items-center gap-1.5 text-rose-800 text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                <span className="font-mono text-sm font-bold tabular-nums">{errors}</span>
              </div>
              <div className="text-[10px] uppercase font-mono font-medium text-rose-600/80">
                Errors
              </div>
            </div>
          )}

          {/* Total Queue */}
          <div className="px-3 py-1.5 rounded-xl border border-blue-200/80 bg-blue-50/50 shadow-2xs">
            <div className="flex items-center gap-1.5 text-blue-800 text-xs font-semibold">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-mono text-sm font-bold tabular-nums">{total}</span>
            </div>
            <div className="text-[10px] uppercase font-mono font-medium text-blue-600/80">
              Total Queue
            </div>
          </div>
        </div>
      </div>

      {/* Modern Progress Bar */}
      <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner">
        <div
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-400 transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>

      {/* Action Button Strip */}
      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        {!isProcessing && !isPaused && (
          <button
            onClick={handleStart}
            disabled={processed === total}
            className="flex-1 min-w-[200px] flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 text-white py-2 px-5 rounded-xl font-semibold text-xs transition-all shadow-xs active:scale-[0.98] cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{processed === total ? 'ALL CONTACTS COMPLETED' : 'START VERIFICATION'}</span>
          </button>
        )}

        {isProcessing && (
          <button
            onClick={pauseProcessing}
            className="flex-1 min-w-[200px] flex items-center justify-center gap-2 bg-slate-900 hover:bg-black text-white py-2 px-5 rounded-xl font-semibold text-xs transition-all shadow-xs active:scale-[0.98] cursor-pointer"
          >
            <Pause className="w-3.5 h-3.5 fill-current" />
            <span>PAUSE ENGINE</span>
          </button>
        )}

        {isPaused && (
          <button
            onClick={resumeProcessing}
            className="flex-1 min-w-[200px] flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-5 rounded-xl font-semibold text-xs transition-all shadow-xs active:scale-[0.98] cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>RESUME QUEUE</span>
          </button>
        )}

        {(isProcessing || isPaused) && (
          <button
            onClick={stopProcessing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold transition-colors active:scale-[0.98] cursor-pointer"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>Stop & Reset</span>
          </button>
        )}

        <div className="h-5 w-px bg-slate-200 mx-1 hidden sm:block"></div>

        <button
          onClick={() => handleExport(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-800 text-xs font-semibold transition-all shadow-2xs active:scale-[0.98] cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-emerald-600" />
          <span>Export Deliverable ({found})</span>
        </button>

        <button
          onClick={() => handleExport(false)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition-all shadow-2xs active:scale-[0.98] cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-slate-500" />
          <span>Export All ({total})</span>
        </button>

        <button
          onClick={clearContacts}
          disabled={isProcessing}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 text-xs font-medium transition-colors ml-auto active:scale-[0.98] cursor-pointer"
          title="Clear queue and upload new file"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear List</span>
        </button>
      </div>
    </div>
  );
}
