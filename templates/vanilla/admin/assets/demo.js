/**
 * 示例表格：请把 listDemo 换成真实 auth:open 云函数名。
 * Source: skills/super-app-mp-dev
 */
SuperAppAdmin.createApp({
  data: function () {
    return {
      gridOptions: {
        border: true,
        height: 'calc(100vh - 24px)',
        pagerConfig: { pageSize: 20 },
        proxyConfig: {
          response: { list: 'data', result: 'data', total: 'total' },
          autoLoad: true,
          ajax: {
            query: async function (params) {
              var page = params.page || {}
              // TODO: 改为真实云函数；未推送前会失败，可先返回空表调试布局
              try {
                var res = await SuperAppAdmin.call('listDemo', {
                  page: params.pageIndex || page.currentPage || 1,
                  pageSize: params.pageSize || page.pageSize || 20,
                })
                var body = res && res.list ? res : (res && res.result) || {}
                var list = body.list || []
                return { data: list, total: Number(body.total) || list.length }
              } catch (e) {
                SuperAppAdmin.ElMessage({
                  message: (e && e.message) || '请先推送 auth:open 云函数 listDemo',
                  type: 'warning',
                })
                return { data: [], total: 0 }
              }
            },
          },
        },
        columns: [
          { type: 'seq', width: 60 },
          { field: 'id', title: 'ID', minWidth: 140 },
          { field: 'title', title: '标题', minWidth: 160 },
        ],
      },
    }
  },
}).mount('#app')
