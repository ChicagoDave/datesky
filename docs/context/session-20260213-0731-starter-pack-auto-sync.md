# Session Summary: 2026-02-13 - Starter Pack Auto-Sync (EST)

## Status: Completed

## Goals
- Automatically maintain a Bluesky starter pack containing all DateSky users
- Auto-add new profiles when users sign up
- Auto-remove profiles when users delete their DateSky profiles
- Backfill existing users into the starter pack

## Completed

### 1. Bluesky Starter Pack Management System

Implemented a complete automated system for managing a Bluesky starter pack that serves as a directory of all DateSky users.

**Key Discovery**: Initially considered using a plain Bluesky list, but discovered that lists display a noisy feed of all posts + replies from list members. Switched to **Starter Packs** instead, which display profiles in a clean grid format without the post feed noise. Starter packs are backed by an underlying `app.bsky.graph.list`, so the list management code works the same way.

### 2. ListManager Class (`src/lib/atproto/list-manager.ts`)

Created a new `ListManager` class to encapsulate all Bluesky list operations:

- **`getExistingMembers()`**: Paginates through `com.atproto.repo.listRecords` to fetch all current list members, returns Map of DID → record URI
- **`addMember(did)`**: Creates a new `app.bsky.graph.listitem` record for a user
- **`removeMember(recordUri)`**: Deletes a listitem by its AT Protocol URI
- **`removeMemberByDid(did)`**: Convenience method that looks up and removes a member by DID

The class handles Bluesky's pagination patterns and provides a clean interface for list operations.

### 3. Backfill Script (`scripts/backfill-list.ts`)

Created a one-time migration script to populate the starter pack with all existing DateSky profiles:

- Queries all DIDs from the SQLite profiles table
- Checks existing list members to avoid duplicates
- Adds missing profiles to the list
- Includes rate limit handling and progress logging
- Can be run via `npm run backfill-list`

### 4. Jetstream Real-Time Integration (`scripts/jetstream.ts`)

Enhanced the Jetstream WebSocket subscriber to automatically sync the starter pack:

- Added `initListManager()` function that initializes the ListManager at startup
- Graceful degradation: if env vars are missing or auth fails, continues running without list sync
- **On profile `create` events**: Automatically adds the user's DID to the Bluesky starter pack
- **On profile `delete` events**: Automatically removes the user from the starter pack
- Includes error handling and logging for all list operations

### 5. Environment Configuration

Updated `.env` with new required variables:

```bash
DATESKY_LIST_OWNER_DID=did:plc:tjqvsy6bsvsvramlqyb4ba53
DATESKY_LIST_URI=at://did:plc:tjqvsy6bsvsvramlqyb4ba53/app.bsky.graph.list/3mepy7rkzrt2m
```

Also fixed `OAUTH_PRIVATE_KEY` by single-quoting the value, making the `.env` file compatible with bash `source .env` for systemd units.

### 6. Server Deployment

Updated the systemd service unit on production server:

- Added `EnvironmentFile=/home/dave/repos/datesky/.env` to `datesky-jetstream.service`
- This provides the Jetstream process with OAuth credentials and list management env vars
- Service restarted to pick up the changes

## Key Decisions

### 1. Starter Pack vs. Plain List

**Decision**: Use a Bluesky Starter Pack instead of a plain list for the DateSky user directory.

**Rationale**: Plain Bluesky lists show a chronological feed of posts + replies from all list members, which becomes noisy as non-DateSky users interact with DateSky users. Starter packs display a clean grid of profile cards without any post content, which is the desired UX for a dating profile directory.

**Implementation**: Starter packs are backed by an underlying `app.bsky.graph.list` record, so the list management code works identically. The only difference is how Bluesky renders the UI.

### 2. Opt-In List Management

**Decision**: Made list management completely optional via environment variables.

