// @flow
const getBiggerVersion = (recordVersion: string, curVersion: string) => {
  const v = recordVersion.split('.').map(item => Number(item));
  const curVersionArr = curVersion.split('.').map(item => Number(item));
  // eslint-disable-next-line no-plusplus
  for (let i = 0, len = v.length; i < len; i++) {
    if (v[i] - curVersionArr[i] < 0) {
      return curVersion;
    }
    if (v[i] - curVersionArr[i] > 0) {
      return recordVersion;
    }
    if (i === v.length - 1) {
      return recordVersion;
    }
  }
};

export default getBiggerVersion;
