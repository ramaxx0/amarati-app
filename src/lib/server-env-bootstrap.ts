/**
 * يُحمَّل مبكراً (من prisma أو session) لمزامنة أسماء متغيرات البيئة الشائعة على Vercel
 * (مثل Vercel Postgres) مع ما يتوقعه Prisma في schema (`DATABASE_URL` / `DIRECT_URL`).
 */
function trim(s: string | undefined): string {
  return s?.trim() ?? "";
}

/** يزيل علامات اقتباس خارجية شائعة عند اللصق من لوحات المتغيرات. */
function unquoteOuter(s: string): string {
  const t = trim(s);
  if (t.length >= 2) {
    const q = t[0];
    if ((q === '"' || q === "'") && t[t.length - 1] === q) {
      return t.slice(1, -1).trim();
    }
  }
  return t;
}

/** Supabase Transaction pooler (6543) + Prisma يحتاج pgbouncer=true وإلا 42P05 prepared statement. */
function ensureSupabasePoolerParams(url: string): string {
  try {
    const u = new URL(url.replace(/^postgres:/, "postgresql:"));
    if (u.hostname.includes("pooler.supabase.com") && u.port === "6543") {
      if (!u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
      if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "1");
    }
    if (!u.searchParams.has("sslmode")) u.searchParams.set("sslmode", "require");
    return u.toString().replace(/^postgresql:/, "postgres:");
  } catch {
    return url;
  }
}

function syncDatabaseEnv(): void {
  if (typeof window !== "undefined") return;

  const dbClean = ensureSupabasePoolerParams(
    unquoteOuter(process.env.DATABASE_URL ?? "") ||
      trim(process.env.POSTGRES_PRISMA_URL) ||
      trim(process.env.POSTGRES_URL),
  );
  if (dbClean) process.env.DATABASE_URL = dbClean;

  const dirClean =
    unquoteOuter(process.env.DIRECT_URL ?? "") ||
    trim(process.env.POSTGRES_URL_NON_POOLING) ||
    trim(process.env.DATABASE_URL_UNPOOLED) ||
    trim(process.env.NEON_DATABASE_URL_UNPOOLED) ||
    trim(process.env.POSTGRES_URL) ||
    dbClean;
  if (dirClean) process.env.DIRECT_URL = dirClean;
}

syncDatabaseEnv();

/** مفتاح JWT للجلسة — يقبل أسماء بديلة شائعة في القوالب والاستضافة. */
export function authSecretKeyBytes(): Uint8Array {
  const candidates = [
    process.env.AUTH_SECRET,
    process.env.SESSION_SECRET,
    process.env.NEXTAUTH_SECRET,
  ];
  for (const c of candidates) {
    const s = unquoteOuter(String(c ?? ""));
    if (s.length >= 16) return new TextEncoder().encode(s);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set (min 16 chars)");
  }
  return new TextEncoder().encode("amarati-local-dev-auth-secret-min-16chars!");
}
