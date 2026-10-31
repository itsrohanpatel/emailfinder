import React, { useState, useMemo } from 'react';
import { useAppStore } from '../Store';
import {
  Search,
  Check,
  Copy,
  Globe,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'bg-violet-100 text-violet-700 border-violet-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-teal-100 text-teal-700 border-teal-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-sky-100 text-sky-700 border-sky-200',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

export function ResultsTable() {
  const { contacts, showToast } = useAppStore();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'found' | 'not_found' | 'catch_all' | 'skipped_no_mx' | 'error' | 'pending'
  >('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);
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

  const handleCopyEmail = (email: string, id: number) => {
    navigator.clipboard.writeText(email);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    showToast({
      type: 'success',
      title: 'Email Copied',
      description: email,
    });
  };

  if (contacts.length === 0) return null;

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Search and Filter Bar */}
      <div className="px-6 py-3 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between gap-4 shrink-0 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search contact, domain..."
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 w-56 font-sans placeholder:text-slate-400 transition-all shadow-2xs"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                ×
              </button>
            )}
          </div>

          {/* Filter Tab Pills */}
          <div className="flex bg-slate-200/60 p-0.5 rounded-lg text-xs font-medium text-slate-600 flex-wrap">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'found', label: 'Deliverable' },
                { id: 'catch_all', label: 'Catch-All' },
                { id: 'skipped_no_mx', label: 'No MX' },
                { id: 'not_found', label: 'Not Found' },
                { id: 'pending', label: 'Pending' },
                { id: 'error', label: 'Error' },
              ] as const
            ).map(tab => {
              const count =
                tab.id === 'all'
                  ? contacts.length
                  : contacts.filter(c => c.status === tab.id).length;

              if (count === 0 && tab.id !== 'all' && tab.id !== 'found') return null;

              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setStatusFilter(tab.id);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                    statusFilter === tab.id
                      ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1 py-0.2 rounded-full font-mono ${
                      statusFilter === tab.id
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-300/50 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="text-xs font-mono text-slate-500">
          Showing <span className="font-semibold text-slate-900">{filteredContacts.length}</span> of{' '}
          {contacts.length} leads
        </div>
      </div>

      {/* Table Body View */}
      <div className="overflow-y-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50/90 border-b border-slate-200/80 sticky top-0 z-10 backdrop-blur-xs">
            <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="px-6 py-2.5 w-14">#</th>
              <th className="px-4 py-2.5">Contact Lead</th>
              <th className="px-4 py-2.5">Target Domain</th>
              <th className="px-4 py-2.5">Verified Deliverable Email</th>
              <th className="px-6 py-2.5 text-right">Verification Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {paginatedContacts.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-16 text-center text-slate-400">
                  <div className="max-w-xs mx-auto flex flex-col items-center">
                    <Search className="w-8 h-8 text-slate-300 mb-2" />
                    <p className="text-xs font-medium text-slate-600">No matching contacts found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Try clearing your search query or switching filter tabs.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedContacts.map(contact => {
                const fullName =
                  `${contact.firstName} ${contact.lastName}`.trim() || 'Unknown Contact';
                const initials =
                  `${contact.firstName?.[0] || ''}${contact.lastName?.[0] || ''}`.toUpperCase() ||
                  'U';
                const avatarColor = getAvatarColor(fullName);

                return (
                  <tr
                    key={contact.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    {/* Index */}
                    <td className="px-6 py-3 font-mono text-[11px] text-slate-400 tabular-nums">
                      {contact.id}
                    </td>

                    {/* Contact Avatar & Name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-lg border flex items-center justify-center font-bold text-[10px] tracking-tight shrink-0 shadow-2xs ${avatarColor}`}
                        >
                          {initials}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-800 leading-snug">
                            {fullName}
                          </div>
                          {contact.originalData?.Title && (
                            <div className="text-[10px] text-slate-400 truncate max-w-xs">
                              {contact.originalData.Title}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Website Domain */}
                    <td className="px-4 py-3 font-mono text-slate-600 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate max-w-[180px]">
                          {contact.website || '—'}
                        </span>
                      </div>
                    </td>

                    {/* Email & One-Click Copy */}
                    <td className="px-4 py-3">
                      {contact.email ? (
                        <div className="flex items-center gap-2 group/copy">
                          <span className="font-mono font-medium text-slate-900 bg-slate-100/80 px-2 py-0.5 rounded-md border border-slate-200/80 text-[11px] select-all">
                            {contact.email}
                          </span>
                          <button
                            onClick={() => handleCopyEmail(contact.email, contact.id)}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
                            title="Copy email to clipboard"
                          >
                            {copiedId === contact.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-300 font-mono text-[11px]">—</span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="px-6 py-3 text-right">
                      {contact.status === 'found' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Deliverable</span>
                        </span>
                      )}

                      {contact.status === 'catch_all' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200/80">
                          <AlertTriangle className="w-3 h-3 text-purple-600" />
                          <span>Catch-All</span>
                        </span>
                      )}

                      {contact.status === 'skipped_no_mx' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono text-slate-600 bg-slate-100 border border-slate-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                          <span>No MX ($0)</span>
                        </span>
                      )}

                      {contact.status === 'not_found' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] text-slate-500 bg-slate-50 border border-slate-200">
                          <span>Not Found</span>
                        </span>
                      )}

                      {contact.status === 'processing' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
                          <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />
                          <span>Checking...</span>
                        </span>
                      )}

                      {contact.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-100">
                          <span>Pending</span>
                        </span>
                      )}

                      {contact.status === 'error' && (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200"
                          title={contact.lastError || 'Verification error'}
                        >
                          <XCircle className="w-3 h-3 text-rose-600" />
                          <span>Error</span>
                        </span>
                      )}

                      {contact.status === 'skipped_missing_info' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-slate-400 bg-slate-100 border border-slate-200">
                          <span>Missing Info</span>
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

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="px-6 py-2.5 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-mono">
            Page <span className="font-semibold text-slate-800">{safePage}</span> of {totalPages}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-3 py-1 text-xs font-mono font-medium text-slate-700">
              {safePage} / {totalPages}
            </span>

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
