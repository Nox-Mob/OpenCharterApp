/**
 * Sales demo (D-199): fills the demo national "Test-Demo" (home-chapter model) so it looks like a
 * real association: 15 chapters, about 500 people with years of membership history, payments and
 * receipts, a mix of standings (current, expiring soon, new, in grace, lapsed, cancelled,
 * lifetime, prospects), member and chapter fields, and every board seat filled.
 *
 * Everything goes through the same database functions the app uses, signed in as the demo
 * national admin, so the rules (permissions, standing, receipts, audit) apply as usual.
 * Deterministic: the same people and dates (relative to the day it runs) every time.
 *
 * Run once: bun scripts/seed-sales-demo.ts
 * It refuses to run again on an organization that already has members (use a fresh demo national
 * with --org <id> to seed another one).
 */
import { DEMO, rpc, signIn, type Db } from "../smoke/client";

const args = process.argv.slice(2);
const ORG = args.includes("--org")
  ? args[args.indexOf("--org") + 1]!
  : "d60400ef-9dbb-414a-9a3e-e0cbf2fc15ab"; // Test-Demo

// ----- deterministic randomness -----
let seed = 20261103;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const weighted = <T>(xs: readonly [T, number][]): T => {
  const total = xs.reduce((n, [, w]) => n + w, 0);
  let r = rand() * total;
  for (const [x, w] of xs) if ((r -= w) <= 0) return x;
  return xs[xs.length - 1]![0];
};

// ----- dates -----
const DAY = 86_400_000;
const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const addYears = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCFullYear(x.getUTCFullYear() + n);
  return x;
};
/** The start of the term that ends on `end` and lasts `years` years. */
const startFor = (end: Date, years: number) => addDays(addYears(end, -years), 1);

