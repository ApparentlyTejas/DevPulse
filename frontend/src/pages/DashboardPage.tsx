import { useQuery } from "@tanstack/react-query";
import { listAlertEvents, type AlertEvent } from "../lib/api/alerts";
import { listIncidents, type IncidentStatus } from "../lib/api/incidents";
import { listServices } from "../lib/api/services";
import { useOrg } from "../lib/org-context";

// There's no org-wide "list all services" call without pagination, so this
// caps how many services the dashboard fans alert-event requests out to.
// Orgs with more services than this undercount recent/unresolved alert
// events; acceptable for a summary page, not for anything that needs to be
// exact.
const SERVICE_FAN_OUT_LIMIT = 100;

// How many of each service's most recent alert events to pull before
// merging. This is a page, not the service's full history, so the merged
// unresolved count is an approximation bounded by this page size per
// service -- same tradeoff as the service fan-out above.
const EVENTS_PER_SERVICE_LIMIT = 20;

const RECENT_EVENTS_LIMIT = 10;

// `IncidentFilters.status` only accepts a single status per call, and the
// backend doesn't offer an "exclude resolved" shape -- so the open/active
// incident count is the sum of one call per non-resolved status. "Open" on
// the dashboard means "not yet resolved", not literally `status: "open"`:
// investigating/identified/monitoring incidents are still outstanding work.
const NON_RESOLVED_INCIDENT_STATUSES: IncidentStatus[] = [
  "open",
  "investigating",
  "identified",
  "monitoring",
];

interface DashboardSummary {
  serviceCount: number;
  openIncidentCount: number;
  unresolvedAlertCount: number;
  recentEvents: AlertEvent[];
}

async function loadDashboardSummary(orgId: string): Promise<DashboardSummary> {
  const [servicesPage, openIncidentPages] = await Promise.all([
    listServices(orgId, { limit: SERVICE_FAN_OUT_LIMIT, offset: 0 }),
    Promise.all(
      NON_RESOLVED_INCIDENT_STATUSES.map((status) =>
        listIncidents(orgId, { status }, { limit: 1, offset: 0 }),
      ),
    ),
  ]);
  const openIncidentCount = openIncidentPages.reduce((sum, page) => sum + page.total, 0);

  const eventPages = await Promise.all(
    servicesPage.items.map((service) =>
      listAlertEvents(orgId, service.id, { limit: EVENTS_PER_SERVICE_LIMIT, offset: 0 }),
    ),
  );
  const allEvents = eventPages.flatMap((page) => page.items);
  const unresolvedAlertCount = allEvents.filter(
    (event) => event.alert_status !== "resolved",
  ).length;
  const recentEvents = [...allEvents]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, RECENT_EVENTS_LIMIT);

  return {
    serviceCount: servicesPage.total,
    openIncidentCount,
    unresolvedAlertCount,
    recentEvents,
  };
}

export function DashboardPage() {
  const { selectedOrgId } = useOrg();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard", selectedOrgId],
    queryFn: () => loadDashboardSummary(selectedOrgId as string),
    enabled: selectedOrgId != null,
  });

  if (!selectedOrgId) {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-medium text-ink">Create organization</h2>
        <p className="text-sm text-ink">Create an organization to see your dashboard.</p>
      </div>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-ink">Loading dashboard...</p>;
  }

  if (isError || !data) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-critical">Failed to load dashboard.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded border border-hairline px-3 py-2 text-sm text-ink"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex divide-x divide-hairline">
        <Stat label="Services" value={data.serviceCount} />
        <Stat label="Open incidents" value={data.openIncidentCount} />
        <Stat
          label="Unresolved alert events"
          value={data.unresolvedAlertCount}
          testId="unresolved-alert-count"
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-medium text-ink">Recent alert events</h2>
        {data.recentEvents.length === 0 ? (
          <p className="text-sm text-ink">No alert events yet.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {data.recentEvents.map((event) => (
              <li
                key={event.id}
                data-testid="recent-alert-event"
                className="flex items-center justify-between py-2 text-sm text-ink"
              >
                <span>{event.title}</span>
                <span className="flex items-center gap-3 font-mono text-xs text-ink/70">
                  <span>{event.alert_status}</span>
                  <span>{event.created_at}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: number; testId?: string }) {
  return (
    <div className="flex-1 space-y-1 px-6 py-4 first:pl-0 last:pr-0">
      <p className="text-sm text-ink">{label}</p>
      <p data-testid={testId} className="text-4xl font-medium text-ink">
        {value}
      </p>
    </div>
  );
}

export default DashboardPage;
