const http = require('http');
const { dialog, app } = require('electron');

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
            console.log(parsedData);
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

export default async function checkRemoteVersion(address: string) {
  try {
    const { version: RemoteVersion } = await download(
      `${address}/package.json?timestamp={+new Date()}`
    );
    console.log(RemoteVersion);
    // console.log(app.getPath('temp'));
  } catch (e) {
    dialog.showMessageBox({
      title: '提示',
      message: '请检查网络'
    });
  }
  const data = await download(
    `${address}/package.json?timestamp=${+new Date()}`
  );
  console.log(data);
  // eslint-disable-next-line no-unused-vars
  const curVersion = app.getVersion();
  // if (curVersion === data.version) {
  //   // eslint-disable-next-line no-useless-return
  //   return;
  // }
  // 弹出一个自动更新界面
}
