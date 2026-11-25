"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { type OwnAiProvider, clearOwnAiKey, saveOwnAiKey, useOwnAiKey } from "@/lib/client/ai-key";

const PROVIDERS: { id: OwnAiProvider; label: string; getUrl: string; hint: string }[] = [
  { id: "gemini", label: "Gemini (free)", getUrl: "https://aistudio.google.com/apikey", hint: "Free key from Google AI Studio" },
  { id: "anthropic", label: "Anthropic", getUrl: "https://platform.claude.com/settings/keys", hint: "Paid key, starts with sk-ant-" },
];

const KEY_RE: Record<OwnAiProvider, RegExp> = {
  anthropic: /^sk-ant-[A-Za-z0-9_-]{20,300}$/,
  gemini: /^[A-Za-z0-9_-]{30,100}$/,
};

/** "Use your own AI key": the AI features then run on the visitor's key, which never leaves this browser except with their AI requests. */
export function AiKeyForm({ openSignal = 0 }: { openSignal?: number }) {
  const saved = useOwnAiKey();
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (openSignal > 0 && details.current) details.current.open = true;
  }, [openSignal]);
  const [provider, setProvider] = useState<OwnAiProvider>("gemini");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (saved) {
    const name = PROVIDERS.find((p) => p.id === saved.provider)?.label.replace(" (free)", "") ?? saved.provider;
    return (
      <div className="space-y-1.5 border-t border-line pt-2.5">
        <p className="text-[12.5px] text-muted">
          AI runs on your {name} key ending <span className="font-mono text-fg">{saved.key.slice(-4)}</span>. It stays in this browser.
        </p>
        <button type="button" onClick={clearOwnAiKey} className="cursor-pointer text-[12.5px] font-medium text-muted underline-offset-2 hover:text-fg hover:underline">
          Remove my key
        </button>
      </div>
    );
  }

  const chosen = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const k = key.trim();
    if (!KEY_RE[provider].test(k)) return setError(provider === "anthropic" ? "Anthropic keys start with sk-ant-." : "That does not look like a Gemini API key.");
    if (!saveOwnAiKey({ provider, key: k })) return setError("This browser blocks storage, so the key cannot be kept.");
    setKey("");
    setError(null);
  };

  return (
    <details ref={details} className="group border-t border-line pt-2.5">
      <summary className="cursor-pointer text-[12.5px] font-medium text-muted hover:text-fg">Use your own AI key</summary>
      <form onSubmit={submit} className="mt-2 space-y-2" noValidate>
        <p className="text-[12px] text-faint">The AI features then run on your key. It stays in this browser and is sent only with your AI requests; the server never stores it.</p>
        <div role="radiogroup" aria-label="AI provider" className="flex gap-1.5">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={provider === p.id}
              onClick={() => setProvider(p.id)}
              className={`h-8 flex-1 cursor-pointer rounded-lg border text-[12.5px] font-medium ${provider === p.id ? "border-fg text-fg" : "border-line text-muted hover:text-fg"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="sr-only">{chosen.label} API key</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={provider === "anthropic" ? "sk-ant-..." : "Paste your Gemini API key"}
            className="h-9 w-full rounded-lg border border-line-strong bg-bg px-3 font-mono text-[13px] outline-none focus:border-fg"
          />
        </label>
        {error && <p className="text-[12.5px] text-down">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <a href={chosen.getUrl} target="_blank" rel="noreferrer" className="text-[12px] text-muted underline-offset-2 hover:text-fg hover:underline">
            {chosen.hint}
          </a>
          <button type="submit" className="h-8 cursor-pointer rounded-lg bg-fg px-3 text-[12.5px] font-medium text-bg hover:opacity-90">
            Save key
          </button>
        </div>
      </form>
    </details>
  );
}
