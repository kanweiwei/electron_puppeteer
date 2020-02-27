const OSS = require('ali-oss');

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

export function getOssConfig() {
  return ossConfig;
}

export function setOssConfig(config) {
  ossConfig = config;
}

export default createOssClient;
