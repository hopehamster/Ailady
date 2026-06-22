// TalkingHead is loaded at runtime from a CDN via the index.html importmap (it brings
// its own `three`). There are no published @types, and we never bundle it, so this
// ambient declaration just lets the dynamic import typecheck. Treated as `any`.
declare module "talkinghead" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const TalkingHead: any;
}
