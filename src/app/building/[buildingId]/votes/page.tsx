import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  closeMaintenanceCompanyVoteAction,
  closeVoteAndApplySupervisorAction,
  openSupervisorVoteAction,
} from "@/actions/governance";
import { castVoteAction } from "@/actions/votes";
import { loadBuildingContext } from "@/lib/building-context";
import { getCurrentUser } from "@/lib/current-user";
import { getLocale } from "@/lib/locale";
import { pickDateLocale, ui } from "@/lib/ui-strings";
import { prisma } from "@/lib/prisma";
import { Button, Card } from "@/components/ui";

export default async function VotesPage({
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
  const v = ui(locale).votes;
  const df = pickDateLocale(locale);
  const votes = await prisma.vote.findMany({
    where: { buildingId },
    orderBy: { createdAt: "desc" },
    include: { options: true, ballots: true, maintenanceRequest: true },
  });
  const isCreator = building.creatorId === user.id;
  const canManage =  membership.isSupervisor;

  const supervisorVotes = votes.filter((x) => x.type === "SUPERVISOR");
  const maintenanceCompanyVotes = votes.filter(
    (x) => x.type === "MAINTENANCE_COMPANY",
  );
  const otherVotes = votes.filter(
    (x) => x.type !== "SUPERVISOR" && x.type !== "MAINTENANCE_COMPANY",
  );

  return (
    <div className="space-y-6">
      {err ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {err}
        </p>
      ) : null}

      <Card title={v.kindsTitle}>
        <div
          className="rounded-2xl border p-4"
          style={{
            borderColor: "var(--card-border)",
            backgroundColor: "color-mix(in srgb, var(--card) 90%, transparent)",
          }}
        >
          <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
            {v.kindSupervisorTitle}
          </p>
          <p className="mt-1 text-xs text-muted">{v.kindSupervisorDesc}</p>
          {isCreator ? (
            <form action={openSupervisorVoteAction} className="mt-3">
              <input type="hidden" name="buildingId" value={buildingId} />
              <Button type="submit" variant="ghost" className="!py-1.5 !text-xs">
                {v.startSupervisor}
              </Button>
            </form>
          ) : (
            <p className="mt-3 text-xs text-muted">{v.creatorOnlyHint}</p>
          )}
        </div>

        <div
          className="mt-4 rounded-2xl border p-4"
          style={{
            borderColor: "var(--card-border)",
            backgroundColor: "color-mix(in srgb, var(--card) 90%, transparent)",
          }}
        >
          <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
            {v.kindCompanyTitle}
          </p>
          <p className="mt-1 text-xs text-muted">{v.kindCompanyDesc}</p>
          <Link
            href={`/building/${buildingId}/maintenance`}
            className="mt-3 inline-flex items-center justify-center rounded-2xl border-2 border-accent px-4 py-2 text-xs font-semibold text-accent transition-colors hover:bg-[var(--accent-soft)]"
          >
            {v.openMaintenance}
          </Link>
        </div>
      </Card>

      <VoteList
        title={v.titleSupervisor}
        votes={supervisorVotes}
        userId={user.id}
        df={df}
        v={v}
        canCloseSupervisor={canManage}
        canCloseCompany={false}
      />

      <VoteList
        title={v.titleCompany}
        votes={maintenanceCompanyVotes}
        userId={user.id}
        df={df}
        v={v}
        canCloseSupervisor={false}
        canCloseCompany={canManage}
      />

      {otherVotes.length > 0 ? (
        <VoteList
          title={v.titleOther}
          votes={otherVotes}
          userId={user.id}
          df={df}
          v={v}
          canCloseSupervisor={false}
          canCloseCompany={false}
        />
      ) : null}
    </div>
  );
}

type VoteRow = {
  id: string;
  type: string;
  title: string;
  status: string;
  endsAt: Date;
  description: string | null;
  options: { id: string; label: string }[];
  ballots: { userId: string; optionId: string }[];
};

