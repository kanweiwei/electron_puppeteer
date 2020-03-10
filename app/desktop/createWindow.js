// @flow
import { BrowserWindow, screen } from 'electron';
import MenuBuilder from '../menu';
import installExtensions from './installExtensions';
import checkRemoteVersion from './checkRemoteVersion';
import remoteUrl from './remoteUrl';

let mainWindow: BrowserWindow;

const createWindow = async () => {
  if (
    process.env.NODE_ENV === 'development' ||
    process.env.DEBUG_PROD === 'true'
  ) {
    await installExtensions();
  }
  // eslint-disable-next-line no-unused-vars
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    show: false,
    width: 300,
    height: 340,
    resizable: false,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInWorker: true
      // nativeWindowOpen: true
      // devTools: false
    }
  });

  mainWindow.loadURL(`${remoteUrl}/index.html`);

  // mainWindow.loadURL('http://localhost:8081/');
  // mainWindow.loadURL(
  //   `file:///Users/kww/work/ezy/Ezy.Web.SchoolControlPanel/build/index.html`
  // );
  mainWindow.webContents.session.clearCache();
  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      checkRemoteVersion();

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
        webContents: options.webContents,
        frame: false,
        show: false,
        webPreferences: {
          nodeIntegration: true,
          nodeIntegrationInWorker: true,
          nativeWindowOpen: true
        }
      });
      win.once('ready-to-show', () => {
        win.show();
      });
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
  // console.log(screen.getPrimaryDisplay().scaleFactor);
};

export function getMainWindow() {
  return mainWindow;
}

export default createWindow;
