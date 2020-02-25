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
  const extensions = ['REACT_DEVELOPER_TOOLS', 'REDUX_DEVTOOLS'];

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
    show: false,
    width,
    height,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      nativeWindowOpen: true
      // devTools: false
    }
  });

  // mainWindow.loadURL('http://demo.exam.zykj.org/electron/index.html');
  mainWindow.loadURL('http://localhost:8081/');

  // mainWindow.loadURL(
  //   `file:///Users/kww/work/ezy/Ezy.Web.SchoolControlPanel/build/index.html`
  // );
  // mainWindow.loadURL('http://localhost:8081/index.html');

  // @TODO: Use 'ready-to-show' event
  //        https://github.com/electron/electron/blob/master/docs/api/browser-window.md#using-ready-to-show-event
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

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

let ossConfig: any;

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

// 在主进程中.
const { ipcMain } = require('electron');
// 异步消息
ipcMain.on('asynchronous-message', async (event, arg) => {
  const data = JSON.parse(arg);
  if (data.type === 'pdfUrl') {
    // 保存答题卡
    const pdf = await getPdfFile(data.data);
    const client = createOssClient();
    if (client) {
      await client.put(`/pdf/${data.data.id}/pdf.pdf`, pdf);
    }
    event.reply('asynchronous-reply', 'success');
  } else if (data.type === 'download-pdf') {
    try {
      const pdf = await getPdfFile(data.data);
      const path = require('electron').dialog.showOpenDialogSync({
        properties: ['openDirectory']
      });
      if (path && path[0]) {
        fs.writeFileSync(
          require('path').join(
            path[0],
            `${decodeURIComponent(data.data.name)}.pdf`
          ),
          pdf
        );
        event.reply('asynchronous-reply', 'success');
      } else {
        event.reply('asynchronous-reply', 'cancel');
      }
    } catch (error) {
      console.log(error);
      event.reply('asynchronous-reply', 'error');
    }
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
  const path = require('electron').dialog.showOpenDialogSync({
    properties: ['openDirectory']
  });
  if (path && path[0]) {
    fs.writeFileSync(
      require('path').join(path[0], `${decodeURIComponent(params.name)}.pdf`),
      pdf
    );
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
