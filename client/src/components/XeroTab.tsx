/**
 * Xero tab in Settings.
 *
 * Delivery 2.11 — the connection only. Connect, see what you're
 * connected to, re-read the tax rates, disconnect. Nothing on this
 * screen writes to Xero.
 *
 * The two states that matter and are easy to get wrong:
 *
 *   NOT CONFIGURED — the server has no Xero app credentials. Shows a
 *   plain explanation rather than a Connect button that would fail.
 *
 *   CONNECTED BUT NO MATCHING TAX RATE — we're talking to Xero, but the
 *   tenant has no active sales tax rate at this organisation's VAT
 *   percentage. Left alone, invoices would later be raised with no VAT.
 *   That gets a warning here, while the user is looking at settings,
 *   rather than in the middle of their first push.
 *
 * The panel always names the connected Xero organisation, so testing
 * against "Demo Company (UK)" can never be mistaken for the real books.
 */
import { useEffect } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link2,
  Link2Off,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

/** Outcomes the OAuth redirect can hand back in ?xero=… */
const OUTCOME_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Xero connected" },
  cancelled: { ok: false, text: "Xero connection cancelled" },
  "not-configured": {
    ok: false,
    text: "Xero isn't set up on this server yet",
  },
  "no-org": { ok: false, text: "No organisation found for your account" },
  "no-tenant": {
    ok: false,
    text: "No Xero organisation was shared with the app",
  },
  "bad-state": {
    ok: false,
    text: "That Xero link had expired — please try again",
  },
  "bad-callback": { ok: false, text: "Xero sent an incomplete response" },
  error: { ok: false, text: "Something went wrong connecting Xero" },
};

