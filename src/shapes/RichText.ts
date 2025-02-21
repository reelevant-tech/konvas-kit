import { Konva } from '../Global'
import { HitContext, SceneContext } from '../Context'
import { Factory } from '../Factory'
import { _registerNode } from '../Global'
import { Shape, ShapeConfig } from '../Shape'
import { GetSet } from '../types'
import { getNumberOrAutoValidator, getNumberValidator, getBooleanValidator } from '../Validators'
import { EmbindEnumEntity, Paragraph, TypefaceFontProvider } from 'canvaskit-wasm'

type Color = {
  r: number
  g: number
  b: number
  a: number
}

export interface TextStyle {
  fontFamily: string
  fontSize: number
  letterSpacing: number
  fontWeight: keyof RichText['supportedFontWeights']
  fontStyle: 'normal' | 'italic'
  fontVariant: 'normal' | 'small-caps'
  textDecoration: '' | 'underline' | 'line-through' | 'underline line-through'
  fill: Color
}

export interface TextPart {
  text: string
  style: TextStyle
}

export interface RichTextConfig extends ShapeConfig {
  textParts?: TextPart[]
  align?: string
  verticalAlign?: string
  padding?: number
  lineHeight?: number
  letterSpacing?: number
  wrap?: string
  ellipsis?: boolean
}

export class RichText extends Shape<RichTextConfig> {
  public className = 'RichText'

  private supportedFontWeights = {
    'thin': Konva.canvasKit.FontWeight.Thin,
    'extra-light': Konva.canvasKit.FontWeight.ExtraLight,
    'light': Konva.canvasKit.FontWeight.Light,
    'regular': Konva.canvasKit.FontWeight.Normal,
    'medium': Konva.canvasKit.FontWeight.Medium,
    'semi-bold': Konva.canvasKit.FontWeight.SemiBold,
    'bold': Konva.canvasKit.FontWeight.Bold,
    'extra-bold': Konva.canvasKit.FontWeight.ExtraBold,
    'black': Konva.canvasKit.FontWeight.Black,
    'extra-black': Konva.canvasKit.FontWeight.ExtraBlack
  }
  public align!: GetSet<'left' | 'center' | 'right' | 'justify', this>
  public letterSpacing!: GetSet<number, this>
  public verticalAlign!: GetSet<'top' | 'middle' | 'bottom', this>
  public padding!: GetSet<number, this>
  public lineHeight!: GetSet<number, this>
  public textParts!: GetSet<TextPart[], this>
  public wrap!: GetSet<'word' | 'char' | 'none', this>
  public ellipsis!: GetSet<boolean, this>

  private paragraph: Paragraph

  public static createFontProvider () {
    return Konva.canvasKit.TypefaceFontProvider.Make()
  }

  constructor (config: RichTextConfig, private typefaceFontProvider: TypefaceFontProvider) {
    super(config)

    for (const attr of [
      'padding', 'wrap', 'lineHeight', 'letterSpacing', 'width', 'height', 'textParts', 'align'
    ]) {
      this.on(`${attr}Change.konva`, this.computeParagraph)
    }

    this.computeParagraph()
  }

  public getHeight (auto = false): number {
    const isAuto = this.attrs.height === 'auto' || this.attrs.height === undefined
    if (!isAuto && auto === false) {
      return this.attrs.height
    }
    return this.paragraph.getHeight()
  }

  public getWidth (auto = false): number {
    const isAuto = this.attrs.width === 'auto' || this.attrs.width === undefined
    if (!isAuto && auto === false) {
      return this.attrs.width
    }
    return this.paragraph.getMaxIntrinsicWidth()
  }

  private computeParagraph () {
    if (this.paragraph !== undefined) this.paragraph.delete()

    let paragraph = this.buildParagraph()

    const width = this.width() - this.padding() / 2
    paragraph.layout(width)

    // If paragraph doesn't fit, we need to remove overflowing lines, which requires another layout phase
    if (this.height() < paragraph.getHeight()) {
      const lines = paragraph.getShapedLines()

      if (lines.length > 0) {
        // For a unknown reason, paragraph can be "too small" even if no line overflows
        let maxLength = lines[lines.length - 1].textRange.last
        for (const line of lines) {
          if (line.bottom > this.height()) {
            maxLength = line.textRange.first
            break
          }
        }

        paragraph.delete()
        paragraph = this.buildParagraph(maxLength)
        paragraph.layout(width)
      }
    }

    this.paragraph = paragraph
  }

