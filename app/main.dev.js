/* eslint global-require: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `yarn build` or `yarn build-main`, this file is compiled to
 * `./app/main.prod.js` using webpack. This gives us some performance wins.
 *
 * @flow
 */
import { app, BrowserWindow, dialog, screen } from 'electron';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import queryString from 'query-string';
import html2pdf from './html2pdf';
import MenuBuilder from './menu';
import commonPdf from './common-pdf';

const fs = require('fs');
const OSS = require('ali-oss');

export default class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow = null;

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

if (
  process.env.NODE_ENV === 'development' ||
  process.env.DEBUG_PROD === 'true'
) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  // const extensions = ['REACT_DEVELOPER_TOOLS', 'REDUX_DEVTOOLS'];
  const extensions = [];

  return Promise.all(
    extensions.map(name => installer.default(installer[name], forceDownload))
  ).catch(console.log);
};

const createWindow = async () => {
  if (
    process.env.NODE_ENV === 'development' ||
    process.env.DEBUG_PROD === 'true'
  ) {
    await installExtensions();
  }
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    backgroundColor: '#2e2c29',
    show: false,
    width,
    height,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInWorker: true
      // nativeWindowOpen: true
      // devTools: false
    }
  });

  mainWindow.loadURL('http://demo.exam.zykj.org/electron/index.html');
  // mainWindow.loadURL('http://localhost:8081/');

  // mainWindow.loadURL(
  //   `file:///Users/kww/work/ezy/Ezy.Web.SchoolControlPanel/build/index.html`
  // );

  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on(
    'new-window',
    (event, url, frameName, disposition, options) => {
      event.preventDefault();
      const win = new BrowserWindow({
        webContents: options.webContents, // use existing webContents if provided
        show: false,
        webPreferences: {
          nodeIntegration: true,
          nodeIntegrationInWorker: true,
          nativeWindowOpen: true
        }
      });
      win.once('ready-to-show', () => win.show());
      if (!options.webContents) {
        win.loadURL(url); // existing webContents will be navigated automatically
      }
      win.webContents.session.on('will-download', (e, item, contents) => {
        console.log(e, item, contents);
      });
      // eslint-disable-next-line no-param-reassign
      event.newGuest = win;
    }
  );

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

let ossConfig;

const createOssClient = () => {
  if (ossConfig) {
    console.log(ossConfig);
    return new OSS({
      accessKeyId: ossConfig.accessKeyId,
      accessKeySecret: ossConfig.accessKeySecret,
      stsToken: ossConfig.securityToken,
      region: ossConfig.region,
      bucket: ossConfig.bucket,
      // endpoint: ossConfig.endpoint
      endpoint: `http://${ossConfig.region}.aliyuncs.com`
    });
  }
  return null;
};

const TARGET_HTML = 'http://demo.exam.zykj.org/dev/index.html';

async function getPdfFile(urlInfo) {
  // eslint-disable-next-line no-param-reassign
  urlInfo.url = `${TARGET_HTML}${urlInfo.url.substring(
    urlInfo.url.indexOf('#')
  )}`;
  const pdf = await html2pdf(urlInfo);
  return pdf;
}

async function getCommonPdfFile(urlInfo) {
  // eslint-disable-next-line no-param-reassign
  urlInfo.url = `${TARGET_HTML}${urlInfo.url.substring(
    urlInfo.url.indexOf('#')
  )}`;
  const pdf = await commonPdf(urlInfo);
  return pdf;
}

// 在主进程中.
const { ipcMain } = require('electron');
// 异步消息
ipcMain.on('asynchronous-message', async (event, arg) => {
  const data = JSON.parse(arg);
  let pdf;
  try {
    switch (data.type) {
      case 'pdfUrl': {
        // 保存答题卡
        pdf = await getPdfFile(data.data);
        const client = createOssClient();
        if (client) {
          await client.put(`/pdf/${data.data.id}/pdf.pdf`, pdf);
        }
        event.reply('asynchronous-reply', 'success');
        break;
      }
      case 'download-pdf': {
        pdf = await getPdfFile(data.data);
      }
      // eslint-disable-next-line no-fallthrough
      case 'download-common-pdf': {
        pdf = await getCommonPdfFile(data.data);
      }
      // eslint-disable-next-line no-fallthrough
      default: {
        if (pdf) {
          const path = require('electron').dialog.showSaveDialogSync({
            properties: ['openDirectory']
          });
          if (path) {
            fs.writeFileSync(`${require('path').join(path)}.pdf`, pdf);
            event.reply('asynchronous-reply', 'success');
          } else {
            event.reply('asynchronous-reply', 'cancel');
          }
        }

        break;
      }
    }
  } catch (error) {
    event.reply('asynchronous-reply', 'error');
  }
});

ipcMain.on('synchronous-message', (event, arg) => {
  const data = JSON.parse(arg);
  if (data.type === 'oss') {
    ossConfig = data.data;
  }
  // eslint-disable-next-line no-param-reassign
  event.returnValue = 'success';
});

// 自定义协议
const protocol = 'ezy-web-tool';
app.setAsDefaultProtocolClient(protocol);
app.on('open-url', async (e, url) => {
  const params = queryString.parse(url.replace(`${protocol}://`, ''));
  const pdf = await html2pdf(params);
  const path = require('electron').dialog.showSaveDialogSync({
    properties: ['openDirectory']
  });
  if (path) {
    fs.writeFileSync(`${require('path').join(path)}.pdf`, pdf);
    // e.reply('asynchronous-reply', 'success');
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      message: '答题卡已保存'
    });
  }
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('ready', createWindow);

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) createWindow();
});
