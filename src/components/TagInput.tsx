"use client";

import { useState } from "react";
import { isValidProfileTag, normalizeTag } from "@/lib/profile/tag-validation";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  max?: number;
}

export default function TagInput({ tags, onChange, max = 32 }: TagInputProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function addTag(value: string) {
    const tag = normalizeTag(value);
    if (!tag) {
      setError(null);
      return;
    }
    if (tags.length >= max) {
      setError(null);
      return;
    }
    if (tags.includes(tag)) {
      setError(null);
      setInput("");
      return;
    }
    const result = isValidProfileTag(tag);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    onChange([...tags, tag]);
    setInput("");
    setError(null);
  }

  function removeTag(index: number) {
    onChange(tags.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((tag, i) => (
          <span
            key={tag}
            className="bg-sky-800 text-sky-200 text-sm px-3 py-1 rounded-full flex items-center gap-1"
          >
            #{tag}
            <button
              type="button"
              onClick={() => removeTag(i)}
              className="text-sky-400 hover:text-white ml-1"
            >
              x
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => input && addTag(input)}
        placeholder={tags.length >= max ? "Max tags reached" : "Add a tag..."}
        disabled={tags.length >= max}
        className="w-full bg-sky-900/50 border border-sky-700 rounded-lg px-4 py-2 text-white placeholder-sky-500 focus:outline-none focus:border-sky-400"
      />
      {error && (
        <p className="text-red-400 text-xs mt-1" role="alert">
          {error}
        </p>
      )}
      <p className="text-sky-600 text-xs mt-1">
        {tags.length}/{max} tags. Press Enter or comma to add.
      </p>
    </div>
  );
}
