const remoteUrl =
  process.env.NODE_ENV === 'development'
    ? 'http://localhost:8081'
    : 'http://demo.exam.zykj.org/electron';
export default remoteUrl;
