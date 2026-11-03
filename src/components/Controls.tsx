import React, { useState, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import { useAppStore } from '../Store';
import {
  Play,
  Pause,
  Square,
  Download,
  Trash2,
  CheckCircle2,
  ShieldAlert,
  AlertTriangle,
  Layers,
  Cloud,
  Cpu,
  Zap,
  X,
  ShieldCheck,
  Check,
} from 'lucide-react';

export function Controls() {
  const {
    contacts,
    apiKeys,
    settings,
    setSettings,
    isProcessing,
    isPaused,
    isCloudRunning,
    startProcessing,
    pauseProcessing,
    resumeProcessing,
    stopProcessing,
    startCloudSync,
    stopCloudSync,
    clearContacts,
    getPreFlightEstimate,
    showToast,
  } = useAppStore();

  const [showPreFlight, setShowPreFlight] = useState(false);
  const [isDispatchingCloud, setIsDispatchingCloud] = useState(false);
  const [githubRepoInput, setGithubRepoInput] = useState(settings.githubRepo || '');
  const [githubTokenInput, setGithubTokenInput] = useState(settings.githubToken || '');

  useEffect(() => {
    if (settings.githubRepo) setGithubRepoInput(settings.githubRepo);
    if (settings.githubToken) setGithubTokenInput(settings.githubToken);
  }, [settings.githubRepo, settings.githubToken]);

  const total = contacts.length;
  if (total === 0) return null;

  const activeKey = apiKeys.find(k => k.status === 'active' || k.status === 'unchecked');

  const handleStartClick = () => {
    if (!activeKey) {
      showToast({
        type: 'error',
        title: 'No Active API Key',
        description: 'Please add a valid Apify API token in the sidebar before starting.',
      });
      return;
    }

    const estimate = getPreFlightEstimate();
    // For lists with >10 pending contacts, show Pre-Flight Budget Guard
    if (estimate.totalContacts > 10) {
      setShowPreFlight(true);
    } else {
      startProcessing();
    }
  };

  const handleConfirmLocalLaunch = () => {
    setShowPreFlight(false);
    startProcessing();
  };

  const handleConfirmCloudLaunch = async () => {
    const cleanRepo = githubRepoInput
      .trim()
      .replace(/^https?:\/\/github\.com\//i, '')
      .replace(/^git@github\.com:/i, '')
      .replace(/\.git$/i, '')
      .replace(/^\/+|\/+$/g, '');

    if (!githubTokenInput.trim() || !cleanRepo) {
      showToast({
        type: 'error',
        title: 'Missing GitHub Configuration',
        description: 'Please provide both your GitHub Token and Repository (owner/repo).',
      });
      return;
    }

    const activeTokens = apiKeys
      .filter(k => k.status === 'active' || k.status === 'unchecked')
      .map(k => k.token);

    if (activeTokens.length === 0) {
      showToast({
        type: 'error',
        title: 'No Active Apify API Key',
        description: 'Please add your Apify API Token (starts with apify_api_...) in the left sidebar under API Keys so GitHub Actions can verify emails.',
      });
      return;
    }

    const pendingContacts = contacts.filter(c => c.status === 'pending');
    if (pendingContacts.length === 0) {
      showToast({
        type: 'error',
        title: 'No Pending Contacts',
        description: 'There are no pending contacts left to verify in this list.',
      });
      return;
    }

    // Save tokens in settings
    setSettings(s => ({
      ...s,
      githubRepo: cleanRepo,
      githubToken: githubTokenInput.trim(),
      executionTarget: 'github_cloud',
    }));

    setIsDispatchingCloud(true);

    try {
      let datasetId = '';
      let resultsDatasetId = '';
      const primaryKey = activeTokens[0];

      // Always stage contacts via Apify Dataset to completely bypass GitHub Actions 64KB input limit
      showToast({
        type: 'info',
        title: 'Staging Cloud Job',
        description: `Uploading ${pendingContacts.length} contacts to high-speed Apify cloud runner...`,
      });

      try {
        const dsRes = await fetch(`https://api.apify.com/v2/datasets?token=${primaryKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: `veriflow-job-${Date.now()}` }),
        });
        const dsData = await dsRes.json();
        datasetId = dsData?.data?.id || '';

        // Create a dedicated dataset for bi-directional real-time browser streaming
        const resDsRes = await fetch(`https://api.apify.com/v2/datasets?token=${primaryKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: `veriflow-results-${Date.now()}` }),
        });
        const resDsData = await resDsRes.json();
        resultsDatasetId = resDsData?.data?.id || '';

        if (datasetId) {
          // Upload in chunks of 500 contacts
          const CHUNK_SIZE = 500;
          for (let i = 0; i < pendingContacts.length; i += CHUNK_SIZE) {
            const chunk = pendingContacts.slice(i, i + CHUNK_SIZE);
            await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${primaryKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(chunk),
            });
          }
        }
      } catch (dsErr) {
        console.warn('Dataset staging error:', dsErr);
      }

      const rawJson = JSON.stringify(pendingContacts);
      const safeContactsJson = datasetId ? '[]' : (rawJson.length < 50000 ? rawJson : '[]');

      if (!datasetId && rawJson.length >= 50000) {
        throw new Error('Contacts list exceeds GitHub Actions input size limit (64KB) and dataset creation failed.');
      }

      const res = await fetch(
        `https://api.github.com/repos/${cleanRepo}/actions/workflows/verify.yml/dispatches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${githubTokenInput.trim()}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              contacts_json: safeContactsJson,
              dataset_id: datasetId,
              results_dataset_id: resultsDatasetId,
              apify_keys: activeTokens.join(';'),
              pattern_mode: settings.patternMode,
              key_strategy: settings.keyStrategy,
              enable_role_fallback: String(settings.enableRoleFallback !== false),
              threads_per_account: String(settings.threadsPerAccount || 4),
            },
          }),
        }
      );

      setIsDispatchingCloud(false);
      setShowPreFlight(false);

      if (res.status === 204) {
        if (resultsDatasetId) {
          startCloudSync(resultsDatasetId, pendingContacts.length, primaryKey);
        }
        showToast({
          type: 'success',
          title: 'GitHub Cloud Runner Live!',
          description: 'Streaming real-time results directly to your browser. You can also safely close this tab anytime.',
        });
      } else {
        const text = await res.text().catch(() => '');
        let errDesc = '';
        try {
          const data = JSON.parse(text);
          errDesc = data?.message || text;
        } catch {
          errDesc = text;
        }
        showToast({
          type: 'error',
          title: `GitHub Dispatch Failed (${res.status})`,
          description: errDesc || 'Check repo name and workflow token permissions.',
        });
      }
    } catch (err: any) {
      setIsDispatchingCloud(false);
      showToast({
        type: 'error',
        title: 'Dispatch Error',
        description: err?.message || 'Failed connecting to GitHub API.',
      });
    }
  };

  const estimate = useMemo(() => getPreFlightEstimate(), [getPreFlightEstimate, contacts, apiKeys, settings]);

  // Single-pass computation for stats
  const { found, roleFound, notFound, catchAll, unknownCount, noMx, processed, errors } = useMemo(() => {
    let f = 0;
    let rf = 0;
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
      } else if (s === 'found_role_fallback') {
        rf++;
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
      roleFound: rf,
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
      toExport = contacts.filter(c => c.status === 'found' || c.status === 'found_role_fallback');
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

          {/* Role / HR Fallback */}
          {roleFound > 0 && (
            <div className="px-3 py-1.5 rounded-xl border border-indigo-200/80 bg-indigo-50/60 shadow-2xs">
              <div className="flex items-center gap-1.5 text-indigo-800 text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                <span className="font-mono text-sm font-bold tabular-nums">{roleFound}</span>
              </div>
              <div className="text-[10px] uppercase font-mono font-medium text-indigo-600/80">
                HR / Careers
              </div>
            </div>
          )}

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

      {/* Cloud Runner Active Live Banner */}
      {isCloudRunning && (
        <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-sky-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <span>GitHub Actions Cloud Runner Active</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-[10px] text-emerald-700 font-mono font-medium uppercase tracking-wider">● Streaming Live</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Streaming verified contacts live into your table. You can safely keep this tab open or close it anytime.
              </div>
            </div>
          </div>
          <button
            onClick={stopCloudSync}
            className="text-xs font-mono font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs hover:bg-slate-50 cursor-pointer"
          >
            Disconnect Stream
          </button>
        </div>
      )}

      {/* Action Button Strip */}
      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        {!isProcessing && !isPaused && (
          <button
            onClick={handleStartClick}
            disabled={processed === total || isCloudRunning}
            className="flex-1 min-w-[200px] flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 text-white py-2 px-5 rounded-xl font-semibold text-xs transition-all shadow-xs active:scale-[0.98] cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>
              {isCloudRunning
                ? 'CLOUD RUNNING (STREAMING LIVE)'
                : processed === total
                ? 'ALL CONTACTS COMPLETED'
                : 'START VERIFICATION'}
            </span>
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
          <span>Export Deliverable ({found + roleFound})</span>
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

      {/* Pre-Flight Cost & Quota Guard Modal */}
      {showPreFlight && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xl max-w-lg w-full overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Pre-Flight Budget & Routing Guard
                </h3>
              </div>
              <button
                onClick={() => setShowPreFlight(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Stat Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                  <div className="text-[10px] uppercase font-mono text-slate-400 font-semibold">Pending Leads</div>
                  <div className="font-mono text-lg font-bold text-slate-900 mt-0.5">{estimate.totalContacts}</div>
                </div>

                <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-xl">
                  <div className="text-[10px] uppercase font-mono text-blue-600 font-semibold">Expected Cost</div>
                  <div className="font-mono text-lg font-bold text-blue-900 mt-0.5">${estimate.expectedCostUsd}</div>
                  <div className="text-[9px] text-blue-500 font-mono">~$0.0018/lead</div>
                </div>

                <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-xl">
                  <div className="text-[10px] uppercase font-mono text-emerald-700 font-semibold">Key Credits</div>
                  <div className="font-mono text-lg font-bold text-emerald-900 mt-0.5">${estimate.availableCreditsUsd}</div>
                  <div className="text-[9px] text-emerald-600 font-mono">
                    {apiKeys.filter(k => k.status === 'active' || k.status === 'unchecked').length} active keys
                  </div>
                </div>
              </div>

              {/* Balance Assessment Banner */}
              {estimate.isSufficient ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-emerald-900">Sufficient API Balance Available</div>
                    <div className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">
                      Your configured Apify keys have ample balance (${estimate.availableCreditsUsd} USD) to complete all {estimate.totalContacts} leads.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-amber-900">Potential Balance Shortage (${estimate.shortageUsd} USD)</div>
                    <div className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                      You need ~${estimate.expectedCostUsd} USD. Please add {estimate.recommendedKeysToAdd} more free Apify key in the sidebar to guarantee all leads finish smoothly.
                    </div>
                  </div>
                </div>
              )}

              {/* Execution Target Selector */}
              <div className="border border-slate-200 rounded-xl p-3 bg-white">
                <div className="text-xs font-bold text-slate-800 mb-2 flex items-center justify-between">
                  <span>Execution Target</span>
                  <span className="text-[10px] font-mono font-medium text-slate-400">Where should workers run?</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, executionTarget: 'local' }))}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      settings.executionTarget === 'local'
                        ? 'bg-blue-50/60 border-blue-300 text-blue-900 shadow-2xs font-semibold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <Cpu className="w-3.5 h-3.5 text-blue-600" />
                      <span>Local Browser</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 leading-tight font-normal">
                      Runs directly in this tab. Fast, zero setup required.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, executionTarget: 'github_cloud' }))}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      settings.executionTarget === 'github_cloud'
                        ? 'bg-indigo-50/60 border-indigo-300 text-indigo-900 shadow-2xs font-semibold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <Cloud className="w-3.5 h-3.5 text-indigo-600" />
                      <span>GitHub Actions Cloud</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 leading-tight font-normal">
                      Runs on gigabit cloud runner. Laptop can close anytime.
                    </div>
                  </button>
                </div>

                {settings.executionTarget === 'github_cloud' && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                    <div>
                      <label className="block text-[10px] font-mono text-slate-500 mb-1">GitHub Repo (owner/repo)</label>
                      <input
                        type="text"
                        placeholder="e.g. yourname/email-finder-github"
                        value={githubRepoInput}
                        onChange={e => setGithubRepoInput(e.target.value)}
                        className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:bg-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono text-slate-500 mb-1">GitHub Personal Access Token (PAT with repo scope)</label>
                      <input
                        type="password"
                        placeholder="ghp_••••••••••••••••••••••••••••••••••••"
                        value={githubTokenInput}
                        onChange={e => setGithubTokenInput(e.target.value)}
                        className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:bg-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Key Rotation Strategy */}
              <div className="border border-slate-200 rounded-xl p-3 bg-white flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    <span>Multi-Key Strategy</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {settings.keyStrategy === 'round_robin'
                      ? 'Parallel striping: 3 workers per active key simultaneously.'
                      : 'Sequential failover: Uses Key 1 until $0, then Key 2.'}
                  </div>
                </div>

                <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, keyStrategy: 'round_robin' }))}
                    className={`px-2.5 py-1 rounded-md text-[11px] transition-all cursor-pointer ${
                      settings.keyStrategy === 'round_robin'
                        ? 'bg-white text-blue-700 font-bold shadow-2xs'
                        : 'text-slate-600'
                    }`}
                  >
                    ★ Round-Robin
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, keyStrategy: 'failover' }))}
                    className={`px-2.5 py-1 rounded-md text-[11px] transition-all cursor-pointer ${
                      settings.keyStrategy === 'failover'
                        ? 'bg-white text-blue-700 font-bold shadow-2xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Failover
                  </button>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowPreFlight(false)}
                className="px-4 py-2 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-semibold cursor-pointer active:scale-[0.98]"
              >
                Cancel
              </button>

              {settings.executionTarget === 'local' ? (
                <button
                  type="button"
                  onClick={handleConfirmLocalLaunch}
                  className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-[0.98]"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Launch Local Verification</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmCloudLaunch}
                  disabled={isDispatchingCloud}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-[0.98]"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>{isDispatchingCloud ? 'Dispatching to Cloud...' : 'Dispatch to GitHub Cloud'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
