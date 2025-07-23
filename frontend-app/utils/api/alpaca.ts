import { OnboardingData, FundingSource, LiquidNetWorthRange } from "@/lib/types/onboarding";

type ApiResponse<T> = {
  data?: T;
  error?: string;
  code?: string;
  accountExists?: boolean;
};

function getLiquidNetWorthMin(range: LiquidNetWorthRange): number {
  const rangeMap: Record<LiquidNetWorthRange, number> = {
    [LiquidNetWorthRange.RANGE_0_20K]: 0,
    [LiquidNetWorthRange.RANGE_20K_50K]: 20000,
    [LiquidNetWorthRange.RANGE_50K_100K]: 50000,
    [LiquidNetWorthRange.RANGE_100K_500K]: 100000,
    [LiquidNetWorthRange.RANGE_500K_1M]: 500000,
    [LiquidNetWorthRange.RANGE_1M_PLUS]: 1000000
  };
  return rangeMap[range] || 0;
}

function getLiquidNetWorthMax(range: LiquidNetWorthRange): number {
  const rangeMap: Record<LiquidNetWorthRange, number> = {
    [LiquidNetWorthRange.RANGE_0_20K]: 20000,
    [LiquidNetWorthRange.RANGE_20K_50K]: 49999,
    [LiquidNetWorthRange.RANGE_50K_100K]: 99999,
    [LiquidNetWorthRange.RANGE_100K_500K]: 499999,
    [LiquidNetWorthRange.RANGE_500K_1M]: 999999,
    [LiquidNetWorthRange.RANGE_1M_PLUS]: 9999999
  };
  return rangeMap[range] || 20000;
}

export async function createAlpacaAccount(userData: OnboardingData): Promise<ApiResponse<any>> {
  try {
    // Comprehensive validation of all required fields
    const validationErrors = validateOnboardingData(userData);
    if (validationErrors) {
      return { error: validationErrors };
    }

    // Get the user's IP address using a client-side approach
    // For a real production app, this should be captured server-side
    let userIpAddress = "127.0.0.1"; // Default fallback
    
    try {
      // Attempt to get the client's IP address from a public service
      const ipResponse = await fetch('https://api.ipify.org?format=json');
      if (ipResponse.ok) {
        const ipData = await ipResponse.json();
        userIpAddress = ipData.ip;
      }
    } catch (ipError) {
      console.warn("Could not retrieve user IP address:", ipError);
      // Fall back to the default IP address
    }

    // Convert frontend data model to Alpaca API format
    const alpacaData = {
      contact: {
        email_address: userData.email,
        phone_number: userData.phoneNumber,
        street_address: userData.streetAddress.filter(line => line.trim()),
        unit: userData.unit || "",
        city: userData.city,
        state: userData.state,
        postal_code: userData.postalCode,
        country: userData.country
      },
      identity: {
        given_name: userData.firstName,
        middle_name: userData.middleName || "",
        family_name: userData.lastName,
        date_of_birth: userData.dateOfBirth,
        tax_id_type: userData.taxIdType,
        tax_id: userData.taxId,
        country_of_citizenship: userData.countryOfCitizenship,
        country_of_birth: userData.countryOfBirth,
        country_of_tax_residence: userData.countryOfTaxResidence,
        permanent_resident: userData.permanentResident || false,
        visa_type: userData.visaType || "",
        visa_expiration_date: userData.visaExpirationDate || "",
        date_of_departure_from_usa: userData.dateOfDepartureFromUsa || "",
        liquid_net_worth_min: getLiquidNetWorthMin(userData.liquidNetWorthRange),
        liquid_net_worth_max: getLiquidNetWorthMax(userData.liquidNetWorthRange),
        funding_source: userData.fundingSource
      },
      disclosures: {
        is_control_person: userData.isControlPerson,
        is_affiliated_exchange_or_finra: userData.isAffiliatedExchangeOrFinra,
        is_politically_exposed: userData.isPoliticallyExposed,
        immediate_family_exposed: userData.immediateFamilyExposed,
        employment_status: userData.employmentStatus,
        employer_name: userData.employerName || "",
        employer_address: userData.employerAddress || "",
        employment_position: userData.employmentPosition || ""
      },
      agreements: [
        ...(userData.agreementsAccepted.customer ? [{
          agreement: "customer_agreement",
          signed_at: new Date().toISOString(),
          ip_address: userIpAddress
        }] : []),
        ...(userData.agreementsAccepted.account ? [{
          agreement: "account_agreement",
          signed_at: new Date().toISOString(),
          ip_address: userIpAddress
        }] : []),
        ...(userData.agreementsAccepted.margin ? [{
          agreement: "margin_agreement",
          signed_at: new Date().toISOString(),
          ip_address: userIpAddress
        }] : [])
        // Removed crypto agreement which is not supported in California
      ],
      documents: userData.account_approval_letter ? [{
        document_type: 'account_approval_letter',
        content: userData.account_approval_letter.split(',')[1], // Remove the data URI prefix
        mime_type: 'application/pdf',
      }] : []
    };

    console.log('Sending data to broker/create-account:', JSON.stringify(alpacaData));

    // Call the backend API that handles the Alpaca broker integration
    const response = await fetch('/api/broker/create-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(alpacaData),
    });

    const responseText = await response.text();
    
    if (!response.ok) {
      let errorMessage = 'Failed to create Alpaca account';
      
      // Try to parse the error message from the response
      try {
        const errorData = JSON.parse(responseText);
        
        // Handle specific account already exists error - but this should now be handled by the backend
        if (response.status === 409 && errorData.accountExists) {
          console.log('Account already exists for this email:', userData.email);
          return { 
            error: errorData.error || "An account with this email address already exists. Please use a different email address.",
            code: errorData.code || "EMAIL_EXISTS",
            accountExists: true
          };
        }
        
        errorMessage = errorData.error || errorMessage;
        
        // Add more detailed diagnostics for debugging
        console.error('Response status:', response.status);
        console.error('Response headers:', Object.fromEntries(Array.from(response.headers)));
        console.error('Error data:', errorData);
      } catch (parseError) {
        console.error('Error parsing error response:', parseError);
        console.error('Raw response text:', responseText);
        errorMessage = `${errorMessage}: ${responseText}`;
      }
      
      console.error('API error:', errorMessage);
      throw new Error(errorMessage);
    }

    // Parse the response data
    let data;
    try {
      data = JSON.parse(responseText);
      console.log('Account creation response data:', data);
      
      // Ensure accountId is properly extracted
      if (data && data.id) {
        console.log('Successfully extracted Alpaca account ID:', data.id);
      } else {
        console.warn('Response data missing expected id field:', data);
      }
    } catch (parseError) {
      console.error('Error parsing response:', parseError);
      throw new Error('Invalid response format from server');
    }
    
    console.log('Account created successfully:', data);
    return { data };
  } catch (error) {
    console.error('Error creating Alpaca account:', error);
    
    // Check if the error is an account already exists error
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    if (errorMessage.includes('EMAIL_EXISTS') || errorMessage.includes('email address already exists')) {
      return { 
        error: "An account with this email address already exists.",
        code: "EMAIL_EXISTS",
        accountExists: true
      };
    }
    
    return { 
      error: errorMessage
    };
  }
}

