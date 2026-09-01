'use client';

import { useState } from 'react';

export default function Home() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [columns, setColumns] = useState([]);
  const [editingCol, setEditingCol] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    const allowed = ['application/pdf', 'text/csv'];
    if (!allowed.includes(selected.type)) {
      setError('Only PDF and CSV files are supported.');
      setFile(null);
      return;
    }

    if (selected.size > 5 * 1024 * 1024) {
      setError('File size must be under 5MB.');
      setFile(null);
      return;
    }

    setError(null);
    setFile(selected);
    setResult(null);
    setColumns([]);
    setSearchQuery('');
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }

      setResult(data);
      setColumns(data.columns || []);
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (colName) => {
    setEditingCol(colName);
    setEditingValue(colName);
  };

  const commitEdit = (oldName) => {
    const trimmed = editingValue.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingCol(null);
      return;
    }
    setColumns((prev) =>
      prev.map((c) => (c.name === oldName ? { ...c, name: trimmed } : c))
    );
    setResult((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => {
        const newRow = { ...row };
        newRow[trimmed] = newRow[oldName];
        delete newRow[oldName];
        return newRow;
      }),
    }));
    setEditingCol(null);
  };

  const handleTypeChange = (colName, newType) => {
    setColumns((prev) =>
      prev.map((c) => (c.name === colName ? { ...c, type: newType } : c))
    );
  };

  const filteredRows = result?.rows
    ? result.rows.filter((row) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return Object.values(row).some((val) =>
        String(val ?? '').toLowerCase().includes(q)
      );
    })
    : [];

  const downloadCSV = () => {
    if (!result) return;

    let csv = '';

    if (result.type === 'keyvalue') {
      csv = 'Field,Value\n' +
        result.fields.map((f) => `"${f.key}","${String(f.value ?? '').replace(/"/g, '""')}"`).join('\n');
    } else {
      const headers = columns.map((c) => c.name).join(',');
      const rows = filteredRows
        .map((row) =>
          columns.map((c) => `"${String(row[c.name] ?? '').replace(/"/g, '""')}"`).join(',')
        )
        .join('\n');
      csv = `${headers}\n${rows}`;
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file?.name?.replace(/\.[^.]+$/, '') ?? 'export'}-extracted.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderKeyValue = (fields) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {fields.map((field) => (
        <div key={field.key} className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            {field.key}
            <span className="ml-1 normal-case text-gray-600">({field.type})</span>
          </p>
          <p className="text-white text-sm font-medium">{field.value ?? '—'}</p>
        </div>
      ))}
    </div>
  );

  const renderTable = () => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-gray-700">
            {columns.map((col) => (
              <th key={col.name} className="py-2 px-4 font-medium whitespace-nowrap">
                {editingCol === col.name ? (
                  <input
                    autoFocus
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onBlur={() => commitEdit(col.name)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit(col.name);
                      if (e.key === 'Escape') setEditingCol(null);
                    }}
                    className="bg-gray-700 text-white px-2 py-0.5 rounded text-sm w-32 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                ) : (
                  <span
                    className="text-blue-400 cursor-pointer hover:text-blue-300"
                    onClick={() => startEditing(col.name)}
                    title="Click to rename"
                  >
                    {col.name}
                  </span>
                )}
                <select
                  value={col.type}
                  onChange={(e) => handleTypeChange(col.name, e.target.value)}
                  className="ml-2 text-xs bg-gray-800 border border-gray-700 text-gray-500 rounded px-1 py-0.5 cursor-pointer"
                >
                  <option value="string">string</option>
                  <option value="number">number</option>
                  <option value="date">date</option>
                  <option value="boolean">boolean</option>
                </select>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredRows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center text-gray-500 text-sm">
                No rows match your search.
              </td>
            </tr>
          ) : (
            filteredRows.map((row, i) => (
              <tr key={i} className="border-b border-gray-800 hover:bg-gray-800 transition-colors">
                {columns.map((col) => (
                  <td key={col.name} className="py-2 px-4 text-gray-300 whitespace-nowrap">
                    {row[col.name] ?? '—'}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">DocuQuery</h1>
        <p className="text-gray-400 text-sm">Upload a PDF or CSV — tables, invoices, forms, reports</p>
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 w-full max-w-md flex flex-col gap-4">
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-600 rounded-lg p-8 cursor-pointer hover:border-blue-500 transition-colors">
          <span className="text-gray-400 text-sm mb-2">
            {file ? file.name : 'Click to select a PDF or CSV'}
          </span>
          <span className="text-gray-600 text-xs">Max 5MB</span>
          <input
            type="file"
            accept=".pdf,.csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>

        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
        >
          {loading ? 'Processing...' : 'Extract & Query'}
        </button>
      </div>

      {loading && (
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Extracting structured data...</p>
        </div>
      )}

      {result && (
        <div className="w-full max-w-5xl bg-gray-900 border border-gray-700 rounded-xl p-6 flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded uppercase tracking-wide">
                  {result.type}
                </span>
                <p className="text-gray-400 text-sm">{result.summary}</p>
              </div>
              {result.type !== 'keyvalue' && (
                <p className="text-gray-600 text-xs">
                  {filteredRows.length} of {result.rows.length} rows
                </p>
              )}
            </div>
            <button
              onClick={downloadCSV}
              className="text-sm bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
            >
              Download CSV
            </button>
          </div>

          {/* Schema hint for table/mixed */}
          {result.type !== 'keyvalue' && columns.length > 0 && (
            <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
                Inferred Schema — click any column name to rename
              </p>
              <div className="flex flex-wrap gap-2">
                {columns.map((col) => (
                  <span
                    key={col.name}
                    onClick={() => startEditing(col.name)}
                    className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded cursor-pointer hover:bg-blue-900 hover:text-blue-300 transition-colors"
                  >
                    {col.name} <span className="text-gray-500">({col.type})</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Search — only for table/mixed */}
          {result.type !== 'keyvalue' && (
            <input
              type="text"
              placeholder="Search across all columns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          )}

          {/* Render based on type */}
          {result.type === 'keyvalue' && renderKeyValue(result.fields)}
          {result.type === 'table' && renderTable()}
          {result.type === 'mixed' && (
            <div className="flex flex-col gap-6">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Document Fields</p>
                {renderKeyValue(result.fields)}
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Line Items</p>
                {renderTable()}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}