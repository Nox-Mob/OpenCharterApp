# User testing guide

What to check by hand in the live app. The automated checks already cover the database rules (`db/tests/`), the screens in isolation (`bun run test`) and the backend flows with the demo accounts (`bun run test:smoke`). This guide covers what only a person can judge: whether screens make sense, look right, work on a phone, print well, and say the right thing.

**Accounts.** Use the demo accounts in [demo-data.md](demo-data.md) (shared password there):

| Short name | Account | Good for |
|---|---|---|
| **National** | `demo-national@opencharter.test` | Admin of Demo National Association |
| **Chapter** | `demo-chapter@opencharter.test` | Admin of Demo Austin Chapter |
| **Member** | `demo-member@opencharter.test` | Member (and admin) of Demo Austin Chapter |

Use a private browser window for a second account at the same time. Test only in the demo orgs (names start with "Demo"). Anything you create there may be removed by the next smoke run (D-150).

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
**Where:** dashboard, org page, Chapters tab.
1. As **National**, open Demo National Association. Expect tabs: Overview, Members, Directory, Board, Membership levels, Member fields, Chapter fields, Roles, Payments, Settings, Chapters, Audit log.
2. Chapters tab → "Add chapter". The wizard asks, step by step:
   - **Name and type.** Try a region too: it skips the chapter steps.
   - **Chapter details:** the national's chapter fields, e.g. Charter date. Required ones are checked.
   - **Chapter admin:** an email to invite as admin, or blank.
   - **Required officers:** only if the national has required seats for chapters (Board tab or Board setup). An email per seat, or blank.

   After "Create", you see the invitation links to copy, and "Open …" goes to the new chapter. Expect it in the Chapters list and the org switcher; its Board tab shows the required seats as **Vacant**.
3. Open an officer's invitation link in a private window and accept it. Then appoint that person on the chapter's Board tab (they need a membership in good standing first, unless the rule is off).
4. Open the new chapter. Expect "← Demo National Association" at the top.

**Also try:** a chapter name with accents or an apostrophe, and check the suggested web address (slug); a bad email (it stops before anything is created); the same email for the admin and an officer (one invitation).

## 3. Settings, locks, tax profile, logo
**Where:** Settings tab.
1. As **National**, lock a setting (e.g. grace period). As **Chapter**, open Austin → Settings. Expect it read-only with "Locked by a parent organization".
2. Tax profile: enter a legal name and EIN (`12-3456789`) → "Save tax profile". A wrong format should show "EIN must look like 12-3456789".
3. Logo: upload a PNG at the national. Austin shows the national logo unless it uploads its own (and the national allows it).

**Also try:** a large image; an SVG.

## 4. Roles
**Where:** Roles tab.
1. As **National**, "Add role" (e.g. "Newsletter editor" with "See member profiles"). As **Chapter**, check that Austin can use it.
2. Assign a role to a member, then remove it. The last admin of the national can't be removed.
3. As **Chapter**, try to create a role with a permission you don't hold. It shouldn't be offered.

## 5. Member and chapter fields
**Where:** Member fields / Chapter fields tabs.
1. "Add field" with a choice list of 20+ options. Expect the dialog to scroll while the title and Save stay visible.
2. Make an ordered list (e.g. Rank E-1…E-9) and use it later in the member filters ("at least").
3. Lock a chapter field (e.g. Charter date) at the national. As **Chapter**, Austin's overview shows it read-only.

## 6. Membership setup and levels
**Where:** Overview → setup card; Membership levels tab.
1. As **National**, open setup and walk through every step. "Review and apply" should show what changes.
2. Membership levels: "Add level" with two terms (1 year, Lifetime). Prices show in dollars.
3. An org with only one level shows it as "Membership" without needing a name.

**Also try:** run setup a second time and change one answer. Only that change should be listed.

## 6b. Setup hub and Board setup
**Where:** Overview (cards), then each card's button. Board setup needs migration 0018; until then its card doesn't show.
1. As **National**, the overview shows **Membership setup**, **Board setup** and **Connect payments**. "Connect payments" opens the Payments tab and says "Done" once test payments are on.
2. Board setup → **Officer seats**: tick President and Treasurer; set President to "Every chapter", required, 2 years; add "Chaplain" for the national itself.
3. **Officer rules**: turn off "May chapters add their own seats?".
4. **Terms from your by-laws**: for Treasurer, tick "set our own term", 3 years, today, "Bylaws Art. II". Review the summary, then "Apply setup".
5. Board tab: the seats are there with the right terms. Run Board setup again and apply without changes; nothing new appears in each seat's term history.
6. As **Chapter**, Austin → Board setup: there's no seats step (the national manages seats). Set Austin's own term for President with a by-law reference and apply. Austin's Board tab shows it; Demo Dallas still shows the suggested term.

