# Member overview: what a member sees

Status: items 2–5 **built** (D-153, 2026-11-02): Actions needed, My profile, My roles and seats, Board / who to contact. The rest is still a proposal. Related: D-152 (Overview), D-139 (privacy), D-140 (receipts), D-141 (board).

Today a member who opens their organization sees the "Your membership" card (level, standing, paid-through date, renewal button, receipts) and their directory choice. Admins see "At a glance" numbers; members don't, because those numbers need `members.view`.

## Principles

- Only the member's own data, or data every member of that org can already read (board, directory). Nothing crosses orgs (D-036, D-037): a chapter member's overview never shows another chapter's data, and the national's data appears only where the member also belongs to the national.
- Reuse what's already exposed to members (RLS already allows it), so most items need no new database rules.
- Every item answers "what do I need to do?" or "what's going on in my organization?".

## Proposed items

| # | Item | Shows | Data source | New DB work? | Suggested phase |
|---|---|---|---|---|---|
| 1 | Membership card (exists) | Level, standing, paid through, renew, receipts | `myMembershipQuery`, receipts | No | Done |
| 2 | Action needed | "Renew by <date>", "Your application is waiting for approval", "Complete your profile" (required member fields left empty), "National membership required" for two-level dues | membership, member field values, `join_requirements` | No | Next |
| 3 | My profile summary | The member fields they may edit, with an Edit button | attribute values (self-edit rules, D-061) | No | Next |
| 4 | My roles and seats | Officer seats they hold (title, term end), roles they have here | `org_board` holders, role assignments | No | Next |
| 5 | Board / who to contact | The current officers of this org (and of the parent), from the Board page | `org_board` | No | Next |
| 6 | Membership history | Joined date, years of membership, past renewals and payments | memberships, payments, receipts | Maybe (years-of-membership helper) | Later |
| 7 | All my memberships | One line per org they belong to (national + chapter), each with standing and a link | `myOrgsQuery` + per-org membership | No | Next (useful with two-level dues) |
| 8 | Organization info | Logo, contact details, chapter fields marked visible to members (meeting place, charter date) | org profile, chapter field values | No | Later |
| 9 | Announcements / upcoming events | Org news and events | Not built (needs a module) | Yes | With the communications / events epics |
| 10 | Documents | By-laws and shared files | Not built (documents epic) | Yes | With the documents epic |
| 11 | Awards and recognitions | Awards received | Not built (awards epic) | Yes | With the awards epic |
| 12 | Elections | Open ballots they may vote in | Not built (E-27) | Yes | With E-27 |

What was built differs from the table in two places: "who to contact" shows the officers' names and the org's public contact email (`contact.email`, its own or the nearest parent's), not officers' own emails; and the national-dues reminder for two-level dues isn't in "Actions needed" yet (the join page already handles it).

## Questions to decide

1. ~~Which of items 2–5 and 7 should ship first?~~ 2–5 shipped; 7 (all my memberships) is next.
5. Should officers' email addresses be shown to members in "who to contact"? Today only the org's public contact email is shown.
2. Should members of a chapter see the national's officers too (item 5)? They can already read the national's board only if they're a member of the national.
3. Should "years of membership" count continuous membership only, or all years including gaps?
4. Should members see any aggregate about their org (for example "142 members")? This would need a new, deliberately narrow function, since members don't have `members.view`.
