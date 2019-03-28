const Koa = require('../');

const app = new Koa();

app.use((ctx, next) => {
  debugger
});

app.listen(2000)
