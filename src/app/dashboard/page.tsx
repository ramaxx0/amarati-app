import { redirect } from "next/navigation";
import { BuildingQuickWidgets } from "@/components/BuildingQuickWidgets";
import { getMyMembership } from "@/lib/access";
import { getCurrentUser } from "@/lib/current-user";
import { TopNav } from "@/components/TopNav";
import { getLocale } from "@/lib/locale";
import { ui } from "@/lib/ui-strings";
import { Button, Card, Input, PageShell } from "@/components/ui";

const accent = "var(--accent)";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const locale = await getLocale();
  const sp = await searchParams;
  let membership: Awaited<ReturnType<typeof getMyMembership>> = null;
  let loadError: string | null = null;
  try {
    membership = await getMyMembership(user.id);
  } catch (e) {
    loadError =
      e instanceof Error
        ? e.message
        : locale === "ar"
          ? "تعذّر تحميل بيانات مبناك. جرّب إعادة التحميل لاحقاً."
          : "Could not load your building. Try again later.";
  }
  const t = ui(locale).dashboard;
  const th = ui(locale).buildingHome;
  const err =
    loadError ?? (sp.error ? decodeURIComponent(sp.error) : null);
  const focusBuilding = membership?.unit.building ?? null;
  const focusBuildingId = focusBuilding?.id ?? null;
  const hasBuilding = Boolean(focusBuildingId);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav />
      <PageShell>
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: accent }}>
            {hasBuilding && focusBuilding
              ? focusBuilding.name
              : hasBuilding
                ? th.overviewSection
                : t.title}
          </h1>
          {hasBuilding ? null : (
            <p className="text-sm text-muted">{t.subtitle}</p>
          )}
        </header>
        {err ? (
          <p className="rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
            {err}
          </p>
        ) : null}

        {hasBuilding ? (
          focusBuildingId ? (
            <BuildingQuickWidgets
              buildingId={focusBuildingId}
              userId={user.id}
              locale={locale}
            />
          ) : null
        ) : null}
      </PageShell>
    </div>
  );
}
