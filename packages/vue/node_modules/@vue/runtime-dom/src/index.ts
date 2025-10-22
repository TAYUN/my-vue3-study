import { nodeOps } from "./nodeOps";
import { createRenderer } from "@vue/runtime-core"

export * from "@vue/runtime-core"
const renderer = createRenderer(nodeOps)
export function render(vnode, container) {
  renderer.render(vnode, container)
}