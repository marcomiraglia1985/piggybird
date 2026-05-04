import {
  getNetWorthHistory,
  getCurrentNetWorth,
  getAccountsBreakdown,
} from "@/lib/queries/networth";
import {
  getInvestmentsGain,
  getStockIrrInputs,
  getSpyMonthlySeries,
} from "@/lib/queries/investments";
import {
  getMonthSummary,
  getTopExpenses,
  getRecentTransactions,
  getLifetimeStats,
  getCategoryStatsMulti,
  getAllCategoriesLight,
} from "@/lib/queries/transactions";
import { prisma } from "@/lib/prisma";
import { estateValueStatus } from "@/lib/estate-value";
import { getWorldLandPath } from "@/lib/world-map-path";

export const dynamic = "force-dynamic";
import { NetWorthChart } from "@/components/charts/net-worth-chart";
import { KpiHero } from "@/components/dashboard/kpi-hero";
import { AccountsList } from "@/components/dashboard/accounts-list";
import { MonthSummary } from "@/components/dashboard/month-summary";
import { TopExpenses } from "@/components/dashboard/top-expenses";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import { MilestonesWidget } from "@/components/dashboard/milestones-widget";
import { FutureYouWidget } from "@/components/dashboard/future-you-widget";
import { AssetAllocationWidget } from "@/components/dashboard/asset-allocation-widget";
import { AnniversaryWidget } from "@/components/dashboard/anniversary-widget";
import { EstateRoiWidget } from "@/components/dashboard/estate-roi-widget";
import { CoffeeTrackerWidget } from "@/components/dashboard/coffee-tracker-widget";
import { Sp500BeatWidget } from "@/components/dashboard/sp500-beat-widget";
import { WorldClocksWidget } from "@/components/dashboard/world-clocks-widget";
import { WorldDayNightWidget } from "@/components/dashboard/world-daynight-widget";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { WelcomeTutorial } from "@/components/dashboard/welcome-tutorial";
import { EmptyDashboardBanner } from "@/components/dashboard/empty-dashboard-banner";
import { FxStaleAlert } from "@/components/dashboard/fx-stale-alert";
import { getFxStalenessReport } from "@/lib/fx-staleness";
import { getFreezeState } from "@/lib/account-freeze";