// This function simulates a successful account creation for development
export async function mockCreateAlpacaAccount(userData: OnboardingData): Promise<ApiResponse<any>> {
  return new Promise((resolve) => {
    // Simulate a network request delay
    setTimeout(() => {
      resolve({
        data: {
          id: "mock-account-id-" + Math.random().toString(36).substring(2, 11),
          account_number: "93" + Math.floor(Math.random() * 10000000).toString(),
          status: "APPROVED",
          created_at: new Date().toISOString()
        }
      });
    }, 1500);
  });
}

// Helper function to validate all required fields
function validateOnboardingData(userData: OnboardingData): string | null {
  // Contact validation
  if (!userData.email || !userData.email.includes('@')) {
    return 'Please enter a valid email address';
  }
  
  if (!userData.phoneNumber || userData.phoneNumber.length < 10) {
    return 'Please enter a valid phone number';
  }
  
  if (!userData.streetAddress.length || !userData.streetAddress[0]) {
    return 'Street address is required';
  }
  
  if (!userData.city) {
    return 'City is required';
  }
  
  if (!userData.state) {
    return 'State is required';
  }
  
  if (!userData.postalCode) {
    return 'Postal code is required';
  }
  
  // Identity validation
  if (!userData.firstName) {
    return 'First name is required';
  }
  
  if (!userData.lastName) {
    return 'Last name is required';
  }
  
  if (!userData.dateOfBirth) {
    return 'Date of birth is required';
  } else {
    // Check if user is at least 18 years old
    const dob = new Date(userData.dateOfBirth);
    const today = new Date();
    const age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      if (age - 1 < 18) {
        return 'You must be at least 18 years old';
      }
    } else if (age < 18) {
      return 'You must be at least 18 years old';
    }
  }
  
  if (!userData.taxId) {
    return 'Tax ID (SSN) is required';
  } else if (!/^\d{3}-\d{2}-\d{4}$/.test(userData.taxId)) {
    return 'Please enter a valid SSN (e.g., 123-45-6789)';
  }
  
  if (userData.fundingSource.length === 0) {
    return 'Please select at least one funding source';
  }
  
  // Agreements validation
  if (!userData.agreementsAccepted.customer) {
    return 'You must accept the Customer Agreement';
  }
  
  if (!userData.agreementsAccepted.account) {
    return 'You must accept the Account Agreement';
  }
  
  return null;
} 