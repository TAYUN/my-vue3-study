import { ShapeFlags } from '@vue/shared'
import { isSameVNodeType } from './vnode'
export function createRenderer(options) {
  // 提供虚拟节点 渲染到页面上的功能
  console.log(options)
  const {
    createElement: hostCreateElement,
    setElementText: hostSetElementText,
    insert: hostInsert,
    remove: hostRemove,
    patchProp: hostPatchProp,
  } = options
  // renderer.ts
  const render = (vnode, container) => {
    // 卸载子元素
    const unmountChildren = children => {
      for (let i = 0; i < children.length; i++) {
        unmount(children[i])
      }
    }

    // 卸载
    const unmount = vnode => {
      // 卸载

      const { type, shapeFlag, children } = vnode

      if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        // 子节点是数组

        unmountChildren(children)
      }

      // 移除 dom 元素
      hostRemove(vnode.el)
    }

    const mountChildren = (children, el) => {
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        // 递归挂载子节点
        patch(null, child, el)
      }
    }

    // 挂载节点
    const mountElement = (vnode, container) => {
      /**
       * 1. 创建一个 dom 节点
       * 2. 设置它的 props
       * 3. 挂载它的子节点
       * 4. 把 el 插入到 container 中
       */
      const { type, props, children, shapeFlag } = vnode
      // 创建 dom 元素 type = div p span
      const el = hostCreateElement(type)
      vnode.el = el
      if (props) {
        for (const key in props) {
          hostPatchProp(el, key, null, props[key])
        }
      }

      // 处理子节点
      if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
        // 子节点是文本
        hostSetElementText(el, children)
      } else if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        // 子节点是数组
        mountChildren(children, el)
      }
      // 把 el 插入到 container 中
      hostInsert(el, container)
    }

    const patchChildren = (n1, n2) => {
      // - 新的子元素是文本
      //   - 老节点是数组，卸载老的 children，将新的文本设置成 children
      //   - 老的是文本，直接替换
      //   - 老的是 null，不用关心老的，将新的设置成 children
      // - 新的子元素是数组
      //   - 老的是数组，那就和新的做全量 diff
      //   - 老的是文本，把老的清空，挂载新的 children
      //   - 老的是 null，不用关心老的，直接挂载新的 children
      // - 新的子元素是 null
      //   - 老的是文本，把 children 设置成空
      //   - 老的是数组，卸载老的
      //   - 老的是 null，俩个哥们都是 null，不用干活

      const el = n2.el
      const prevShapeFlag = n1.shapeFlag
      const shapeFlag = n2.shapeFlag
      if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
        // 新的是文本
        if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          // 老的是数组，卸载老的 children
          unmountChildren(n1.children)
        }
        // 老的是文本或者null，不相等，就直接设置
        if (n1.children !== n2.children) {
          hostSetElementText(el, n2.children)
        }
      } else {
        // 新的可能是数组、null
        // 老的可能是数组、文本、null

        if (prevShapeFlag & ShapeFlags.TEXT_CHILDREN) {
          // 老的是文本
          // 把老文本节点干掉
          // todo 不理解 因为这里属于更新不是卸载，所以不用删除el
          hostSetElementText(el, '')
          if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
            // 新的是数组
            mountChildren(n2.children, el)
          }
          // todo 新的是null 不用管？
        } else {
          // 老的是数组或者null
          // 新的还是数组或者null
          if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
            // 老的是数组
            if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
              // todo 全量diff
            } else {
              // 新的是null
              // 卸载老的数组
              unmountChildren(n1.children)
            }
          } else {
            // 老的是null
            if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
              // 新的是数组，挂载新的
              mountChildren(n2.children, el)
            }
            // 新的是null 不用管
          }
        }
      }
    }

    const patchProps = (el, oldProps, newProps) => {
      /**
       * 1. 把老的 props 全删掉
       * 2. 把新的 props 全部给它设置上
       */

      if (oldProps) {
        // 把老的 props 全干掉
        for (const key in oldProps) {
          hostPatchProp(el, key, oldProps[key], null)
        }
      }

      if (newProps) {
        for (const key in newProps) {
          hostPatchProp(el, key, oldProps?.[key], newProps[key])
        }
      }
    }

    const patchElement = (n1, n2) => {
      /**
       * 1. 复用 dom 元素
       * 2. 更新 props
       * 3. 更新 children
       */
      // 复用 dom 元素 每次进来，都拿上一次的 el，保存到最新的虚拟节点上 n2.el
      const el = (n2.el = n1.el)

      // 更新 props
      const oldProps = n1.props
      const newProps = n2.props
      patchProps(el, oldProps, newProps)

      // 更新 children
      patchChildren(n1, n2)
    }

    /**
     * 更新和挂载，都用这个函数
     * @param n1 老节点，之前的，如果有，表示要个 n2 做 diff，更新，如果没有，表示直接挂载 n2
     * @param n2 新节点
     * @param container 要挂载的容器
     */
    const patch = (n1, n2, container) => {
      if (n1 === n2) {
        // 如果两次传递了同一个虚拟节点，啥都不干
        return
      }

      if (n1 && !isSameVNodeType(n1, n2)) {
        // 如果两个节点不是同一个类型，那就卸载 n1 直接挂载 n2    unmount(n1)
        n1 = null
      }

      if (n1 == null) {
        // 挂载元素
        mountElement(n2, container)
      } else {
        // 更新元素
        patchElement(n1, n2)
      }
    }

    /**
     * 分三步：
     * 1. 挂载
     * 2. 更新
     * 3. 卸载
     */

    if (vnode == null) {
      if (container._vnode) {
        // 卸载
        unmount(container._vnode)
      }
    } else {
      // 挂载和更新
      patch(container._vnode || null, vnode, container)
    }

    container._vnode = vnode
  }
  return {
    render,
  }
}
