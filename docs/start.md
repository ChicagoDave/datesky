# DateSky: Open Dating on AT Protocol

## The Idea

Create a dating profile on the atproto network. Tag yourself with what you're about and what you're looking for. People find each other through lists, tags, and the social graph that already exists on Bluesky. That's it.

No app to download. No algorithm deciding who you see. No company in the middle. Just an open standard anyone can opt in to.

---

## Why atproto

### Real Identity
Your dating profile is tied to your existing Bluesky handle and DID. No burner accounts, no catfishing — your social history is right there.

### Your Data, Your PDS
Your profile lives in your Personal Data Server. You can delete it anytime. Nobody else controls it.

### Trust Is Already There
Mutual follows, shared communities, and post history provide more trust signal than any verification selfie ever could.

### No Walled Garden
Find someone interesting? You're already on the same network. DM them on Bluesky. No captive messaging system needed.

---

## How It Works

### 1. Create a Profile
You write a `app.datesky.profile` record to your PDS. This contains your dating bio, photos, what you're looking for, and your location (as broad or specific as you want).

### 2. Tag Yourself
Tags describe who you are and what you're into. These are simple, self-applied labels:

```
#queer #portland #hiking #polyam #dog-parent #looking-for-friends #30s
```

Tags are freeform but conventions will emerge from usage. Common ones get listed, niche ones still work.

### 3. Browse Lists and Tags
Anyone can create and curate lists — just like Bluesky lists but for dating profiles:

- **"Queer Portland"** — a community-maintained list
- **"Hikers Looking for Hikers"** — interest-based
- **"New to DateSky This Week"** — freshness-based

You can also just search by tags directly.

### 4. Reach Out
See someone you're interested in? You're both on Bluesky. Message them. No matching gate, no mutual-like requirement. Just people finding people.

---

## Lexicon

One record type: `app.datesky.profile` — stored in your PDS, keyed as `self` (one per account).

**Fields:**

| Field | Type | Description |
|---|---|---|
| `displayName` | string | Name for your dating profile |
| `bio` | string | Free-form dating bio (up to 1024 characters) |
| `photos` | array of blobs | Up to 6 profile photos with alt text |
| `intentions` | array of strings | What you're looking for: `dating`, `friends`, `casual`, `long-term`, or your own |
| `location` | string | As broad or specific as you want |
| `gender` | string | Freeform |
| `pronouns` | string | Freeform |
| `age` | integer | Must be 18+ |
| `tags` | array of strings | Up to 32 self-applied tags for discovery |
| `createdAt` | datetime | When the profile was created |

Only `createdAt` is required. Everything else is optional — fill in what you want.

Tags are just strings on your profile. No taxonomy, no controlled vocabulary. Conventions emerge from usage. The schema lives at [`lexicons/app/datesky/profile.json`](../lexicons/app/datesky/profile.json).

---

## Privacy Considerations

atproto records are public by default. People opting in to DateSky should understand that their dating profile is visible on the network, just like a Bluesky post. This is a feature for some and a dealbreaker for others.

Possible future work:
- Unlisted profiles (discoverable via tags/lists but not indexed publicly)
- Private fields visible only to specific people
- The atproto ecosystem is still evolving on privacy — DateSky can adopt new primitives as they appear

For now, this is for people comfortable with an open profile.

---

## What This Isn't

- **Not a company** — no one owns it, no one profits from it
- **Not an app** — it's a record format and a set of conventions; anyone can build a UI for it
- **Not an algorithm** — no one decides who you see except you (and the people curating lists)
- **Not a gatekeeper** — no matching required to talk to someone

---

## Challenges

### Adoption
People need to know it exists and feel like there are enough people using it in their area. Starting with communities that are already active on Bluesky is the natural path.

### Moderation
Open systems can be abused. Bluesky's existing block/report/label infrastructure helps. Community-maintained lists can also delist bad actors.

### Privacy
Some people won't be comfortable with public dating profiles. That's fine — this isn't for everyone, and better privacy tooling may come with time.

---

## Getting Started (Roadmap)

1. **Define the Lexicon schema** — `app.datesky.profile` (done: [`lexicons/app/datesky/profile.json`](../lexicons/app/datesky/profile.json))
2. **Build a simple web UI** for creating and browsing profiles
3. **Seed with early adopters** from the Bluesky community
4. **Let it grow organically** — lists, tags, and conventions will emerge from real usage

---

**DateSky: Make a profile. Tag yourself. Find each other.**

---

*Concept by David — February 2026*
