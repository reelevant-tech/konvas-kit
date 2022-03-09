// main entry for umd build for rollup
import { Konva } from './_FullInternals';
const isNode = typeof global.document === 'undefined';

if (isNode) {
  Konva.Util['createCanvasElement'] = () => {
    return {
      width: 300,
      height: 300,
      style: {}
    } as any;
  };

  // create image in Node env
  Konva.Util.createImageElement = () => {
    throw new Error('createImageElement not supported in node')
  };
}

export default Konva;