// ----- names -----
const FIRST = [
  "James",
  "Mary",
  "Robert",
  "Patricia",
  "John",
  "Jennifer",
  "Michael",
  "Linda",
  "David",
  "Elizabeth",
  "William",
  "Barbara",
  "Richard",
  "Susan",
  "Joseph",
  "Jessica",
  "Thomas",
  "Sarah",
  "Charles",
  "Karen",
  "Christopher",
  "Lisa",
  "Daniel",
  "Nancy",
  "Matthew",
  "Betty",
  "Anthony",
  "Sandra",
  "Mark",
  "Margaret",
  "Donald",
  "Ashley",
  "Steven",
  "Kimberly",
  "Andrew",
  "Emily",
  "Paul",
  "Donna",
  "Joshua",
  "Michelle",
  "Kenneth",
  "Carol",
  "Kevin",
  "Amanda",
  "Brian",
  "Melissa",
  "George",
  "Deborah",
  "Timothy",
  "Stephanie",
  "Ronald",
  "Rebecca",
  "Jason",
  "Sharon",
  "Edward",
  "Laura",
  "Jeffrey",
  "Cynthia",
  "Ryan",
  "Dorothy",
  "Jacob",
  "Amy",
  "Gary",
  "Kathleen",
  "Nicholas",
  "Angela",
  "Eric",
  "Shirley",
  "Jonathan",
  "Emma",
  "Stephen",
  "Brenda",
  "Larry",
  "Pamela",
  "Justin",
  "Nicole",
  "Scott",
  "Anna",
  "Brandon",
  "Samantha",
  "Benjamin",
  "Katherine",
  "Samuel",
  "Christine",
  "Gregory",
  "Debra",
  "Alexander",
  "Rachel",
  "Patrick",
  "Carolyn",
  "Frank",
  "Janet",
  "Raymond",
  "Maria",
  "Jack",
  "Olivia",
  "Dennis",
  "Heather",
  "Jerry",
  "Helen",
  "Tyler",
  "Catherine",
  "Aaron",
  "Diane",
  "Jose",
  "Julie",
  "Adam",
  "Victoria",
  "Nathan",
  "Joyce",
  "Henry",
  "Lauren",
  "Zachary",
  "Kelly",
  "Douglas",
  "Christina",
  "Peter",
  "Ruth",
  "Kyle",
  "Joan",
  "Noah",
  "Virginia",
  "Ethan",
  "Judith",
  "Jeremy",
  "Evelyn",
  "Walter",
  "Hannah",
  "Christian",
  "Andrea",
  "Keith",
  "Megan",
  "Roger",
  "Cheryl",
  "Terry",
  "Jacqueline",
  "Austin",
  "Madison",
  "Sean",
  "Teresa",
  "Gerald",
  "Abigail",
  "Carl",
  "Sophia",
  "Harold",
  "Martha",
  "Dylan",
  "Sara",
  "Arthur",
  "Gloria",
  "Lawrence",
  "Janice",
  "Jordan",
  "Kathryn",
  "Jesse",
  "Ann",
  "Bryan",
  "Isabella",
  "Billy",
  "Judy",
  "Bruce",
  "Charlotte",
  "Gabriel",
  "Julia",
  "Joe",
  "Grace",
  "Logan",
  "Amber",
  "Alan",
  "Alice",
  "Juan",
  "Jean",
  "Albert",
  "Denise",
  "Willie",
  "Frances",
  "Elijah",
  "Danielle",
  "Wayne",
  "Marilyn",
  "Randy",
  "Natalie",
  "Vincent",
  "Beverly",
  "Mason",
  "Diana",
  "Roy",
  "Brittany",
  "Ralph",
  "Theresa",
  "Bobby",
  "Kayla",
  "Russell",
  "Alexis",
  "Bradley",
  "Doris",
  "Philip",
  "Lori",
  "Eugene",
  "Tiffany",
];
const LAST = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Rodriguez",
  "Martinez",
  "Hernandez",
  "Lopez",
  "Gonzalez",
  "Wilson",
  "Anderson",
  "Thomas",
  "Taylor",
  "Moore",
  "Jackson",
  "Martin",
  "Lee",
  "Perez",
  "Thompson",
  "White",
  "Harris",
  "Sanchez",
  "Clark",
  "Ramirez",
  "Lewis",
  "Robinson",
  "Walker",
  "Young",
  "Allen",
  "King",
  "Wright",
  "Scott",
  "Torres",
  "Nguyen",
  "Hill",
  "Flores",
  "Green",
  "Adams",
  "Nelson",
  "Baker",
  "Hall",
  "Rivera",
  "Campbell",
  "Mitchell",
  "Carter",
  "Roberts",
  "Gomez",
  "Phillips",
  "Evans",
  "Turner",
  "Diaz",
  "Parker",
  "Cruz",
  "Edwards",
  "Collins",
  "Reyes",
  "Stewart",
  "Morris",
  "Morales",
  "Murphy",
  "Cook",
  "Rogers",
  "Gutierrez",
  "Ortiz",
  "Morgan",
  "Cooper",
  "Peterson",
  "Bailey",
  "Reed",
  "Kelly",
  "Howard",
  "Ramos",
  "Kim",
  "Cox",
  "Ward",
  "Richardson",
  "Watson",
  "Brooks",
  "Chavez",
  "Wood",
  "James",
  "Bennett",
  "Gray",
  "Mendoza",
  "Ruiz",
  "Hughes",
  "Price",
  "Alvarez",
  "Castillo",
  "Sanders",
  "Patel",
  "Myers",
  "Long",
  "Ross",
  "Foster",
  "Jimenez",
];

const NEW_CHAPTERS = [
  "Albuquerque Chapter",
  "Santa Fe Chapter",
  "Las Cruces Chapter",
  "Roswell Chapter",
  "El Paso Chapter",
  "Tucson Chapter",
  "Phoenix Chapter",
  "Fort Huachuca Chapter",
  "Fort Bliss Chapter",
  "White Sands Chapter",
  "Denver Chapter",
  "Colorado Springs Chapter",
  "Fort Carson Chapter",
];
const RANKS = [
  "E-3",
  "E-4",
  "E-5",
  "E-6",
  "E-7",
  "E-8",
  "E-9",
  "W-2",
  "W-3",
  "O-1",
  "O-2",
  "O-3",
  "O-4",
  "O-5",
  "O-6",
];
const RANK_WEIGHTS: [string, number][] = RANKS.map((r) => [
  r,
  r.startsWith("E") ? (r === "E-5" || r === "E-6" ? 12 : 7) : r.startsWith("W") ? 3 : 4,
]);
const BRANCHES: [string, number][] = [
  ["army", 55],
  ["navy", 10],
  ["air_force", 15],
  ["marines", 8],
  ["coast_guard", 4],
  ["space_force", 3],
  ["civilian", 5],
];
const METHODS: [string, number][] = [
  ["check", 45],
  ["card", 30],
  ["cash", 15],
  ["bank_transfer", 10],
];

