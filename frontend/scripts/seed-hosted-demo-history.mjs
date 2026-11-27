import assert from "node:assert/strict";
import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ path: ".env.local", quiet: true });

function syntheticIban(number) {
  const body = `TRST000000${String(number).padStart(8, "0")}`;
  let remainder = 0;
  for (const char of `${body}GB00`) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return `GB${String(98 - remainder).padStart(2, "0")}${body}`;
}

function protectAccount(iban) {
  const key = Buffer.from(process.env.TRUSTPAY_IBAN_ENCRYPTION_KEY ?? "", "base64");
  const fingerprintKey = Buffer.from(process.env.TRUSTPAY_IBAN_FINGERPRINT_KEY ?? "", "base64");
  assert.equal(key.length, 32, "A 32-byte encryption key is required");
  assert.ok(fingerprintKey.length >= 32, "A 32-byte fingerprint key is required");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([nonce, cipher.update(iban, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return { encrypted, fingerprint: createHmac("sha256", fingerprintKey).update(iban).digest("hex"), last4: iban.slice(-4) };
}

async function main() {
  assert.equal(process.env.TRUSTPAY_ENVIRONMENT, "development", "Only the designated development project may be seeded");
  assert.equal(process.env.TRUSTPAY_BACKEND, "postgres", "PostgreSQL mode is required");
  const expectedRef = process.argv.find(arg => arg.startsWith("--project-ref="))?.slice("--project-ref=".length);
  if (process.argv.includes("--apply")) {
    assert.match(expectedRef ?? "", /^[a-z0-9]{20}$/, "Pass the intended Supabase project ref with --project-ref=... before applying");
    const authUrl = new URL(process.env.SUPABASE_URL);
    const databaseUrl = new URL(process.env.TRUSTPAY_DATABASE_URL);
    assert.equal(authUrl.hostname, `${expectedRef}.supabase.co`, "Supabase Auth is not the intended project");
    assert.ok(databaseUrl.username.endsWith(`.${expectedRef}`) || databaseUrl.hostname === `db.${expectedRef}.supabase.co`, "PostgreSQL is not the intended project");
  }
  const ca = readFileSync(process.env.TRUSTPAY_DATABASE_CA_CERT_PATH, "utf8");
  const pool = new Pool({ connectionString: process.env.TRUSTPAY_DATABASE_URL, ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 10_000 });
  try {
    const client = await pool.connect();
    try {
      const organizations = (await client.query(`select o.id from public.organizations o
        where (o.name ilike '%synthetic%' or o.name ilike '%demo%')
        and (select count(*) from public.organization_memberships m where m.organization_id=o.id) >= 3`)).rows;
      assert.equal(organizations.length, 1, "Expected one staffed synthetic development organization");
      const organizationId = organizations[0].id;
      const existing = (await client.query(`select count(*)::int as total,
        count(*) filter (where source='synthetic_demo_fixture')::int as fixture
        from public.payment_records where organization_id=$1 and status='paid'`, [organizationId])).rows[0];
      assert.equal(existing.total, existing.fixture, "Existing non-fixture paid records require manual review");
      if (!process.argv.includes("--apply")) {
        console.log(JSON.stringify({ mode: "dry-run", existingFixturePayments: existing.fixture, plannedFixturePayments: 14 }));
        return;
      }
      await client.query("BEGIN");
      try {
        await client.query("select pg_advisory_xact_lock(hashtext('trustpay-synthetic-history-v1'))");
        await client.query(`insert into public.suppliers (organization_id,public_id,name,registration_number,country,status)
          values ($1,'SUP-001','Aegean Supplies Synthetic Ltd','DEMO-AS','CY','active')
          on conflict (organization_id,public_id) do nothing`, [organizationId]);
        const supplierRows = (await client.query(`select id,name from public.suppliers
          where organization_id=$1 and public_id='SUP-001'`, [organizationId])).rows;
        assert.equal(supplierRows[0].name, "Aegean Supplies Synthetic Ltd", "SUP-001 belongs to a different supplier");
        const supplierId = supplierRows[0].id;
        const account = protectAccount(syntheticIban(1));
        await client.query(`insert into public.supplier_bank_accounts
          (organization_id,supplier_id,encrypted_iban,iban_fingerprint,iban_last4,verification_status)
          values ($1,$2,$3,$4,$5,'candidate')
          on conflict (organization_id,supplier_id,iban_fingerprint) do nothing`, [organizationId, supplierId, account.encrypted, account.fingerprint, account.last4]);
        const bankRows = (await client.query(`select id from public.supplier_bank_accounts
          where organization_id=$1 and supplier_id=$2 and iban_fingerprint=$3`, [organizationId, supplierId, account.fingerprint])).rows;
        const bankAccountId = bankRows[0].id;
        for (let index = 0; index < 14; index++) {
          const reference = `TRUSTPAY-SYNTHETIC-HIST-${String(index + 1).padStart(2, "0")}`;
          await client.query(`insert into public.payment_records
            (organization_id,supplier_id,bank_account_id,historical_invoice_number,amount,currency,status,paid_at,source,external_reference)
            select $1,$2,$3,$4,$5,'EUR','paid',$6,'synthetic_demo_fixture',$7
            where not exists (select 1 from public.payment_records where organization_id=$1 and source='synthetic_demo_fixture' and external_reference=$7)`,
          [organizationId, supplierId, bankAccountId, `AS-HIST-${String(index + 1).padStart(3, "0")}`, (7600 + (index % 3 - 1) * 120).toFixed(2), `2026-09-${String(index + 1).padStart(2, "0")}`, reference]);
        }
        const rows = (await client.query(`select supplier_id,bank_account_id,historical_invoice_number,amount,currency,status,
          paid_at::date::text as paid_date,external_reference from public.payment_records
          where organization_id=$1 and source='synthetic_demo_fixture'`, [organizationId])).rows;
        assert.equal(rows.length, 14, "The synthetic history must contain exactly 14 records");
        for (let index = 0; index < 14; index++) {
          const reference = `TRUSTPAY-SYNTHETIC-HIST-${String(index + 1).padStart(2, "0")}`;
          const matches = rows.filter(row => row.external_reference === reference);
          assert.equal(matches.length, 1, `Expected one intact fixture record ${reference}`);
          const row = matches[0];
          assert.equal(row.supplier_id, supplierId, `Incorrect supplier for ${reference}`);
          assert.equal(row.bank_account_id, bankAccountId, `Incorrect account for ${reference}`);
          assert.equal(row.historical_invoice_number, `AS-HIST-${String(index + 1).padStart(3, "0")}`, `Incorrect invoice for ${reference}`);
          assert.equal(Number(row.amount), 7600 + (index % 3 - 1) * 120, `Incorrect amount for ${reference}`);
          assert.equal(row.currency, "EUR", `Incorrect currency for ${reference}`);
          assert.equal(row.status, "paid", `Incorrect status for ${reference}`);
          assert.equal(row.paid_date, `2026-09-${String(index + 1).padStart(2, "0")}`, `Incorrect paid date for ${reference}`);
        }
        await client.query("COMMIT");
        console.log(JSON.stringify({ applied: true, fixturePayments: rows.length }));
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    } finally { client.release(); }
  } finally { await pool.end(); }
}

main().catch(error => { console.error(`Synthetic history seed failed: ${error.code ?? error.name}`); process.exitCode = 1; });
