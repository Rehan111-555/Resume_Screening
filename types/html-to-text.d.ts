// types/html-to-text.d.ts
declare module 'html-to-text' {
  export interface HtmlToTextOptions {
    wordwrap?: number | false;
    selectors?: any[];
    baseElement?: string | string[];
    preserveNewlines?: boolean;
    [key: string]: any;
  }

  export function convert(html: string, options?: HtmlToTextOptions): string;
}
