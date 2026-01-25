export type OnboardingStatus = 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'rejected' | 'pending_closure' | 'closed';

export enum FundingSource {
  EMPLOYMENT_INCOME = "employment_income",
  INVESTMENTS = "investments",
  INHERITANCE = "inheritance",
  BUSINESS_INCOME = "business_income",
  SAVINGS = "savings",
  FAMILY = "family"
}

export enum CitizenshipStatus {
  US_CITIZEN = "us_citizen",
  PERMANENT_RESIDENT = "permanent_resident", 
  VISA_HOLDER = "visa_holder"
}

export enum EmploymentStatus {
  EMPLOYED = "employed",
  UNEMPLOYED = "unemployed",
  STUDENT = "student",
  RETIRED = "retired"
}

export enum VisaType {
  B1 = "B1",
  B2 = "B2", 
  F1 = "F1",
  F2 = "F2",
  H1B = "H1B",
  H4 = "H4",
  J1 = "J1",
  J2 = "J2",
  L1 = "L1",
  L2 = "L2",
  O1 = "O1",
  O2 = "O2",
  TN = "TN"
}

export enum LiquidNetWorthRange {
  RANGE_0_20K = "0-20000",
  RANGE_20K_50K = "20000-49999", 
  RANGE_50K_100K = "50000-99999",
  RANGE_100K_500K = "100000-499999",
  RANGE_500K_1M = "500000-999999",
  RANGE_1M_PLUS = "1000000-9999999"
}

export interface OnboardingData {
  // Contact Information
  email: string;
  phoneNumber: string;
  streetAddress: string[];
  unit?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  
  // Personal Information
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  taxIdType: string;
  taxId: string;
  countryOfTaxResidence: string;
  
  // Citizenship Information
  citizenshipStatus: CitizenshipStatus;
  countryOfCitizenship: string;
  countryOfBirth: string;
  permanentResident?: boolean;
  visaType?: VisaType;
  visaExpirationDate?: string;
  dateOfDepartureFromUsa?: string;
  
  // Financial Profile
  liquidNetWorthRange?: LiquidNetWorthRange;
  fundingSource: FundingSource[];
  employmentStatus?: EmploymentStatus;
  employerName?: string;
  employerAddress?: string;
  employmentPosition?: string;
  
  // Disclosures
  isControlPerson: boolean;
  isAffiliatedExchangeOrFinra: boolean;
  isPoliticallyExposed: boolean;
  immediateFamilyExposed: boolean;
  
  // Agreements accepted
  agreementsAccepted: {
    margin: boolean;
    customer: boolean;
    account: boolean;
  };
  account_approval_letter?: string | null;
  
  // Clera Terms & Conditions (SEC RIA requirements)
  cleraAgreementsAccepted: {
    formCRS: boolean;           // Form CRS (Client Relationship Summary)
    formADVPart2A: boolean;     // Form ADV Part 2A (Firm Brochure)
    advisoryAgreement: boolean; // Investment Advisory Agreement
    privacyPolicy: boolean;     // Privacy Policy (Regulation S-P)
    eSignConsent: boolean;      // E-SIGN Act consent
    aiDisclosure: boolean;      // AI/Algorithmic advisory disclosure
  };
  cleraAgreementsTimestamp?: string; // When user accepted Clera agreements
}

// Helper type for net worth range descriptions
export const LIQUID_NET_WORTH_DESCRIPTIONS: Record<LiquidNetWorthRange, string> = {
  [LiquidNetWorthRange.RANGE_0_20K]: "$0 - $20,000",
  [LiquidNetWorthRange.RANGE_20K_50K]: "$20,000 - $49,999",
  [LiquidNetWorthRange.RANGE_50K_100K]: "$50,000 - $99,999",
  [LiquidNetWorthRange.RANGE_100K_500K]: "$100,000 - $499,999",
  [LiquidNetWorthRange.RANGE_500K_1M]: "$500,000 - $999,999",
  [LiquidNetWorthRange.RANGE_1M_PLUS]: "$1,000,000+"
};

// Helper type for employment status descriptions
export const EMPLOYMENT_STATUS_DESCRIPTIONS: Record<EmploymentStatus, string> = {
  [EmploymentStatus.EMPLOYED]: "Employed (including self-employed)",
  [EmploymentStatus.UNEMPLOYED]: "Unemployed",
  [EmploymentStatus.STUDENT]: "Student",
  [EmploymentStatus.RETIRED]: "Retired"
};

// Helper type for visa type descriptions
export const VISA_TYPE_DESCRIPTIONS: Record<VisaType, string> = {
  [VisaType.B1]: "B1 - Business Visitor",
  [VisaType.B2]: "B2 - Tourist Visitor", 
  [VisaType.F1]: "F1 - Academic Student",
  [VisaType.F2]: "F2 - Dependent of F1",
  [VisaType.H1B]: "H1B - Specialty Occupation Worker",
  [VisaType.H4]: "H4 - Dependent of H1B",
  [VisaType.J1]: "J1 - Exchange Visitor",
  [VisaType.J2]: "J2 - Dependent of J1",
  [VisaType.L1]: "L1 - Intracompany Transferee",
  [VisaType.L2]: "L2 - Dependent of L1",
  [VisaType.O1]: "O1 - Extraordinary Ability",
  [VisaType.O2]: "O2 - Dependent of O1",
  [VisaType.TN]: "TN - NAFTA Professional"
}; 