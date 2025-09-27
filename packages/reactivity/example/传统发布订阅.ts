// 发布者
class Publisher {
  subscribers: any[] = []
  constructor () {
    this.subscribers = []
  }
  // 订阅方法
  subscribe (subscriber: any) {
    this.subscribers.push(subscriber)
    console.log(`${subscriber.name}订阅成功`)
  }
  // 发布方法
  publish (message: any) {
    this.subscribers.forEach(subscriber => subscriber.notify(message))
  }
}
// 订阅者
class Subscriber {
  name: string
  constructor (name: string) {
    this.name = name
  }
  notify (message: any) {
    console.log(`${this.name}收到消息：${message}`)
  }
}
const publisher = new Publisher()
const subscriber1 = new Subscriber('张三')
const subscriber2 = new Subscriber('李四')
// 手动管理
publisher.subscribe(subscriber1)
publisher.subscribe(subscriber2)

publisher.publish('更新了')
