// Small shared UI pieces. Everything here is presentational: no studio state,
// so any view can use them without pulling in the engine.

import type { ReactNode } from 'react';

export function Panel({
  title,
  hint,
  right,
  children,
  className = '',
  bodyClassName = '',
}: {
  title?: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}): JSX.Element {
  return (
    <section className={`panel ${className}`}>
      {(title || right) && (
        <header className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
          <div className="min-w-0 flex-1">
            {title && <h2 className="truncate text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-300)]">{title}</h2>}
            {hint && <p className="mt-0.5 truncate text-[11px] text-[var(--ink-400)]">{hint}</p>}
          </div>
          {right}
        </header>
      )}
      <div className={`p-3 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function Field({ label, hint, children, right }: { label: string; hint?: string; children: ReactNode; right?: ReactNode }): JSX.Element {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-2">
        <span className="flex-1 text-[11px] font-medium text-[var(--ink-300)]">{label}</span>
        {right}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-[var(--ink-400)]">{hint}</span>}
    </label>
  );
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        className="min-w-0 flex-1"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="w-9 shrink-0 text-right font-mono text-[11px] text-[var(--ink-200)]">{value}</span>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className = '',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; title?: string }[];
  className?: string;
}): JSX.Element {
  return (
    <div className={`flex flex-wrap gap-1 rounded-lg border border-white/[0.06] bg-[var(--ink-850)] p-1 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            title={o.title ?? o.label}
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
              active
                ? 'bg-[var(--brass-500)] text-[#1a1305]'
                : 'text-[var(--ink-300)] hover:bg-[var(--ink-700)] hover:text-[var(--ink-100)]'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-[var(--ink-850)]"
    >
      <span
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${checked ? 'bg-[var(--brass-500)]' : 'bg-[var(--ink-600)]'}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-[var(--ink-100)] transition-transform ${checked ? 'translate-x-3.5' : 'translate-x-0.5'}`}
        />
      </span>
      <span className="text-[11px] text-[var(--ink-200)]">{label}</span>
    </button>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}): JSX.Element {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="field w-full appearance-none py-1.5 pl-2 pr-7 text-[12px] disabled:opacity-40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[var(--ink-850)]">
            {o.label}
          </option>
        ))}
      </select>
      <svg viewBox="0 0 10 6" className="pointer-events-none absolute right-2 top-1/2 h-1.5 w-2.5 -translate-y-1/2 fill-[var(--ink-400)]">
        <path d="M0 0l5 6 5-6z" />
      </svg>
    </div>
  );
}

export function Btn({
  children,
  onClick,
  variant = 'default',
  disabled,
  title,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost';
  disabled?: boolean;
  title?: string;
  className?: string;
}): JSX.Element {
  const v = variant === 'primary' ? 'btn-primary' : variant === 'ghost' ? 'btn-ghost' : '';
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={`btn ${v} px-2.5 py-1.5 text-[12px] ${className}`}>
      {children}
    </button>
  );
}

export function Stat({ label, value, mono = true }: { label: string; value: ReactNode; mono?: boolean }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-[11px] text-[var(--ink-400)]">{label}</span>
      <span className={`text-[11px] text-[var(--ink-100)] ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex h-full min-h-[140px] items-center justify-center p-6 text-center text-[12px] leading-relaxed text-[var(--ink-400)]">
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] text-[var(--ink-300)]">
      <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-[var(--ink-600)] border-t-[var(--brass-400)]" />
      {label}
    </span>
  );
}
