'use client';

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Building2, ExternalLink } from "lucide-react";

const CONNECTABLE_BROKERAGES = [
  "Robinhood",
  "Fidelity",
  "Charles Schwab",
  "TD Ameritrade",
  "E*TRADE",
  "Vanguard",
  "Webull",
  "SoFi",
  "Interactive Brokers",
];

interface NoTradeAccountsNoticeProps {
  onConnectClick?: () => void;
  className?: string;
}

export function NoTradeAccountsNotice({ onConnectClick, className }: NoTradeAccountsNoticeProps) {
  return (
    <Alert className={className}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-muted">
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </div>
        <AlertDescription className="text-sm">
          <div className="font-semibold text-foreground">
            No trading-enabled accounts connected
          </div>
          <p className="text-muted-foreground mt-1">
            You can connect read-only accounts for insights, but trading requires a brokerage
            that supports trade access.
          </p>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              See brokerages you can connect via SnapTrade
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {CONNECTABLE_BROKERAGES.map((brokerage) => (
                <span
                  key={brokerage}
                  className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {brokerage}
                </span>
              ))}
              <span className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                +20 more
              </span>
            </div>
          </details>
          {onConnectClick && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={onConnectClick}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Connect a brokerage
            </Button>
          )}
        </AlertDescription>
      </div>
    </Alert>
  );
}
