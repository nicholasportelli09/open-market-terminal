import type { ReactNode } from "react";

type PanelProps = {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function Panel({ title, action, children, className = "", bodyClassName = "" }: PanelProps) {
  return (
    <section className={`rounded-2xl border border-line bg-card ${className}`}>
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">{title}</h2>
        {action}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

type SegmentedProps<T extends string> = {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  size?: "sm" | "md";
};

export function Segmented<T extends string>({ options, value, onChange, label, size = "sm" }: SegmentedProps<T>) {
  const pad = size === "sm" ? "min-h-8 px-2.5 py-1 text-[12.5px] sm:min-h-0" : "px-3 py-1.5 text-[13px]";
  return (
    <div role="tablist" aria-label={label} className="no-scrollbar flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-hover p-0.5">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={`shrink-0 cursor-pointer whitespace-nowrap rounded-md font-medium transition-colors ${pad} ${
              active ? "bg-card text-fg shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-muted hover:text-fg"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return <p className="px-4 py-6 text-center text-[13px] text-muted">{message}</p>;
}
