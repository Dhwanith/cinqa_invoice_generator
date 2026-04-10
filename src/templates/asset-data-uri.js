import fs from 'node:fs';

function fileToDataUri(relativePath, mimeType) {
  const fileUrl = new URL(relativePath, import.meta.url);
  const fileBase64 = fs.readFileSync(fileUrl).toString('base64');
  return `data:${mimeType};base64,${fileBase64}`;
}

function optionalFileToDataUri(relativePath, mimeType) {
  const fileUrl = new URL(relativePath, import.meta.url);
  if (!fs.existsSync(fileUrl)) {
    return null;
  }

  return fileToDataUri(relativePath, mimeType);
}

export const cinqaLogoDataUri = fileToDataUri('../../Cinqa Logo.jpeg', 'image/jpeg');
export const cinqaSignatureDataUri = optionalFileToDataUri('../../assets/authorized-signature.png', 'image/png');