**Also try:** the browser Back button and a page reload in the middle of a flow (your answers are kept as a draft); a phone-sized window for the seat list.

## 7. Members, payments recorded by hand, standing
**Where:** Members tab, member details.
1. As **National**, "Add member" without an email. Expect "Contact (no login yet)".
2. Open the member → "Record membership", 1 year, paid by check. Expect the standing to be Good, "Paid through" one year minus a day, and a History entry with the payment.
3. Record a renewal. Expect it to start the day after the current paid-through date.
4. Cancel the membership ("Cancel this membership now?"). History shows it.

**Also try:** a historical member with a start date years ago; check the standing (Grace or Lapsed) and "expires in".

## 8. Finding and exporting members
**Where:** Members tab toolbar.
1. Search by part of a name or email, with and without accents.
2. Filter by standing, level, a member field, and "Expiring within 30 / 60 / 90 days". Check the "Showing x of y" count.
3. "Save this view", reload, and click the saved view.
4. "Export CSV". Open the file in Excel and Google Sheets: accents, dates and empty cells look right, and there are no formulas. The Audit log shows the export.

**Also try:** a member who opted out of the directory. The export leaves them out unless "Include … who opted out" is ticked, if your national allows it.

## 9. Directory and privacy
**Where:** Directory tab; Overview → "Show me in the member directory".
1. As **Member**, turn the switch off. As **Chapter**, the Directory no longer lists them, and the Members tab shows "Not in directory".
2. The Directory never shows email addresses, only fields marked "show in directory".

## 10. Payments tab and test payments
**Where:** Payments tab (demo orgs only).
1. As **National**, "Use test payments (demo only)". Expect the "Test mode" badge and a join page link.
2. Read the Stripe connection instructions and the webhook address. Are they clear enough for a treasurer?

**Can't test here:** a real Stripe connection. It needs an org with its own Stripe test account (`sk_test_…` key and a webhook).

