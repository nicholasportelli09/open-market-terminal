"use client";

import { useEffect, useState } from "react";

type Pref = "theme" | "calm";

function readPref(pref: Pref): boolean {
  const d = document.documentElement.dataset;
  return pref === "theme" ? d.theme === "dark" : d.calm === "1";
}

function writePref(pref: Pref, on: boolean) {
  const d = document.documentElement.dataset;
  if (pref === "theme") d.theme = on ? "dark" : "light";
  else if (on) d.calm = "1";
  else delete d.calm;
  try {
    localStorage.setItem(pref === "theme" ? "terminal.theme" : "terminal.calm", pref === "theme" ? (on ? "dark" : "light") : on ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}

function usePref(pref: Pref) {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(readPref(pref)), [pref]);
  return [on, () => { writePref(pref, !on); setOn(!on); }] as const;
}

const btn =
  "grid h-10 w-10 cursor-pointer place-items-center rounded-xl border border-line text-muted transition-colors hover:bg-hover hover:text-fg";

export function PrefsToggles() {
  const [dark, toggleDark] = usePref("theme");
  const [calm, toggleCalm] = usePref("calm");
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={toggleCalm} className={btn} aria-pressed={calm} title={calm ? "Calm mode on: no animation" : "Calm mode: turn off animation"} aria-label="Toggle calm mode">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          {calm ? <path d="M4 12h16" /> : <path d="M3 12c2.5-5 4.5-5 6 0s3.5 5 6 0 3.5-5 6 0" />}
        </svg>
      </button>
      <button type="button" onClick={toggleDark} className={btn} aria-pressed={dark} title={dark ? "Switch to light" : "Switch to dark"} aria-label="Toggle dark mode">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          {dark ? (
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </>
          ) : (
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
          )}
        </svg>
      </button>
    </div>
  );
}
