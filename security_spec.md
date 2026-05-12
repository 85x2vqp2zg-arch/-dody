# Security Specification for Dody Royale

## Data Invariants
1. **Identity Integrity**: Users can only create and update their own profiles.
2. **Admin Authority**: Only `lm656508@gmail.com` can grant memberships (famous, influencer, premium) or ban/mute users.
3. **Verified Access**: Most operations (except initial profile creation) require `email_verified == true`.
4. **Relational Consistency**: Messages must belong to an existing room (though in RTDB this is handled by path structure).
5. **Immutable Records**: `createdAt` and `ownerId` fields cannot be changed after creation.

## The "Dirty Dozen" Payloads (Firestore)

| # | Attack Type | Path | Payload | Expected Result |
|---|-------------|------|---------|-----------------|
| 1 | Identity Spoofing | `/users/other_uid` | `{ "displayName": "Hacker", "username": "hack" }` | PERMISSION_DENIED |
| 2 | Privilege Escalation | `/users/me` | `{ "membership": "famous", "isVip": true }` | PERMISSION_DENIED |
| 3 | Shadow Field Injection | `/rooms/room1/messages/msg1` | `{ "text": "hi", "uid": "me", "isVerified": true, ... }` | PERMISSION_DENIED |
| 4 | Orphaned Write | `/rooms/fake_room/messages/msg1` | `{ "text": "hi", ... }` | PERMISSION_DENIED (if room checked) |
| 5 | Identity Poisoning | `/users/very_long_id_...` | `{ ... }` | PERMISSION_DENIED |
| 6 | Unverified Write | `/rooms/r1/messages/m1` | `{ "text": "spam" }` (by unverified user) | PERMISSION_DENIED |
| 7 | Outcome Forging | `/users/me` | `{ "isBanned": false }` (trying to unban self) | PERMISSION_DENIED |
| 8 | Resource Exhaustion | `/users/me` | `{ "displayName": "a".repeat(1000000) }` | PERMISSION_DENIED |
| 9 | PII Leak | `/users/private_user` | `get()` by anonymous/stranger | PERMISSION_DENIED |
| 10 | Immutable Bypass | `/users/me` | `{ "createdAt": "2000-01-01" }` (modifying existing) | PERMISSION_DENIED |
| 11 | Recursive Cost Attack | `/rooms/r1/messages` | `list` with no filter | PERMISSION_DENIED |
| 12 | System Field Modification | `/system/health` | `{ "status": "down" }` | PERMISSION_DENIED |

## The "Dirty Dozen" Payloads (Realtime Database)

| # | Attack Type | Path | Payload | Expected Result |
|---|-------------|------|---------|-----------------|
| 1 | Unauthorized Root Write | `/` | `{ "hack": true }` | PERMISSION_DENIED |
| 2 | Public Data Theft | `/users` | `read` (trying to list all users) | PERMISSION_DENIED |
| 3 | User Profile Takeover | `users/other_user_id` | `{ "isBanned": false }` | PERMISSION_DENIED |
| 4 | Membership Self-Grant | `users/my_id/membership` | `"famous"` | PERMISSION_DENIED |
| 5 | Unauthorized DM Access | `user_dms/other_user` | `read` | PERMISSION_DENIED |
| 6 | Ghost Message | `rooms/room1/messages` | `{ "text": "hi", "uid": "fake" }` | PERMISSION_DENIED |
| 7 | Global Block Bypass | `blocks/other_user` | `write` | PERMISSION_DENIED |
| 8 | Status Forging | `users/my_id/isAdmin` | `true` | PERMISSION_DENIED |
| 9 | Unauthenticated Read | `rooms/public/messages` | `read` (no login) | PERMISSION_DENIED |
| 10 | Data Trashing | `rooms/room1` | `set(null)` | PERMISSION_DENIED |
| 11 | PII Scraping | `users` | `.indexOn: ["email"]` | PERMISSION_DENIED |
| 12 | Admin Impersonation | `users/my_id` | `{ "role": "admin" }` | PERMISSION_DENIED |
