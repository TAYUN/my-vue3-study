import {
  isArray,
  isFunction,
  isObject,
  isString,
  ShapeFlags,
} from '@vue/shared'

/**
 * 判断是不是一个虚拟节点，根据 __v_isVNode 属性
 * @param value
 */
export function isVNode(value) {
  return value?.__v_isVNode
}
/**
 * 判断两个虚拟节点是不是相同类型
 * @param n1 
 * @param n2 
 */
export function isSameVNodeType(n1, n2) {
  return n1.type === n2.type && n1.key === n2.key
}
/**
 * 创建虚拟节点的底层方法
 * @param type 节点类型
 * @param props 节点的属性
 * @param children 子节点
 * @param patchFlag 更新标记
 * @param isBlock 表示是不是一个块
 */
export function createVNode(type, props, children) {
  let shapeFlag = 0

  //region 处理 type 的 shapeFlag
  if (isString(type)) {
    // div span p h1
    shapeFlag = ShapeFlags.ELEMENT
  }
  if (isString(children)) {
    shapeFlag = ShapeFlags.TEXT_CHILDREN
  } else if (isArray(children)) {
    shapeFlag = ShapeFlags.ARRAY_CHILDREN
  }
  //  else if (isTeleport(type)) {
  //   // Teleport 组件
  //   shapeFlag = ShapeFlags.TELEPORT
  // } else if (isObject(type)) {
  //   // 有状态的组件
  //   shapeFlag = ShapeFlags.STATEFUL_COMPONENT
  // } else if (isFunction(type)) {
  //   // 函数式组件
  //   shapeFlag = ShapeFlags.FUNCTIONAL_COMPONENT
  // }
  //endregion

  const vnode = {
    __v_isVNode: true,
    type,
    props,
    children,
    key: props?.key,
    el: null,
    shapeFlag,
  }

  return vnode
}
