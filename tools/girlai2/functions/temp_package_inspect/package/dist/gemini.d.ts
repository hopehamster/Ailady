import type { GenerateImageOptions, GeneratedImage, DescribeImageOptions } from "./types.js";
export declare class GeminiImageClient {
    private apiKey;
    constructor(apiKey: string);
    generateImage(options: GenerateImageOptions): Promise<GeneratedImage>;
    describeImage(options: DescribeImageOptions): Promise<string>;
}
//# sourceMappingURL=gemini.d.ts.map