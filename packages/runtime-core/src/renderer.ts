import { ShapeFlags } from '@vue/shared'
import { isSameVNodeType, normalizeVNode } from './vnode'
import { createAppAPI } from './apiCreateApp'
export function createRenderer(options) {
  // 提供虚拟节点 渲染到页面上的功能
  const {
    createElement: hostCreateElement,
    setElementText: hostSetElementText,
    insert: hostInsert,
    setText: hostSetText,
    remove: hostRemove,
    createText: hostCreateText,
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
        const child = (children[i] = normalizeVNode(children[i]))
        // 递归挂载子节点
        patch(null, child, el)
      }
    }

    // 挂载节点
    const mountElement = (vnode, container, anchor) => {
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
      hostInsert(el, container, anchor)
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
              // 全量diff
              patchKeyedChildren(n1.children, n2.children, el)
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
    const patchKeyedChildren = (c1, c2, container) => {
      /**
       * 全量 diff
       *
       * 1. 双端 diff
       *
       * 1.1 头部对比
       * c1 => [a, b]
       * c2 => [a, b, c, d]
       *
       * 开始时：i = 0, e1 = 1, e2 = 3
       * 结束时：i = 2, e1 = 1, e2 = 3
       *
       * 1.2 尾部对比
       * c1 => [a, b]
       * c2 => [c, d, a, b]
       * 开始时：i = 0, e1 = 1, e2 = 3
       * 结束时：i = 0，e1 = -1, e2 = 1
       *
       * 根据双端对比，得出结论：
       * i > e1 表示老的少，新的多，要挂载新的，挂载的范围是 i - e2
       * i > e2 的情况下，表示老的多，新的少，要把老的里面多余的卸载掉，卸载的范围是 i - e1
       *
       * 2. 乱序
       * c1 => [a, (b, c, d), e]
       * c2 => [a, (c, d, b), e]
       * 开始时：i = 0, e1 = 4, e2 = 4
       * 双端对比完结果：i = 1, e1 = 3, e2 = 3
       *
       */

      let i = 0

      let e1 = c1.length - 1

      let e2 = c2.length - 1

      /**
       * 1.1 头部对比
       * c1 => [a, b]
       * c2 => [a, b, c]
       *
       * 开始时：i = 0, e1 = 1, e2 = 2
       * 结束时：i = 2, e1 = 1, e2 = 2
       *
       */

      while (i <= e1 && i <= e2) {
        const n1 = c1[i]
        const n2 = (c2[i] = normalizeVNode(c2[i]))
        if (isSameVNodeType(n1, n2)) {
          // 如果是同一个节点，就进行更新
          patch(n1, n2, container)
        } else {
          // 如果不是同一个节点，就进行替换
          break
        }
        i++
      }

      /**
       *
       * 1.2 尾部对比
       *
       * c1 => [a, b]
       * c2 => [c, d, a, b]
       * 开始时：i = 0, e1 = 1, e2 = 3
       * 结束时：i = 0，e1 = -1, e2 = 1
       */

      while (i <= e1 && i <= e2) {
        const n1 = c1[e1]
        const n2 = (c2[e2] = normalizeVNode(c2[e2]))
        if (isSameVNodeType(n1, n2)) {
          // 如果是同一个节点，就进行更新
          patch(n1, n2, container)
        } else {
          // 如果不是同一个节点，就进行替换
          break
        }
        e1--
        e2--
      }

      if (i > e1) {
        /**
         * 根据双端对比，得出结论：
         * i > e1 表示老的少，新的多，要挂载新的，挂载的范围是 i - e2
         */
        const nextPos = e2 + 1
        // 由于挂载不一定是追加到父元素的最后面，所以此处需要获取到 anchor，插入到某个元素之前
        const anchor = nextPos < c2.length ? c2[nextPos].el : null
        while (i <= e2) {
          patch(null, (c2[i] = normalizeVNode(c2[i])), container, anchor)
          i++
        }
      } else if (i > e2) {
        /**
         * 根据双端对比，得出结果：
         * i > e2 的情况下，表示老的多，新的少，要把老的里面多余的卸载掉，卸载的范围是 i - e1
         */
        while (i <= e1) {
          unmount(c1[i])
          i++
        }
      } else {
        /**
         * 2. 乱序
         * c1 => [a, (b, c, d), e]
         * c2 => [a, (c, d, b), e]
         * 开始时：i = 0, e1 = 4, e2 = 4
         * 双端对比完结果：i = 1, e1 = 3, e2 = 3
         *
         * 找到 key 相同的 虚拟节点，让它们 patch 一下
         */

        // 老的子节点开始查找的位置 s1 - e1
        let s1 = i
        // 新的子节点开始查找的位置 s2 - e2
        let s2 = i

        /**
         * 做一份新的子节点的key和index之间的映射关系
         * map = {
         *   c:1,
         *   d:2,
         *   b:3
         * }
         */

        const keyToNewIndexMap = new Map()

        const newIndexToOldIndexMap = new Array(e2 - s2 + 1)
        // -1 代表不需要计算的
        newIndexToOldIndexMap.fill(-1)

        /**
         * 遍历新的 s2 - e2 之间，这些是还没更新的，做一份 key => index map
         */
        for (let j = s2; j <= e2; j++) {
          const n2 = c2[j] = normalizeVNode(c2[j])
          keyToNewIndexMap.set(n2.key, j)
        }

        /**
         * 省略部分乱序 diff
         */
        // 表示新的子节点在老的子节点中本身就是连续递增的
        let pos = -1
        // 是否需要移动
        let moved = false

        /**
         * 遍历老的子节点
         */
        for (let j = s1; j <= e1; j++) {
          const n1 = c1[j]
          // 看一下这个key在新的里面有没有
          const newIndex = keyToNewIndexMap.get(n1.key)
          if (newIndex != null) {
            if (newIndex > pos) {
              // 💡 如果每一次都是比上一次的大，表示就是连续递增的，不需要算
              pos = newIndex
            } else {
              // 💡 如果突然有一天比上一次的小了，表示需要移动了
              moved = true
            }
            newIndexToOldIndexMap[newIndex] = j
            // 如果有，就patch
            patch(n1, c2[newIndex], container)
          } else {
            // 如果没有，表示老的有，新的没有，需要卸载
            unmount(n1)
          }
        }
        // 💡 如果 moved 为 false，表示不需要移动，就别算了
        const newIndexSequence = moved ? getSequence(newIndexToOldIndexMap) : []
        // 换成 Set 性能好一点
        const sequenceSet = new Set(newIndexSequence)

        /**
         * 1. 遍历新的子元素，调整顺序，倒序插入
         * 2. 新的有，老的没有的，我们需要重新挂载
         */
        for (let j = e2; j >= s2; j--) {
          /**
           * 倒序插入
           */
          const n2 = c2[j]
          // 拿到它的下一个子元素
          const anchor = c2[j + 1]?.el || null
          if (n2.el) {
            if (moved) {
              // 💡 如果需要移动，再进去
              // 如果 j 不在最长递增子序列中，表示需要移动
              if (!sequenceSet.has(j)) {
                // 依次进行倒序插入，保证顺序的一致性
                hostInsert(n2.el, container, anchor)
              }
            }
          } else {
            // 新的有，老的没有，重新挂载
            patch(null, n2, container, anchor)
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

    const processElement = (n1, n2, container, anchor = null) => {
      if (n1 == null) {
        // 挂载
        mountElement(n2, container, anchor)
      } else {
        // 更新
        patchElement(n1, n2)
      }
    }

    /**
     * 处理文本的挂载和更新
     */
    const processText = (n1, n2, container, anchor) => {
      if (n1 == null) {
        // 挂载
        const el = hostCreateText(n2.children)
        // 给 vnode 绑定 el
        n2.el = el // todo 这个语句有意义吗，好像用不到
        // 把文本节点插入到 container 中
        hostInsert(el, container, anchor)
      } else {
        // 更新
        // 复用节点
        n2.el = n1.el
        if (n1.children != n2.children) {
          // 如果文本内容变了，就更新
          hostSetText(n2.el, n2.children)
        }
      }
    }

    /**
     * 更新和挂载，都用这个函数
     * @param n1 老节点，之前的，如果有，表示要和 n2 做 diff，更新，如果没有，表示直接挂载 n2
     * @param n2 新节点
     * @param container 要挂载的容器
     * @param anchor 锚点
     */
    const patch = (n1, n2, container, anchor = null) => {
      if (n1 === n2) {
        // 如果两次传递了同一个虚拟节点，啥都不干
        return
      }

      if (n1 && !isSameVNodeType(n1, n2)) {
        // 如果两个节点不是同一个类型，那就卸载 n1 直接挂载 n2    unmount(n1)
        n1 = null
      }

      const { shapeFlag, type } = n2

      switch (type) {
        case Text:
          processText(n1, n2, container, anchor)
          break
        default:
          if (shapeFlag & ShapeFlags.ELEMENT) {
            processElement(n1, n2, container, anchor)
          }
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
    createApp: createAppAPI(render)
  }
}

/**
 * 求最长递增子序列
 */
function getSequence(arr) {
  const result = []
  // 记录前驱节点
  const map = new Map()

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i]
    // -1 不在计算范围内
    if (item === -1 || item === undefined) continue

    if (result.length === 0) {
      // 如果 result 里面一个都没有，把当前的索引放进去
      result.push(i)
      continue
    }

    const lastIndex = result[result.length - 1]
    const lastItem = arr[lastIndex]

    if (item > lastItem) {
      // 如果当前这一项大于上一个，那么就直接把索引放到 result 中
      result.push(i)
      // 记录前驱节点
      map.set(i, lastIndex)
      continue
    }
    // item 小于 lastItem

    let left = 0
    let right = result.length - 1

    while (left < right) {
      const mid = Math.floor((left + right) / 2)
      // 拿到中间项
      const midItem = arr[result[mid]]
      if (midItem < item) {
        left = mid + 1
      } else {
        right = mid
      }
    }

    if (arr[result[left]] > item) {
      if (left > 0) {
        // 记录前驱节点
        map.set(i, result[left - 1])
      }
      // 找到最合适的，把索引替换进去
      result[left] = i
    }
  }

  // 反向追溯
  let l = result.length
  let last = result[l - 1]

  while (l > 0) {
    l--
    // 纠正顺序
    result[l] = last
    // 去前驱节点里面找
    last = map.get(last)
  }

  return result
}
