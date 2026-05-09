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

const buildCertificateHtml = ({
  name,
  branch,
  examName,
  date,
  certificateId,
  showCertificateId = true
}) => {
  if (!certificateTemplate) {
    throw new Error("Certificate template is missing. Please ensure backend/templates/new_certificate.html exists.");
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

const generateCertificatePdf = (certificateData) => runPdfJob(() => generateBrowserCertificatePdf(certificateData));

process.on("SIGINT", () => {
  closeBrowser();
});

process.on("SIGTERM", () => {
  closeBrowser();
});

module.exports = {
  generateCertificatePdf
};
