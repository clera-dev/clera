"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  CreditCard, 
  Loader2, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  XCircle
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import toast from 'react-hot-toast';

interface PaymentRecord {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  payment_status: 'active' | 'inactive' | 'past_due' | 'canceled' | 'unpaid';
  subscription_status: string | null;
  created_at: string;
  updated_at: string;
}

interface SubscriptionStatus {
  hasActivePayment: boolean;
  paymentRecord: PaymentRecord | null;
}

/**
 * SubscriptionManagement Component
 * 
 * Displays subscription status and provides access to Stripe Customer Portal
 * for users to manage their billing, update payment methods, or cancel subscription.
 * 
 * Design follows existing dashboard component patterns (Card-based layout).
 */
export default function SubscriptionManagement() {
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch subscription status on mount
  const fetchSubscriptionStatus = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/stripe/check-payment-status');
      
      if (!response.ok) {
        throw new Error('Failed to fetch subscription status');
      }
      
      const data = await response.json();
      setSubscriptionStatus(data);
    } catch (err) {
      console.error('Error fetching subscription status:', err);
      setError('Unable to load subscription information');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptionStatus();
  }, [fetchSubscriptionStatus]);

  // Handle redirect to Stripe Customer Portal
  const handleManageSubscription = async () => {
    setIsRedirecting(true);
    
    try {
      const response = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        // Handle specific error codes
        if (data.code === 'NO_CUSTOMER') {
          toast.error('No subscription found. Please subscribe first.');
        } else {
          toast.error(data.error || 'Failed to open subscription management');
        }
        setIsRedirecting(false);
        return;
      }
      
      // Open Stripe Customer Portal in new tab (industry standard - user keeps dashboard context)
      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
        setIsRedirecting(false);
      } else {
        toast.error('Failed to get portal URL');
        setIsRedirecting(false);
      }
    } catch (err) {
      console.error('Error creating portal session:', err);
      toast.error('Failed to open subscription management');
      setIsRedirecting(false);
    }
  };

  // Get status display configuration
  const getStatusConfig = (status: SubscriptionStatus | null) => {
    if (!status?.paymentRecord) {
      return {
        label: 'No Subscription',
        variant: 'secondary' as const,
        icon: XCircle,
        color: 'text-muted-foreground',
        bgColor: 'bg-muted',
        description: 'You don\'t have an active subscription.'
      };
    }

    const paymentStatus = status.paymentRecord.payment_status;
    const subscriptionStatus = status.paymentRecord.subscription_status;

    if (paymentStatus === 'active' || subscriptionStatus === 'active' || subscriptionStatus === 'trialing') {
      return {
        label: subscriptionStatus === 'trialing' ? 'Trial Active' : 'Active',
        variant: 'default' as const,
        icon: CheckCircle2,
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-100 dark:bg-green-900/20',
        description: subscriptionStatus === 'trialing' 
          ? 'Your trial subscription is active.'
          : 'Your subscription is active and in good standing.'
      };
    }

    if (paymentStatus === 'past_due') {
      return {
        label: 'Past Due',
        variant: 'destructive' as const,
        icon: AlertCircle,
        color: 'text-orange-600 dark:text-orange-400',
        bgColor: 'bg-orange-100 dark:bg-orange-900/20',
        description: 'Your payment is past due. Please update your payment method.'
      };
    }

    if (paymentStatus === 'canceled' || subscriptionStatus === 'canceled') {
      return {
        label: 'Canceled',
        variant: 'secondary' as const,
        icon: XCircle,
        color: 'text-muted-foreground',
        bgColor: 'bg-muted',
        description: 'Your subscription has been canceled.'
      };
    }

    return {
      label: 'Inactive',
      variant: 'secondary' as const,
      icon: Clock,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted',
      description: 'Your subscription is not active.'
    };
  };

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading subscription info...
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error}
              <Button 
                variant="link" 
                className="p-0 h-auto ml-2 text-destructive underline"
                onClick={() => {
                  setIsLoading(true);
                  fetchSubscriptionStatus();
                }}
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const statusConfig = getStatusConfig(subscriptionStatus);
  const StatusIcon = statusConfig.icon;
  const hasStripeCustomer = !!subscriptionStatus?.paymentRecord?.stripe_customer_id;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription
          </CardTitle>
          <Badge variant={statusConfig.variant} className="ml-2">
            {statusConfig.label}
          </Badge>
        </div>
        <CardDescription>
          Manage your Clera subscription and billing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Display */}
        <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
          <div className={`flex-shrink-0 h-10 w-10 rounded-full ${statusConfig.bgColor} flex items-center justify-center`}>
            <StatusIcon className={`h-5 w-5 ${statusConfig.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {statusConfig.description}
            </p>
            {subscriptionStatus?.paymentRecord?.updated_at && (
              <p className="text-xs text-muted-foreground mt-1">
                Last updated: {new Date(subscriptionStatus.paymentRecord.updated_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}
              </p>
            )}
          </div>
        </div>

        {/* Past Due Warning */}
        {subscriptionStatus?.paymentRecord?.payment_status === 'past_due' && (
          <Alert variant="destructive" className="bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/20">
            <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <AlertDescription className="text-sm text-orange-800 dark:text-orange-300">
              <strong>Action Required:</strong> Please update your payment method to avoid service interruption.
            </AlertDescription>
          </Alert>
        )}

        {/* Manage Subscription Button */}
        {hasStripeCustomer ? (
          <Button 
            onClick={handleManageSubscription}
            disabled={isRedirecting}
            className="w-full"
            variant="outline"
          >
            {isRedirecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Opening...
              </>
            ) : (
              <>
                Manage Subscription
                <ExternalLink className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        ) : (
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Subscribe to access all features of Clera.
            </p>
            <Button 
              onClick={() => window.location.href = '/onboarding'}
              className="w-full"
            >
              Get Started
            </Button>
          </div>
        )}

        {/* Help Text */}
        <p className="text-xs text-muted-foreground text-center">
          {hasStripeCustomer 
            ? 'Update payment methods, view invoices, or cancel your subscription in the billing portal.'
            : 'Start your subscription to unlock personalized AI investment advice.'}
        </p>
      </CardContent>
    </Card>
  );
}
