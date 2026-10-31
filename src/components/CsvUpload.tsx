import React, { useRef, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useAppStore } from '../Store';
import { Contact } from '../types';
import {
  Upload,
  Sparkles,
  FileSpreadsheet,
  Check,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { normalizeDomain } from '../utils/permutation';
import { parseFullName } from '../utils/name';

// Pre-packaged realistic sample dataset for zero-friction 1-click testing
const SAMPLE_APOLLO_CSV = `Name,Title,Company,Domain
Brian Chesky,CEO & Co-Founder,Airbnb,airbnb.com
Patrick Collison,CEO & Co-Founder,Stripe,stripe.com
Marc Benioff,Chair & CEO,Salesforce,salesforce.com
Stewart Butterfield,Founder,Slack,slack.com
Dylan Field,CEO & Co-Founder,Figma,figma.com`;

interface ParsedFileState {
  fileName: string;
  rows: Record<string, any>[];
  headers: string[];
}

export function CsvUpload() {
  const { setContacts, settings, showToast } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dupCount, setDupCount] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Staged file state for column mapping review
  const [stagedFile, setStagedFile] = useState<ParsedFileState | null>(null);
  const [nameMode, setNameMode] = useState<'full_name' | 'separate'>('full_name');
  const [fullNameCol, setFullNameCol] = useState<string>('');
  const [firstNameCol, setFirstNameCol] = useState<string>('');
  const [lastNameCol, setLastNameCol] = useState<string>('');
  const [domainCol, setDomainCol] = useState<string>('');
  const [emailCol, setEmailCol] = useState<string>('');

  // Auto-detect columns from headers
  const autoDetectColumns = (headers: string[]) => {
    const clean = headers.map(h => h.trim());
    const lower = clean.map(h => h.toLowerCase());

    // 1. Detect First Name vs Full Name
    let detectedFn = '';
    let detectedLn = '';
    let detectedFull = '';

    const exactFull = ['name', 'full name', 'fullname', 'contact name', 'person name'];
    for (const target of exactFull) {
      const idx = lower.indexOf(target);
      if (idx !== -1) {
        detectedFull = clean[idx];
        break;
      }
    }

    const exactFn = ['first name', 'firstname', 'first', 'given name'];
    for (const target of exactFn) {
      const idx = lower.indexOf(target);
      if (idx !== -1) {
        detectedFn = clean[idx];
        break;
      }
    }

    const exactLn = ['last name', 'lastname', 'last', 'surname', 'family name'];
    for (const target of exactLn) {
      const idx = lower.indexOf(target);
      if (idx !== -1) {
        detectedLn = clean[idx];
        break;
      }
    }

    // 2. Detect Domain / Website
    let detectedDomain = '';
    const exactDomain = ['domain', 'company domain', 'website', 'company website', 'url', 'site', 'web'];
    for (const target of exactDomain) {
      const idx = lower.indexOf(target);
      if (idx !== -1) {
        detectedDomain = clean[idx];
        break;
      }
    }

    if (!detectedDomain) {
      for (let i = 0; i < lower.length; i++) {
        const h = lower[i];
        if (
          (h.includes('domain') || h.includes('website') || h.includes('url')) &&
          !h.includes('linkedin') &&
          !h.includes('twitter') &&
          !h.includes('photo')
        ) {
          detectedDomain = clean[i];
          break;
        }
      }
    }

    // 3. Detect Email
    let detectedEmail = '';
    const exactEmail = ['email', 'email address', 'contact email', 'work email', 'mail'];
    for (const target of exactEmail) {
      const idx = lower.indexOf(target);
      if (idx !== -1) {
        detectedEmail = clean[idx];
        break;
      }
    }

    // Decide initial mode
    if (detectedFn && detectedLn) {
      setNameMode('separate');
      setFirstNameCol(detectedFn);
      setLastNameCol(detectedLn);
      setFullNameCol(detectedFull || clean[0] || '');
    } else {
      setNameMode('full_name');
      setFullNameCol(detectedFull || detectedFn || clean[0] || '');
      setFirstNameCol(detectedFn || clean[0] || '');
      setLastNameCol(detectedLn || '');
    }

    setDomainCol(detectedDomain || clean[1] || '');
    setEmailCol(detectedEmail || '');
  };

  const handleRawDataParsed = (rows: Record<string, any>[], fileName: string) => {
    if (!rows || rows.length === 0) {
      setError('File is empty or contains no records.');
      return;
    }

    const headers = Object.keys(rows[0] || {}).map(h => h.trim()).filter(Boolean);
    if (headers.length === 0) {
      setError('No column headers found in file.');
      return;
    }

    setError(null);
    setStagedFile({ fileName, rows, headers });
    autoDetectColumns(headers);
  };

  const handleFile = async (file: File) => {
    setError(null);
    const fileName = file.name;
    const isExcel =
      fileName.endsWith('.xlsx') ||
      fileName.endsWith('.xls') ||
      file.type.includes('spreadsheetml') ||
      file.type.includes('ms-excel');

    if (isExcel) {
      try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          setError('Excel file contains no worksheets.');
          return;
        }
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
        handleRawDataParsed(jsonData, fileName);
      } catch (err: any) {
        setError('Error reading Excel spreadsheet: ' + (err?.message || err));
      }
    } else {
      // CSV file via PapaParse
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: results => {
          handleRawDataParsed(results.data as Record<string, any>[], fileName);
        },
        error: err => {
          setError('Error parsing CSV: ' + err.message);
        },
      });
    }
  };

  const loadSampleData = () => {
    Papa.parse(SAMPLE_APOLLO_CSV, {
      header: true,
      skipEmptyLines: true,
      complete: results => {
        handleRawDataParsed(results.data as Record<string, any>[], 'sample-apollo.csv');
      },
      error: err => {
        setError('Error loading demo leads: ' + err.message);
      },
    });
  };

  const handleConfirmImport = () => {
    if (!stagedFile) return;

    if (nameMode === 'full_name' && !fullNameCol) {
      setError('Please select a Full Name column.');
      return;
    }

    if (nameMode === 'separate' && (!firstNameCol || !lastNameCol)) {
      setError('Please select both First Name and Last Name columns.');
      return;
    }

    if (!domainCol && !emailCol) {
      setError('Please select a Company Domain or Email column.');
      return;
    }

    const seenKeys = new Set<string>();
    let duplicates = 0;
    let nextId = 1;
    const newContacts: Contact[] = [];

    for (const row of stagedFile.rows) {
      let fn = '';
      let ln = '';

      if (nameMode === 'full_name') {
        const rawName = fullNameCol ? String(row[fullNameCol] || '').trim() : '';
        const parsed = parseFullName(rawName);
        fn = parsed.firstName;
        ln = parsed.lastName;
      } else {
        fn = firstNameCol ? String(row[firstNameCol] || '').trim() : '';
        ln = lastNameCol ? String(row[lastNameCol] || '').trim() : '';
      }

      const rawDomain = domainCol ? String(row[domainCol] || '').trim() : '';
      const existingEmail = emailCol ? String(row[emailCol] || '').trim() : '';
      const hasExistingEmail = existingEmail !== '' && existingEmail.includes('@');
      const skipEmail = hasExistingEmail && !settings.reverifyAll;

      const normDomain = normalizeDomain(rawDomain || existingEmail);
      const dedupKey = `${fn.toLowerCase()}|${ln.toLowerCase()}|${normDomain}|${existingEmail.toLowerCase()}`;

      if (seenKeys.has(dedupKey)) {
        duplicates++;
        continue;
      }
      seenKeys.add(dedupKey);

      newContacts.push({
        id: nextId++,
        firstName: fn,
        lastName: ln,
        website: rawDomain,
        email: existingEmail,
        status: skipEmail ? 'found' : 'pending',
        originalData: row,
      });
    }

    setContacts(newContacts);
    setDupCount(duplicates);
    setStagedFile(null);
    setError(null);

    showToast({
      type: 'success',
      title: 'Contacts Imported Successfully',
      description: `${newContacts.length} contacts loaded from ${stagedFile.fileName} ${
        duplicates > 0 ? `(${duplicates} duplicate rows filtered)` : ''
      }`,
    });
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  return (
    <div className="w-full flex flex-col items-center justify-center py-4">
      {!stagedFile ? (
        <>
          {/* Drag & Drop Container */}
          <div
            className={`w-full max-w-xl border-2 border-dashed rounded-2xl bg-white p-8 text-center transition-all duration-150 cursor-pointer shadow-xs ${
              isDragging
                ? 'border-blue-500 bg-blue-50/50 scale-[1.01]'
                : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50/50'
            }`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 border border-blue-100 shadow-xs">
              <Upload className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 tracking-tight">
              Upload Contacts (Excel or CSV)
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Drag and drop any <b className="text-slate-700">.xlsx</b>, <b className="text-slate-700">.xls</b>, or <b className="text-slate-700">.csv</b> export file, or click to browse.
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
              <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-mono font-medium text-slate-600 border border-slate-200">
                Full Name or (First + Last Name)
              </span>
              <span className="text-slate-400 text-xs">+</span>
              <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-mono font-medium text-slate-600 border border-slate-200">
                Company Domain / Website
              </span>
            </div>

            <input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              ref={fileInputRef}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="hidden"
            />
          </div>

          {/* 1-Click Demo Shortcut */}
          <div className="mt-4 flex items-center gap-2">
            <span className="text-xs text-slate-400">or test immediately:</span>
            <button
              onClick={loadSampleData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors shadow-2xs active:scale-[0.98] cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Load 5 Demo Apollo Leads</span>
            </button>
          </div>
        </>
      ) : (
        /* Column Mapping Review Card */
        <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-sm p-6 animate-in fade-in">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Map Columns: {stagedFile.fileName}
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {stagedFile.rows.length} rows loaded. Confirm column mappings below:
              </p>
            </div>
            <button
              onClick={() => setStagedFile(null)}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Change File</span>
            </button>
          </div>

          {/* Mapping Controls */}
          <div className="py-4 space-y-4">
            {/* Name Mode Toggle */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Name Format in File:
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setNameMode('full_name')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    nameMode === 'full_name'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Full Name (Single Column)
                </button>
                <button
                  type="button"
                  onClick={() => setNameMode('separate')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    nameMode === 'separate'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Separate First & Last Name
                </button>
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                {nameMode === 'full_name'
                  ? 'Auto-splits into First Name & Last Name (middle names are automatically excluded).'
                  : 'Reads distinct first and last name columns from the file.'}
              </span>
            </div>

            {/* Column Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {nameMode === 'full_name' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name Column *
                  </label>
                  <select
                    value={fullNameCol}
                    onChange={e => setFullNameCol(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-sans cursor-pointer"
                  >
                    {stagedFile.headers.map(h => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      First Name Column *
                    </label>
                    <select
                      value={firstNameCol}
                      onChange={e => setFirstNameCol(e.target.value)}
                      className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-sans cursor-pointer"
                    >
                      {stagedFile.headers.map(h => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Last Name Column *
                    </label>
                    <select
                      value={lastNameCol}
                      onChange={e => setLastNameCol(e.target.value)}
                      className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-sans cursor-pointer"
                    >
                      {stagedFile.headers.map(h => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Company Domain / Website *
                </label>
                <select
                  value={domainCol}
                  onChange={e => setDomainCol(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-sans cursor-pointer"
                >
                  {stagedFile.headers.map(h => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Existing Email Column (Optional)
                </label>
                <select
                  value={emailCol}
                  onChange={e => setEmailCol(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-sans cursor-pointer"
                >
                  <option value="">-- None / Discover with VeriFlow --</option>
                  {stagedFile.headers.map(h => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Live 3-Row Preview */}
            <div className="pt-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">
                Preview (First 3 Rows):
              </span>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-xs font-mono">
                {stagedFile.rows.slice(0, 3).map((row, idx) => {
                  let pFn = '';
                  let pLn = '';
                  if (nameMode === 'full_name') {
                    const parsed = parseFullName(row[fullNameCol]);
                    pFn = parsed.firstName;
                    pLn = parsed.lastName;
                  } else {
                    pFn = row[firstNameCol] || '';
                    pLn = row[lastNameCol] || '';
                  }
                  const pDom = normalizeDomain(row[domainCol]);

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200/80 shadow-2xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-slate-400 font-semibold w-5">#{idx + 1}</span>
                        <span className="text-slate-800 font-medium">
                          First: <b className="text-blue-600">{pFn || '—'}</b> | Last:{' '}
                          <b className="text-blue-600">{pLn || '—'}</b>
                        </span>
                      </div>
                      <div className="text-slate-500 text-[11px] truncate max-w-xs font-sans">
                        Domain: <span className="font-mono text-slate-800">{pDom || '—'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Import Action */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              onClick={() => setStagedFile(null)}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmImport}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all active:scale-[0.98] cursor-pointer"
            >
              <span>Confirm & Import ({stagedFile.rows.length} Contacts)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Auto-deduplicated notice */}
      {dupCount !== null && dupCount > 0 && (
        <div className="mt-4 w-full max-w-xl text-xs font-mono text-emerald-800 bg-emerald-50 border border-emerald-200/80 p-3 rounded-xl flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-600" />
            Auto-deduplicated: <b>{dupCount}</b> duplicate rows removed on import.
          </span>
          <button
            onClick={() => setDupCount(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold ml-2 cursor-pointer text-sm"
          >
            ×
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="mt-4 w-full max-w-xl text-xs font-mono text-rose-700 bg-rose-50 border border-rose-200/80 p-3 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