// ----- helpers -----
async function pool<T>(items: readonly T[], n: number, f: (x: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        await f(items[i]!, i);
      }
    }),
  );
}
async function one<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as T;
}
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ----- the seed -----
async function main() {
  const db: Db = await signIn(DEMO.national);
  const org = await one<{ id: string; name: string; slug: string; is_demo: boolean }>(
    db.from("organizations").select("id,name,slug,is_demo").eq("id", ORG).single(),
  );
  if (!org.is_demo) throw new Error(`${org.name} isn't a demo organization`);
  const model = await rpc<string>(db, "membership_model", { _org: ORG });
  if (model !== "home_chapter") throw new Error(`${org.name} doesn't use the home-chapter model`);
  const existing = await one<{ id: string }[]>(
    db.from("org_member_profiles").select("id").eq("org_id", ORG).is("left_at", null).limit(50),
  );
  if (existing.length > 5) throw new Error(`${org.name} already has members; not seeding twice`);
  log(`Seeding ${org.name}`);

  // organization details
  await one(
    db.from("tax_profiles").upsert({
      org_id: ORG,
      legal_name: `${org.name} Association, Inc.`,
      ein: "12-3456789",
      tax_status: "501(c)(19)",
      address_line1: "1 Signal Way",
      city: "Albuquerque",
      region: "NM",
      postal_code: "87101",
      country: "US",
    }),
  );
  await rpc(db, "connect_test_gateway", { _org: ORG }).catch((e: Error) =>
    log("test payments:", e.message),
  );

  // member fields
  const defs: Record<string, string> = {};
  for (const [i, d] of [
    {
      key: "rank",
      label: "Rank",
      data_type: "ordered",
      options: RANKS.map((r) => [r.toLowerCase(), r]),
    },
    {
      key: "branch",
      label: "Branch",
      data_type: "choice",
      options: [
        ["army", "Army"],
        ["navy", "Navy"],
        ["air_force", "Air Force"],
        ["marines", "Marine Corps"],
        ["coast_guard", "Coast Guard"],
        ["space_force", "Space Force"],
        ["civilian", "Civilian"],
      ],
    },
    { key: "veteran", label: "Veteran", data_type: "boolean", options: [] },
  ].entries()) {
    const def = await one<{ id: string }>(
      db
        .from("attribute_definitions")
        .insert({
          org_id: ORG,
          applies_to: "member",
          key: d.key,
          label: d.label,
          data_type: d.data_type as never,
          required: d.key === "rank",
          visibility: "members",
          member_editable: true,
          show_in_directory: d.key !== "veteran",
          sort_order: (i + 1) * 10,
        })
        .select("id")
        .single(),
    );
    defs[d.key] = def.id;
    for (const [j, [value, label]] of d.options.entries())
      await one(
        db.from("attribute_options").insert({
          definition_id: def.id,
          org_id: ORG,
          value: value!,
          label: label!,
          sort_order: (j + 1) * 10,
        }),
      );
  }
  const charter = await one<{ id: string }>(
    db
      .from("attribute_definitions")
      .insert({
        org_id: ORG,
        applies_to: "chapter",
        key: "charter_date",
        label: "Charter date",
        data_type: "date",
        required: false,
        visibility: "members",
        member_editable: false,
        show_in_directory: false,
        sort_order: 10,
      })
      .select("id")
      .single(),
  );
  log("fields done");

  // levels
  const tiers: Record<string, { tier: string; terms: Record<string, string> }> = {};
  for (const [i, t] of [
    {
      key: "regular",
      name: "Regular",
      terms: [
        ["1_year", "1 year", 1, "year", 4500],
        ["3_years", "3 years", 3, "year", 12000],
      ],
    },
    { key: "life", name: "Life Member", terms: [["lifetime", "Lifetime", null, null, 60000]] },
    { key: "associate", name: "Associate", terms: [["1_year", "1 year", 1, "year", 2500]] },
  ].entries()) {
    const tier = await one<{ id: string }>(
      db
        .from("membership_tiers")
        .insert({ org_id: ORG, key: t.key, name: t.name, sort_order: (i + 1) * 10 })
        .select("id")
        .single(),
    );
    tiers[t.key] = { tier: tier.id, terms: {} };
    for (const [j, [key, label, count, unit, price]] of t.terms.entries()) {
      const term = await one<{ id: string }>(
        db
          .from("tier_terms")
          .insert({
            tier_id: tier.id,
            org_id: ORG,
            key: key as string,
            label: label as string,
            length_count: count as number | null,
            length_unit: unit as never,
            price_minor: price as number,
            sort_order: (j + 1) * 10,
          })
          .select("id")
          .single(),
      );
      tiers[t.key]!.terms[key as string] = term.id;
    }
  }
  log("levels done");

  // chapters: the existing ones plus new ones, up to 15
  const chapters = await one<{ id: string; name: string }[]>(
    db.from("organizations").select("id,name").eq("parent_id", ORG).order("name"),
  );
  for (const name of NEW_CHAPTERS) {
    if (chapters.length >= 15) break;
    if (chapters.some((c) => c.name === name)) continue;
    const id = await rpc<string>(db, "create_organization", {
      _name: name,
      _slug: `${org.slug}-${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-chapter$/, "")}`,
      _type: "chapter",
      _parent: ORG,
    });
    chapters.push({ id, name });
  }
  await pool(chapters, 4, async (c, i) => {
    await rpc(db, "set_attribute_value", {
      _def: charter.id,
      _entity: c.id,
      _value: ymd(new Date(Date.UTC(1972 + i * 3, int(0, 11), int(1, 28)))),
    });
  });
  log(`${chapters.length} chapters`);

  // people
  type Kind =
    "life" | "long" | "three" | "new" | "grace" | "lapsed" | "cancelled" | "associate" | "prospect";
  const PLAN: [Kind, number][] = [
    ["life", 40],
    ["long", 270],
    ["three", 30],
    ["new", 35],
    ["grace", 25],
    ["lapsed", 55],
    ["cancelled", 15],
    ["associate", 15],
    ["prospect", 15],
  ];
  const people: { name: string; email: string; kind: Kind; chapter: string | null }[] = [];
  const used = new Set<string>();
  for (const [kind, n] of PLAN)
    for (let k = 0; k < n; k++) {
      let name: string;
      do name = `${pick(FIRST)} ${pick(LAST)}`;
      while (used.has(name));
      used.add(name);
      const chapter =
        rand() < 0.05
          ? null
          : chapters[
              Math.min(chapters.length - 1, Math.floor(Math.pow(rand(), 1.4) * chapters.length))
            ]!.id;
      people.push({
        name,
        email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.org`,
        kind,
        chapter,
      });
    }

  let payments = 0;
  const failures: string[] = [];
  await pool(people, 8, async (p) => {
    try {
      const profile = await rpc<string>(db, "admin_create_member", {
        _org: ORG,
        _display_name: p.name,
        _email: p.email,
      });
      await rpc(db, "set_attribute_value", {
        _def: defs["rank"]!,
        _entity: profile,
        _value: weighted(RANK_WEIGHTS).toLowerCase(),
      });
      await rpc(db, "set_attribute_value", {
        _def: defs["branch"]!,
        _entity: profile,
        _value: weighted(BRANCHES),
      });
      if (rand() < 0.8)
        await rpc(db, "set_attribute_value", {
          _def: defs["veteran"]!,
          _entity: profile,
          _value: rand() < 0.85,
        });
      if (p.kind === "prospect") return;

      // the periods paid, oldest first: [start, term, price]
      const periods: [Date, string, number][] = [];
      const reg = tiers["regular"]!.terms;
      if (p.kind === "life") {
        periods.push([
          new Date(Date.UTC(int(2004, 2022), int(0, 11), int(1, 28))),
          tiers["life"]!.terms["lifetime"]!,
          60000,
        ]);
      } else if (p.kind === "new") {
        periods.push([addDays(today, -int(0, 29)), reg["1_year"]!, 4500]);
      } else if (p.kind === "three") {
        const end = addDays(today, int(20, 1000));
        const n = int(1, 3);
        for (let k = n - 1; k >= 0; k--)
          periods.push([startFor(addYears(end, -3 * k), 3), reg["3_years"]!, 12000]);
      } else if (p.kind === "associate") {
        const end = addDays(today, int(10, 360));
        for (let k = int(1, 4) - 1; k >= 0; k--)
          periods.push([
            startFor(addYears(end, -k), 1),
            tiers["associate"]!.terms["1_year"]!,
            2500,
          ]);
      } else {
        const end =
          p.kind === "grace"
            ? addDays(today, -int(1, 25))
            : p.kind === "lapsed"
              ? addDays(today, -int(40, 1100))
              : addDays(today, int(1, 364));
        const years =
          p.kind === "long"
            ? weighted([
                [1, 10],
                [2, 12],
                [3, 14],
                [4, 14],
                [5, 12],
                [6, 10],
                [7, 8],
                [8, 8],
                [9, 6],
                [10, 6],
              ] as [number, number][])
            : int(1, 5);
        for (let k = years - 1; k >= 0; k--)
          periods.push([startFor(addYears(end, -k), 1), reg["1_year"]!, 4500]);
      }

      let membership = "";
      for (const [i, [start, term, price]] of periods.entries()) {
        membership = await rpc<string>(db, "record_membership", {
          _profile: profile,
          _term: term,
          _paid_on: ymd(start),
          _starts_on: ymd(start),
          _amount_minor: price,
          _method: weighted(METHODS),
          _note: i === 0 ? "" : "Annual renewal",
        });
        payments++;
        if (i === 0 && p.chapter)
          await rpc(db, "set_member_home_chapter", {
            _membership: membership,
            _chapter: p.chapter,
          });
      }
      if (p.kind === "cancelled")
        await rpc(db, "cancel_membership", { _membership: membership, _note: "Asked to cancel" });
    } catch (e) {
      failures.push(`${p.name}: ${(e as Error).message}`);
    }
  });
  log(`${people.length} people, ${payments} payments, ${failures.length} failures`);
  if (failures.length) console.log(failures.slice(0, 10).join("\n"));

  // the board: four required seats for the national and every chapter, all filled
  const seats: { id: string; title: string }[] = [];
  for (const [i, title] of ["President", "Vice President", "Secretary", "Treasurer"].entries()) {
    const id = await rpc<string>(db, "define_seat", {
      _org: ORG,
      _key: title.toLowerCase().replace(/ /g, "_"),
      _title: title,
      _required: true,
      _scope: "self_and_chapters",
      _seat_count: 1,
      _term_count: 2,
      _term_unit: "year",
      _sort_order: (i + 1) * 10,
    });
    seats.push({ id, title });
  }
  // officers: current members of that organization (a chapter's records stand for their national membership)
  const officerPool = async (orgId: string) => {
    const rows = await one<{ id: string; memberships: unknown }[]>(
      db
        .from("org_member_profiles")
        .select(
          orgId === ORG
            ? "id,memberships!memberships_profile_id_fkey(status,paid_through,lifetime)"
            : "id,home:memberships!org_member_profiles_home_of_fkey(status,paid_through,lifetime)",
        )
        .eq("org_id", orgId)
        .is("left_at", null)
        .not("display_name", "eq", ""),
    );
    return rows
      .filter((r) => {
        const m = ((r as Record<string, unknown>)["memberships"] ??
          (r as Record<string, unknown>)["home"]) as
          | { status: string; paid_through: string | null; lifetime: boolean }
          | { status: string; paid_through: string | null; lifetime: boolean }[]
          | null;
        const one = Array.isArray(m) ? m[0] : m;
        return (
          !!one &&
          one.status === "active" &&
          (one.lifetime || (one.paid_through ?? "") >= ymd(addDays(today, 60)))
        );
      })
      .map((r) => r.id);
  };
  let appointed = 0;
  for (const o of [{ id: ORG, name: org.name }, ...chapters]) {
    const candidates = await officerPool(o.id);
    for (const s of seats) {
      const profile = candidates.splice(int(0, Math.max(0, candidates.length - 1)), 1)[0];
      if (!profile) {
        log(`no one left to appoint as ${s.title} in ${o.name}`);
        continue;
      }
      try {
        await rpc(db, "appoint_officer", {
          _org: o.id,
          _template: s.id,
          _profile: profile,
          _starts_on: ymd(addDays(today, -int(30, 600))),
        });
        appointed++;
      } catch (e) {
        log(`couldn't appoint ${s.title} in ${o.name}: ${(e as Error).message}`);
      }
    }
  }
  log(`${appointed} officers appointed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
