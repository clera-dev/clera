import { FundingSource, OnboardingData, CitizenshipStatus, EmploymentStatus, LiquidNetWorthRange } from '@/lib/types/onboarding';

export const initialOnboardingData: OnboardingData = {
  // Contact Information
  email: '',
  phoneNumber: '',
  streetAddress: [''],
  unit: '',
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
  countryOfTaxResidence: 'USA',
  
  // Citizenship Information
  citizenshipStatus: CitizenshipStatus.US_CITIZEN,
  countryOfCitizenship: 'USA',
  countryOfBirth: 'USA',
  permanentResident: false,
  visaType: undefined,
  visaExpirationDate: '',
  dateOfDepartureFromUsa: '',
  
  // Financial Profile
  liquidNetWorthRange: LiquidNetWorthRange.RANGE_0_20K,
  fundingSource: [FundingSource.EMPLOYMENT_INCOME],
  employmentStatus: EmploymentStatus.EMPLOYED,
  employerName: '',
  employerAddress: '',
  employmentPosition: '',
  
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