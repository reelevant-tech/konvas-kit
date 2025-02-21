import { Util } from './Util';
import { SceneContext, HitContext, Context } from './Context';
import { Konva } from './Global';
import { Factory } from './Factory';
import { getNumberValidator } from './Validators';

// calculate pixel ratio
var _pixelRatio;
function getDevicePixelRatio() {
  if (_pixelRatio) {
    return _pixelRatio;
  }
  var canvas = Util.createCanvasElement();
  var context = canvas.getContext('2d') as any;
  _pixelRatio = (function () {
    var devicePixelRatio = Konva._global.devicePixelRatio || 1,
      backingStoreRatio =
        context.webkitBackingStorePixelRatio ||
        context.mozBackingStorePixelRatio ||
        context.msBackingStorePixelRatio ||
        context.oBackingStorePixelRatio ||
        context.backingStorePixelRatio ||
        1;
    return devicePixelRatio / backingStoreRatio;
  })();
  return _pixelRatio;
}

interface ICanvasConfig {
  width?: number;
  height?: number;
  pixelRatio?: number;
}

/**
 * Canvas Renderer constructor. It is a wrapper around native canvas element.
 * Usually you don't need to use it manually.
 * @constructor
 * @abstract
 * @memberof Konva
 * @param {Object} config
 * @param {Number} config.width
 * @param {Number} config.height
 * @param {Number} config.pixelRatio
 */
export abstract class Canvas<T extends Context> {
  pixelRatio = 1;
  _canvas: HTMLCanvasElement;
  context: T;
  width = 0;
  height = 0;

  isCache = false;

  constructor(config: ICanvasConfig) {
    var conf = config || {};

    var pixelRatio =
      conf.pixelRatio || Konva.pixelRatio || getDevicePixelRatio();

    this.pixelRatio = pixelRatio;

    this._canvas = Util.createCanvasElement();
    // set inline styles
    this._canvas.style.padding = '0';
    this._canvas.style.margin = '0';
    this._canvas.style.border = '0';
    this._canvas.style.background = 'transparent';
    this._canvas.style.position = 'absolute';
    this._canvas.style.top = '0';
    this._canvas.style.left = '0';
  }

  /**
   * get canvas context
   * @method
   * @name Konva.Canvas#getContext
   * @returns {CanvasContext} context
   */
  getContext() {
    return this.context;
  }
  getPixelRatio() {
    return this.pixelRatio;
  }
  setPixelRatio(pixelRatio) {
    var previousRatio = this.pixelRatio;
    this.pixelRatio = pixelRatio;
    this.setSize(
      this.getWidth() / previousRatio,
      this.getHeight() / previousRatio
    );
  }
  getWidth() {
    return this.width;
  }
  getHeight() {
    return this.height;
  }
  setSize(width, height) {
    this.sizeCanvas(width, height);
    this.scaleCanvas();
  }
  sizeCanvas(width: number, height: number) {
    this.width = this._canvas.width = width * this.pixelRatio;
    this._canvas.style.width = width + 'px';

    this.height = this._canvas.height = height * this.pixelRatio;
    this._canvas.style.height = height + 'px';
  }
  scaleCanvas() {
    const _context = this.getContext()._context;

    const scaleRatio = this.pixelRatio;
    _context.scale(scaleRatio, scaleRatio);
  }
  /**
   * to data url
   * @method
   * @name Konva.Canvas#toDataURL
   * @param {String} mimeType
   * @param {Number} quality between 0 and 1 for jpg mime types
   * @returns {String} data url string
   */
  toDataURL(mimeType, quality) {
    try {
      // If this call fails (due to browser bug, like in Firefox 3.6),
      // then revert to previous no-parameter image/png behavior
      return this._canvas.toDataURL(mimeType, quality);
    } catch (e) {
      try {
        return this._canvas.toDataURL();
      } catch (err) {
        Util.error(
          'Unable to get data URL. ' +
            err.message +
            ' For more info read https://konvajs.org/docs/posts/Tainted_Canvas.html.'
        );
        return '';
      }
    }
  }

  destroy() {
    this.context.destroy()
    return this
  }
}

/**
 * get/set pixel ratio.
 * KonvaJS automatically handles pixel ratio adustments in order to render crisp drawings
 *  on all devices. Most desktops, low end tablets, and low end phones, have device pixel ratios
 *  of 1.  Some high end tablets and phones, like iPhones and iPads have a device pixel ratio
 *  of 2.  Some Macbook Pros, and iMacs also have a device pixel ratio of 2.  Some high end Android devices have pixel
 *  ratios of 2 or 3.  Some browsers like Firefox allow you to configure the pixel ratio of the viewport.  Unless otherwise
 *  specificed, the pixel ratio will be defaulted to the actual device pixel ratio.  You can override the device pixel
 *  ratio for special situations, or, if you don't want the pixel ratio to be taken into account, you can set it to 1.
 * @name Konva.Canvas#pixelRatio
 * @method
 * @param {Number} pixelRatio
 * @returns {Number}
 * @example
 * // get
 * var pixelRatio = layer.getCanvas.pixelRatio();
 *
 * // set
 * layer.getCanvas().pixelRatio(3);
 */
Factory.addGetterSetter(Canvas, 'pixelRatio', undefined, getNumberValidator());

export class SceneCanvas extends Canvas<SceneContext> {
  constructor(config: ICanvasConfig = { width: 0, height: 0 }) {
    super(config);
    this.sizeCanvas(config.width, config.height); // set right width/height before creating surface
    this.context = new SceneContext(this);
    this.setSize(config.width, config.height);
  }

  setSize(width, height) {

    // Try to create a surface bigger than necessary to prevent recreating it too often
    // Doesn't work FTM because surface is not correctly aligned with canvas
    // if (context.surface.width() < width || context.surface.height() < height) {
    //   const newWidth = Math.max(context.surface.width(), width * 1.2);
    //   const newHeight = Math.max(context.surface.height(), height * 1.2);

    //   this._canvas.width = newWidth;
    //   this._canvas.height = newHeight;

    //   context.surface.dispose();
    //   context.surface = Konva.canvasKit.MakeCanvasSurface(this._canvas);
    //   context.emulatedCanvas = new Konva.htmlCanvas(context.surface);
      
    //   context._context = context.emulatedCanvas.getContext('2d');
    // }


    this.sizeCanvas(width, height);
    this.context.createSurface();
    this.scaleCanvas();
  }

  toDataURL(mimeType, quality) {
    return this.context.emulatedCanvas.toDataURL(mimeType, quality);
  }
}

export class HitCanvas extends Canvas<HitContext> {
  hitCanvas = true;
  constructor(config: ICanvasConfig = { width: 0, height: 0 }) {
    super(config);

    this.context = new HitContext(this);
    this.setSize(config.width, config.height);
  }
}
