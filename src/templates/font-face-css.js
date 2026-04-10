import fs from 'node:fs';

function fontDataUri(fileName) {
  const fileUrl = new URL(`../../assets/fonts/${fileName}`, import.meta.url);
  const fontBase64 = fs.readFileSync(fileUrl).toString('base64');
  return `data:font/ttf;base64,${fontBase64}`;
}

export const bundledFontFaceCss = `
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(${fontDataUri('Poppins-Regular.ttf')}) format('truetype');
}

@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url(${fontDataUri('Poppins-Medium.ttf')}) format('truetype');
}

@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url(${fontDataUri('Poppins-SemiBold.ttf')}) format('truetype');
}

@font-face {
  font-family: 'Syne';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url(${fontDataUri('Syne-Bold.ttf')}) format('truetype');
}

@font-face {
  font-family: 'Syne';
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url(${fontDataUri('Syne-ExtraBold.ttf')}) format('truetype');
}
`;