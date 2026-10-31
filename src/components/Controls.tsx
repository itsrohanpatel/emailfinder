import React, { useMemo } from 'react';
import Papa from 'papaparse';
import { useAppStore } from '../Store';

export function Controls() {
  const {
    contacts,
    isProcessing,
    isPaused,
    startProcessing,
    pauseProcessing,
    resumeProcessing,
    stopProcessing,
    clearContacts,
  } = useAppStore();

  const total = contacts.length;
  if (total === 0) return null;

  // Single-pass computation for stats
  const { found, notFound, catchAll, noMx, processed, errors } = useMemo(() => {
    let f = 0;
    let nf = 0;
    let ca = 0;
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

    return { found: f, notFound: nf, catchAll: ca, noMx: nm, processed: proc, errors: err };
  }, [contacts]);

  const percentage = total > 0 ? (processed / total) * 100 : 0;

  const handleExport = (onlyFound: boolean) => {
    let toExport = contacts;
    if (onlyFound) {
      toExport = contacts.filter(c => c.status === 'found');
      if (toExport.length === 0) {
        alert('No verified deliverable emails found to export yet.');
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
  };

  return (
    <>
      <div className="flex items-end justify-between mb-4 flex-wrap gap-4">
        <div>
          <div className="text-3xl font-light text-slate-900 tracking-tighter">
            {percentage.toFixed(1)}
            <span className="text-slate-400 text-xl font-normal">%</span>
          </div>
          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-0.5">
            Progress ({processed} of {total} contacts)
          </div>
        </div>

        <div className="flex gap-4 items-center flex-wrap">
          <div className="text-right">
            <div className="text-xl font-mono text-emerald-600 font-bold">{found}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Found</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-mono text-slate-400 font-bold">{notFound}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Not Found</div>
          </div>
          {catchAll > 0 && (
            <div className="text-right">
              <div className="text-xl font-mono text-purple-600 font-bold">{catchAll}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Catch-All</div>
            </div>
          )}
          {noMx > 0 && (
            <div className="text-right">
              <div className="text-xl font-mono text-slate-500 font-bold">{noMx}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">No MX</div>
            </div>
          )}
          {errors > 0 && (
            <div className="text-right">
              <div className="text-xl font-mono text-red-500 font-bold">{errors}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Errors</div>
            </div>
          )}
          <div className="text-right border-l pl-4 border-slate-200">
            <div className="text-xl font-mono text-blue-600 font-bold">{total}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Total Rows</div>
          </div>
        </div>
      </div>

      <div className="relative h-2.5 bg-slate-100 rounded-full overflow-hidden mb-4 shadow-inner">
        <div
          className="absolute top-0 left-0 h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!isProcessing && !isPaused && (
          <button
            onClick={startProcessing}
            disabled={processed === total}
            className="flex-1 bg-blue-600 disabled:opacity-40 text-white py-2 px-4 rounded font-semibold text-xs hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
          >
            {processed === total ? 'ALL CONTACTS PROCESSED' : 'START VERIFICATION'}
          </button>
        )}
        {isProcessing && (
          <button
            onClick={pauseProcessing}
            className="flex-1 bg-slate-900 text-white py-2 px-4 rounded font-semibold text-xs hover:bg-black transition-colors cursor-pointer"
          >
            PAUSE
          </button>
        )}
        {isPaused && (
          <button
            onClick={resumeProcessing}
            className="flex-1 bg-emerald-600 text-white py-2 px-4 rounded font-semibold text-xs hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer"
          >
            RESUME
          </button>
        )}

        {(isProcessing || isPaused) && (
          <button
            onClick={stopProcessing}
            className="px-4 border border-slate-200 text-red-600 py-2 rounded font-semibold text-xs hover:bg-red-50 transition-colors cursor-pointer"
          >
            STOP & RESET
          </button>
        )}

        <button
          onClick={() => handleExport(false)}
          className="px-4 border border-slate-200 text-slate-700 py-2 rounded font-semibold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
        >
          EXPORT ALL
        </button>
        <button
          onClick={() => handleExport(true)}
          className="px-4 bg-emerald-50 border border-emerald-200 text-emerald-800 py-2 rounded font-semibold text-xs hover:bg-emerald-100 transition-colors cursor-pointer"
        >
          EXPORT FOUND ({found})
        </button>
        <button
          onClick={clearContacts}
          disabled={isProcessing}
          className="px-3 text-slate-400 hover:text-red-500 disabled:opacity-30 text-xs font-semibold py-2 transition-colors ml-auto cursor-pointer"
          title="Clear queue and upload new file"
        >
          Clear List
        </button>
      </div>
    </>
  );
}
