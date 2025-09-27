/**
 * 传统发布订阅模式 - 发布者类
 * 
 * 这是传统的设计模式，需要：
 * 1. 订阅者手动调用 subscribe() 方法进行订阅
 * 2. 发布者手动调用 publish() 方法进行通知
 * 
 * 缺点：
 * - 需要手动管理订阅关系
 * - 容易忘记订阅或取消订阅
 * - 订阅关系分散在代码各处
 */
class Publisher {
  // 存储所有订阅者
  subscribers: any[] = []
  
  constructor () {
    this.subscribers = []
  }
  
  /**
   * 订阅方法 - 手动订阅
   * 订阅者需要主动调用这个方法来订阅消息
   */
  subscribe (subscriber: any) {
    this.subscribers.push(subscriber)
    console.log(`${subscriber.name}订阅成功`)
  }
  
  /**
   * 发布方法 - 手动发布
   * 发布者需要主动调用这个方法来通知所有订阅者
   */
  publish (message: any) {
    this.subscribers.forEach(subscriber => subscriber.notify(message))
  }
}
/**
 * 传统发布订阅模式 - 订阅者类
 * 
 * 订阅者需要：
 * 1. 实现 notify 方法来接收消息
 * 2. 主动调用发布者的 subscribe 方法进行订阅
 * 
 * 这种模式的问题：
 * - 订阅者必须知道发布者的存在
 * - 必须手动管理订阅关系
 * - 订阅和发布是分离的两个步骤
 */
class Subscriber {
  name: string
  
  constructor (name: string) {
    this.name = name
  }
  
  /**
   * 接收通知的方法
   * 当发布者发布消息时会被调用
   */
  notify (message: any) {
    console.log(`${this.name}收到消息：${message}`)
  }
}
/**
 * 传统发布订阅模式的使用示例
 * 
 * 与 Vue3 响应式系统的对比：
 * 
 * 传统模式（当前示例）：
 * 1. 创建发布者和订阅者
 * 2. 订阅者手动调用 subscribe() 进行订阅
 * 3. 发布者手动调用 publish() 进行通知
 * 
 * Vue3 模式：
 * 1. 创建响应式数据：const count = ref(0)
 * 2. 自动收集依赖：effect(() => console.log(count.value))
 * 3. 自动触发更新：count.value = 1
 * 
 * 核心区别：Vue3 将订阅和发布自动化了！
 */

// 创建发布者
const publisher = new Publisher()

// 创建订阅者
const subscriber1 = new Subscriber('张三')
const subscriber2 = new Subscriber('李四')

// ❌ 手动管理订阅关系 - 容易忘记或出错
publisher.subscribe(subscriber1)
publisher.subscribe(subscriber2)

// ❌ 手动发布消息 - 需要记得调用
publisher.publish('更新了')

/**
 * 对比 Vue3 的写法：
 * 
 * const count = ref(0)
 * 
 * effect(() => {
 *   console.log('count:', count.value)  // ✅ 自动收集依赖
 * })
 * 
 * count.value = 1  // ✅ 自动触发更新
 * 
 * 优势：
 * - 不需要手动管理订阅关系
 * - 访问数据时自动收集依赖
 * - 修改数据时自动触发更新
 * - 代码更简洁，不易出错
 */
