const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const logoCandidates = [
  path.join(__dirname, "..", "assets", "certificates", "logo.png"),
  path.join(__dirname, "..", "public", "assets", "logo.png")
];
const signatureCandidates = [
  path.join(__dirname, "..", "assets", "certificates", "signature.jpg"),
  path.join(__dirname, "..", "assets", "certificates", "signature.jpeg"),
  path.join(__dirname, "..", "assets", "certificates", "signature.png"),
  path.join(__dirname, "..", "assets", "certificates", "signature.jp")
];
const logoPath = logoCandidates.find((candidatePath) => fs.existsSync(candidatePath));
const signaturePath = signatureCandidates.find((candidatePath) => fs.existsSync(candidatePath));
const certificateTemplatePath = path.join(__dirname, "..", "templates", "new_certificate.html");
let logoBase64 = "";
let logoMimeType = "image/png";
let signatureBase64 = "";
let signatureMimeType = "image/jpeg";
let certificateTemplate = "";
let browserPromise = null;
let activePdfJobs = 0;
const pdfQueue = [];
const maxConcurrentPdfJobs = Math.max(1, Math.min(3, Number(process.env.PDF_CONCURRENCY) || 2));

const browserExecutableCandidates = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
  path.join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
  path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  path.join(process.env.PROGRAMFILES || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  path.join(process.env.LOCALAPPDATA || "", "Microsoft", "Edge", "Application", "msedge.exe")
].filter(Boolean);

const getBrowserExecutablePath = () =>
  browserExecutableCandidates.find((candidatePath) => fs.existsSync(candidatePath));

const getPuppeteerLaunchOptions = () => {
  const executablePath = getBrowserExecutablePath();
  const launchOptions = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  };

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  return launchOptions;
};

const getImageMimeType = (filePath = "") => {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".jpg" || extension === ".jpeg" || extension === ".jp") {
    return "image/jpeg";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  return "image/png";
};

if (logoPath) {
  logoBase64 = fs.readFileSync(logoPath).toString("base64");
  logoMimeType = getImageMimeType(logoPath);
}

if (signaturePath) {
  signatureBase64 = fs.readFileSync(signaturePath).toString("base64");
  signatureMimeType = getImageMimeType(signaturePath);
}

if (fs.existsSync(certificateTemplatePath)) {
  certificateTemplate = fs.readFileSync(certificateTemplatePath, "utf-8");
}

const getBrowser = () => {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch(getPuppeteerLaunchOptions())
      .then((browser) => {
        browser.on("disconnected", () => {
          browserPromise = null;
        });

        return browser;
      })
      .catch((error) => {
        browserPromise = null;
        if (/could not find chrome/i.test(error.message || "")) {
          throw new Error(
            "Could not find Chrome or Edge for certificate generation. Run: npm.cmd exec puppeteer browsers install chrome"
          );
        }
        throw error;
      });
  }

  return browserPromise;
};

const closeBrowser = async () => {
  if (!browserPromise) {
    return;
  }

  const browser = await browserPromise;
  await browser.close();
  browserPromise = null;
};

const processPdfQueue = () => {
  if (activePdfJobs >= maxConcurrentPdfJobs || !pdfQueue.length) {
    return;
  }

  const nextJob = pdfQueue.shift();
  activePdfJobs += 1;

  Promise.resolve()
    .then(nextJob.job)
    .then(nextJob.resolve, nextJob.reject)
    .finally(() => {
      activePdfJobs -= 1;
      processPdfQueue();
    });
};

const runPdfJob = (job) =>
  new Promise((resolve, reject) => {
    pdfQueue.push({ job, resolve, reject });
    processPdfQueue();
  });

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getAcademicYear = (dateValue) => {
  const date = new Date(dateValue);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = safeDate.getFullYear();
  const startYear = safeDate.getMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
};

const toPdfText = (value) => {
  const utf16le = Buffer.from(`\ufeff${String(value || "")}`, "utf16le");
  const utf16be = Buffer.alloc(utf16le.length);

  for (let index = 0; index < utf16le.length; index += 2) {
    utf16be[index] = utf16le[index + 1];
    utf16be[index + 1] = utf16le[index];
  }

  return `<${utf16be.toString("hex").toUpperCase()}>`;
};

