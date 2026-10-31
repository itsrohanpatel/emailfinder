import React, { useRef, useState } from 'react';
import Papa from 'papaparse';
import { useAppStore } from '../Store';
import { Contact } from '../types';
import { Upload, Sparkles, FileSpreadsheet, Check, AlertCircle } from 'lucide-react';
import { normalizeDomain } from '../utils/permutation';

// Pre-packaged realistic sample dataset for zero-friction 1-click testing
const SAMPLE_APOLLO_CSV = `First Name,Last Name,Company,Website,Title
Brian,Chesky,Airbnb,airbnb.com,CEO & Co-Founder
Patrick,Collison,Stripe,stripe.com,CEO & Co-Founder
Marc,Benioff,Salesforce,salesforce.com,Chair & CEO
Stewart,Butterfield,Slack,slack.com,Founder
Dylan,Field,Figma,figma.com,CEO & Co-Founder`;

export function CsvUpload() {
  const { setContacts, settings, showToast } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dupCount, setDupCount] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processData = (data: any[], sourceName?: string) => {
    if (!data || data.length === 0) {
      setError('CSV file is empty or could not be parsed.');
      return;
    }

    const headers = Object.keys(data[0] || {});
    if (headers.length === 0) {
      setError('No header columns found in CSV.');
      return;
    }

    const cleanHeaders = headers.map(h => h.trim());
    const lowerHeaders = cleanHeaders.map(h => h.toLowerCase());

    // 1. Detect First Name / Full Name
    const findFirstNameHeader = (): string | null => {
      const exactList = ['first name', 'firstname', 'first', 'full name', 'fullname', 'contact name', 'name'];
      for (const target of exactList) {
        const idx = lowerHeaders.indexOf(target);
        if (idx !== -1) return cleanHeaders[idx];
      }
      for (let i = 0; i < lowerHeaders.length; i++) {
        const h = lowerHeaders[i];
        if (
          (h.includes('first') || h.includes('given') || h.includes('contact')) &&
          !h.includes('company') &&
          !h.includes('account')
        ) {
          return cleanHeaders[i];
        }
      }
      return null;
    };

    // 2. Detect Last Name
    const findLastNameHeader = (): string | null => {
      const exactList = ['last name', 'lastname', 'last', 'surname', 'family name'];
      for (const target of exactList) {
        const idx = lowerHeaders.indexOf(target);
        if (idx !== -1) return cleanHeaders[idx];
      }
      for (let i = 0; i < lowerHeaders.length; i++) {
        const h = lowerHeaders[i];
        if (h.includes('last') || h.includes('surname')) {
          return cleanHeaders[i];
        }
      }
      return null;
    };

    // 3. Detect Website / Domain
    const findDomainHeader = (): string | null => {
      const exactList = ['website', 'domain', 'company domain', 'company website', 'url', 'site', 'web'];
      for (const target of exactList) {
        const idx = lowerHeaders.indexOf(target);
        if (idx !== -1) return cleanHeaders[idx];
      }
      for (let i = 0; i < lowerHeaders.length; i++) {
        const h = lowerHeaders[i];
        if (
          (h.includes('website') || h.includes('domain') || h.includes('url')) &&
          !h.includes('linkedin') &&
          !h.includes('twitter') &&
          !h.includes('facebook') &&
          !h.includes('photo') &&
          !h.includes('avatar')
        ) {
          return cleanHeaders[i];
        }
      }
      return null;
    };

    // 4. Detect Email
    const findEmailHeader = (): string | null => {
      const exactList = ['email', 'email address', 'contact email', 'work email', 'mail'];
      for (const target of exactList) {
        const idx = lowerHeaders.indexOf(target);
        if (idx !== -1) return cleanHeaders[idx];
      }
      for (let i = 0; i < lowerHeaders.length; i++) {
        const h = lowerHeaders[i];
        if (h.includes('email') || h.includes('mail')) {
          return cleanHeaders[i];
        }
      }
      return null;
    };

    const fnHeader = findFirstNameHeader();
    const lnHeader = findLastNameHeader();
    const urlHeader = findDomainHeader();
    const emailHeader = findEmailHeader();

    if (!fnHeader && !lnHeader && !emailHeader) {
      setError('CSV must contain a column for Name (First Name, Full Name) or Email.');
      return;
    }

    if (!urlHeader && !emailHeader) {
      setError('CSV must contain a column for Website, Domain, or Email.');
      return;
    }

    const seenKeys = new Set<string>();
    let duplicates = 0;
    let nextId = 1;

    const newContacts: Contact[] = [];

    for (const row of data) {
      const existingEmail = emailHeader ? String(row[emailHeader] || '').trim() : '';
      const hasExistingEmail = existingEmail !== '' && existingEmail.includes('@');
      const skipEmail = hasExistingEmail && !settings.reverifyAll;

      let rawFn = fnHeader ? String(row[fnHeader] || '').trim() : '';
      let rawLn = lnHeader ? String(row[lnHeader] || '').trim() : '';
      const rawDomain = urlHeader ? String(row[urlHeader] || '').trim() : '';

      if (rawFn && !rawLn && rawFn.includes(' ')) {
        const parts = rawFn.split(/\s+/);
        rawFn = parts[0];
        rawLn = parts.slice(1).join(' ');
      }

      // Deduplication key
      const normDomain = normalizeDomain(rawDomain || existingEmail);
      const dedupKey = `${rawFn.toLowerCase()}|${rawLn.toLowerCase()}|${normDomain}|${existingEmail.toLowerCase()}`;

      if (seenKeys.has(dedupKey)) {
        duplicates++;
        continue;
      }
      seenKeys.add(dedupKey);

      newContacts.push({
        id: nextId++,
        firstName: rawFn,
        lastName: rawLn,
        website: rawDomain,
        email: existingEmail,
        status: skipEmail ? 'found' : 'pending',
        originalData: row,
      });
    }

    setContacts(newContacts);
    setDupCount(duplicates);
    setError(null);

    showToast({
      type: 'success',
      title: 'CSV Imported Successfully',
      description: `${newContacts.length} contacts loaded ${
        duplicates > 0 ? `(${duplicates} duplicate rows filtered)` : ''
      }`,
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: results => {
        processData(results.data, file.name);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: err => {
        setError('Error parsing CSV: ' + err.message);
      },
    });
  };

  const loadSampleData = () => {
    Papa.parse(SAMPLE_APOLLO_CSV, {
      header: true,
      skipEmptyLines: true,
      complete: results => {
        processData(results.data, 'demo-apollo.csv');
      },
      error: err => {
        setError('Error loading sample data: ' + err.message);
      },
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
    if (file && (file.name.endsWith('.csv') || file.type.includes('csv'))) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: results => processData(results.data, file.name),
        error: err => setError('Error parsing CSV: ' + err.message),
      });
    } else {
      setError('Please upload a valid .csv file.');
    }
  };

  return (
    <div className="w-full flex flex-col items-center justify-center py-6">
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
          Upload Contacts CSV
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Drag and drop your export from Apollo, LinkedIn, or Hubspot, or click to browse.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
          <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-mono font-medium text-slate-600 border border-slate-200">
            First Name
          </span>
          <span className="text-slate-400 text-xs">+</span>
          <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-mono font-medium text-slate-600 border border-slate-200">
            Last Name
          </span>
          <span className="text-slate-400 text-xs">+</span>
          <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-mono font-medium text-slate-600 border border-slate-200">
            Company Domain / Website
          </span>
        </div>

        <input
          type="file"
          accept=".csv,text/csv"
          ref={fileInputRef}
          onChange={handleFileUpload}
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
