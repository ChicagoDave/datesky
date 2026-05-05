"use client";

/**
 * Client form for the settings page.
 *
 * Public interface: receives initial prefs from the server, lets the user toggle them,
 *   POSTs to /api/settings on save.
 * Owner context: settings UI.
 *
 * Validation matches the API: age floor 18, intent enum, ranges where min <= max.
 * The API is the source of truth; this form does cheap client-side checks for UX only.
 */
import { useState } from "react";
import type {
  MatchIntent,
  UserPreferences,
} from "@/lib/db/queries";

interface SettingsFormProps {
  initial: UserPreferences;
}

const COMMON_GENDERS = [
  "woman",
  "man",
  "nonbinary",
  "trans",
  "genderqueer",
];

const AGE_FLOOR = 18;
const AGE_CEILING = 120;

export default function SettingsForm({ initial }: SettingsFormProps) {
  const [baseline, setBaseline] = useState(initial);
  const [showPhotos, setShowPhotos] = useState(initial.show_photos);
  const [compactView, setCompactView] = useState(initial.compact_view);
  const [matchModeEnabled, setMatchModeEnabled] = useState(
    initial.match_mode_enabled
  );
  const [matchIntent, setMatchIntent] = useState<MatchIntent>(
    initial.match_intent
  );
  const [datingAgeMin, setDatingAgeMin] = useState<number>(
    initial.dating_age_min ?? 25
  );
  const [datingAgeMax, setDatingAgeMax] = useState<number>(
    initial.dating_age_max ?? 45
  );
  const [friendshipAgeMin, setFriendshipAgeMin] = useState<number>(
    initial.friendship_age_min ?? AGE_FLOOR
  );
  const [friendshipAgeMax, setFriendshipAgeMax] = useState<number>(
    initial.friendship_age_max ?? 99
  );
  const [genderPreferences, setGenderPreferences] = useState<string[]>(
    initial.gender_preferences
  );
  const [locationFilter, setLocationFilter] = useState<string>(
    initial.location_filter ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    showPhotos !== baseline.show_photos ||
    compactView !== baseline.compact_view ||
    matchModeEnabled !== baseline.match_mode_enabled ||
    matchIntent !== baseline.match_intent ||
    datingAgeMin !== (baseline.dating_age_min ?? 25) ||
    datingAgeMax !== (baseline.dating_age_max ?? 45) ||
    friendshipAgeMin !== (baseline.friendship_age_min ?? AGE_FLOOR) ||
    friendshipAgeMax !== (baseline.friendship_age_max ?? 99) ||
    !arraysEqual(genderPreferences, baseline.gender_preferences) ||
    locationFilter !== (baseline.location_filter ?? "");

  const showDatingRange =
    matchIntent === "dating" || matchIntent === "both";
  const showFriendshipRange =
    matchIntent === "friendship" || matchIntent === "both";

  const datingRangeError =
    showDatingRange && datingAgeMin > datingAgeMax
      ? "Dating age min must be ≤ max."
      : null;
  const friendshipRangeError =
    showFriendshipRange && friendshipAgeMin > friendshipAgeMax
      ? "Friendship age min must be ≤ max."
      : null;
  const localError = datingRangeError || friendshipRangeError;

  function toggleGender(g: string) {
    setGenderPreferences((current) =>
      current.includes(g) ? current.filter((v) => v !== g) : [...current, g]
    );
  }

  async function handleSave() {
    if (localError) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        show_photos: showPhotos,
        compact_view: compactView,
        match_mode_enabled: matchModeEnabled,
        match_intent: matchIntent,
        dating_age_min: datingAgeMin,
        dating_age_max: datingAgeMax,
        friendship_age_min: friendshipAgeMin,
        friendship_age_max: friendshipAgeMax,
        gender_preferences: genderPreferences,
        location_filter: locationFilter.trim() || null,
      };
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error || "Could not save settings.");
      } else {
        const next = (await res.json()) as UserPreferences;
        setBaseline(next);
        setSavedAt(Date.now());
      }
    } catch {
      setError("Network error saving settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-10">
      <section className="space-y-6">
        <h2 className="text-sm font-semibold text-sky-300 uppercase tracking-wide">
          Viewing
        </h2>
        <Toggle
          label="Show profile photos"
          description="When off, photos are stripped from profiles before they reach your browser. Frees up bandwidth and avoids accidental exposure."
          checked={showPhotos}
          onChange={setShowPhotos}
        />
        <Toggle
          label="Compact view"
          description="Browse profiles as a tight list of handle, age, location, and tags. No images regardless of the photos setting."
          checked={compactView}
          onChange={setCompactView}
        />
      </section>

      <section className="space-y-6">
        <h2 className="text-sm font-semibold text-sky-300 uppercase tracking-wide">
          Match mode
        </h2>
        <Toggle
          label="Match mode"
          description="Show only profiles that fit your preferences. Profiles that fail one filter are summarized below the list, not shown."
          checked={matchModeEnabled}
          onChange={setMatchModeEnabled}
        />

        <div
          className={
            matchModeEnabled
              ? "space-y-6 pl-4 border-l-2 border-[#9b4f96]/40"
              : "space-y-6 pl-4 border-l-2 border-white/5 opacity-50 pointer-events-none"
          }
        >
          <Field label="Looking for">
            <div className="flex flex-wrap gap-2">
              {(["dating", "friendship", "both"] as MatchIntent[]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setMatchIntent(opt)}
                  className={
                    matchIntent === opt
                      ? "px-4 py-1.5 rounded-full bg-gradient-to-r from-[#d60270] to-[#9b4f96] text-white text-sm font-medium"
                      : "px-4 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-sky-300 text-sm transition-colors"
                  }
                >
                  {opt[0].toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
          </Field>

          {showDatingRange && (
            <Field label="Dating age range">
              <RangeInput
                min={datingAgeMin}
                max={datingAgeMax}
                onMinChange={setDatingAgeMin}
                onMaxChange={setDatingAgeMax}
              />
              {datingRangeError && (
                <p className="text-xs text-red-400 mt-1">{datingRangeError}</p>
              )}
            </Field>
          )}

          {showFriendshipRange && (
            <Field label="Friendship age range">
              <RangeInput
                min={friendshipAgeMin}
                max={friendshipAgeMax}
                onMinChange={setFriendshipAgeMin}
                onMaxChange={setFriendshipAgeMax}
              />
              {friendshipRangeError && (
                <p className="text-xs text-red-400 mt-1">
                  {friendshipRangeError}
                </p>
              )}
            </Field>
          )}

          <Field
            label="Gender preferences"
            help="A profile matches if its gender contains any selected term. Empty = no filter."
          >
            <div className="flex flex-wrap gap-2">
              {COMMON_GENDERS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggleGender(g)}
                  className={
                    genderPreferences.includes(g)
                      ? "px-3 py-1.5 rounded-full bg-gradient-to-r from-[#d60270] to-[#9b4f96] text-white text-sm font-medium"
                      : "px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-sky-300 text-sm transition-colors"
                  }
                >
                  {g}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="Location contains"
            help="Substring match against the candidate's location. Leave empty for no filter."
          >
            <input
              type="text"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              placeholder="Chicago"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-sky-600 focus:outline-none focus:border-[#9b4f96]"
              maxLength={200}
            />
          </Field>
        </div>
      </section>

      <div className="flex items-center gap-4 pt-4">
        <button
          onClick={handleSave}
          disabled={!dirty || saving || !!localError}
          className="bg-gradient-to-r from-[#d60270] to-[#9b4f96] hover:from-[#e0357a] hover:to-[#a95fa8] disabled:from-sky-800 disabled:to-sky-800 disabled:cursor-not-allowed text-white font-semibold px-5 py-2 rounded-lg transition-colors"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {savedAt && !dirty && (
          <span className="text-sm text-sky-400">Saved.</span>
        )}
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </div>
  );
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

interface ToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

function Toggle({ label, description, checked, onChange }: ToggleProps) {
  return (
    <label className="flex items-start gap-4 cursor-pointer group">
      <span className="relative inline-flex flex-shrink-0 mt-1">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="w-11 h-6 bg-white/10 peer-checked:bg-[#9b4f96] rounded-full transition-colors" />
        <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
      </span>
      <span className="flex-1">
        <span className="block text-white font-medium">{label}</span>
        <span className="block text-sm text-sky-300 mt-0.5">{description}</span>
      </span>
    </label>
  );
}

interface FieldProps {
  label: string;
  help?: string;
  children: React.ReactNode;
}

function Field({ label, help, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        {help && <div className="text-xs text-sky-400 mt-0.5">{help}</div>}
      </div>
      {children}
    </div>
  );
}

interface RangeInputProps {
  min: number;
  max: number;
  onMinChange: (n: number) => void;
  onMaxChange: (n: number) => void;
}

function RangeInput({ min, max, onMinChange, onMaxChange }: RangeInputProps) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="number"
        min={AGE_FLOOR}
        max={AGE_CEILING}
        value={min}
        onChange={(e) =>
          onMinChange(clampAge(parseInt(e.target.value, 10) || AGE_FLOOR))
        }
        className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#9b4f96]"
      />
      <span className="text-sky-400 text-sm">to</span>
      <input
        type="number"
        min={AGE_FLOOR}
        max={AGE_CEILING}
        value={max}
        onChange={(e) =>
          onMaxChange(clampAge(parseInt(e.target.value, 10) || AGE_FLOOR))
        }
        className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#9b4f96]"
      />
      <span className="text-sky-500 text-xs">years old</span>
    </div>
  );
}

function clampAge(n: number): number {
  if (!Number.isFinite(n)) return AGE_FLOOR;
  if (n < AGE_FLOOR) return AGE_FLOOR;
  if (n > AGE_CEILING) return AGE_CEILING;
  return n;
}