export default function XeroTab() {
  const status = trpc.xero.status.useQuery();
  const disconnect = trpc.xero.disconnect.useMutation();
  const refreshRates = trpc.xero.refreshRates.useMutation();
  const saveOptions = trpc.xero.saveOptions.useMutation();
  const accounts = trpc.xero.accounts.useQuery(undefined, {
    // Only worth a round trip once connected, and only when the user
    // opens the picker — most organisations never need an account code.
    enabled: false,
  });
  const utils = trpc.useUtils();

  // Surface the redirect outcome once, then strip it from the URL so a
  // refresh doesn't re-announce a connection that happened minutes ago.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("xero");
    if (!outcome) return;
    const message = OUTCOME_MESSAGES[outcome];
    if (message) {
      if (message.ok) toast.success(message.text);
      else toast.error(message.text);
    }
    window.history.replaceState(null, "", "/settings?tab=xero");
    utils.xero.status.invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDisconnect() {
    if (
      !window.confirm(
        "Disconnect Xero? Nothing already in Xero is changed or removed.",
      )
    ) {
      return;
    }
    try {
      await disconnect.mutateAsync({});
      await utils.xero.status.invalidate();
      toast.success("Xero disconnected");
    } catch (err: any) {
      toast.error(err?.message || "Couldn't disconnect");
    }
  }

  async function handleRefreshRates() {
    try {
      const result = await refreshRates.mutateAsync();
      await utils.xero.status.invalidate();
      toast.success(
        (result as any)?.salesTaxType
          ? "Tax rates re-read from Xero"
          : "Re-read done — still no matching VAT rate found",
      );
    } catch (err: any) {
      toast.error(err?.message || "Couldn't read the tax rates");
    }
  }

  if (status.isLoading) {
    return (
      <Card>
        <CardContent className="py-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const data = status.data as any;

  if (!data?.configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Xero
          </CardTitle>
          <CardDescription>
            Send agreed contracts straight into Xero as repeating invoices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border bg-amber-50 border-amber-300 p-3 text-sm">
            Xero isn't set up on this server yet. Once the app credentials
            are in place, a Connect button appears here.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Xero
          </CardTitle>
          <CardDescription>
            Send agreed contracts straight into Xero as repeating invoices.
            Everything arrives as a draft — nothing reaches a client until
            you approve it in Xero.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!data.connected ? (
            <>
              <p className="text-sm text-muted-foreground">
                You'll be sent to Xero to approve the connection, then
                brought back here. IDYQ asks only for what it needs:
                read your tax rates, find or create a customer, and
                create invoices.
              </p>
              <Button asChild>
                <a href="/api/xero/connect">
                  <Link2 className="h-4 w-4 mr-2" />
                  Connect to Xero
                </a>
              </Button>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border p-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-sm">
                  Connected to{" "}
                  <strong>{data.tenantName || "a Xero organisation"}</strong>
                  {data.connectedAt
                    ? ` · since ${new Date(data.connectedAt).toLocaleDateString(
                        "en-GB",
                        { day: "numeric", month: "short", year: "numeric" },
                      )}`
                    : ""}
                </span>
              </div>

              {/* VAT matching — the thing most likely to be quietly
                  wrong, so it is stated either way rather than only on
                  failure. */}
              {data.vatCharged && data.salesTaxType ? (
                <div className="rounded-md border p-3 text-sm">
                  VAT at {data.orgVatRate}% will be applied to every line,
                  using this Xero organisation's own{" "}
                  <code className="text-xs">{data.salesTaxType}</code> rate.
                </div>
              ) : data.vatCharged && !data.salesTaxType ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm space-y-2">
                  <div className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
                    <span>
                      Your VAT rate is {data.orgVatRate}%, but this Xero
                      organisation has no active sales tax rate at that
                      percentage. Invoices would be raised without VAT.
                      Check the tax rates in Xero, then re-read them here.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border p-3 text-sm">
                  Your organisation isn't VAT registered, so lines will be
                  sent to Xero with no VAT.
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={handleRefreshRates}
                  disabled={refreshRates.isPending}
                >
                  {refreshRates.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Re-read tax rates
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDisconnect}
                  disabled={disconnect.isPending}
                >
                  <Link2Off className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Disconnecting removes this app's access from IDYQ's side.
                To revoke it at Xero's end as well, open your Xero
                account's connected apps.{" "}
                <a
                  href="https://developer.xero.com/faq"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline"
                >
                  Xero help
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {data.connected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Push options</CardTitle>
            <CardDescription>
              How lines are written onto invoices.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                defaultChecked={!!data.monthYearSuffix}
                onChange={async (e) => {
                  try {
                    await saveOptions.mutateAsync({
                      monthYearSuffix: e.target.checked,
                    });
                    await utils.xero.status.invalidate();
                    toast.success("Saved");
                  } catch (err: any) {
                    toast.error(err?.message || "Couldn't save");
                  }
                }}
                className="mt-0.5"
              />
              <span>
                Add "(for [Month] [Year])" to monthly lines
                <span className="block text-xs text-muted-foreground">
                  Xero fills those in on each invoice it raises. Monthly
                  lines only — yearly lines are left plain.
                </span>
              </span>
            </label>

            <div className="space-y-1">
              <label className="text-sm font-medium">
                Default sales account (optional)
              </label>
              <p className="text-xs text-muted-foreground">
                Leave blank and Xero applies your own default, which is
                usually what you want. Set one only if a push is refused
                for a missing account code.
              </p>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  defaultValue={data.salesAccountCode || ""}
                  placeholder="e.g. 200"
                  onBlur={async (e) => {
                    try {
                      await saveOptions.mutateAsync({
                        salesAccountCode: e.target.value.trim() || null,
                      });
                      await utils.xero.status.invalidate();
                      toast.success("Saved");
                    } catch (err: any) {
                      toast.error(err?.message || "Couldn't save");
                    }
                  }}
                  className="rounded-md border px-2 py-1.5 text-sm w-40"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => accounts.refetch()}
                  disabled={accounts.isFetching}
                >
                  {accounts.isFetching ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : null}
                  Show my sales accounts
                </Button>
              </div>
              {(accounts.data as any)?.accounts?.length > 0 && (
                <div className="mt-2 rounded-md border divide-y text-sm">
                  {(accounts.data as any).accounts.map((a: any) => (
                    <div
                      key={a.code}
                      className="flex justify-between px-2 py-1.5"
                    >
                      <span>{a.name}</span>
                      <code className="text-xs">{a.code}</code>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {data.connected && (data.taxRates?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Sales tax rates in this Xero organisation
            </CardTitle>
            <CardDescription>
              Read from Xero, not assumed. Only rates valid on sales are
              listed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {data.taxRates.map((r: any) => (
                <div
                  key={r.taxType}
                  className="flex items-center justify-between text-sm border-b last:border-0 py-1.5"
                >
                  <span>{r.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {r.effectiveRate}%{" "}
                    <code className="text-xs">{r.taxType}</code>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
