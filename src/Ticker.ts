import { Layer } from "./Layer"

type Animation = {
  metadata: Record<string, unknown>
  loop: () => number
  reset?: () => void
}

/**
 * @description The ticker manages all animation in a specific layer.
 * You can register a new animation by calling `registerAnimation` and passing a callback.
 * When your callback is called, you are responsible to sync the animation with the `elapsedTime`.
 * You need to return from this callback the duration when you would like the callback to be called again (e.g. the duration of the frame).
 * The callback can be called at any time, there is no warranty the requested time will be respected.
 * If you want to end your animation, you should call `stopAnimation`.
 * All animation should at some point be stopped with the current design to avoid infinity loops.
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
  elapsedTime = 0

  /**
   * @description Timestamp in ms for the current frame we're rendering
   * We should use this value instead of Date.now() since we could export frames
   * quicker than the time pass
   */
  currentTime: number

  previewStartTime: number
  previewTimeout: ReturnType<typeof setTimeout>

  constructor(private readonly layer: Layer) {
    this.initDate = Date.now()
  }

  /**
   * @description Register an animation
   * @param loop Callback to run on each frame. Returns when it would like to be called next, without any warranty
   * @param reset Callback to run if we want to replay animation
   * @param metadata User metadata
   */
  registerAnimation (id: string, loop: () => number, reset?: () => void, metadata: Record<string, unknown> = {}) {
    this.animations.set(id, { loop, reset, metadata })
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
    if (typeof this.currentTime === 'undefined') {
      this.currentTime = Date.now()
    }
    const requestedTimes = []

    for (const id of this.activeAnimations) {
      const animation = this.animations.get(id)
      const requestedTime = animation.loop()
      requestedTimes.push(requestedTime)
    }

    if (requestedTimes.length === 0) { // nothing was run
      return undefined
    }

    const willRenderIn = Math.min(...requestedTimes)
    this.elapsedTime += willRenderIn
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

    // Force elapsedTime to real time, because this is a preview
    this.elapsedTime = Date.now() - this.previewStartTime
    this.currentTime = Date.now()

    const willRenderIn = this.moveForward()

    this.layer.drawScene()

    if (willRenderIn !== undefined && this.activeAnimations.size > 0) {
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
    this.elapsedTime = 0
    this.previewStartTime = undefined
    clearTimeout(this.previewTimeout)

    for (const [id, animation] of this.animations.entries()) {
      animation.reset?.()
      this.activeAnimations.add(id)
    }

    this.startPreview()
  }
}
