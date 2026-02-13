"use client";

import { KNOWN_INTENTIONS } from "@/lib/atproto/lexicon";

interface IntentionPickerProps {
  intentions: string[];
  onChange: (intentions: string[]) => void;
}

export default function IntentionPicker({
  intentions,
  onChange,
}: IntentionPickerProps) {
  function toggle(value: string) {
    if (intentions.includes(value)) {
      onChange(intentions.filter((i) => i !== value));
    } else if (intentions.length < 5) {
      onChange([...intentions, value]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {KNOWN_INTENTIONS.map((intention) => (
        <button
          key={intention}
          type="button"
          onClick={() => toggle(intention)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            intentions.includes(intention)
              ? "bg-sky-500 text-white"
              : "bg-sky-900/50 text-sky-300 border border-sky-700 hover:border-sky-500"
          }`}
        >
          {intention}
        </button>
      ))}
      <p className="w-full text-sky-600 text-xs mt-1">
        Select what you are looking for (up to 5).
      </p>
    </div>
  );
}