type VotesT = ReturnType<typeof ui>["votes"];

function VoteList({
  title,
  votes,
  userId,
  df,
  v,
  canCloseSupervisor,
  canCloseCompany,
}: {
  title: string;
  votes: VoteRow[];
  userId: string;
  df: string;
  v: VotesT;
  canCloseSupervisor: boolean;
  canCloseCompany: boolean;
}) {
  return (
    <Card title={title}>
      {votes.length === 0 ? (
        <p className="text-sm text-muted">{v.none}</p>
      ) : (
        <ul className="space-y-5">
          {votes.map((vote) => {
            const mine = vote.ballots.find((b) => b.userId === userId);
            const counts = new Map<string, number>();
            for (const o of vote.options) counts.set(o.id, 0);
            for (const b of vote.ballots) {
              counts.set(b.optionId, (counts.get(b.optionId) ?? 0) + 1);
            }
            const total = vote.ballots.length;
            const isOpen = vote.status === "OPEN" && vote.endsAt > new Date();
            const typeLabel =
              vote.type === "SUPERVISOR"
                ? v.typeSupervisor
                : vote.type === "MAINTENANCE_COMPANY"
                  ? v.typeCompany
                  : v.typeLegacyPoll;
            return (
              <li
                key={vote.id}
                className="rounded-2xl border p-4 shadow-sm"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--card) 88%, transparent)",
                  borderColor: "var(--card-border)",
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="font-semibold" style={{ color: "var(--accent)" }}>
                      {vote.title}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {typeLabel} · {isOpen ? v.statusActive : v.statusEnded} · {v.ends}{" "}
                      {vote.endsAt.toLocaleString(df)}
                    </p>
                    {vote.description ? (
                      <p className="mt-2 text-sm">{vote.description}</p>
                    ) : null}
                  </div>
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {vote.options.map((o) => {
                    const c = counts.get(o.id) ?? 0;
                    const pct = total > 0 ? Math.round((c / total) * 100) : 0;
                    const isMine = mine?.optionId === o.id;
                    return (
                      <li
                        key={o.id}
                        className="rounded-xl border p-2.5"
                        style={{
                          borderColor: isMine ? "var(--accent)" : "var(--card-border)",
                          backgroundColor: "var(--card)",
                        }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{o.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted">
                              {c} {v.votes} · {pct}%
                            </span>
                            {isOpen ? (
                              <form action={castVoteAction}>
                                <input type="hidden" name="voteId" value={vote.id} />
                                <input type="hidden" name="optionId" value={o.id} />
                                <Button type="submit" className="!py-1 !text-xs">
                                  {isMine ? v.yourVote : v.vote}
                                </Button>
                              </form>
                            ) : null}
                          </div>
                        </div>
                        <div
                          className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
                          style={{ backgroundColor: "var(--accent-soft)" }}
                          aria-hidden
                        >
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: "var(--accent)",
                            }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {isOpen && (canCloseSupervisor || canCloseCompany) ? (
                  <div
                    className="mt-4 flex flex-wrap gap-2 border-t pt-3"
                    style={{ borderColor: "var(--card-border)" }}
                  >
                    {canCloseSupervisor && vote.type === "SUPERVISOR" ? (
                      <form action={closeVoteAndApplySupervisorAction}>
                        <input type="hidden" name="voteId" value={vote.id} />
                        <Button type="submit" variant="ghost" className="!py-1 !text-xs">
                          {v.closeSupervisor}
                        </Button>
                      </form>
                    ) : null}
                    {canCloseCompany && vote.type === "MAINTENANCE_COMPANY" ? (
                      <form action={closeMaintenanceCompanyVoteAction}>
                        <input type="hidden" name="voteId" value={vote.id} />
                        <Button type="submit" variant="ghost" className="!py-1 !text-xs">
                          {v.closeCompany}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

