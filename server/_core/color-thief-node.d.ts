declare module 'color-thief-node' {
  const ColorThief: {
    getColor(image: Buffer | string): Promise<number[]>;
    getPalette(image: Buffer | string, colorCount?: number): Promise<number[][]>;
  };
  export default ColorThief;
}
