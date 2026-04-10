const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const TEENS = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitsToWords(number) {
  if (number < 10) {
    return ONES[number];
  }
  if (number < 20) {
    return TEENS[number - 10];
  }

  const tens = Math.floor(number / 10);
  const remainder = number % 10;
  return `${TENS[tens]}${remainder ? `-${ONES[remainder]}` : ''}`.trim();
}

function threeDigitsToWords(number) {
  const hundreds = Math.floor(number / 100);
  const remainder = number % 100;
  const parts = [];

  if (hundreds) {
    parts.push(`${ONES[hundreds]} Hundred`);
  }
  if (remainder) {
    parts.push(twoDigitsToWords(remainder));
  }

  return parts.join(' ');
}

function integerToIndianWords(number) {
  if (number === 0) {
    return 'Zero';
  }

  const parts = [];
  const crore = Math.floor(number / 10000000);
  const lakh = Math.floor((number % 10000000) / 100000);
  const thousand = Math.floor((number % 100000) / 1000);
  const remainder = number % 1000;

  if (crore) {
    parts.push(`${integerToIndianWords(crore)} Crore`);
  }
  if (lakh) {
    parts.push(`${twoDigitsToWords(lakh)} Lakh`);
  }
  if (thousand) {
    parts.push(`${twoDigitsToWords(thousand)} Thousand`);
  }
  if (remainder) {
    parts.push(threeDigitsToWords(remainder));
  }

  return parts.join(' ').trim();
}

export function amountToWords(amount) {
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);
  const rupeeWords = `${integerToIndianWords(rupees)} Rupees`;

  if (!paise) {
    return `${rupeeWords} Only`;
  }

  return `${rupeeWords} and ${integerToIndianWords(paise)} Paise Only`;
}