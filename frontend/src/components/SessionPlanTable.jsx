import React from 'react';

const COLS = [
  { key: 'sessionNo', label: 'Session No', type: 'number', narrow: true },
  { key: 'unitNoAndName', label: 'Unit No & Name' },
  { key: 'topic', label: 'Topic' },
  { key: 'reference', label: 'Reference' },
  { key: 'deliveryMethod', label: 'Delivery Method' },
  { key: 'completedOn', label: 'Completed On', type: 'date' },
  { key: 'remarks', label: 'Remarks' }
];

export default function SessionPlanTable({ rows, onChange, onRemoveRow }) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-500">
        No sessions in this plan yet. Add academic lectures in this period, then generate or refresh the plan.
      </div>
    );
  }

  const updateRow = (index, key, value) => {
    const next = rows.map((r, i) => (i === index ? { ...r, [key]: value } : r));
    onChange(next);
  };

  const inputClass =
    'w-full min-w-[5rem] px-2 py-1.5 border border-slate-200 rounded text-sm bg-white focus:ring-1 focus:ring-primary-500 focus:border-primary-500';

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-sm text-left">
        <thead className="bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wide">
          <tr>
            {COLS.map((c) => (
              <th key={c.key} className="px-2 py-2.5 border-b border-slate-200 whitespace-nowrap">
                {c.label}
              </th>
            ))}
            <th className="px-2 py-2.5 border-b border-slate-200 w-16" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || row.lectureId || i} className="border-b border-slate-100 hover:bg-slate-50/50">
              {COLS.map((c) => (
                <td key={c.key} className="px-2 py-1.5 align-top">
                  <input
                    type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
                    value={row[c.key] ?? ''}
                    min={c.type === 'number' ? 1 : undefined}
                    onChange={(e) =>
                      updateRow(
                        i,
                        c.key,
                        c.type === 'number' ? Number(e.target.value) || '' : e.target.value
                      )
                    }
                    className={inputClass}
                  />
                </td>
              ))}
              <td className="px-2 py-1.5 align-top">
                <button
                  type="button"
                  onClick={() => onRemoveRow(i)}
                  className="text-xs text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
