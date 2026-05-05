"use client";

export function BoolTriField({
  value,
  onChange,
}: {
  value: boolean | null | undefined;
  onChange: (v: boolean | null) => void;
}) {
  const v = value === undefined ? null : value;
  return (
    <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 text-xs w-fit">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`px-3 py-1 rounded ${
          v === null ? "bg-white shadow-sm" : "text-slate-600"
        }`}
      >
        —
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`px-3 py-1 rounded ${
          v === false ? "bg-white text-red-700 shadow-sm" : "text-slate-600"
        }`}
      >
        No
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`px-3 py-1 rounded ${
          v === true ? "bg-white text-green-800 shadow-sm" : "text-slate-600"
        }`}
      >
        Sí
      </button>
    </div>
  );
}
