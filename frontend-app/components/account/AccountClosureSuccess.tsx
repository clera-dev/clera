"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Calendar, Mail, FileText, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AccountClosureSuccessProps {
  accountId: string;
  completionTimestamp: string;
  estimatedCompletion: string;
  confirmationNumber: string;
  contactEmail?: string;
}

export default function AccountClosureSuccess({
  accountId,
  completionTimestamp,
  estimatedCompletion,
  confirmationNumber,
  contactEmail = "support@askclera.com"
}: AccountClosureSuccessProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Success Header */}
      <Card className="border-green-200 bg-green-50">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <CheckCircle className="h-16 w-16 text-green-600" />
          </div>
          <CardTitle className="text-2xl text-green-800">
            Account Closure Process Initiated
          </CardTitle>
          <CardDescription className="text-green-700 text-lg">
            Your request has been successfully submitted and processing has begun.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Process Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            What Happens Next
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-2 w-2 bg-blue-600 rounded-full mt-2"></div>
              <p className="text-sm">Your holdings will be liquidated at current market prices</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-2 w-2 bg-blue-600 rounded-full mt-2"></div>
              <p className="text-sm">Resulting cash will be transferred to your connected bank account</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-2 w-2 bg-blue-600 rounded-full mt-2"></div>
              <p className="text-sm">Your account will be permanently closed</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-2 w-2 bg-blue-600 rounded-full mt-2"></div>
              <p className="text-sm">Final account documents will be sent via email within 2 business days</p>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-md border border-blue-200">
            <p className="text-sm font-medium text-blue-800 mb-1">Timeline</p>
            <p className="text-sm text-blue-700">
              Please allow <strong>3-5 business days</strong> for this process to complete.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Important Notice */}
      <Alert className="border-amber-200 bg-amber-50">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800">
          <strong>Important:</strong> This process cannot be reversed once liquidation begins. 
          Your account closure is now in progress and cannot be canceled.
        </AlertDescription>
      </Alert>

      {/* Confirmation Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Confirmation Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm bg-gray-900 p-4 rounded-lg border border-gray-700">
            <div>
              <p className="font-medium text-gray-300">Confirmation Number</p>
              <p className="font-mono text-white bg-black/30 px-2 py-1 rounded border border-gray-600">{confirmationNumber}</p>
            </div>
            <div>
              <p className="font-medium text-gray-300">Request Date</p>
              <p className="text-white">{formatDate(completionTimestamp)}</p>
            </div>
            <div>
              <p className="font-medium text-gray-300">Account ID</p>
              <p className="font-mono text-white bg-black/30 px-2 py-1 rounded border border-gray-600">{accountId}</p>
            </div>
            <div>
              <p className="font-medium text-gray-300">Estimated Completion</p>
              <p className="text-white">{estimatedCompletion}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle>Questions or Concerns?</CardTitle>
          <CardDescription>
            Our support team is available to help you during this process.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-gray-500" />
            <div>
              <p className="font-medium">Email Support</p>
              <p className="text-sm text-gray-600">{contactEmail}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 