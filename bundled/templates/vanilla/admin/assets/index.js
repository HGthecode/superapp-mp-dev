/**
 * 控制台首页。菜单见 manifest.json；业务页用 SuperAppAdmin.call 调 auth:open 云函数。
 * Source: skills/super-app-mp-dev
 */
SuperAppAdmin.createApp({
  template:
    '<div style="padding:16px;line-height:1.6">' +
    '<p>这是开放平台「控制台」起步页。</p>' +
    '<p>请从左侧菜单进入业务页；本地调试执行 <code>sa-mp console</code>（默认 5180）。</p>' +
    '</div>',
}).mount('#app')