  /**
   * @description Builds a canvas kit paragraph
   */
  private buildParagraph (maxLength: number = Infinity) {
    const textAlign = this.align() === 'left'
      ? Konva.canvasKit.TextAlign.Left
      : this.align() === 'center'
        ? Konva.canvasKit.TextAlign.Center
        : this.align() === 'right'
          ? Konva.canvasKit.TextAlign.Right
          : Konva.canvasKit.TextAlign.Justify

    const paraStyle = new Konva.canvasKit.ParagraphStyle({
      // TextStyle is defined after for each text part
      textStyle: {},
      textAlign,
      ellipsis: '…',
      maxLines: Math.pow(2, 32) - 2 // Max CPP int
    })

    const builder = Konva.canvasKit.ParagraphBuilder.MakeFromFontProvider(paraStyle, this.typefaceFontProvider)

    const parts = this.textParts()

    let charCount = 0
    for (const part of parts) {
      const partStyle = part.style

      const color = [
        partStyle.fill.r / 255,
        partStyle.fill.g / 255,
        partStyle.fill.b / 255,
        partStyle.fill.a
      ]

      const weight = this.supportedFontWeights[partStyle.fontWeight]

      const slant = partStyle.fontStyle === 'italic'
        ? Konva.canvasKit.FontSlant.Italic
        : Konva.canvasKit.FontSlant.Upright

      let decoration = Konva.canvasKit.NoDecoration
      if (partStyle.textDecoration.includes('underline')) {
        decoration |= Konva.canvasKit.UnderlineDecoration
      }
      if (partStyle.textDecoration.includes('line-through')) {
        decoration |= Konva.canvasKit.LineThroughDecoration
      }

      const style = new Konva.canvasKit.TextStyle({
        fontFamilies: [partStyle.fontFamily, 'Roboto', 'Noto Color Emoji'],
        fontSize: partStyle.fontSize,
        fontStyle: { weight, slant },
        letterSpacing: partStyle.letterSpacing,
        decoration,
        color
      })

      builder.pushStyle(style)

      let text = part.text
      if (charCount + text.length > maxLength) {
        text = text.substr(0, maxLength - charCount)
      }

      builder.addText(text)
      charCount += text.length
      builder.pop()

      if (charCount === maxLength) break
    }

    const paragraph = builder.build()
    builder.delete()
    return paragraph
  }

  /**
   * @description This method is called when the shape should render
   * on canvas
   */
  protected _sceneFunc (context: SceneContext) {
    const skCanvas = context.surface.getCanvas()

    const y = this.verticalAlign() === 'top'
      ? this.padding()
      : this.verticalAlign() === 'middle'
        ? (this.height() - this.paragraph.getHeight()) / 2
        : this.height() - this.paragraph.getHeight() - this.padding()

    const x = this.padding()

    skCanvas.drawParagraph(this.paragraph, x, y)
  }

  /**
   * @description This method should render on canvas a rect with
   * the width and the height of the text shape
   */
  protected _hitFunc (context: HitContext) {
    context.beginPath()
    context.rect(0, 0, this.getWidth(), this.getHeight())
    context.closePath()
    context.fillStrokeShape(this)
  }

  // for text we can't disable stroke scaling
  // if we do, the result will be unexpected
  public getStrokeScaleEnabled () {
    return true
  }

  destroy() {
    super.destroy()
    this.paragraph.delete()

    return this
  }
}
_registerNode(RichText)

/**
 * get/set width of text area, which includes padding.
 * @name Konva.Text#width
 * @method
 * @param {Number} width
 * @returns {Number}
 * @example
 * // get width
 * var width = text.width();
 *
 * // set width
 * text.width(20);
 *
 * // set to auto
 * text.width('auto');
 * text.width() // will return calculated width, and not "auto"
 */
