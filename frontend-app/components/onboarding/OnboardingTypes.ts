import { FundingSource, OnboardingData } from '@/lib/types/onboarding';

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