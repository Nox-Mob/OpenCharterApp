# Glossary

| Term | Meaning |
|---|---|
| **Platform** | The top tier of an install. Self-hosted: the installer. Hosted: us. Manages orgs, hosting billing, and system settings |
| **Organization (org)** | Any node in the hierarchy: standalone, national, region, or chapter |
| **National** | A top-level org that has chapters beneath it and sets rules for them |
| **Region** | Optional tier between national and chapters (built later) |
| **Chapter** | A local org beneath a national or region |
| **Standalone org** | A single local association with no parent or children |
| **Tenant** | An org and its data, isolated from others by org ID and row-level security |
| **Person** | A human in the system, who can hold memberships in one or more orgs |
| **Member / membership** | A person's relationship to a specific org through a tier and term. A person can have national and chapter memberships |
| **Tier** | A membership level defined by an org (name, price options, rules) |
| **Term unit** | Days, months or years: the unit a term's length is counted in. A term with no unit is lifetime |
| **Term** | A duration option for a tier (for example 1 year, 3 years, lifetime). Fully org-defined |
| **Prepaid dues** | Member pays first, standing runs through the paid-through date |
| **Postpaid dues** | Member is active while a balance accrues. Delinquency rules are set by each org's admins |
| **Standing / good standing** | A derived status from membership state that gates officer eligibility, voting, approvals, and benefits |
| **Paid-through date** | The date through which a prepaid membership is current |
| **Member record** | A member added by an admin (for example a historical member) who has no login yet. An invitation to their email lets them claim it |
| **Grace period** | Days after the paid-through date during which a member keeps good standing. Set per org, a national can lock it |
| **Stacked renewal** | Renewing before the membership lapses adds the new term after the current paid-through date |
| **Attribute** | An org-defined field on an entity, such as a member's rank or salutation, or a chapter's charter date |
| **Ordered list attribute** | An attribute with ranked values (e.g., E1 to E6), so rules can say "at least E5" |
| **Rule** | A declarative condition and effect, authored in the UI, evaluated by the rules engine |
| **Setup engine** | The guided questionnaire framework that creates configuration |
| **Flow** | A setup sequence for one module |
| **Preset** | A saved set of setup answers |
| **Inherit / override / locked** | How a setting at national applies to chapters: followed, changeable, or unchangeable |
| **Board seat template** | National's definition of a board role (required, count, term, permissions) |
| **Seat** | An instance of a template in a specific chapter |
| **Appointment** | A person occupying a seat for a time period |
| **Seat term rule** | An org's own term length for a seat, from its by-laws, with the date it takes effect. A by-law change adds a new rule; old ones are kept |
| **Custom title** | A chapter's display name for a seat (the underlying role does not change) |
| **Required seat** | A seat national requires to be filled at all times. Vacancies trigger alerts |
| **Board report** | A periodic report chapters submit to national |
| **Election** | A process that fills seats via nominations and voting |
| **Ranked choice** | Voting method where voters rank candidates. A chapter-level option |
| **Certification** | The point where election results lock and winners are appointed |
| **Document repository** | Per-org file libraries with versions, categories, and visibility |
| **Award** | A recognition with its own criteria, form, approval chain, and purchase options |
| **Award family / series** | Related awards in ranked tiers (Bronze, Silver, Gold) that may have prerequisites |
| **Approval policy** | The ordered chain of approval steps for an award |
| **Approver rule** | Who may approve a step: by role, rank, or both |
| **Rank verified flag** | Set when a chapter president confirms an approver holds the required rank, to speed national's review |
| **Escalation** | Routing to national when no eligible approver exists or a step stalls |
| **Appeal** | A permitted challenge to a decline, if the award's owning org allows it |
| **Purchase option** | A purchasable variant of an award (e.g., certificate only, framed with medal) |
| **Add-on** | An optional extra attached to an award purchase (e.g., express fee) |
| **Payer** | The party who pays, which may differ from the recipient. Configurable per award |
| **Fulfillment** | Producing, shipping, and presenting a physical award. National-managed for now |
| **Signed one-click link** | An emailed link carrying a single-use, expiring token that opens a confirmation page for an action such as approving an award |
| **Gateway** | A payment processor integration (Stripe or PayPal) |
| **National fee** | Optional fee national takes on chapter transactions |
| **Tax profile** | An org's legal name, EIN, and tax status, driving receipts |
| **Tax treatment** | A per-item flag (deductible, non-deductible, partially) feeding receipt wording |
| **FMV** | Fair market value of goods or services received in exchange for a payment, used on receipts |
| **501(c)(19)** | US tax status commonly used by veterans organizations |
| **501(c)(3)** | US tax status for charitable organizations |
| **Receipt (manual)** | A receipt created by an admin for cash, check, or in-kind gifts |
| **Receipt version** | A receipt that replaces an earlier one (after a correction or a partial refund). The earlier one is kept, marked replaced |
| **Void and reissue** | Correcting a receipt by invalidating it and issuing a new version, with audit trail |
| **RLS** | PostgreSQL row-level security, used as a tenant-isolation safety net |
| **Modular monolith** | One deployable app organized into strictly bounded modules |
| **Engine** | A shared capability reused by many modules (attributes, rules, setup, approvals, forms, automation) |
| **Org switcher** | UI for a person with roles in several orgs to choose the active org context. Data stays separate per org |
| **Branding** | An org's logo, icon, colors, and header image. Chapters can override national's defaults |
| **Logo override** | A chapter-supplied logo that replaces the inherited national logo for that chapter's site, emails, and receipts |
| **Stripe Connect mode / Direct mode** | Two ways to connect Stripe: national as platform with automatic fees, or each org on its own account with fees invoiced |
