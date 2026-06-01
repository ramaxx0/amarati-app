import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { openMaintenanceCompanyVoteAction } from "@/actions/governance";
import { createMaintenanceAction } from "@/actions/maintenance";
import { loadBuildingContext } from "@/lib/building-context";
import { getCurrentUser } from "@/lib/current-user";
import { getLocale } from "@/lib/locale";
import { ui } from "@/lib/ui-strings";
import { prisma } from "@/lib/prisma";
import { Button, Card, Input, TextArea } from "@/components/ui";

function parseMaintCompanies(
  raw: string | null,
): { company: string; rating: number }[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw) as { company?: string; rating?: unknown }[];
    if (!Array.isArray(p)) return [];
    return p
      .map((item) => ({
        company: String(item.company ?? "").trim(),
        rating:
          typeof item.rating === "number"
            ? item.rating
            : Number(item.rating),
      }))
      .filter((x) => x.company.length > 0 && Number.isFinite(x.rating));
  } catch {
    return [];
  }
}

export default async function MaintenancePage({
  params,
  searchParams,
}: {
  params: Promise<{ buildingId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { buildingId } = await params;
  const sp = await searchParams;
  const err = sp.error ? decodeURIComponent(sp.error) : null;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { building, membership } = await loadBuildingContext(buildingId, user.id);
  if (!building || !membership) notFound();
  const locale = await getLocale();
  const m = ui(locale).maintenance;
  const rows = await prisma.maintenanceRequest.findMany({
    where: { buildingId },
    orderBy: { createdAt: "desc" },
    include: { unit: true, vote: true },
  });
  return (
    <div className="space-y-6">
      {err ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {err}
        </p>
      ) : null}
      <Card title={m.newRequest}>
        <p className="mb-3 text-xs leading-relaxed text-muted">{m.aiHint}</p>
        <form action={createMaintenanceAction} className="space-y-3">
          <input type="hidden" name="buildingId" value={buildingId} />
          <div>
            <label className="mb-1 block text-xs text-muted">{m.type}</label>
            <select
              name="scope"
              className="w-full rounded-xl border px-3 py-2 text-sm"
              style={{
                backgroundColor: "var(--field-bg)",
                borderColor: "var(--field-border)",
                color: "var(--foreground)",
              }}
            >
              <option value="PERSONAL">{m.scopePersonal}</option>
              <option value="COMMUNITY">{m.scopeCommunity}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">{m.title}</label>
            <Input name="title" required />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">{m.problem}</label>
            <TextArea name="description" rows={4} required />
          </div>
          <Button type="submit" className="w-full">
            {m.submitAi}
          </Button>
        </form>
      </Card>
      <Card title={m.requests}>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">{m.noneRequests}</p>
        ) : (
          <ul className="space-y-4">
            {rows.map((r) => {
              const companiesList = parseMaintCompanies(r.aiCompaniesJson);
              return (
              <li
                key={r.id}
                className="rounded-2xl border p-4 text-sm shadow-sm"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--card) 88%, transparent)",
                  borderColor: "var(--card-border)",
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold" style={{ color: "var(--accent)" }}>
                      {r.title}
                    </p>
                    <p className="text-xs text-muted">
                      {r.scope === "PERSONAL"
                        ? `${m.personalUnit} ${r.unit?.label ?? "-"}`
                        : m.community}
                    </p>
                  </div>
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      backgroundColor:
                        r.scope === "COMMUNITY"
                          ? "color-mix(in srgb, var(--accent) 15%, transparent)"
                          : "var(--accent-soft)",
                      color: "var(--accent)",
                    }}
                  >
                    {r.scope === "COMMUNITY" ? m.scopeLabelCommunity : m.scopeLabelPersonal}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-line">{r.description}</p>
                {r.aiSummary ? (
                  <div
                    className="mt-3 rounded-xl border p-3 text-xs"
                    style={{
                      borderColor: "var(--card-border)",
                      backgroundColor: "var(--accent-soft)",
                    }}
                  >
                    <p className="font-semibold" style={{ color: "var(--accent)" }}>
                      {m.aiTag} 
                    </p>
                    <p className="mt-1 whitespace-pre-line">{r.aiSummary}</p>
                    {r.aiSuggestions ? (
                      <p className="mt-2 whitespace-pre-line">
                        <span className="font-semibold">{m.suggestions}: </span>
                        {r.aiSuggestions}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {companiesList.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-dashed px-3 py-2 text-xs" style={{ borderColor: "var(--card-border)" }}>
                    <p className="font-semibold text-muted">{m.aiCompanies}</p>
                    <ul className="mt-2 space-y-1 font-medium" dir="ltr">
                      {companiesList.map((c) => (
                        <li key={c.company} className="text-left">
                          {c.company} — ⭐ {c.rating.toFixed(1)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {r.scope === "COMMUNITY" ? (
                  <div className="mt-3 rounded-xl border p-3 text-xs" style={{ borderColor: "var(--card-border)", backgroundColor: "var(--accent-soft)" }}>
                    {r.vote ? (
                      <Link
                        href={`/building/${buildingId}/votes`}
                        className="font-semibold underline"
                        style={{ color: "var(--accent)" }}
                      >
                        {m.companyVoteOpen}
                      </Link>
                    ) : (
                      <form action={openMaintenanceCompanyVoteAction} className="inline">
                        <input type="hidden" name="buildingId" value={buildingId} />
                        <input type="hidden" name="requestId" value={r.id} />
                        <Button type="submit" variant="ghost" className="!h-auto !py-2 !text-xs underline">
                          {m.startCompanyVote}
                        </Button>
                      </form>
                    )}
                  </div>
                ) : null}
              </li>
            );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
