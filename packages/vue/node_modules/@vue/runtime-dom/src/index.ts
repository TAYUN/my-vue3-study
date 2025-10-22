import { nodeOps } from './nodeOps'
import { createRenderer } from '@vue/runtime-core'
import { patchProp } from './patchProp'

export * from '@vue/runtime-core'

const renderOptions = { patchProp, ...nodeOps }
const renderer = createRenderer(renderOptions)
export function render(vnode, container) {
  renderer.render(vnode, container)
}

export { renderOptions }