const sanitizePdfText = (value, maxLength = 120) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const getApproxTextX = (text, fontSize) => {
  const width = sanitizePdfText(text, 200).length * fontSize * 0.48;
  return Math.max(60, (841.89 - width) / 2);
};

const drawCenteredPdfText = (text, y, font, fontSize, color = "0 0 0") => {
  const safeText = sanitizePdfText(text, 200);
  return [
    "BT",
    `/${font} ${fontSize} Tf`,
    `${color} rg`,
    `1 0 0 1 ${getApproxTextX(safeText, fontSize).toFixed(2)} ${y.toFixed(2)} Tm`,
    `${toPdfText(safeText)} Tj`,
    "ET"
  ].join("\n");
};

const drawPdfText = (text, x, y, font, fontSize, color = "0 0 0") => {
  const safeText = sanitizePdfText(text, 200);
  return [
    "BT",
    `/${font} ${fontSize} Tf`,
    `${color} rg`,
    `1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`,
    `${toPdfText(safeText)} Tj`,
    "ET"
  ].join("\n");
};

const buildPdf = (content) => {
  const streamLength = Buffer.byteLength(content, "utf8");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${streamLength} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>"
  ];
  const chunks = ["%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n"];
  const offsets = [0];
  let currentLength = Buffer.byteLength(chunks[0], "binary");

  objects.forEach((object, index) => {
    offsets.push(currentLength);
    const chunk = `${index + 1} 0 obj\n${object}\nendobj\n`;
    chunks.push(chunk);
    currentLength += Buffer.byteLength(chunk, "binary");
  });

  const xrefOffset = currentLength;
  const xrefRows = offsets
    .map((offset, index) => index === 0 ? "0000000000 65535 f " : `${String(offset).padStart(10, "0")} 00000 n `)
    .join("\n");
  chunks.push(
    `xref\n0 ${objects.length + 1}\n${xrefRows}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  return Buffer.from(chunks.join(""), "binary");
};

const generateFallbackCertificatePdf = ({
  name,
  branch,
  examName,
  date,
  certificateId,
  showCertificateId = true
}) => {
  const certificateIdText = showCertificateId && certificateId ? `Certificate No: ${certificateId}` : "";
  const content = [
    "q",
    "0.98 0.99 1 rg",
    "0 0 841.89 595.28 re f",
    "0.05 0.28 0.55 RG",
    "6 w",
    "36 36 769.89 523.28 re S",
    "0.86 0.66 0.22 RG",
    "2 w",
    "54 54 733.89 487.28 re S",
    drawCenteredPdfText("Certificate of Achievement", 468, "F2", 42, "0.05 0.28 0.55"),
    drawCenteredPdfText("This certificate is proudly presented to", 406, "F3", 20, "0.15 0.15 0.15"),
    drawCenteredPdfText(name, 346, "F2", 38, "0.05 0.28 0.55"),
    drawCenteredPdfText("for successfully completing", 292, "F3", 20, "0.15 0.15 0.15"),
    drawCenteredPdfText(examName, 252, "F2", 24, "0.05 0.28 0.55"),
    drawCenteredPdfText(`Branch: ${branch}`, 206, "F1", 18, "0.15 0.15 0.15"),
    certificateIdText ? drawCenteredPdfText(certificateIdText, 166, "F1", 14, "0.15 0.15 0.15") : "",
    drawCenteredPdfText(`Academic Year ${getAcademicYear(date)}`, 138, "F1", 14, "0.15 0.15 0.15"),
    drawPdfText(date, 128, 92, "F3", 13, "0.15 0.15 0.15"),
    drawPdfText("Date of Issue", 116, 72, "F1", 13, "0.05 0.28 0.55"),
    "0.05 0.28 0.55 RG",
    "1 w",
    "586 96 160 0 l S",
    drawCenteredPdfText("Authorized Signature", 72, "F1", 12, "0.15 0.15 0.15"),
    "Q"
  ].filter(Boolean).join("\n");

  return buildPdf(content);
};

const wrapTemplate = (markup) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Certificate</title>
  </head>
  <body>
    ${markup}
  </body>
</html>
`;

const buildFallbackTemplate = ({ name, examName, branch, date, certificateId, showCertificateId }) => `
<style>
  @page { size: A4 landscape; margin: 0; }
  body { margin: 0; font-family: Georgia, serif; background: #f5f8fc; }
  .box { margin: 24px; border: 6px solid #0d5baa; padding: 36px; text-align: center; background: #fff; }
  .title { font-size: 40px; color: #0d5baa; margin-bottom: 14px; }
  .name { font-size: 36px; margin: 18px 0; }
  .text { font-size: 20px; }
  .meta { margin-top: 24px; font-size: 16px; color: #444; }
</style>
<div class="box">
  <div class="title">Certificate of Achievement</div>
  <div class="text">This certificate is proudly presented to</div>
  <div class="name">${escapeHtml(name)}</div>
  <div class="text">
    for successfully completing the <strong>${escapeHtml(examName)}</strong> from
    <strong>${escapeHtml(branch)}</strong>.
  </div>
  <div class="meta">Completed On: ${escapeHtml(date)}</div>
  ${showCertificateId ? `<div class="meta">Certificate No: ${escapeHtml(certificateId)}</div>` : ""}
</div>
`;

const buildCertificateHtml = ({
  name,
  branch,
  examName,
  date,
  certificateId,
  showCertificateId = true
}) => {
  if (!certificateTemplate) {
    return wrapTemplate(
      buildFallbackTemplate({
        name,
        branch,
        examName,
        date,
        certificateId,
        showCertificateId
      })
    );
  }

  const logoSrc = logoBase64 ? `data:${logoMimeType};base64,${logoBase64}` : "";
  const signatureSrc = signatureBase64 ? `data:${signatureMimeType};base64,${signatureBase64}` : "";
  const signatureImageBlock = signatureSrc
    ? `<img class="signature-img" src="${signatureSrc}" alt="Signature" />`
    : "";
  const certificateIdBlock = showCertificateId
    ? `<div class="cert-no">Certificate No. &nbsp; ${escapeHtml(certificateId || "--")} &nbsp;·&nbsp; Academic Year ${escapeHtml(getAcademicYear(date))}</div>`
    : '<div class="cert-no" style="display: none;">Certificate No. &nbsp; NGS-WB-RMT-_______ &nbsp;·&nbsp; Academic Year ____________</div>';

  const rendered = certificateTemplate
    .replaceAll("{{LOGO_SRC}}", logoSrc)
    .replaceAll("{{NAME}}", escapeHtml(name))
    .replaceAll("{{EXAM_NAME}}", escapeHtml(examName))
    .replaceAll("{{BRANCH}}", escapeHtml(branch))
    .replaceAll("{{DATE}}", escapeHtml(date))
    .replace("{{SIGNATURE_IMAGE_BLOCK}}", signatureImageBlock)
    .replace("{{CERTIFICATE_ID_BLOCK}}", certificateIdBlock);

  return wrapTemplate(rendered);
};

const generateBrowserCertificatePdf = async (certificateData) => {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    page.setDefaultTimeout(30000);

    await page.setContent(buildCertificateHtml(certificateData), {
      waitUntil: "load",
      timeout: 30000
    });

    const pdfBytes = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0"
      }
    });

    return Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);
  } finally {
    await page.close();
  }
};

const generateCertificatePdf = (certificateData) => runPdfJob(async () => {
  try {
    return await generateBrowserCertificatePdf(certificateData);
  } catch (error) {
    console.error("Certificate browser PDF generation failed; using fallback PDF.", error);
    return generateFallbackCertificatePdf(certificateData);
  }
});

process.on("SIGINT", () => {
  closeBrowser();
});

process.on("SIGTERM", () => {
  closeBrowser();
});

module.exports = {
  generateCertificatePdf
};