**Rationale**:
- Allows local development without needing list credentials
- Gracefully handles missing configuration
- Jetstream continues normal profile indexing even if list sync fails
- Makes the system more resilient and easier to test

### 3. Single-Responsibility ListManager Class

**Decision**: Created a dedicated `ListManager` class rather than mixing list operations into existing modules.

**Rationale**:
- Clear separation of concerns
- Easier to test and maintain
- Can be reused for future list-related features
- Encapsulates Bluesky's pagination and record management patterns

### 4. Backfill as Separate Script

**Decision**: Created a standalone backfill script rather than auto-backfilling on Jetstream startup.

**Rationale**:
- Backfill is a one-time operation, not something to repeat
- Allows manual control over when backfill runs
- Easier to monitor progress and handle rate limits
- Keeps Jetstream startup fast and focused on real-time events

## Open Items

### Short Term
- None — feature is complete and deployed

### Long Term
- Consider adding admin UI to manually add/remove users from the starter pack
- Monitor for Bluesky rate limits as the user base grows
- Consider batch operations if list grows very large (currently ~20 users)

## Files Modified

**Configuration** (1 file):
- `.env` — Added `DATESKY_LIST_OWNER_DID` and `DATESKY_LIST_URI`, quoted `OAUTH_PRIVATE_KEY`

**New Library Code** (1 file):
- `src/lib/atproto/list-manager.ts` — ListManager class for Bluesky list operations

**Scripts** (2 files):
- `scripts/backfill-list.ts` — One-time backfill script to populate list with existing users
- `scripts/jetstream.ts` — Enhanced with automatic list sync on profile create/delete events

**Build Configuration** (1 file):
- `package.json` — Added `backfill-list` npm script

**Server Configuration** (1 file, not in repo):
- `/etc/systemd/system/datesky-jetstream.service` — Added `EnvironmentFile` directive

## Architectural Notes

### AT Protocol List Management

Bluesky lists are managed via `app.bsky.graph.list` (the list itself) and `app.bsky.graph.listitem` (individual members). Key patterns:

1. **List records** define metadata (name, description, purpose)
2. **Listitem records** represent membership, with `subject` field containing the DID
3. Listitems are stored in the list owner's repo at `app.bsky.graph.listitem/*`
4. Deletion requires the full AT Protocol URI of the listitem record

### Pagination Pattern

The `getExistingMembers()` method demonstrates the standard AT Protocol pagination pattern:

```typescript
let cursor: string | undefined;
do {
  const response = await agent.api.com.atproto.repo.listRecords({
    repo: ownerDid,
    collection: 'app.bsky.graph.listitem',
    limit: 100,
  });
  // process records...
  cursor = response.cursor;
} while (cursor);
```

This pattern is reusable for any AT Protocol record collection.

### Jetstream Event Filtering

The Jetstream integration filters for:
- `collection === 'app.datesky.profile'`
- `commit.operation === 'create'` or `'delete'`

This ensures list sync only triggers for DateSky profile events, not other AT Protocol records.

## Production URLs

**Starter Pack**: https://bsky.app/start/did:plc:tjqvsy6bsvsvramlqyb4ba53/3mepy7rorve2s

**Underlying List URI**: `at://did:plc:tjqvsy6bsvsvramlqyb4ba53/app.bsky.graph.list/3mepy7rkzrt2m`

**List Owner DID**: `did:plc:tjqvsy6bsvsvramlqyb4ba53` (David's Bluesky account)

## Notes

**Session duration**: ~2 hours

**Approach**:
1. Researched Bluesky list vs. starter pack behavior
2. Created ListManager abstraction for list operations
3. Built backfill script to migrate existing users
4. Integrated real-time sync into Jetstream subscriber
5. Deployed and tested on production server

**Testing**: Manually tested create/delete flows on production. Verified that new profiles appear in the starter pack within seconds, and deleted profiles are removed immediately.

---

**Progressive update**: Session completed 2026-02-13 07:31 EST
