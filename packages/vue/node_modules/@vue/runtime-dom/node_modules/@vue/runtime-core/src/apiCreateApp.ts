import { h } from './h'
export function createAppAPI(render) {
  // 返回一个 createApp 函数
  return function createApp(rootComponent, rootProps) {
    // 创建一个 应用实例
    const app = {
      _container: null,
      mount(container) {
        // mount 方法会接受一个 container，是一个 DOM 元素，也必须是一个 DOM 元素
        // 💡 在 mount 方法中，我们使用 h 函数将组件转换成虚拟节点
        const vnode = h(rootComponent, rootProps)
        // 💡 调用 render 函数将虚拟节点渲染到容器中
        render(vnode, container)
        // 💡 将容器保存到应用实例中
        app._container = container
      },
      unmount() {
        // 卸载组件，卸载就是将虚拟节点渲染成 null
        render(null, app._container)
      },
    }
    return app
  }
}
