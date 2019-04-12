const Koa = require('../')
const Router = require('../lib/router')

const app = new Koa()
const router = new Router()

router.get('/aaa', (ctx, next) => {
  ctx.body = 'hello world get'
})

router.post('/aaa', (ctx, next) => {
  ctx.body = 'hello world post'
})

app.use(router.routes())

app.listen(2000)
