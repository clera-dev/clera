export enum FundingSource {
  EMPLOYMENT_INCOME = "employment_income",
  INVESTMENTS = "investments",
  INHERITANCE = "inheritance",
  BUSINESS_INCOME = "business_income",
  SAVINGS = "savings",
  FAMILY = "family"
}

export interface OnboardingData {
  // Contact Information
  email: string;
  phoneNumber: string;
  streetAddress: string[];
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
  countryOfCitizenship: string;
  countryOfBirth: string;
  countryOfTaxResidence: string;
  fundingSource: FundingSource[];
  
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
} 