export default async function Dashboard() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [
    history,
    current,
    accounts,
    monthSum,
    topExp,
    recent,
    investGain,
    freezeState,
    ownedEstates,
    categoryStats,
    allCategories,
    stockIrrInputs,
    spySeries,
    worldLandPath,
    fxStaleness,
  ] = await Promise.all([
    getNetWorthHistory(),
    getCurrentNetWorth(),
    getAccountsBreakdown(),
    getMonthSummary(year, month),
    getTopExpenses(year, month),
    getRecentTransactions(25),
    getInvestmentsGain(),
    getFreezeState(),
    prisma.realEstate.findMany({
      where: { active: true, holding: "owned" },
      select: {
        id: true,
        name: true,
        emoji: true,
        currentValue: true,
        currentValueUpdatedAt: true,
        purchasePrice: true,
        purchaseDate: true,
        ownershipShare: true,
      },
    }),
    getCategoryStatsMulti(year),
    getAllCategoriesLight(),
    getStockIrrInputs(),
    getSpyMonthlySeries(),
    getWorldLandPath(),
    getFxStalenessReport(),
  ]);

  // Lifetime stats prende il NW attuale (per Δ vs primo snapshot), quindi va
  // dopo il Promise.all che risolve `current`. Query interne sono leggere.
  const lifetime = await getLifetimeStats(current.total);

  // Tutti gli estate attivi (per il CategoryPicker dei widget). Diverso da
  // ownedEstates perché qui includiamo anche gli affitti per non perdere il
  // raggruppamento di categorie estate-linked.
  const allActiveEstates = await prisma.realEstate.findMany({
    where: { active: true },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, emoji: true },
  });

  const prevMonthTotal = history.length > 1 ? history[history.length - 2].total : undefined;
  // Valore stimato totale degli immobili di proprietà — usa
  // estateValueStatus() (currentValue → fallback purchasePrice) e applica
  // ownershipShare per quote parziali.
  const estatesValue = ownedEstates.reduce(
    (s, e) => s + estateValueStatus(e).value * e.ownershipShare,
    0,
  );

  // Per il widget Estate ROI: mappa solo gli immobili con purchasePrice +
  // purchaseDate (necessari al calcolo del rendimento). Gli altri vengono
  // esclusi dal widget (ma restano contati in estatesValue).
  const estateRoiRows = ownedEstates
    .filter((e) => e.purchasePrice != null && e.purchaseDate != null)
    .map((e) => {
      const status = estateValueStatus(e);
      return {
        id: e.id,
        name: e.name,
        emoji: e.emoji,
        currentValue: status.value,
        isFallback: status.isFallback,
        purchasePrice: e.purchasePrice as number,
        purchaseDateIso: (e.purchaseDate as Date).toISOString(),
        ownershipShare: e.ownershipShare,
      };
    });

  const hasNoAccounts = accounts.length === 0;

  return (
    <>
      <WelcomeTutorial />
      {hasNoAccounts && <EmptyDashboardBanner />}
      {!hasNoAccounts && <FxStaleAlert report={fxStaleness} />}
      <DashboardShell
      accountsFrozen={freezeState.frozen}
      kpiHero={
        <KpiHero
          total={current.total}
          liquidity={current.liquidity}
          savings={current.savings}
          investments={current.investments}
          investmentsGainPct={investGain.hasCostData ? investGain.gainPct : null}
          prevMonthTotal={prevMonthTotal}
        />
      }
      cards={[
          {
            id: "networth-chart",
            label: "Andamento Liquid Net Worth",
            node: <NetWorthChart key="networth-chart" data={history} />,
            defaultSpan: 3,
            minSpan: 1,
            maxSpan: 3,
            removable: false,
          },
          {
            id: "accounts",
            label: "Conti",
            node: <AccountsList key="accounts" accounts={accounts} />,
            defaultSpan: 1,
            minSpan: 1,
            maxSpan: 1,
          },
          {
            id: "month-summary",
            label: "Mese corrente",
            node: <MonthSummary key="month-summary" income={monthSum.income} expense={monthSum.expense} date={now} />,
            defaultSpan: 1,
            minSpan: 1,
            maxSpan: 1,
          },
          {
            id: "top-expenses",
            label: "Top spese",
            node: <TopExpenses key="top-expenses" rows={topExp} />,
            defaultSpan: 1,
            minSpan: 1,
            maxSpan: 1,
          },
          {
            id: "milestones",
            label: "Milestones LNW",
            node: <MilestonesWidget key="milestones" history={history} />,
            defaultSpan: 1,
            minSpan: 1,
            maxSpan: 1,
          },
          {
            id: "asset-allocation",
            label: "Asset allocation",
            node: (
              <AssetAllocationWidget
                key="asset-allocation"
                liquidity={current.liquidity}
                savings={current.savings}
                investments={current.investments}
                estates={estatesValue}
              />
            ),
            defaultSpan: 1,
            minSpan: 1,
            maxSpan: 1,
          },
          {
            id: "anniversary",
            label: "Anniversary",
            node: (
              <AnniversaryWidget
                key="anniversary"
                firstDate={lifetime?.firstDate ?? null}
                startNetWorth={lifetime?.startNetWorth ?? null}
                currentNetWorth={lifetime?.currentNetWorth ?? null}
                txCount={lifetime?.txCount ?? 0}
              />
            ),
            defaultSpan: 1,
            minSpan: 1,
            maxSpan: 1,
          },
          {
            id: "estate-roi",
            label: "Estate ROI",
            node: <EstateRoiWidget key="estate-roi" estates={estateRoiRows} />,
            defaultSpan: 1,
            minSpan: 1,
            maxSpan: 1,
          },
          {
            id: "coffee-tracker",
            label: "Coffee tracker",
            node: (
              <CoffeeTrackerWidget
                key="coffee-tracker"
                year={year}
                categories={allCategories}
                estates={allActiveEstates}
                stats={categoryStats}
              />
            ),
            defaultSpan: 1,
            minSpan: 1,
            maxSpan: 1,
          },
          {
            id: "sp500-beat",
            label: "S&P beat",
            node: (
              <Sp500BeatWidget
                key="sp500-beat"
                cashflows={stockIrrInputs.cashflows}
                finalByPlatform={stockIrrInputs.finalByPlatform}
                platforms={stockIrrInputs.platforms}
                spySeries={spySeries}
              />
            ),
            defaultSpan: 1,
            minSpan: 1,
            maxSpan: 3,
          },
          {
            id: "world-clocks",
            label: "Borse mondiali",
            node: <WorldClocksWidget key="world-clocks" />,
            defaultSpan: 1,
            minSpan: 1,
            // Max 2 col: a 3 col troppi orologi sparpagliati senza beneficio
            maxSpan: 2,
          },
          {
            id: "world-daynight",
            label: "Live Markets World Map",
            node: (
              <WorldDayNightWidget
                key="world-daynight"
                landPath={worldLandPath}
              />
            ),
            defaultSpan: 2,
            minSpan: 1,
            maxSpan: 3,
          },
          {
            id: "future-you",
            label: "Future you",
            node: <FutureYouWidget key="future-you" history={history} />,
          },
          {
            id: "recent-transactions",
            label: "Movimenti recenti",
            node: (
              <RecentTransactions
                key="recent-transactions"
                transactions={recent.map((t) => ({
                  id: t.id,
                  date: t.date.toISOString(),
                  amount: t.amount,
                  beneficiary: t.beneficiary,
                  notes: t.notes,
                  isJoint: t.isJoint,
                  accountId: t.accountId,
                  account: { name: t.account.name, emoji: t.account.emoji },
                  category: t.category
                    ? { emoji: t.category.emoji, name: t.category.name }
                    : null,
                }))}
                accounts={accounts.map((a) => ({
                  id: a.id,
                  name: a.name,
                  emoji: a.emoji,
                }))}
              />
            ),
          },
      ]}
      />
    </>
  );
}
