export const companyProfile = {
  name: process.env.COMPANY_NAME || 'Cinqa Tech Solutions LLP',
  gstin: process.env.COMPANY_GSTIN || process.env.COMPANY_GST || '24AAWFC2925N1ZX',
  pan: process.env.COMPANY_PAN || 'AAWFC2925N',
  tan: process.env.COMPANY_TAN || 'SRTC05319G',
  state: process.env.COMPANY_STATE || 'Gujarat',
  stateCode: Number(process.env.COMPANY_STATE_CODE || '24'),
  addressLines: [
    process.env.COMPANY_ADDRESS_LINE_1 || '47/107, Soham Park, Saraswat Nagar',
    process.env.COMPANY_ADDRESS_LINE_2 || 'Piplod, Surat - 395007, GJ(24)'
  ],
  email: process.env.COMPANY_EMAIL || 'tarunchelumalla@cinqa.space',
  website: process.env.COMPANY_WEBSITE || 'www.cinqa.space',
  bankAccountName: process.env.BANK_ACCOUNT_NAME || 'CINQA TECH SOLUTIONS LLP',
  bankName: process.env.BANK_NAME || 'Axis Bank',
  bankAccountNumber: process.env.BANK_ACCOUNT_NUMBER || '926020012433774',
  bankBranchName: process.env.BANK_BRANCH_NAME || 'Parle Point, Surat',
  bankIfsc: process.env.BANK_IFSC || 'UTIB0005112',
  authorizedSignatory: process.env.AUTHORIZED_SIGNATORY || 'Authorized Signatory',
  paymentTermsDays: Number(process.env.PAYMENT_TERMS_DAYS || '10'),
  defaultSac: process.env.DEFAULT_SAC || '998314',
  defaultGstRate: Number(process.env.DEFAULT_GST_RATE || '0.18')
};