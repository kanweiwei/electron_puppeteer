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
import { app, dialog, screen } from 'electron';
import queryString from 'query-string';
import html2pdf from './desktop/html2pdf';
import commonPdf from './desktop/common-pdf';
import createWindow, { getMainWindow } from './desktop/createWindow';
import createOssClient, { setOssConfig } from './desktop/ossConfig';

const fs = require('fs');

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

// 保存pdf存入oss
ipcMain.on('printPdf', async (event, arg) => {
  const { id, options } = JSON.parse(arg);
  const win = getMainWindow();
  if (win) {
    const pdf = await win.webContents.printToPDF(options);
    const client = createOssClient();
    if (client) {
      await client.put(`/pdf/${id}/pdf.pdf`, pdf);
    }
    event.reply('printPdf-reply', 'success');
  }
});

ipcMain.on('printCommonPdf', async (event, arg) => {
  const { title, options } = JSON.parse(arg);
  const win = getMainWindow();
  if (win) {
    try {
      const pdf = await win.webContents.printToPDF(options);
      const path = require('electron').dialog.showSaveDialogSync({
        properties: ['openDirectory'],
        options: {
          title
        }
      });
      if (path) {
        fs.writeFileSync(`${require('path').join(path)}.pdf`, pdf);
        event.reply('printCommonPdf-reply', 'success');
      } else {
        event.reply('printCommonPdf-reply', 'cancel');
      }
    } catch (error) {
      console.log(error);
      event.reply('printCommonPdf-reply', 'failed');
    }
  }
});

ipcMain.on('go-to-login', () => {
  const win = getMainWindow();
  win.hide();
  win.setSize(300, 340, true);
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const x = parseInt(width / 2 - 300 / 2, 10);
  const y = parseInt(height / 2 - 340 / 2, 10);
  win.setPosition(x, y);
  win.show();
});

// 关闭
ipcMain.on('win-close', () => {
  const win = getMainWindow();
  win.close();
});

// 最大化
ipcMain.on('win-max', () => {
  const win = getMainWindow();
  win.resizable = true;
  win.hide();
  win.maximize();
  win.show();
});
// 最小化
ipcMain.on('win-min', () => {
  const win = getMainWindow();
  win.resizable = true;
  win.minimize();
});
// 全屏切换
ipcMain.on('win-full-screen', () => {
  const win = getMainWindow();
  win.setFullScreen(!win.isFullScreen());
});

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
      // eslint-disable-next-line no-fallthrough
      case 'download-common-pdf': {
        pdf = await getCommonPdfFile(data.data);
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
      // eslint-disable-next-line no-fallthrough
      default: {
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
    setOssConfig(data.data);
  }
  // eslint-disable-next-line no-param-reassign
  event.returnValue = 'success';
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
  const mainWindow = getMainWindow();
  if (mainWindow === null) createWindow();
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
  const mainWindow = getMainWindow();
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

app.setAppLogsPath();
