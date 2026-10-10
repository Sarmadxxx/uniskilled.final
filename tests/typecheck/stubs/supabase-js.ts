// Type-check stand-in for jsr:@supabase/supabase-js@2 (the functions treat the client as `any`).
// deno-lint-ignore no-explicit-any
export function createClient(_url: string, _key: string, _opts?: unknown): any {
  throw new Error('type-check stub only');
}
