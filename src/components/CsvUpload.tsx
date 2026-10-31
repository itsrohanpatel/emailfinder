import React, { useRef, useState } from 'react';
import Papa from 'papaparse';
import { useAppStore } from '../Store';
import { Contact } from '../types';
import { Upload } from 'lucide-react';

export function CsvUpload() {
  const { setContacts, settings } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processData = (data: any[]) => {
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
      // Step A: Exact matches
      const exactList = ['first name', 'firstname', 'first', 'full name', 'fullname', 'contact name', 'name'];
      for (const target of exactList) {
        const idx = lowerHeaders.indexOf(target);
        if (idx !== -1) return cleanHeaders[idx];
      }

      // Step B: Partial matches excluding companies/accounts
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
        // Exclude social links that aren't the primary company domain
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

    let nextId = 1;
    const newContacts: Contact[] = data.map(row => {
      const existingEmail = emailHeader ? String(row[emailHeader] || '').trim() : '';
      const hasExistingEmail = existingEmail !== '' && existingEmail.includes('@');
      const skipEmail = hasExistingEmail && !settings.reverifyAll;

      let rawFn = fnHeader ? String(row[fnHeader] || '').trim() : '';
      let rawLn = lnHeader ? String(row[lnHeader] || '').trim() : '';

      // If full name in first name and last name empty
      if (rawFn && !rawLn && rawFn.includes(' ')) {
        const parts = rawFn.split(/\s+/);
        rawFn = parts[0];
        rawLn = parts.slice(1).join(' ');
      }

      return {
        id: nextId++,
        firstName: rawFn,
        lastName: rawLn,
        website: urlHeader ? String(row[urlHeader] || '').trim() : '',
        email: existingEmail,
        status: skipEmail ? 'found' : 'pending',
        originalData: row,
      };
    });

    setContacts(newContacts);
    setError(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: results => {
        processData(results.data);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: err => {
        setError('Error parsing CSV: ' + err.message);
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
        complete: results => processData(results.data),
        error: err => setError('Error parsing CSV: ' + err.message),
      });
    } else {
      setError('Please upload a valid .csv file.');
    }
  };

  return (
    <div className="w-full flex flex-col items-center justify-center py-8">
      <div
        className={`w-full max-w-xl border-2 border-dashed rounded-lg bg-slate-50 p-10 text-center transition-colors cursor-pointer ${
          isDragging ? 'border-blue-500 bg-blue-50/50' : 'border-slate-300 hover:border-slate-400'
        }`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="mx-auto h-10 w-10 text-blue-500 mb-3" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
          Upload Contacts CSV
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Drag and drop your CSV file here, or click to browse.
        </p>
        <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-slate-200/80 rounded text-[10px] uppercase font-mono tracking-wider text-slate-600">
          Required Columns: (Name or First Name) + (Website/Domain or Email)
        </div>
        <input
          type="file"
          accept=".csv,text/csv"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>
      {error && (
        <div className="mt-4 w-full max-w-xl text-xs font-mono text-red-600 bg-red-50 border border-red-200 p-3 rounded">
          [ERROR] {error}
        </div>
      )}
    </div>
  );
}
