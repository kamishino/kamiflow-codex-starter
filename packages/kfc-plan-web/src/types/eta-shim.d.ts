declare module "eta" {
  export class Eta {
    constructor(config?: Record<string, unknown>);
    renderAsync(name: string, data?: Record<string, unknown>): Promise<string | undefined>;
  }
}

