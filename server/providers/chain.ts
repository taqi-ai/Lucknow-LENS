import type { LiveProvider } from './types';

/**
 * ChainProvider — try providers in order and use the first that succeeds.
 * `name` reports whichever source actually supplied the current data, so the UI
 * attributes it correctly instead of crediting a provider that was down.
 */
export class ChainProvider<T> implements LiveProvider<T> {
  private used: string;
  constructor(private readonly providers: LiveProvider<T>[]) { this.used = providers[0].name; }

  public get name(): string { return this.used; }
  public isConfigured(): boolean { return this.providers.some((p) => p.isConfigured()); }
  public unavailableReason(): string { return this.providers.map((p) => p.unavailableReason()).join('; '); }

  public async fetch(): Promise<T[]> {
    const errors: string[] = [];
    for (const p of this.providers) {
      if (!p.isConfigured()) continue;
      try {
        const items = await p.fetch();
        this.used = p.name;
        return items;
      } catch (e) {
        errors.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    throw new Error(errors.join(' | ') || 'No provider configured');
  }
}
