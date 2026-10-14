/**
 * 微应用入口（无构建：平台托管 Vue + Vant）
 * Source: skills/super-app-mp-dev
 */
(function () {
  var createApp = Vue.createApp
  var ref = Vue.ref
  var onMounted = Vue.onMounted

  var app = createApp({
    setup: function () {
      var userLabel = ref('未获取')

      function onHello() {
        vant.showToast('你好，SuperApp')
      }

      onMounted(function () {
        if (!window.SuperApp || typeof SuperApp.getUserInfo !== 'function') return
        SuperApp.getUserInfo()
          .then(function (u) {
            userLabel.value = (u && (u.nickname || u.id)) || '游客'
          })
          .catch(function () {
            userLabel.value = '预览环境'
          })
      })

      return { userLabel: userLabel, onHello: onHello }
    },
  })

  app.use(vant)
  app.mount('#app')
})()
