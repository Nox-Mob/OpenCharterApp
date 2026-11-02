# User testing guide

What to check by hand in the live app. The automated checks already cover the database rules (`db/tests/`), the screens in isolation (`bun run test`), the backend flows with the demo accounts (`bun run test:smoke`) and the main screens in a real browser (`bun run test:e2e`, docs/testing.md). This guide covers what only a person can judge: whether screens make sense, look right, work on a phone, print well, and say the right thing.

The org page has a menu on the left (a "Section" dropdown on a phone): Overview, Members or Directory, Board, Reports, Chapters, and Settings with its pages (General, Setup, Membership levels, Member fields, Chapter fields, Roles, Payments, Audit log). "Where" lines below use those names.

**Accounts.** Use the demo accounts in [demo-data.md](demo-data.md) (shared password there):

| Short name | Account | Good for |
|---|---|---|
| **National** | `demo-national@opencharter.test` (Nora National) | Admin of Demo National Association, with a lifetime membership there |
| **Chapter** | `demo-chapter@opencharter.test` (Chris Chapter) | Admin of Demo Austin Chapter |
| **Member** | `demo-member@opencharter.test` (Morgan Member) | A plain member record in Demo Austin, with no membership yet: good for joining, renewing and the member view |

Use a private browser window for a second account at the same time. Test only in the demo orgs (names start with "Demo"). Smoke and end-to-end runs remove what *they* create (D-150); avoid editing the demo orgs while one is running. Choices that can't be undone (the membership model) belong in a new demo national, not in Demo National.

**Reporting a problem.** Send the section and step number, the account, what you expected, what happened, and a screenshot. Mention the browser and whether it was a phone-sized window.

**Ticking results.** Copy a section into your notes and mark each step ✅ / ❌.

---

## 1. Sign-in, password reset, invitations
**Where:** `/auth`, the sign-in link on the home page.
1. Sign in as **Chapter**. Expect the dashboard with your orgs.
2. Sign out, then sign in with a wrong password. Expect "Email or password is incorrect." Nothing should say whether the email exists.
3. "Forgot password?" → enter an email → "Send reset link". Expect a neutral message, whether or not the account exists.
4. As **Chapter**: Demo Austin Chapter → Members → "Invite someone" → "Create invite link". Copy the link and open it in a private window. Expect the invitation page; accepting needs a button press.

