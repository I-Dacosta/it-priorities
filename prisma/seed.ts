import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Owner } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const LAUNCH_USERS = [
  { email: "robert.rosten@aquatiq.com", name: "Robert Rosten" },
  { email: "ima.dacosta@aquatiq.com", name: "Ima Da Costa" },
  { email: "eirik.bugge@aquatiq.com", name: "Eirik Bugge" },
  { email: "sigmund.hagehaugen@aquatiq.com", name: "Sigmund Hagehaugen" },
  { email: "steinar.ege@aquatiq.com", name: "Steinar Ege" },
];

// Best-effort grouping of the pasted "IT oppgaver og prioriteringer" flat
// bullet list into initiatives. Only Xero carries an explicit owner hint in
// the source ("(Ima)"); everything else defaults to Robert until dragged.
const TASKS: { title: string; notes: string; owner: Owner }[] = [
  {
    title: "Ansattportal - Skytech",
    notes: "Estimert ferdig med go-live i uke 40. Forbedre onboarding/offboarding.",
    owner: Owner.ROBERT,
  },
  {
    title: "Elæring",
    notes: "Estimert ferdig med go-live i uke 41.",
    owner: Owner.ROBERT,
  },
  {
    title: "AI",
    notes:
      "Få på plass AI policy, estimert ferdig til behandling uke 38. Tilganger — hvem, hvor/når går vi fra pilot til å rulle det ut til «alle». AI verktøy, all in på Claude? MCP til Visma, neste steg -> read&write. MCP til SO, lanseres i Q3. MCP til andre systemer? Claude til møtenotater? Andre løsninger? Hvordan ta neste steg? Bygge apper e.l. som kan gi selskapet mer verdi.",
    owner: Owner.ROBERT,
  },
  {
    title: "NIS2",
    notes:
      "Starte jobben med å få på plass sikkerhet ihht NIS2, se NSM rammeverk. Forankres/eies av ledelsen. Beredskapsplan. Outsource?",
    owner: Owner.ROBERT,
  },
  {
    title: "Hjemmeside/webshop",
    notes:
      "Forbedre/endre layout – modernisere. Kategorier. Nye markeder. Kontinuerlig utvikle, men nå mer og mer avhengig av Anadigme bistand — hvordan snu den trenden? PIM, bør prioriteres. Flytte kunder og kontaktpersoner ut fra Sanity, kun Shopify, endre login og sikkerhet, kode for å logge inn.",
    owner: Owner.ROBERT,
  },
  {
    title: "Datavarehus",
    notes: "Bygge datavarehus for rapportering.",
    owner: Owner.ROBERT,
  },
  {
    title: "Xero",
    notes:
      "Neste steg er AU&NZ, integrasjon er satt opp, starter med oppsett (likt Visma). Jobbes med fortløpende, ved ledig tid.",
    owner: Owner.IMA,
  },
  {
    title: "Odoo",
    notes:
      "Valg av ERP partner for de ulike landene (bortsett fra Island). Chile, Ecuador og Belgia.",
    owner: Owner.ROBERT,
  },
  {
    title: "SuperOffice",
    notes:
      "Fått på plass brukerveiledninger, publisert. Få satt opp for Litauen, Latvia, Estland — i dialog med … Dashboard, hjelpe med å sette opp gode dashboard. Følge opp. Flere Power BI Dashboard?",
    owner: Owner.ROBERT,
  },
  {
    title: "MCP – Q3",
    notes: "",
    owner: Owner.ROBERT,
  },
];

async function main() {
  const users = new Map<string, string>();
  for (const u of LAUNCH_USERS) {
    const created = await prisma.allowedUser.upsert({
      where: { email: u.email },
      update: { name: u.name },
      create: { email: u.email, name: u.name },
    });
    users.set(u.email, created.id);
  }

  const seededBy = users.get("ima.dacosta@aquatiq.com")!;

  const existing = await prisma.task.count();
  if (existing === 0) {
    const byOwner: Record<Owner, number> = { ROBERT: 0, IMA: 0 };
    for (const task of TASKS) {
      await prisma.task.create({
        data: {
          title: task.title,
          notes: task.notes,
          owner: task.owner,
          position: byOwner[task.owner]++,
          createdById: seededBy,
        },
      });
    }
    console.log(`Seeded ${TASKS.length} tasks.`);
  } else {
    console.log(`Skipped task seed — ${existing} task(s) already exist.`);
  }

  console.log(`Seeded ${LAUNCH_USERS.length} allowed users.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
