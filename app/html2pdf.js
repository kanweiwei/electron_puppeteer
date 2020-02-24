const puppeteer = require('puppeteer');

const fs = require('fs');
const uuidv1 = require('uuid/v1');
const Promise = require('bluebird');
const unlinkAsync = Promise.promisify(fs.unlink);
const html2pdf = async ({
  url,
  apiToken,
  apiHost,
  permission,
  userInfo,
  printSize = 1
}) => {
  try {
    const browser = await puppeteer.launch({
      headless: true
    });
    const page = await browser.newPage();
    let subUrl = url.substring(0, url.indexOf('#'));
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
      let stem = document.querySelector('.answer-sheet--stem');
      let nostem = document.querySelector('.answer-sheet--nostem');
      let loading = document.querySelector('.ant-spin');

      return !loading && (stem || nostem);
    });
    await Promise.delay(1000);
    await page.evaluate(s => {
      var tmp = document.querySelector('.answer-sheet-container').innerHTML;
      document.body.innerHTML = tmp;
      if (Number(s) === 2) {
        let doms = Array.prototype.slice.call(
          document.querySelectorAll('.answer-sheet')
        );
        doms.forEach(dom => {
          dom.style.marginTop = '0px';
          dom.style.float = 'left';
        });
      }
    }, printSize);
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
    const path = `${uuid}.pdf`;
    let pdfBuffer = await page.pdf({
      path,
      format: Number(printSize) === 1 ? 'A4' : 'A3',
      printBackground: true,
      landscape: Number(printSize) === 1 ? false : true,
      scale: 0.95
    });
    await browser.close();
    if (fs.existsSync(`${uuid}.pdf`)) {
      await unlinkAsync(`${uuid}.pdf`);
    }
    return pdfBuffer;
  } catch (e) {
    return e;
  }
};
export default html2pdf;
