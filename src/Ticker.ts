import { Layer } from "./Layer"

type Animation = {
  loop: () => number | undefined
  reset?: () => void
}

/**
 * @description The ticker manages all animation in a specific layer.
 * You can register a new animation by calling `registerAnimation` and passing a callback.
 * When your callback is called, you are responsible to sync the animation with the `currentTime`.
 * You need to return from this callback the duration when you would like the callback to be called again.
 * The callback can be called at any time, there is no warranty the requested time will be respected.
 * If you want to end your animation, you can return `undefined` or call `removeAnimation`.
 * All animation should at some point be unregistered with the current design.
 */
export class Ticker {
  animations = new Map<string, Animation>()
  activeAnimations = new Set<string>()
  initDate: number

  /**
   * @description Corresponds to the time since the animation started, in ms.
   * You should sync your animation to that time when the `registerAnimation` callback is called.
   * We use it because we want to export frames at a differente rate than real time.
   */
  currentTime = 0

  previewStartTime: number
  previewTimeout: ReturnType<typeof setTimeout>

  constructor(private readonly layer: Layer) {
    this.initDate = Date.now()
  }

  /**
   * @description Register an animation
   * @param loop Callback to run on each frame. Returns when it would like to be called next, without any warranty
   * @param reset Callback to run if we want to replay animation
   */
  registerAnimation (id: string, loop: () => number | undefined, reset?: () => void) {
    this.animations.set(id, { loop, reset })
    this.activeAnimations.add(id)

    if (typeof window !== 'undefined') {
      if (this.activeAnimations.size === 1) {
        this.startPreview()
      } else if (this.activeAnimations.size > 1) {
        // An animation loop is already running, cancel timeout & run immediatly
        clearTimeout(this.previewTimeout)
        this.previewLoop()
      }
    }
  }

  /**
   * @description Stop an animation
   */
  stopAnimation (id: string) {
    this.activeAnimations.delete(id)

    if (typeof window !== 'undefined' && this.activeAnimations.size === 0) {
      clearTimeout(this.previewTimeout)
    }
  }

  /**
   * @description Stop and unregister animation
   */
  unregisterAnimation (id: string) {
    this.stopAnimation(id)
    this.animations.delete(id)
  }

  /**
   * @description Called before drawing next frame
   */
  moveForward () {
    const requestedTimes = []

    for (const id of this.activeAnimations) {
      const animation = this.animations.get(id)
      const requestedTime = animation.loop()

      if (requestedTime === undefined) {
        this.stopAnimation(id)
      } else {
        requestedTimes.push(requestedTime)
      }
    }

    if (requestedTimes.length === 0) {
      return undefined
    }

    const willRenderIn = Math.min(...requestedTimes)
    this.currentTime += willRenderIn

    return willRenderIn
  }


  /**
   * @description Move all animation to real time
   */
  private previewLoop () {
    if (this.activeAnimations.size === 0) {
      this.previewStartTime = undefined
      return
    }

    // Force currentTime to real time, because this is a preview
    this.currentTime = Date.now() - this.previewStartTime

    const willRenderIn = this.moveForward()

    this.layer.drawScene()

    if (willRenderIn !== undefined) {
      this.previewTimeout = setTimeout(() => {
        this.previewLoop()
      }, willRenderIn)
    }
  }

  /**
   * @description Run all animations in real time, for preview
   */
  startPreview () {
    if (this.previewStartTime !== undefined) {
      return
    }
    this.previewStartTime = Date.now()

    this.previewLoop()
  }

  /**
   * @description Replay all animations
   */
  replayPreview () {
    this.currentTime = 0
    this.previewStartTime = undefined
    clearTimeout(this.previewTimeout)

    for (const [id, animation] of this.animations.entries()) {
      animation.reset?.()
      this.activeAnimations.add(id)
    }

    this.startPreview()
  }
}
