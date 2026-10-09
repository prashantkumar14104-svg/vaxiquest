# VaxiQuest – Gamified Immunization Ecosystem
One platform · four roles · one vaccination database · gamification + analytics.

## Run in VS Code
1. Install Node.js 18+ and open this folder in VS Code.
2. Terminal → `npm install`
3. `npm start` (or press F5) → open http://localhost:3000
4. Data lives in `data/db.json` (auto-seeded on first run). `npm run reseed` resets it.

## Demo logins (mobile / password) — or use "Send OTP" (demo OTP is shown on screen)
| Role | Mobile | Password |
|---|---|---|
| Parent/Caregiver | 9000000001 | parent123 |
| Healthcare Worker | 9000000101 | worker123 |
| Program Manager | 9000000201 | manager123 |
| Administrator | 9000000301 | admin123 |

## Features implemented (from the spec)
- Role-based login (password or OTP), RBAC on every API, audit log, consent, scrypt password hashing
- Parent: child profile, progress bar, timeline, next vaccine, booking, points/levels/badges/streak, quizzes, challenges, reminders + SMS/IVR previews, printable physical card, Hindi/English, voice guidance
- Worker: today's tasks, missed list, AI-style risk priority (🟢🟡🔴), record vaccination, follow-ups, search, centre inventory, performance + badges, team leaderboard, **offline mode** (queued locally, auto-sync)
- Manager: coverage, on-time %, area comparison, weekly trend, high-risk areas, action plans, CSV report
- Admin: create users, configure reward points, audit logs

## Registering new children / parents
Worker or Admin dashboard → **➕ Register new child / parent**: enter child name, DOB, area, parent name + mobile (+ optional password, default `parent123`), and tick vaccines already given on an existing card.
The full schedule (upcoming / due / missed), points, badges and risk status are generated automatically, exactly like the seeded children. The parent can log in right away with that mobile number. Using the same mobile again adds a sibling to the same parent.

## Editing details
- Any user: header button **🔑 Password** → change own password.
- Admin: **Users → Edit** (name, mobile, area, reset password) and **Children → Edit** (name, DOB, area).
- Admin also: change **role**, **Deactivate/Activate**, **Delete** user, reassign a child's **worker**, **delete** a child.
- Every user: header **👤 Profile** → change own name/mobile (parents also area) after confirming current password.
- Safety rules: last admin can't be removed/deactivated; parents/workers with children can't be deleted or role-changed until children are moved/deleted.
