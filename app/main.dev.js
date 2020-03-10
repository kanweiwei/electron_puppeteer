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
import { app, screen, ipcMain, dialog, shell, BrowserWindow } from 'electron';
import queryString from 'query-string';
import createWindow, { getMainWindow } from './desktop/createWindow';
import createOssClient, { setOssConfig } from './desktop/ossConfig';
import {
  getLastestVersion,
  getAppDownloadDir,
  getProductName
} from './desktop/checkRemoteVersion';

const request = require('request');
const progress = require('request-progress');
const os = require('os');

const path = require('path');
const cp = require('child_process');
const fs = require('fs-extra');

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
      const filePath = dialog.showSaveDialogSync({
        properties: ['openDirectory'],
        options: {
          title
        }
      });
      if (filePath) {
        fs.writeFileSync(`${require('path').join(filePath)}.pdf`, pdf);
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
  win.resizable = false;
  win.show();
});

// 关闭
ipcMain.on('win-close', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.close();
  }
});

// 最大化
ipcMain.on('win-max', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.resizable = true;
    win.hide();
    win.maximize();
    win.show();
  }
});
// 最小化
ipcMain.on('win-min', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.resizable = true;
    win.minimize();
  }
});
// 全屏切换
ipcMain.on('win-full-screen', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.setFullScreen(!win.isFullScreen());
  }
});

// oss
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
  // eslint-disable-next-line no-unused-vars
  const params = queryString.parse(url.replace(`${protocol}://`, ''));

  const mainWindow = getMainWindow();

  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.setAppLogsPath();

let installer;

const platform = os.platform();

ipcMain.on('update', async e => {
  const version = getLastestVersion();

  const dir = getAppDownloadDir();
  let appDownUrl;
  let appInstallName;
  if (platform === 'darwin') {
    appInstallName = `${getProductName()}-${version}.dmg`;
    appDownUrl = `${dir}/${appInstallName}`;
  }
  if (appDownUrl && appInstallName) {
    const file = path.join(app.getPath('temp'), appInstallName);
    fs.exists(file, (exists: boolean) => {
      if (exists) {
        installer = file;
        return e.reply('update-percent', JSON.stringify({ percent: 1 }));
      }
      progress(request(appDownUrl))
        .on('progress', state => {
          // 进度
          // const { time, speed, percent, size } = state;
          e.reply('update-percent', JSON.stringify(state));
        })
        .on('end', () => {
          installer = file;
          e.reply('update-percent', JSON.stringify({ percent: 1 }));
        })
        // 写入到临时文件夹
        .pipe(
          fs.createWriteStream(path.join(app.getPath('temp'), appInstallName))
        );
    });
  }
});

ipcMain.on('start-install', () => {
  const version = getLastestVersion();
  if (platform === 'win32') {
    shell.openItem(installer); // 打开下载好的安装程序
    setTimeout(() => {
      app.quit();
    }, 1500);
  }
  if (platform === 'darwin') {
    cp.execSync(`hdiutil attach ${installer}`, {
      stdio: ['ignore', 'ignore', 'ignore']
    });

    // 覆盖原 app
    cp.execSync(
      `rm -rf '/Applications/${getProductName()}.app' && cp -R '/Volumes/${getProductName()} ${version}/${getProductName()}.app' '/Applications/${getProductName()}.app'`
    );

    // 卸载挂载的 dmg
    cp.execSync(`hdiutil eject '/Volumes/${getProductName()} ${version}'`, {
      stdio: ['ignore', 'ignore', 'ignore']
    });
    // 重启
    app.relaunch();
    app.quit();
  }
});
