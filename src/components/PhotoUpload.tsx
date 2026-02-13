"use client";

import { useRef } from "react";
import type { ProfilePhoto } from "@/lib/atproto/lexicon";

interface PhotoUploadProps {
  photos: ProfilePhoto[];
  onChange: (photos: ProfilePhoto[]) => void;
  max?: number;
}

export default function PhotoUpload({
  photos,
  onChange,
  max = 6,
}: PhotoUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Upload failed");
      return;
    }

    const { blob } = await res.json();
    const newPhoto: ProfilePhoto = {
      image: blob,
      alt: "",
    };
    onChange([...photos, newPhoto]);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  }

  function removePhoto(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  function updateAlt(index: number, alt: string) {
    const updated = [...photos];
    updated[index] = { ...updated[index], alt };
    onChange(updated);
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        {photos.map((photo, i) => (
          <div key={i} className="relative">
            <div className="aspect-square bg-sky-900/50 rounded-lg border border-sky-700 flex items-center justify-center text-sky-500 text-xs">
              Photo {i + 1}
            </div>
            <button
              type="button"
              onClick={() => removePhoto(i)}
              className="absolute -top-2 -right-2 bg-red-600 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center hover:bg-red-500"
            >
              x
            </button>
            <input
              type="text"
              placeholder="Alt text"
              value={photo.alt}
              onChange={(e) => updateAlt(i, e.target.value)}
              className="mt-1 w-full bg-sky-900/30 border border-sky-800 rounded px-2 py-1 text-xs text-white placeholder-sky-600 focus:outline-none focus:border-sky-500"
            />
          </div>
        ))}

        {photos.length < max && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="aspect-square bg-sky-900/30 rounded-lg border-2 border-dashed border-sky-700 flex items-center justify-center text-sky-500 hover:border-sky-500 hover:text-sky-400 transition-colors"
          >
            + Add photo
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />
      <p className="text-sky-600 text-xs mt-2">
        {photos.length}/{max} photos. PNG, JPEG, or WebP. Max 1MB each.
      </p>
    </div>
  );
}
