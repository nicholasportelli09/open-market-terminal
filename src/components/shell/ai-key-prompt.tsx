"use client";

/** Event that opens the account menu on its "Use your own AI key" form (listened for in account-menu.tsx). */
export const OPEN_AI_KEY_EVENT = "terminal:open-ai-key";

export function openAiKeyForm(): void {
  window.dispatchEvent(new Event(OPEN_AI_KEY_EVENT));
}

/** Shown where an AI answer would be when this visitor may not use the server's AI: one button to add their key. */
export function AiKeyPrompt({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-1.5 px-4 py-6 text-center ${className}`}>
      <p className="text-[13.5px] font-medium">AI here runs on your own key</p>
      <p className="max-w-[52ch] text-[13px] text-muted">Add a free Gemini key or an Anthropic key. It stays in your browser and is used only for your requests.</p>
      <button
        type="button"
        onClick={openAiKeyForm}
        className="mt-2 inline-flex h-9 cursor-pointer items-center rounded-lg bg-fg px-3.5 text-[13px] font-semibold text-bg hover:opacity-85"
      >
        Add your AI key
      </button>
    </div>
  );
}
