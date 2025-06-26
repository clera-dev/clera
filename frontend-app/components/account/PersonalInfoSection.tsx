"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, User, Mail, Shield } from "lucide-react";

interface UserData {
  firstName: string;
  lastName: string;
  email: string;
}

interface AccountData {
  alpacaAccountId: string;
  accountStatus: string;
  created?: string;
}

interface PersonalInfoSectionProps {
  userData: UserData;
  accountData: AccountData;
}

export default function PersonalInfoSection({ userData, accountData }: PersonalInfoSectionProps) {
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'ACTIVE':
        return 'bg-green-500';
      case 'SUBMITTED':
      case 'PENDING':
        return 'bg-yellow-500';
      case 'INACTIVE':
      case 'CLOSED':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Personal Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Name */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Full Name</p>
            <p className="text-base font-medium">
              {userData.firstName} {userData.lastName}
            </p>
          </div>

          {/* Email */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Email Address</p>
            <p className="text-base font-medium flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              {userData.email}
            </p>
          </div>

          {/* Account Number */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Account Number</p>
            <p className="text-base font-medium font-mono">
              {accountData.alpacaAccountId}
            </p>
          </div>

          {/* Account Status */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Account Status</p>
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${getStatusColor(accountData.accountStatus)}`} />
              <p className="text-base font-medium flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                {accountData.accountStatus}
              </p>
            </div>
          </div>

          {/* Account Created */}
          <div className="md:col-span-2">
            <p className="text-sm font-medium text-muted-foreground mb-1">Account Created</p>
            <p className="text-base font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {formatDate(accountData.created)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 