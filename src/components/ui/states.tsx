import type { ReactNode } from "react";
import type { ApiState } from "@/lib/client/use-api";

/** Skeleton rows matching Panel list rows. */
export function LoadingBlock({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 px-4 py-4 ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-4" style={{ width: `${92 - ((i * 17) % 35)}%` }} />
      ))}
    </div>
  );
}

function Shell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col items-center gap-1.5 px-4 py-8 text-center ${className}`}>{children}</div>;
}

const actionBtn =
  "mt-2 inline-flex h-8 cursor-pointer items-center rounded-lg border border-line px-3 text-[12.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-fg";

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <Shell>
      <p className="text-[13.5px] font-medium">{title}</p>
      {body && <p className="max-w-[46ch] text-[13px] text-muted">{body}</p>}
      {action}
    </Shell>
  );
}

/** A feature the server is not configured for. Explains what the operator must set; never shows sample data. */
export function UnavailableState({ message, missingEnv }: { message: string; missingEnv?: string[] }) {
  const names = missingEnv?.filter(Boolean) ?? [];
  return (
    <Shell>
      <p className="text-[13.5px] font-medium">Not configured</p>
      <p className="max-w-[52ch] text-[13px] text-muted">{message}</p>
      {names.length > 0 && (
        <p className="max-w-[52ch] text-[12px] text-faint">
          The operator needs to set{" "}
          {names.map((n, i) => (
            <span key={n}>
              {i > 0 && (i === names.length - 1 ? " and " : ", ")}
              <code className="rounded bg-hover px-1 py-0.5 font-mono text-[11.5px] text-muted">{n}</code>
            </span>
          ))}{" "}
          in the server environment (.env.local locally, project settings on Vercel).
        </p>
      )}
    </Shell>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Shell>
      <p className="text-[13.5px] font-medium text-down">Could not load</p>
      <p className="max-w-[52ch] text-[13px] text-muted">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={actionBtn}>
          Try again
        </button>
      )}
    </Shell>
  );
}

type ApiViewProps<T> = {
  state: ApiState<T>;
  children: (data: T) => ReactNode;
  loadingRows?: number;
  /** Rendered when the data is ok but empty (decided by `isEmpty`). */
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
};

/** Renders the right state for a useApi() result; children get the data once it is there. */
export function ApiView<T>({ state, children, loadingRows = 3, empty, isEmpty }: ApiViewProps<T>) {
  if (state.status === "unavailable" && state.error) {
    return <UnavailableState message={state.error.message} missingEnv={state.error.missingEnv} />;
  }
  if (state.status === "error" && state.error) return <ErrorState message={state.error.message} onRetry={state.reload} />;
  if (state.data === null) return state.status === "idle" ? null : <LoadingBlock rows={loadingRows} />;
  if (isEmpty?.(state.data)) return <>{empty ?? <EmptyState title="Nothing to show" />}</>;
  return <>{children(state.data)}</>;
}
