import { BrowserWindow } from 'electron';
import remoteUrl from './remoteUrl';

const http = require('http');
const { dialog, app, screen } = require('electron');

let lastestVersion;
let productName;

export function getProductName() {
  return productName;
}

const address =
  'http://ezy-quick-exam-web.oss-cn-hangzhou.aliyuncs.com/electron_app';

export function getAppDownloadDir() {
  return address;
}

function download(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, res => {
        const { statusCode } = res;
        const contentType = res.headers['content-type'];

        let error;
        if (statusCode !== 200) {
          // eslint-disable-next-line no-useless-concat
          error = new Error('Request Failed.\n' + `Status Code: ${statusCode}`);
        } else if (!/^application\/json/.test(contentType)) {
          error = new Error(
            'Invalid content-type.\n' +
              `Expected application/json but received ${contentType}`
          );
        }
        if (error) {
          console.error(error.message);
          // Consume response data to free up memory
          res.resume();
          return;
        }

        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', chunk => {
          rawData += chunk;
        });
        res.on('end', () => {
          try {
            const parsedData = JSON.parse(rawData);
            resolve(parsedData);
          } catch (e) {
            console.error(e.message);
            reject(e);
          }
        });
      })
      .on('error', e => {
        console.error(`Got error: ${e.message}`);
        reject(e);
      });
  });
}

export function getLastestVersion() {
  return lastestVersion;
}

export default async function checkRemoteVersion() {
  try {
    const data = await download(
      `${address}/package.json?timestamp={+new Date()}`
    );
    // eslint-disable-next-line no-unused-vars
    const curVersion = app.getVersion();
    lastestVersion = data.version;
    productName = data.productName;
    console.log(curVersion, data.version);
    if (curVersion === data.version) {
      return;
    }
    // 弹出一个自动更新界面
    const win = BrowserWindow.getFocusedWindow();
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const x = parseInt(width / 2 - 300 / 2, 10);
    const y = parseInt(height / 2 - 340 / 2, 10);
    const newWin = new BrowserWindow({
      show: false,
      parent: win,
      width: 300,
      height: 340,
      resizable: false,
      frame: false,
      webPreferences: {
        nodeIntegration: true,
        nodeIntegrationInWorker: true,
        devTools: false
      }
    });
    newWin.setPosition(x, y);
    newWin.loadURL(`${remoteUrl}/index.html#/electron_app_update`);
    newWin.webContents.on('did-finish-load', () => {
      newWin.show();
    });
  } catch (e) {
    dialog.showMessageBox({
      title: '提示',
      message: '请检查网络'
    });
  }
}
