const puppeteer = require('puppeteer');

const fs = require('fs');
const uuidv1 = require('uuid/v1');
const Promise = require('bluebird');

const unlinkAsync = Promise.promisify(fs.unlink);

function getChromiumExecPath() {
  return puppeteer.executablePath().replace('app.asar', 'app.asar.unpacked');
}

function createBrowser(options = {}) {
  return puppeteer.launch({
    ...options,
    executablePath: getChromiumExecPath()
  });
}

const commonHtml2pdf = async ({
  url,
  apiToken,
  apiHost,
  permission,
  userInfo,
  printSize = 1
}) => {
  let browser;
  try {
    browser = await createBrowser({
      headless: true
    });
    const page = await browser.newPage();

    const subUrl = url.substring(0, url.indexOf('#'));
    await page.goto(subUrl, { waitUntil: 'networkidle0' });
    await page.evaluate(
      (a, b, c, d) => {
        localStorage.setItem('apiToken', a);
        localStorage.setItem('apiHost', b);
        localStorage.setItem(
          'expiresTime',
          Number(+new Date()) + 60 * 60 * 60 * 8
        );
        localStorage.setItem('permission', c);
        localStorage.setItem('userInfo', d);
      },
      apiToken,
      apiHost,
      permission,
      userInfo
    );
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => {
      const pdfHtml = document.getElementById('common_html_pdf');
      return pdfHtml;
    });
    await page.evaluate(() => {
      const tmp = document.getElementById('common_html_pdf').innerHTML;
      document.body.innerHTML = tmp;
    });
    await page.addStyleTag({
      content: `
              html, body {
                  background: #fff;
                  height: auto;
              }
          `
    });
    await page.waitFor(500);
    const uuid = uuidv1().replace(/-/g, '');
    const path = `${uuid}commonhtmlpdf.pdf`;
    const pdfBuffer = await page.pdf({
      path,
      format: Number(printSize) === 1 ? 'A4' : 'A3',
      printBackground: true,
      landscape: Number(printSize) !== 1,
      scale: 0.95
    });
    await browser.close();
    if (fs.existsSync(`${uuid}commonhtmlpdf.pdf`)) {
      await unlinkAsync(`${uuid}commonhtmlpdf.pdf`);
    }
    return pdfBuffer;
  } catch (e) {
    if (browser) {
      await browser.close();
    }
    return e;
  }
};

module.exports = commonHtml2pdf;
