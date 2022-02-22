import { Util } from '../Util';
import { Factory } from '../Factory';
import { Shape, ShapeConfig } from '../Shape';
import { getNumberValidator } from '../Validators';
import { Konva, _registerNode } from '../Global';
import type { Image as CanvasKitImage, AnimatedImage } from 'canvaskit-wasm'

import { GetSet, IRect } from '../types';
import { Context, SceneContext } from '../Context';

export interface ImageConfig extends ShapeConfig {
  image: ArrayBuffer | undefined;
}

/**
 * Image constructor
 * @constructor
 * @memberof Konva
 * @augments Konva.Shape
 * @param {Object} config
 * @param {Image} config.image
 * @@shapeParams
 * @@nodeParams
 * @example
 * var imageObj = new Image();
 * imageObj.onload = function() {
 *   var image = new Konva.Image({
 *     x: 200,
 *     y: 50,
 *     image: imageObj,
 *     width: 100,
 *     height: 100
 *   });
 * };
 * imageObj.src = '/path/to/image.jpg'
 */
export class Image extends Shape<ImageConfig> {
  canvasKitImg: CanvasKitImage
  canvasKitAnimatedImg: AnimatedImage

  constructor(attrs: ImageConfig) {
    super(attrs);
    this.on('imageChange.konva', () => {
      this._setImageLoad();
    });

    this._setImageLoad();
  }
  _setImageLoad () {
    const image = this.image();

    if (image) {
      // A static image (png/jpeg) is an animated img with 1 frame
      this.canvasKitAnimatedImg?.delete()
      this.canvasKitAnimatedImg = Konva.canvasKit.MakeAnimatedImageFromEncoded(image)

      this._startAnimation()
    }
  }

  _startAnimation () {
    // Return early if we couldn't decode the image
    if (!this.canvasKitAnimatedImg) {
      return
    }

    this.canvasKitAnimatedImg.reset()

    this.canvasKitImg?.delete()
    this.canvasKitImg = this.canvasKitAnimatedImg.makeImageAtCurrentFrame()

    const frameCount = this.canvasKitAnimatedImg.getFrameCount()
    if (frameCount <= 1) {
      return
    }

    const ticker = this.getLayer().ticker

    // We already displayed first frame, so 1
    let animationFrame = 1
    let animationTime = this.canvasKitAnimatedImg.currentFrameDuration()

    ticker.registerAnimation(this.id(), () => {
      // Loop while animation is late, and don't do anything if on time
      while (ticker.elapsedTime >= animationTime) {
        this.canvasKitAnimatedImg.decodeNextFrame()
        
        // Increment animation time by frame duration
        const frameDuration = this.canvasKitAnimatedImg.currentFrameDuration()
        animationTime += frameDuration

        // Don't display frame if we know we need to skip it
        if (ticker.elapsedTime >= animationTime) {
          continue
        }

        // Display frame
        this.canvasKitImg?.delete()
        this.canvasKitImg = this.canvasKitAnimatedImg.makeImageAtCurrentFrame()

        // If we are at the end of the animation, end it
        animationFrame++
        if (animationFrame >= frameCount) {
          ticker.stopAnimation(this.id())
          break
        }
      }

      // Return when we need to display next frame
      return (animationTime - ticker.elapsedTime)
    }, () => this._startAnimation())
  }

  _useBufferCanvas() {
    return super._useBufferCanvas(true);
  }
  _sceneFunc(context: SceneContext) {
    const width = this.getWidth();
    const height = this.getHeight();
    const image = this.attrs.image;

    if (this.hasFill() || this.hasStroke()) {
      context.beginPath();
      context.rect(0, 0, width, height);
      context.closePath();
      context.fillStrokeShape(this);
    }

    if (image && this.canvasKitImg) {
      // src: https://github.com/google/skia/blob/652d790355b524953c8e913d4e8ea6ce70d77cff/modules/canvaskit/tests/canvas.spec.js#L648 since https://github.com/google/skia/commit/652d790355b524953c8e913d4e8ea6ce70d77cff
      const skCanvas = context.surface.getCanvas()
      const paint = new Konva.canvasKit.Paint();
      const xScale = width / this.canvasKitImg.width()
      const yScale = height / this.canvasKitImg.height()
      // Using shader cubic allows us to render better images than with context.drawImage()
      const shader = this.canvasKitImg.makeShaderCubic(
        Konva.canvasKit.TileMode.Decal,
        Konva.canvasKit.TileMode.Clamp,
        1/3 /*B*/, 1/3 /*C*/,
        Konva.canvasKit.Matrix.scaled(xScale, yScale)
      );
      paint.setShader(shader);
      skCanvas.drawRect(Konva.canvasKit.LTRBRect(0, 0, width, height), paint);
      paint.delete();
      shader.delete();
    }
  }
  _hitFunc(context) {
    var width = this.width(),
      height = this.height();

    context.beginPath();
    context.rect(0, 0, width, height);
    context.closePath();
    context.fillStrokeShape(this);
  }
  getWidth() {
    return this.attrs.width ?? this.canvasKitImg?.width() ?? 100;
  }
  getHeight() {
    return this.attrs.height ?? this.canvasKitImg?.height() ?? 100;
  }

  destroy() {
    super.destroy();

    this.canvasKitImg?.delete()
    this.canvasKitAnimatedImg?.delete()
    this.getLayer()?.ticker.unregisterAnimation(this.id())
    return this;
  }

  image: GetSet<ArrayBuffer | undefined, this>;
}

Image.prototype.className = 'Image';
_registerNode(Image);
/**
 * get/set image source. It can be image, canvas or video element
 * @name Konva.Image#image
 * @method
 * @param {Object} image source
 * @returns {Object}
 * @example
 * // get value
 * var image = shape.image();
 *
 * // set value
 * shape.image(img);
 */
Factory.addGetterSetter(Image, 'image');

