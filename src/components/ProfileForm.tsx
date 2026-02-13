"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { DateSkyProfile, ProfilePhoto } from "@/lib/atproto/lexicon";
import TagInput from "./TagInput";
import IntentionPicker from "./IntentionPicker";
import PhotoUpload from "./PhotoUpload";

export default function ProfileForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [intentions, setIntentions] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [gender, setGender] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [age, setAge] = useState<number | "">("");
  const [tags, setTags] = useState<string[]>([]);
  const [createdAt, setCreatedAt] = useState("");

  useEffect(() => {
    fetch("/api/profile")
      .then(async (res) => {
        if (res.ok) {
          const data: DateSkyProfile = await res.json();
          if (data) {
            setDisplayName(data.displayName ?? "");
            setBio(data.bio ?? "");
            setPhotos(data.photos ?? []);
            setIntentions(data.intentions ?? []);
            setLocation(data.location ?? "");
            setGender(data.gender ?? "");
            setPronouns(data.pronouns ?? "");
            setAge(data.age ?? "");
            setTags(data.tags ?? []);
            setCreatedAt(data.createdAt);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (age !== "" && age < 18) {
      alert("You must be 18 or older.");
      return;
    }

    setSaving(true);
    try {
      const record: DateSkyProfile = {
        createdAt: createdAt || new Date().toISOString(),
      };

      if (displayName) record.displayName = displayName;
      if (bio) record.bio = bio;
      if (photos.length > 0) record.photos = photos;
      if (intentions.length > 0) record.intentions = intentions;
      if (location) record.location = location;
      if (gender) record.gender = gender;
      if (pronouns) record.pronouns = pronouns;
      if (age !== "") record.age = Number(age);
      if (tags.length > 0) record.tags = tags;

      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });

      if (res.ok) {
        router.push("/browse");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save profile.");
      }
    } catch {
      alert("Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="text-sky-400 text-center py-12">Loading profile...</div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-sky-300 mb-1">
          Display Name
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={64}
          className="w-full bg-sky-900/50 border border-sky-700 rounded-lg px-4 py-2 text-white placeholder-sky-500 focus:outline-none focus:border-sky-400"
          placeholder="Your name on DateSky"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-sky-300 mb-1">
          Bio
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={1024}
          rows={4}
          className="w-full bg-sky-900/50 border border-sky-700 rounded-lg px-4 py-2 text-white placeholder-sky-500 focus:outline-none focus:border-sky-400 resize-none"
          placeholder="Tell people about yourself..."
        />
        <p className="text-sky-600 text-xs mt-1">{bio.length}/1024</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-sky-300 mb-2">
          Photos
        </label>
        <PhotoUpload photos={photos} onChange={setPhotos} />
      </div>

      <div>
        <label className="block text-sm font-medium text-sky-300 mb-2">
          Looking for
        </label>
        <IntentionPicker intentions={intentions} onChange={setIntentions} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-sky-300 mb-1">
            Location
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full bg-sky-900/50 border border-sky-700 rounded-lg px-4 py-2 text-white placeholder-sky-500 focus:outline-none focus:border-sky-400"
            placeholder="Portland, OR"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-sky-300 mb-1">
            Age
          </label>
          <input
            type="number"
            value={age}
            onChange={(e) =>
              setAge(e.target.value ? Number(e.target.value) : "")
            }
            min={18}
            className="w-full bg-sky-900/50 border border-sky-700 rounded-lg px-4 py-2 text-white placeholder-sky-500 focus:outline-none focus:border-sky-400"
            placeholder="18+"
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-sky-300 mb-1">
            Gender
          </label>
          <input
            type="text"
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="w-full bg-sky-900/50 border border-sky-700 rounded-lg px-4 py-2 text-white placeholder-sky-500 focus:outline-none focus:border-sky-400"
            placeholder="Freeform"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-sky-300 mb-1">
            Pronouns
          </label>
          <input
            type="text"
            value={pronouns}
            onChange={(e) => setPronouns(e.target.value)}
            className="w-full bg-sky-900/50 border border-sky-700 rounded-lg px-4 py-2 text-white placeholder-sky-500 focus:outline-none focus:border-sky-400"
            placeholder="they/them"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-sky-300 mb-2">
          Tags
        </label>
        <TagInput tags={tags} onChange={setTags} />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-sky-500 hover:bg-sky-400 disabled:bg-sky-700 text-white font-semibold py-3 rounded-lg transition-colors"
      >
        {saving ? "Saving..." : createdAt ? "Update Profile" : "Create Profile"}
      </button>
    </form>
  );
}
