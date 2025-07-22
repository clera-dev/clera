export function cleanStatus(status: string | null): string | null {
  if (!status) return status;
  // Remove any prefix like 'Accountstatus.' or 'accountstatus.'
  return status.replace(/^accountstatus\.|^Accountstatus\./i, '');
}

export function formatAccountStatus(status: string | null): string {
  if (!status) return 'Unknown';
  const clean = cleanStatus(status);
  if (!clean) return 'Unknown';
  const statusUpper = clean.toUpperCase();
  switch (statusUpper) {
    case 'ACTIVE':
      return 'Active';
    case 'ACCOUNT_UPDATED':
      return 'Account Updated';
    case 'APPROVED':
      return 'Approved';
    case 'PENDING':
    case 'PENDING_APPROVAL':
      return 'Pending Approval';
    case 'SUBMITTED':
      return 'Application Submitted';
    case 'REJECTED':
      return 'Application Rejected';
    case 'ACCOUNT_CLOSED':
      return 'Account Closed';
    case 'DISABLED':
      return 'Disabled';
    case 'ACCOUNT_BLOCKED':
      return 'Account Blocked';
    case 'LIMITED':
      return 'Limited Access';
    case 'RESTRICTED':
      return 'Restricted';
    case 'ONBOARDING':
      return 'Setting Up';
    case 'EDITING':
      return 'Being Updated';
    case 'APPROVAL_PENDING':
      return 'Awaiting Approval';
    case 'PAPER_ONLY':
      return 'Paper Trading Only';
    case 'INACTIVE':
      return 'Inactive';
    default:
      // Convert underscores to spaces and title case
      return clean
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
  }
}

export function getAccountStatusColor(status: string | null): string {
  if (!status) return 'bg-gray-500';
  const clean = cleanStatus(status);
  if (!clean) return 'bg-gray-500';
  const statusUpper = clean.toUpperCase();
  switch (statusUpper) {
    case 'ACTIVE':
    case 'APPROVED':
      return 'bg-green-500';
    case 'ACCOUNT_UPDATED':
    case 'EDITING':
    case 'PENDING':
    case 'PENDING_APPROVAL':
    case 'SUBMITTED':
    case 'ONBOARDING':
    case 'APPROVAL_PENDING':
      return 'bg-yellow-500';
    case 'REJECTED':
    case 'ACCOUNT_CLOSED':
    case 'DISABLED':
    case 'ACCOUNT_BLOCKED':
      return 'bg-red-500';
    case 'LIMITED':
    case 'RESTRICTED':
    case 'PAPER_ONLY':
    case 'INACTIVE':
      return 'bg-orange-500';
    default:
      return 'bg-gray-500';
  }
}

export function getAccountStatusTooltip(status: string | null): string {
  const clean = cleanStatus(status);
  if (!clean) return '';
  switch (clean.toUpperCase()) {
    case 'ACTIVE':
      return 'Account is fully active and can trade.';
    case 'ACCOUNT_UPDATED':
      return 'Your account info is being updated. Trading is temporarily restricted.';
    case 'REJECTED':
      return 'Account was rejected. Please contact support.';
    case 'ACCOUNT_CLOSED':
      return 'Account is closed. No trading or funding allowed.';
    case 'ONBOARDING':
      return 'Account is being created. Please complete onboarding.';
    default:
      return formatAccountStatus(status);
  }
} 