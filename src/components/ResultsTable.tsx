import React, { useState, useMemo } from 'react';
import { useAppStore } from '../Store';

export function ResultsTable() {
  const { contacts } = useAppStore();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'found' | 'not_found' | 'catch_all' | 'skipped_no_mx' | 'error' | 'pending'
  >('all');
  const [searchTerm, setSearchTerm] = useState('');
  const pageSize = 50;

  // Filter contacts by status and search keyword
  const filteredContacts = useMemo(() => {
    let result = contacts;
    if (statusFilter !== 'all') {
      result = result.filter(c => c.status === statusFilter);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(
        c =>
          c.firstName.toLowerCase().includes(q) ||
          c.lastName.toLowerCase().includes(q) ||
          c.website.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q)
      );
    }
    return result;
  }, [contacts, statusFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredContacts.length / pageSize));

  // Auto-clamp page if filter or list size changes
  const safePage = Math.min(page, totalPages);
  if (safePage !== page) {
    setPage(safePage);
  }

  const paginatedContacts = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredContacts.slice(start, start + pageSize);
  }, [filteredContacts, safePage, pageSize]);

  if (contacts.length === 0) return null;

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Search and Filter Bar */}
      <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search contact, domain, email..."
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="text-xs px-2.5 py-1 bg-white border border-slate-200 rounded focus:outline-none focus:border-blue-500 w-52 font-sans"
          />
          <div className="flex bg-slate-200/80 p-0.5 rounded text-[11px] font-medium text-slate-600 flex-wrap">
            {(
              ['all', 'found', 'not_found', 'catch_all', 'skipped_no_mx', 'error', 'pending'] as const
            ).map(tab => (
              <button
                key={tab}
                onClick={() => {
                  setStatusFilter(tab);
                  setPage(1);
                }}
                className={`px-2 py-0.5 rounded capitalize cursor-pointer ${
                  statusFilter === tab
                    ? 'bg-white text-blue-600 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="text-[11px] font-mono text-slate-500">
          Showing <span className="font-bold text-slate-800">{filteredContacts.length}</span> of {contacts.length} rows
        </div>
      </div>

      {/* Table view */}
      <div className="overflow-y-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
            <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="px-6 py-2.5 w-16">#</th>
              <th className="px-4 py-2.5">Contact</th>
              <th className="px-4 py-2.5">Domain</th>
              <th className="px-4 py-2.5">Verified Email</th>
              <th className="px-6 py-2.5 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs font-mono">
            {paginatedContacts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-400 font-sans italic">
                  No matching records found.
                </td>
              </tr>
            ) : (
              paginatedContacts.map(c => {
                const isFound = c.status === 'found';
                const isProcessing = c.status === 'processing';
                const isNotFound = c.status === 'not_found';
                const isCatchAll = c.status === 'catch_all';
                const isNoMx = c.status === 'skipped_no_mx';
                const isError = c.status === 'error';
                const isPending = c.status === 'pending';
                const isSkipped = c.status === 'skipped_missing_info';

                const rowClass = isFound
                  ? 'bg-emerald-50/30'
                  : isProcessing
                  ? 'bg-amber-50/50'
                  : isCatchAll
                  ? 'bg-purple-50/30'
                  : isNoMx
                  ? 'bg-slate-50/50'
                  : isError
                  ? 'bg-red-50/30'
                  : 'bg-white';

                return (
                  <tr key={c.id} className={`${rowClass} hover:bg-slate-50/60 transition-colors`}>
                    <td className={`px-6 py-2.5 text-slate-400 ${isProcessing ? 'animate-pulse font-bold' : ''}`}>
                      {c.id}
                    </td>
                    <td className="px-4 py-2.5 font-sans font-medium text-slate-800">
                      {c.firstName} {c.lastName}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{c.website || '—'}</td>
                    <td
                      className={`px-4 py-2.5 ${
                        isFound
                          ? 'text-emerald-700 font-bold'
                          : isProcessing
                          ? 'text-amber-600 italic'
                          : isCatchAll
                          ? 'text-purple-700 italic text-[11px]'
                          : isNoMx
                          ? 'text-slate-400 text-[11px]'
                          : isError
                          ? 'text-red-500 text-[11px]'
                          : 'text-slate-400'
                      }`}
                    >
                      {isFound
                        ? c.email
                        : isProcessing
                        ? 'testing permutations...'
                        : isCatchAll
                        ? 'Domain is catch-all'
                        : isNoMx
                        ? 'No active MX mail servers'
                        : isError
                        ? c.lastError || 'error'
                        : isNotFound
                        ? 'not found'
                        : isSkipped
                        ? 'skipped'
                        : '—'}
                    </td>
                    <td className="px-6 py-2.5 text-right font-sans">
                      {isFound && (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                          FOUND
                        </span>
                      )}
                      {isCatchAll && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full text-[10px] font-bold">
                          CATCH-ALL
                        </span>
                      )}
                      {isNoMx && (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-bold">
                          NO MX
                        </span>
                      )}
                      {isNotFound && (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-bold">
                          NOT FOUND
                        </span>
                      )}
                      {isProcessing && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 animate-pulse rounded-full text-[10px] font-bold">
                          PROCESSING
                        </span>
                      )}
                      {isError && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-bold">
                          ERROR
                        </span>
                      )}
                      {isSkipped && (
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-[10px] font-bold">
                          SKIPPED
                        </span>
                      )}
                      {isPending && (
                        <span className="text-[10px] text-slate-400 font-bold uppercase">
                          Pending
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      <div className="bg-slate-50 px-6 py-2.5 border-t border-slate-200 flex items-center justify-between shrink-0">
        <div className="text-[11px] font-mono text-slate-500">
          PAGE <span className="font-bold text-slate-800">{safePage}</span> / {totalPages}
          {filteredContacts.length > 0 && (
            <span className="ml-2 text-slate-400">
              (rows {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredContacts.length)})
            </span>
          )}
        </div>
        <div className="flex space-x-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 disabled:opacity-30 uppercase tracking-wider rounded hover:bg-slate-200/50 cursor-pointer"
          >
            Prev
          </button>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 disabled:opacity-30 uppercase tracking-wider rounded hover:bg-slate-200/50 cursor-pointer"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
