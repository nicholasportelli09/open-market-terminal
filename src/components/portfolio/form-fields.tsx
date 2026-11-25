"use client";

import type { ReactNode } from "react";

/** Label + control + hint + field error, wired for screen readers through ids. */
export function Field({ id, label, error, hint, children, wide }: { id: string; label: string; error?: string; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <label htmlFor={id} className="block text-[12.5px] font-medium text-muted">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[12px] leading-snug text-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-[12px] leading-snug text-down">
          {error}
        </p>
      )}
    </div>
  );
}

/** aria props for a control inside <Field>. */
export function aria(id: string, error: string | undefined, hasHint = false) {
  const describedBy = error ? `${id}-err` : hasHint ? `${id}-hint` : undefined;
  return { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy };
}