Factory.overWriteSetter(RichText, 'width', getNumberOrAutoValidator())

/**
 * get/set the height of the text area, which takes into account multi-line text, line heights, and padding.
 * @name Konva.Text#height
 * @method
 * @param {Number} height
 * @returns {Number}
 * @example
 * // get height
 * var height = text.height();
 *
 * // set height
 * text.height(20);
 *
 * // set to auto
 * text.height('auto');
 * text.height() // will return calculated height, and not "auto"
 */
Factory.overWriteSetter(RichText, 'height', getNumberOrAutoValidator())

/**
 * get/set padding
 * @name Konva.Text#padding
 * @method
 * @param {Number} padding
 * @returns {Number}
 * @example
 * // get padding
 * var padding = text.padding();
 *
 * // set padding to 10 pixels
 * text.padding(10);
 */
Factory.addGetterSetter(RichText, 'padding', 0, getNumberValidator())

/**
 * get/set horizontal align of text.  Can be 'left', 'center', 'right' or 'justify'
 * @name Konva.Text#align
 * @method
 * @param {String} align
 * @returns {String}
 * @example
 * // get text align
 * var align = text.align();
 *
 * // center text
 * text.align('center');
 *
 * // align text to right
 * text.align('right');
 */
Factory.addGetterSetter(RichText, 'align', 'left')

/**
 * get/set vertical align of text.  Can be 'top', 'middle', 'bottom'.
 * @name Konva.Text#verticalAlign
 * @method
 * @param {String} verticalAlign
 * @returns {String}
 * @example
 * // get text vertical align
 * var verticalAlign = text.verticalAlign();
 *
 * // center text
 * text.verticalAlign('middle');
 */
Factory.addGetterSetter(RichText, 'verticalAlign', 'top')

/**
 * get/set line height.  The default is 1.
 * @name Konva.Text#lineHeight
 * @method
 * @param {Number} lineHeight
 * @returns {Number}
 * @example
 * // get line height
 * var lineHeight = text.lineHeight();
 *
 * // set the line height
 * text.lineHeight(2);
 */
Factory.addGetterSetter(RichText, 'lineHeight', 1, getNumberValidator())

/**
 * get/set wrap.  Can be "word", "char", or "none". Default is "word".
 * In "word" wrapping any word still can be wrapped if it can't be placed in the required width
 * without breaks.
 * @name Konva.Text#wrap
 * @method
 * @param {String} wrap
 * @returns {String}
 * @example
 * // get wrap
 * var wrap = text.wrap();
 *
 * // set wrap
 * text.wrap('word');
 */
Factory.addGetterSetter(RichText, 'wrap', 'word')

/**
 * get/set ellipsis. Can be true or false. Default is false. If ellipses is true,
 * Konva will add "..." at the end of the text if it doesn't have enough space to write characters.
 * That is possible only when you limit both width and height of the text
 * @name Konva.Text#ellipsis
 * @method
 * @param {Boolean} ellipsis
 * @returns {Boolean}
 * @example
 * // get ellipsis param, returns true or false
 * var ellipsis = text.ellipsis();
 *
 * // set ellipsis
 * text.ellipsis(true);
 */
Factory.addGetterSetter(RichText, 'ellipsis', false, getBooleanValidator())

/**
 * get/set textParts
 * @name Konva.Text#textParts
 * @method
 * @param {TextPart[]} textParts
 * @returns {String}
 * @example
 * // set styles
 * text.textParts([{ text: '', style: {...} }]);
 */
const defaultTextPart: TextPart = {
  text: '',
  style: {
    fill: { r: 0, g: 0, b: 0, a: 1 },
    fontFamily: 'Arial',
    letterSpacing: 0,
    fontSize: 12,
    fontWeight: 'regular',
    fontStyle: 'normal',
    fontVariant: 'normal',
    textDecoration: ''
  }
}
Factory.addGetterSetter(RichText, 'textParts', [defaultTextPart])