## 11. Joining online
**Where:** `/join/demo-national`. Also try it at phone width (the browser's device toolbar, about 390 px wide).
1. Signed out, open the page. Pick a level and term, and sign in as **Member** when asked.
2. On the test checkout, try each button in turn: Card declined, Insufficient funds, Cancel. Each should return a clear message, and no membership is created.
3. Then "Card accepted". Expect the return page to wait, then confirm. If approval is required, the application is pending.
4. As **National**: Members → Applications → Approve. As **Member**, "Your membership" shows Good standing and the receipt.
5. "Accepted, slow confirmation": the return page should keep waiting politely, then confirm.

**Also try:** "Decline" on a paid application. The member is refunded (test) and the history says so.

## 12. Renewing
**Where:** Overview → Your membership.
1. As **Member**, "Renew online (…)" and pay with "Card accepted". Paid-through moves forward by one term from the old date, not from today.

## 12c. Pricing rules (price by member fields)
**Where:** Membership levels tab → click a term (e.g. "1 year · $50.00"). Needs migration 0021; until then terms aren't clickable.
1. As the admin of the org that owns the level, add a rule: condition "Rank is at least E-5", "they pay" $30. Add another: "Veteran is yes", a 20% discount. Reorder with "Order" if needed. The list reads in plain words, and the term shows "· 2 pricing rules".
2. Open the join page signed out: the term says the price can depend on your answers.
3. Sign in and answer Rank E-5: the pay button shows $30.00. Change to E-2 with Veteran yes: $40.00. With neither: the usual price.
4. Pay with the test card. The payment and the receipt show the rule's price.
5. As a member whose Rank is stored, "Your membership" → "Renew online" shows your price.
6. Retire a rule: it greys out and stops applying.

**Also try:** a chapter rule priced outside the national's range (refused); a rule with no conditions (applies to everyone).

## 12b. Two-level dues (national and chapter)
**Where:** Demo National → Membership setup ("Rules for your chapters"), then `/join/demo-austin`. Needs migration 0020; until then these questions don't appear.
1. As **National**, run Membership setup. Turn on "Must chapter members also be members of your organization?". Set a chapter price range, e.g. lowest $10, highest $30. Apply.
2. As **Chapter**, Austin → Membership levels: the range is shown. Try a term priced at $50; it's refused with the range.
3. In a private window, open `/join/demo-austin` signed out. It mentions two payments. Sign in as an account that isn't a national member. Expect "Step 1 of 2: Demo National Association dues" and a "Join … first" button.
4. Pay the national dues with "Card accepted". The return page offers "Continue to step 2: chapter dues". Follow it: "Step 2 of 2", then pay the chapter's dues.
5. If the national approves new members, the chapter application waits. As **Chapter**, try to approve it first; it says the national membership isn't active yet. Approve at the national, then at the chapter.
6. Payments tab at each org: one payment and one receipt each.

**Also try:** "No chapter dues" (turn off "May chapters create their own membership levels?"): Austin's join page sends people to the national.

## 13. Receipts
**Where:** Payments tab → Receipt column; Your membership → Your receipts; member History.
1. Open a receipt: number (`2026-00001` style), legal name, EIN, payer, items, amount, method, tax wording, footer, logo.
2. "Print": check the print preview. It fits one page and the buttons don't print.
3. As **National**, "Void" with a reason. The receipt shows VOID.
4. "Reissue" (after correcting the tax profile). The old receipt says "Replaced by …" and links to the new one.
5. Settings → Receipt footer: set a thank-you text, then record a new payment. The new receipt shows it; old ones don't change.

**Can't test yet:** the tax wording is a placeholder until a CPA or attorney reviews it (R-07). Emailing receipts waits for E-08.

## 14. Board
**Where:** Board tab.
1. As **National**: "Add seat" → President, "Every chapter below…", required, suggested term 2 years. Add a national-only seat too (e.g. Treasurer, linked to a role).
2. As **Chapter**, Austin → Board: President shows **Vacant**, and the warning lists it.
3. "Change term": 1 year, today's date, by-law reference "Bylaws Art. IV §2". Expect "Term: 1 year (Bylaws Art. IV §2, since …)" and an entry in "Term history".
4. "Appoint" a member in good standing. The dialog shows when the term ends. Try a lapsed member too; it should be refused with a clear message.
5. Change the term again (2 years). Answer "Apply to current officers?" with OK. The holder's end date moves.
6. "Rename here": call President "Commander" in Austin. The national's own view still says President.
7. For a seat with a linked role: after appointing, the person appears with that role in Roles. After "End term", the role is gone (unless they also had it by hand).
8. Past officers lists the ended term with the reason.

**Also try:** as **National**, turn off "Chapters may rename the board seats you define" in Settings, then try "Rename here" in Austin.
Also: edit a seat and set "No role" and a suggested term of "No fixed term"; and "Change term" to "No fixed term". Both should save (fixed 2026-11-02).

## 14b. Reports (nationals and regions)
**Where:** Demo National → Reports tab. Needs migration 0019; until then the tab says it needs a database update.
1. **Members:** one row per organization (chapters indented under the national) and a Total row. Check the counts against each chapter's Members tab. The standing bar shows good / grace / lapsed / pending; hovering a segment shows the count and share.
2. **Revenue:** defaults to this year so far. Change the dates. Test payments aren't counted; a partly refunded payment shows the refund and the net amount.
3. **Boards:** required seats with nobody in them are listed per chapter; "Terms past their end" counts officers still serving after their planned end.
4. "Export CSV" on each section: open the files in Excel or Sheets, then check the Audit log shows each export.
5. As **Chapter**, open Austin: there's no Reports tab (chapters don't have one). As **Member**, Demo National shows no Reports tab either.

**Also try:** dark mode (the standing colors should still read clearly); a phone-sized window (the tables scroll sideways).

## 15. Audit log
**Where:** Audit log tab.
1. After the steps above, the log shows who did what (role changes, payments, receipts voided, exports, appointments).
2. Nothing in the app offers to edit or delete log entries.

---

## Not testable yet
- Real Stripe payments (needs an org's own Stripe test account and webhook).
- Every email: invitations, confirmations, receipts and reminders (E-08). Admins copy links for now.
- Per-org web addresses (E-07) and custom domains (E-22).
- Guided setup for payments and the board (coming next: the setup hub).

## Keeping this guide current
Every feature change updates its section here in the same commit, and new features add a section.
