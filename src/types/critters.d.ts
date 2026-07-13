declare module 'critters' {
  interface CrittersOptions {
    preload?: 'body' | 'media' | 'swap' | 'js' | 'js-lazy'
  }

  export default class Critters {
    constructor(options?: CrittersOptions)
    process(html: string): Promise<string>
  }
}