**Also try:** opening the same invite link a second time after accepting (it should say it's used).

## 2. Organizations and chapters
**Where:** dashboard, org page, Chapters.
1. As **National**, open Demo National Association. Expect a menu on the left (a "Section" dropdown on a phone): Overview, Members, Board, Reports, Chapters, Settings (no Directory: admins have Members), and under Settings: General, Setup, Membership levels, Member fields, Chapter fields, Roles, Payments, Audit log. As **Chapter** (Austin) expect the same without Chapters, with Reports showing only Austin. As **Member** expect only Overview, Directory and Board (and Chapters at a national).
2. Chapters → "Add chapter". The wizard asks, step by step:
   - **Name and type.** Try a region too: it skips the chapter steps.
   - **Chapter details:** the national's chapter fields, e.g. Charter date. Required ones are checked.
   - **Chapter admin:** an email to invite as admin, or blank.
   - **Required officers:** only if the national has required seats for chapters (Board or Board setup). An email per seat, or blank.

   After "Create", you see the invitation links to copy, and "Open …" goes to the new chapter. Expect it in the Chapters list and the org switcher; its Board shows the required seats as **Vacant**.
3. Open an officer's invitation link in a private window and accept it. Then appoint that person on the chapter's Board (they need a membership in good standing first, unless the rule is off).
4. Open the new chapter. Expect "← Demo National Association" at the top.
5. **Creating a national** (Dashboard → create an organization, type National; tick "demo" if you're an operator): step 2 is **How membership works**. Both models are shown side by side, each with joining, dues, chapters, changing chapter, "A good fit if" and an example. "Create" is refused until you pick one or "Decide later". Pick one and check Settings → General says it's chosen and can't be changed; with "Decide later", Settings → General still offers the choice. A standalone organization has no such step.

**Also try:** a chapter name with accents or an apostrophe, and check the suggested web address (slug); a bad email (it stops before anything is created); the same email for the admin and an officer (one invitation).

## 2b. Demo organizations (for QA)
**Where:** Dashboard → create an organization; the new org's Settings → General.
1. As **National** (a platform operator), create an organization and tick **This is a demo organization**. It shows a **Demo** badge on its page and in the dashboard list.
2. Run setup from scratch in it: Membership setup, Board setup, add chapters (they're demo too: the wizard says "Demo, like …"), turn on test payments, join, pay.
3. In a private window, sign in as an account that isn't an operator: the demo checkbox doesn't appear when creating an org.
4. As the demo org's admin: Settings → General → **Delete this demo organization**. "Delete for good" stays disabled until you type the exact name. After deleting you land on the dashboard and the org and its chapters are gone; the accounts you used still sign in.
5. A production org's Settings never shows the delete section, and a demo chapter's doesn't either (delete from the top).

**Also try:** creating a chapter under a production national: no demo option there.

## 3. Settings, locks, tax profile, logo
**Where:** Settings → General.
1. As **National**, lock a setting (e.g. grace period). As **Chapter**, open Austin → Settings. Expect it read-only with "Locked by a parent organization".
2. Tax profile: enter a legal name and EIN (`12-3456789`) → "Save tax profile". A wrong format should show "EIN must look like 12-3456789".
3. Logo: upload a PNG at the national. Austin shows the national logo unless it uploads its own (and the national allows it).

**Also try:** a large image; an SVG.

## 4. Roles
**Where:** Settings → Roles.
1. As **National**, "Add role" (e.g. "Newsletter editor" with "See member profiles"). As **Chapter**, check that Austin can use it.
2. Assign a role to a member, then remove it. The last admin of the national can't be removed.
3. As **Chapter**, try to create a role with a permission you don't hold. It shouldn't be offered.

## 5. Member and chapter fields
**Where:** Settings → Member fields / Chapter fields.
1. "Add field" with a choice list of 20+ options. Expect the dialog to scroll while the title and Save stay visible.
2. Make an ordered list (e.g. Rank E-1…E-9) and use it later in the member filters ("at least").
3. Lock a chapter field (e.g. Charter date) at the national. As **Chapter**, Austin → Settings → Chapter fields shows it read-only.

## 6. Membership setup and levels
**Where:** Settings → Setup (Membership setup card); Settings → Membership levels.
1. As **National**, open setup and walk through every step. "Review and apply" should show what changes.
2. Membership levels: "Add level" with two terms (1 year, Lifetime). Prices show in dollars.
3. An org with only one level shows it as "Membership" without needing a name.

**Also try:** run setup a second time and change one answer. Only that change should be listed.

## 6b. Setup hub and Board setup
**Where:** Settings → Setup (cards), then each card's button.
1. As **National**, Settings → Setup shows **Membership setup**, **Board setup** and **Connect payments**. "Connect payments" opens Settings → Payments and says "Done" once test payments are on.
2. Board setup → **Officer seats**: tick President and Treasurer; set President to "Every chapter", required, 2 years; add "Chaplain" for the national itself. A third choice "<national> and every chapter" appears; pick it for Secretary and check both the national's and Austin's Board list Secretary.
3. **Officer rules**: turn off "May chapters add their own seats?".
4. **Terms from your by-laws**: for Treasurer, tick "set our own term", 3 years, today, "Bylaws Art. II". Review the summary, then "Apply setup".
5. Board: the seats are there with the right terms. Run Board setup again and apply without changes; nothing new appears in each seat's term history.
6. Run Board setup again and change President from "Every chapter" to "Demo National Association and every chapter", then apply. President now appears on the national's Board too. Changing it back to "itself" is refused, with a clear message, while a chapter has a president.
7. As **Chapter**, Austin → Board setup: there's no seats step (the national manages seats). Set Austin's own term for President with a by-law reference and apply. Austin's Board shows it; Demo Dallas still shows the suggested term.

**Also try:** the browser Back button and a page reload in the middle of a flow (your answers are kept as a draft); a phone-sized window for the seat list.

## 7. Members, payments recorded by hand, standing
**Where:** Members, member details.
1. As **National**, "Add member" without an email. Expect "Contact (no login yet)".
2. Open the member → "Record membership", 1 year, paid by check. Expect the standing to be Good, "Paid through" one year minus a day, and a History entry with the payment.
3. Record a renewal. Expect it to start the day after the current paid-through date.
4. Cancel the membership ("Cancel this membership now?"). History shows it.

**Also try:** a historical member with a start date years ago; check the standing (Grace or Lapsed) and "expires in".

## 8. Finding and exporting members
**Where:** Members toolbar.
0. As **National**, the Members page opens on "Everyone in Demo National Association and below": members of Austin and Dallas are listed with an Organization column and their email, including anyone who opted out of the directory. Their rows have "Open" (goes to that chapter's Members page). Switch to "Only Demo National Association" for roles, Details and Export CSV. As **Chapter** (Austin) only Austin's members are listed and there's no switch. Admins have no Directory item.
1. Search by part of a name or email, with and without accents.
2. Filter by standing, level, a member field, and "Expiring within 30 / 60 / 90 days". Check the "Showing x of y" count.
3. "Save this view", reload, and click the saved view.
4. "Export CSV". Open the file in Excel and Google Sheets: accents, dates and empty cells look right, and there are no formulas. The Audit log shows the export.

**Also try:** a member who opted out of the directory. The export leaves them out unless "Include … who opted out" is ticked, if your national allows it.

## 9. Directory and privacy
**Where:** Directory (members only; admins have the Members page instead); Overview → "Show me in the member directory".
1. As **Member**, turn the switch off. Use "View as member" as **Chapter**: the Directory no longer lists them. Out of the preview, the Members page still lists them with "Not in directory".
2. The Directory never shows email addresses, only fields marked "show in directory".

## 10. Payments and test payments
**Where:** Settings → Payments (demo orgs only).
1. As **National**, "Use test payments (demo only)". Expect the "Test mode" badge and a join page link.
2. Read the Stripe connection instructions and the webhook address. Are they clear enough for a treasurer?

3. **Export payments**: pick a date range and "Export CSV". Open it in Excel or Sheets: one row per paid or refunded payment, amounts as numbers, refunds and net, receipt numbers. As **National**, tick "Include every organization below" and check chapters' payments appear. The Audit log shows the export.

**Stripe in test mode** (any org, needs a free Stripe account):
1. In Stripe (test mode): Developers → API keys → create a restricted key with "Checkout Sessions: write" (or use the `sk_test_…` secret key). Developers → Webhooks → add an endpoint at the address shown on the Payments page, with the events listed there; copy its signing secret (`whsec_…`).
2. Paste both on the Payments page. Expect "Stripe (test mode)".
3. Join at the org's join page and pay with Stripe's test card 4242 4242 4242 4242 (any future date, any CVC). Stripe returns you to the app's own address (never "localhost"), and the return page confirms the payment.
4. Try it once with a wrong webhook signing secret: the return page should still confirm the payment, by asking Stripe directly (D-158). Refunds still need the webhook.

## 11. Joining online
**Where:** `/join/demo-national`. Also try it at phone width (the browser's device toolbar, about 390 px wide).
1. Signed out, open the page. Pick a level and term, and sign in as **Member** when asked. "About you" asks every required field, including **Rank**; paying without it is refused ("Rank is required").
2. On the test checkout, try each button in turn: Card declined, Insufficient funds, Cancel. Each should return a clear message, and no membership is created.
3. Then "Card accepted". You come back to the app's own address (not "localhost"). Expect the return page to wait, then confirm. If approval is required, the application is pending.
4. As **National**: Members → Applications → Approve. As **Member**, "Your membership" shows Good standing and the receipt.
5. "Accepted, slow confirmation": the return page should keep waiting politely, then confirm.

**Also try:** "Decline" on a paid application. The member is refunded (test) and the history says so.

## 12. Renewing
**Where:** Overview → Your membership.
1. As **Member** (after joining in §11), "Renew online (…)" and pay with "Card accepted". Paid-through moves forward by one term from the old date, not from today.

## 12b. Two-level dues (national and chapter)
**Where:** Demo National → Membership setup ("Rules for your chapters"), then `/join/demo-austin`.
1. As **National**, run Membership setup. Turn on "Must chapter members also be members of your organization?". Set a chapter price range, e.g. lowest $10, highest $30. Apply.
2. As **Chapter**, Austin → Membership levels: the range is shown. Try a term priced at $50; it's refused with the range.
3. In a private window, open `/join/demo-austin` signed out. It mentions two payments. Sign in as an account that isn't a national member. Expect "Step 1 of 2: Demo National Association dues" and a "Join … first" button.
4. Pay the national dues with "Card accepted". The return page offers "Continue to step 2: chapter dues". Follow it: "Step 2 of 2", then pay the chapter's dues.
5. If the national approves new members, the chapter application waits. As **Chapter**, try to approve it first; it says the national membership isn't active yet. Approve at the national, then at the chapter.
6. Settings → Payments at each org: one payment and one receipt each.

**Also try:** "No chapter dues" (turn off "May chapters create their own membership levels?"): Austin's join page sends people to the national.

## 12c. Pricing rules (price by member fields)
**Where:** Settings → Membership levels → click a term (e.g. "1 year · $50.00").
1. As the admin of the org that owns the level, add a rule: condition "Rank is at least E-5", "they pay" $30. Add another: "Veteran is yes", a 20% discount. Reorder with "Order" if needed. The list reads in plain words, and the term shows "· 2 pricing rules".
2. Open the join page signed out: the term says the price can depend on your answers.
3. Sign in and answer Rank E-5: the pay button shows $30.00. Change to E-2 with Veteran yes: $40.00. With neither: the usual price.
4. Pay with the test card. The payment and the receipt show the rule's price.
5. As a member whose Rank is stored, "Your membership" → "Renew online" shows your price.
6. Retire a rule: it greys out and stops applying.

**Also try:** a chapter rule priced outside the national's range (refused); a rule with no conditions (applies to everyone).

## 13. Receipts
**Where:** Settings → Payments → Receipt column; Your membership → Your receipts; member History.
1. Open a receipt: number (`2026-00001` style), legal name, EIN, payer, items, amount, method, tax wording, footer, logo.
2. "Print": check the print preview. It fits one page and the buttons don't print.
3. As **National**, "Void" with a reason. The receipt shows VOID.
4. "Reissue" (after correcting the tax profile). The old receipt says "Replaced by …" and links to the new one.
5. Settings → General → Receipt footer: set a thank-you text, then record a new payment. The new receipt shows it; old ones don't change.

**Can't test yet:** the tax wording is a placeholder until a CPA or attorney reviews it (R-07). Emailing receipts waits for E-08.

## 13b. National membership with a home chapter
**Where:** creating a national, Settings → General ("How membership works"), the join pages, the Overview, a chapter's Members page.
Use a *new* demo national for this (§2 step 5, then add two chapters, levels and test payments): the choice can't be undone, so don't try it on Demo National.
1. Choose "National membership with a home chapter" when creating it (or later on Settings → General, which shows the same comparison and asks you to confirm). Settings → General then says it can't be changed; pick one chapter as the at-large chapter (for example an "online chapter").
2. Open a chapter's join page: it sends you to the national's page with that chapter preselected. The national's join page shows "Your chapter" (at-large chapter first, "None for now" last).
3. Join as a member with a chapter. After paying, the national's Overview shows "Your chapter: …" and the chapter's Members page lists you with your national level and standing ("This is the member's national membership" in Details).
4. Change chapter from the Overview. The old chapter no longer lists you; the new one does. If you held a seat in the old chapter, it ended with "changed chapter".
5. The chapter's Membership levels page explains that members join the national.

## 14. Board
**Where:** Board.
1. As **National**: "Add seat" → President, "Every chapter below…", required, suggested term 2 years. Add a national-only seat too (e.g. Treasurer, linked to a role).
2. As **Chapter**, Austin → Board: President shows **Vacant**, and the warning lists it.
3. "Change term": 1 year, today's date, by-law reference "Bylaws Art. IV §2". Expect "Term: 1 year (Bylaws Art. IV §2, since …)" and an entry in "Term history".
4. "Appoint" a member in good standing. The dialog shows when the term ends. Try a lapsed member too; it should be refused with a clear message.
5. Change the term again (2 years). Answer "Apply to current officers?" with OK. The holder's end date moves.
6. "Rename here": call President "Commander" in Austin. The national's own view still says President.
7. For a seat with a linked role: after appointing, the person appears with that role in Roles. After "End term", the role is gone (unless they also had it by hand).
8. Past officers lists the ended term with the reason.

9. **The national and every chapter**: as **National**, "Add seat" → Vice President, Used by "Demo National Association and every chapter below it". It appears on the national's Board *and* on Austin's, and each fills its own. Edit the seat and change "Used by" to "Every chapter below…": refused with a clear message while the national has someone in it; after "End term" at the national, it saves and the seat leaves the national's Board.

10. **Contact email**: as **Chapter**, Austin → Board → President → "Contact email". Choose "A role email for this seat", enter `President@DemoAustin.xyz` and save: the seat shows "Contact: president@demoaustin.xyz (role email)". Try `not-an-email` (refused). Switch back to "The officer's own email". As **Member**, Austin's Overview → "Board and who to contact" shows the role email for President instead of the president's own email, and the officer's own email for seats without one. Give a vacant seat a role email: it's listed as "Vacant" with that email.

**Also try:** as **National**, turn off "Chapters may rename the board seats you define" in Settings, then try "Rename here" in Austin.
Also: edit a seat and set "No role" and a suggested term of "No fixed term"; and "Change term" to "No fixed term". Both should save (fixed 2026-11-02).

## 14a. Overview
**Where:** Overview.
1. As **National**: "At a glance" shows Current members, Chapters, Average members per chapter, Lifetime members (with "N other current members · X% lifetime" and a bar), New in the last 30 days, Waiting for approval, Renewals due in 30 days, Revenue this year and Vacant required seats. A person in both the national and a chapter counts once. "See each chapter on the Reports page" opens Reports.
2. As **Chapter**, Austin: the same tiles for Austin only, without Chapters or the average.
3. As **Member**: no numbers. Instead:
   - **Actions needed**: e.g. "Your membership ends on … (in N days)" with Renew, "Complete your profile: …" if a required field the member may edit is empty, "Your term as … ends on …" for a seat ending within 30 days, or "You're all set".
   - **Your profile**: name, email and member fields (no admin-only fields). "Edit" shows only the fields members may change; save and reload.
   - **Your roles and seats**: seats held here with dates, and roles.
   - **Board and who to contact**: the general email from Settings → General (or the national's, marked with its name), then the officers by seat, each with the seat's role email or, if it has none, the officer's own email. Vacant seats appear only if they have a role email.
   - **Your chapter** (home-chapter model, at the national): see §13b.
   - "Your membership" and the directory choice as before.
4. **View as member**: as **National**, click "View as member" next to the org name. The menu shrinks to Overview, Directory, Board (and Chapters), a banner explains it's a preview, and the Overview shows your own member cards. Switch sections; the preview stays on until "Exit member view".

## 14b. Reports
**Where:** Demo National → Reports.
1. **Members:** one row per organization (chapters indented under the national) and a Total row. Check the counts against each chapter's Members page. The standing bar shows good / grace / lapsed / pending; hovering a segment shows the count and share.
2. **Revenue:** defaults to this year so far. Change the dates. Test payments aren't counted; a partly refunded payment shows the refund and the net amount.
3. **Boards:** required seats with nobody in them are listed per chapter; "Terms past their end" counts officers still serving after their planned end.
4. "Export CSV" on each section: open the files in Excel or Sheets, then check the Audit log shows each export.
5. As **Chapter**, open Austin → Reports: one row, Austin only, described as "Austin, as of today." Opening Demo National's Reports as Chapter isn't possible. As **Member**, there's no Reports item.

**Also try:** dark mode (the standing colors should still read clearly); a phone-sized window (the tables scroll sideways).

## 15. Audit log
**Where:** Settings → Audit log.
1. After the steps above, the log shows who did what (role changes, payments, receipts voided, exports, appointments).
2. Nothing in the app offers to edit or delete log entries.

---

## Not testable yet
- Every email: invitations, confirmations, receipts and reminders (E-08, the first update after the MVP). Admins copy links for now.
- Local dues for chapters in the home-chapter model, postpaid dues and invoices (E-20).
- Suggested levels for chapters, copy or linked (A4, Sprint 2).
- Per-org web addresses (E-07), custom domains (E-22) and PayPal (E-21).
- Real money: Stripe works in test mode with an org's own Stripe account (§10); live mode is the same path with live keys.

## Keeping this guide current
Every feature change updates its section here in the same commit, and new features add a section.
