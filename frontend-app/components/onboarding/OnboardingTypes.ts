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

export const initialOnboardingData: OnboardingData = {
  // Contact Information
  email: '',
  phoneNumber: '',
  streetAddress: [''],
  city: '',
  state: '',
  postalCode: '',
  country: 'USA',
  
  // Personal Information
  firstName: '',
  middleName: '',
  lastName: '',
  dateOfBirth: '',
  taxIdType: 'USA_SSN',
  taxId: '',
  countryOfCitizenship: 'USA',
  countryOfBirth: 'USA',
  countryOfTaxResidence: 'USA',
  fundingSource: [FundingSource.EMPLOYMENT_INCOME],
  
  // Disclosures
  isControlPerson: false,
  isAffiliatedExchangeOrFinra: false,
  isPoliticallyExposed: false,
  immediateFamilyExposed: false,
  
  // Agreements accepted
  agreementsAccepted: {
    margin: false,
    customer: false,
    account: false
  }
}; 