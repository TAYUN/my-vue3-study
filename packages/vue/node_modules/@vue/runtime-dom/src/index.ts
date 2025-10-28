import { nodeOps } from './nodeOps'
import { createRenderer } from '@vue/runtime-core'
import { patchProp } from './patchProp'
import { isString } from '@vue/shared'

export * from '@vue/runtime-core'

const renderOptions = { patchProp, ...nodeOps }
const renderer = createRenderer(renderOptions)
export function render(vnode, container) {
  renderer.render(vnode, container)
}

// 💡 创建一个 createApp 函数，内部调用 renderer.createApp
export function createApp(rootComponent, rootProps) {
  // 💡 先创建一个应用实例
  const app = renderer.createApp(rootComponent, rootProps)
  // 保存原始的 mount 方法
  const _mount = app.mount.bind(app)

  // 💡 重写 mount 方法
  function mount(selector) {
    // 默认传入的 selector 是一个 DOM 元素
    let el = selector
    if (isString(selector)) {
      // 💡 如果传入的是字符串，则使用 querySelector 获取 DOM 元素
      el = document.querySelector(selector)
    }
    _mount(el)
  }
  // 💡 将重写的 mount 方法赋值给应用实例
  app.mount = mount

  return app
}

export { renderOptions }
